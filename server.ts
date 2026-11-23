import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import stream from "node:stream";
import url from "node:url";
import { createServer as createViteServer } from "vite";
import { type AppEnv, resolveRuntimeEnv } from "./src/env_types";
import { MultiplayerHub } from "./src/multiplayer_hub";
import { OgameUniverseStore } from "./src/ogame_universe";
import {
  buildSecurityHeaders,
  readBoundedJsonBody,
  resolveVisitorIdentity,
  safeLogError,
  sanitizePlainText,
  verifyMutationSecurity,
} from "./src/security";
import type {
  BuildingId,
  DarkMarketItemId,
  DefenseId,
  FleetMissionKind,
  ResourceBundle,
  ShipId,
  TechId,
} from "./src/types";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

type NodeIncomingReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type NodeServerRes = {
  statusCode: number;
  headersSent?: boolean;
  setHeader(name: string, value: string | string[]): void;
  end(chunk?: unknown): void;
};

type NodeUpgradeSocket = {
  write(chunk: string | Uint8Array): boolean;
  destroy(): void;
};

const VALID_MISSIONS = new Set<FleetMissionKind>([
  "attack",
  "espionage",
  "transport",
  "deploy",
  "recycle",
  "colonize",
  "expedition",
]);

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...buildSecurityHeaders(isHttps),
      ...(extraHeaders ?? {}),
    },
  });
}

function toWebRequest(req: NodeIncomingReq): Request {
  const proto =
    (typeof req.headers["x-forwarded-proto"] === "string" &&
      req.headers["x-forwarded-proto"].split(",")[0].trim()) ||
    "http";
  const host =
    (typeof req.headers["x-forwarded-host"] === "string" &&
      req.headers["x-forwarded-host"].split(",")[0].trim()) ||
    req.headers.host ||
    `localhost:${PORT}`;
  const fullUrl = `${proto}://${host}${req.url || "/"}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") {
      headers.set(k, v);
    } else if (Array.isArray(v)) {
      headers.set(k, v.join(", "));
    }
  }

  const method = (req.method || "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
  };
  if (hasBody) {
    init.body = stream.Readable.toWeb(
      req as unknown as Parameters<typeof stream.Readable.toWeb>[0],
    ) as unknown as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(fullUrl, init);
}

async function sendWebResponse(res: NodeServerRes, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const setCookies = (webRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (setCookies && setCookies.length > 0) {
    res.setHeader("set-cookie", setCookies);
  }
  if (!webRes.body) {
    res.end();
    return;
  }
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.end(buf);
}

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function tryServeStaticFile(req: NodeIncomingReq, res: NodeServerRes, rootDir: string): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const cleanRel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const resolved = path.resolve(rootDir, cleanRel);
  if (!resolved.startsWith(path.resolve(rootDir))) {
    return false;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return false;
  }
  const ext = path.extname(resolved).toLowerCase();
  res.statusCode = 200;
  res.setHeader("content-type", MIME_BY_EXT[ext] || "application/octet-stream");
  res.setHeader("x-content-type-options", "nosniff");
  if (ext === ".png" || ext === ".jpg" || ext === ".ico") {
    res.setHeader("cache-control", "public, max-age=3600");
  }
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(resolved).pipe(res as unknown as NodeJS.WritableStream);
  return true;
}

function parseSystemParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(5, Math.trunc(n)));
}

export async function startServer(customPort?: number) {
  const mpHub = new MultiplayerHub();

  const universeStore = new OgameUniverseStore({
    onUpdate: (evt) => {
      mpHub.broadcastWorldEvent(evt);
    },
  });

  async function handleApiRequest(request: Request, env: AppEnv): Promise<Response> {
    const reqUrl = new URL(request.url);

    try {
      if (reqUrl.pathname === "/api/mp") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const parsed = await readBoundedJsonBody(request, 32_768);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const syncRes = mpHub.handleHttpSync(parsed.data);
        return jsonResponse(request, syncRes, 200);
      }

      if (reqUrl.pathname === "/api/ogame/state") {
        if (request.method !== "GET") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const id = await resolveVisitorIdentity(request, env);
        const sys = parseSystemParam(reqUrl.searchParams.get("system"));
        const snapshot = universeStore.getSnapshot(id.cookieId, sys);
        return jsonResponse(
          request,
          {
            ok: true,
            ...snapshot,
            visitorToken: id.visitorToken,
          },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/galaxy") {
        if (request.method !== "GET") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const id = await resolveVisitorIdentity(request, env);
        const galaxy = Math.max(1, Math.min(1, Math.trunc(Number(reqUrl.searchParams.get("galaxy") || 1))));
        const system = parseSystemParam(reqUrl.searchParams.get("system")) ?? 1;
        const view = universeStore.getGalaxySystemView(id.cookieId, galaxy, system);
        return jsonResponse(
          request,
          {
            ok: true,
            ...view,
            visitorToken: id.visitorToken,
          },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/profile") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 8_192);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const body = parsed.data;
        const planetId = sanitizePlainText(body.planetId, 64, true);
        const commanderName = sanitizePlainText(body.commanderName, 24, true);
        const planetName = sanitizePlainText(body.planetName, 24, true);
        const res = universeStore.updateProfile(id.cookieId, planetId, commanderName, planetName);
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const sys = parseSystemParam(typeof body.system === "number" ? String(body.system) : null);
        const snapshot = universeStore.getSnapshot(id.cookieId, sys);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/speed") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 4_096);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const speed = Number(parsed.data.speed);
        universeStore.setUniverseSpeed(Number.isFinite(speed) ? speed : 60);
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/build") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 8_192);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const planetId = sanitizePlainText(parsed.data.planetId, 64, true);
        const buildingId = sanitizePlainText(parsed.data.buildingId, 48, true) as BuildingId;
        const res = universeStore.startBuildingUpgrade(id.cookieId, planetId, buildingId);
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/research") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 8_192);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const planetId = sanitizePlainText(parsed.data.planetId, 64, true);
        const techId = sanitizePlainText(parsed.data.techId, 48, true) as TechId;
        const res = universeStore.startResearch(id.cookieId, planetId, techId);
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/shipyard") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 8_192);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const planetId = sanitizePlainText(parsed.data.planetId, 64, true);
        const kind = parsed.data.kind === "defense" ? "defense" : "ship";
        const unitId = sanitizePlainText(parsed.data.unitId, 48, true) as ShipId | DefenseId;
        const quantity = Number(parsed.data.quantity);
        if (!Number.isFinite(quantity) || quantity < 1) {
          return jsonResponse(request, { ok: false, error: "Quantidade inválida." }, 400);
        }
        const res = universeStore.buildShipyardUnit(id.cookieId, planetId, kind, unitId, quantity);
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/fleet") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 16_384);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const body = parsed.data;
        const planetId = sanitizePlainText(body.planetId, 64, true);
        const mission = sanitizePlainText(body.mission, 24, true) as FleetMissionKind;
        if (!VALID_MISSIONS.has(mission)) {
          return jsonResponse(request, { ok: false, error: "Missão inválida." }, 400);
        }

        const rawCoords =
          body.targetCoords && typeof body.targetCoords === "object" && !Array.isArray(body.targetCoords)
            ? (body.targetCoords as Record<string, unknown>)
            : {};
        const targetCoords = {
          galaxy: 1,
          system: Math.max(1, Math.min(5, Math.trunc(Number(rawCoords.system) || 1))),
          position: Math.max(1, Math.min(16, Math.trunc(Number(rawCoords.position) || 1))),
        };

        const ships =
          body.ships && typeof body.ships === "object" && !Array.isArray(body.ships)
            ? (body.ships as Partial<Record<ShipId, number>>)
            : {};
        const cargo =
          body.cargo && typeof body.cargo === "object" && !Array.isArray(body.cargo)
            ? (body.cargo as Partial<ResourceBundle>)
            : {};
        const speedPct = Number(body.speedPct);

        const res = universeStore.dispatchFleet(
          id.cookieId,
          planetId,
          targetCoords,
          mission,
          ships,
          cargo,
          Number.isFinite(speedPct) ? speedPct : 100,
        );
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const snapshot = universeStore.getSnapshot(id.cookieId, targetCoords.system);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/fleet/recall") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 4_096);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const fleetId = sanitizePlainText(parsed.data.fleetId, 64, true);
        const res = universeStore.recallFleet(id.cookieId, fleetId);
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/reports/read") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        universeStore.markReportsRead(id.cookieId);
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      if (reqUrl.pathname === "/api/ogame/dark-market") {
        if (request.method !== "POST") {
          return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
        }
        const csrfErr = verifyMutationSecurity(request);
        if (csrfErr) {
          return jsonResponse(request, { ok: false, error: csrfErr }, 403);
        }
        const id = await resolveVisitorIdentity(request, env);
        const parsed = await readBoundedJsonBody(request, 8_192);
        if (!parsed.ok) {
          return jsonResponse(request, { ok: false, error: parsed.error }, parsed.status);
        }
        const planetId = sanitizePlainText(parsed.data.planetId, 64, true);
        const itemId = sanitizePlainText(parsed.data.itemId, 48, true) as DarkMarketItemId;
        const res = universeStore.buyDarkMarketItem(id.cookieId, planetId, itemId);
        if (!res.ok) {
          return jsonResponse(request, { ok: false, error: res.error }, 400);
        }
        const snapshot = universeStore.getSnapshot(id.cookieId);
        return jsonResponse(
          request,
          { ok: true, message: res.message, ...snapshot, visitorToken: id.visitorToken },
          200,
          id.setCookieHeader ? { "Set-Cookie": id.setCookieHeader } : undefined,
        );
      }

      return jsonResponse(request, { ok: false, error: "Not found." }, 404);
    } catch (err) {
      safeLogError("api_unhandled", err, [env.GEMINI_API_KEY, env.CREATOR_HMAC_SECRET]);
      return jsonResponse(request, { ok: false, error: "Internal server error." }, 500);
    }
  }

  const isProd = process.env.NODE_ENV === "production";
  const distDir = path.join(__dirname, "dist");
  const publicDir = path.join(__dirname, "public");

  const httpServer = http.createServer();

  let viteMiddleware: ((req: NodeIncomingReq, res: NodeServerRes, next: () => void) => void) | null =
    null;

  const NOOP_VITE_CLIENT_JS = `
const sheetsMap = new Map();
let lastInsertedStyle;
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  sheetsMap.delete(id);
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export class ErrorOverlay extends HTMLElement {}
`;

  if (!isProd || !fs.existsSync(path.join(distDir, "index.html"))) {
    const vite = await createViteServer({
      root: __dirname,
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        allowedHosts: true,
      },
      appType: "spa",
    });
    viteMiddleware = vite.middlewares as unknown as (
      req: NodeIncomingReq,
      res: NodeServerRes,
      next: () => void,
    ) => void;
  }

  httpServer.on("request", async (req: NodeIncomingReq, res: NodeServerRes) => {
    const urlPath = (req.url || "/").split("?")[0];

    if (urlPath.startsWith("/api/")) {
      try {
        const env = resolveRuntimeEnv();
        const webReq = toWebRequest(req);
        const webRes = await handleApiRequest(webReq, env);
        await sendWebResponse(res, webRes);
      } catch (err) {
        safeLogError("api_request_dispatch", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: "Erro interno ao processar requisição." }));
        } else {
          res.end();
        }
      }
      return;
    }

    if (viteMiddleware) {
      if (urlPath === "/@vite/client") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/javascript; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(NOOP_VITE_CLIENT_JS);
        return;
      }
      viteMiddleware(req, res, () => {
        if (!res.headersSent) {
          res.statusCode = 404;
          res.end("Not Found");
        }
      });
      return;
    }

    if (tryServeStaticFile(req, res, distDir)) return;
    if (tryServeStaticFile(req, res, publicDir)) return;

    const indexPath = path.join(distDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      fs.createReadStream(indexPath).pipe(res as unknown as NodeJS.WritableStream);
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  });

  httpServer.on("upgrade", (req: NodeIncomingReq, socket: NodeUpgradeSocket, head: Uint8Array) => {
    const handled = mpHub.handleUpgrade(req, socket, head);
    if (!handled) {
      socket.destroy();
    }
  });

  const listenPort = customPort ?? PORT;
  await new Promise<void>((resolve) => {
    httpServer.listen(listenPort, HOST, () => {
      console.log(`Ogamex Pro server listening on http://${HOST}:${listenPort}`);
      resolve();
    });
  });

  return {
    httpServer,
    universeStore,
    mpHub,
    close: () =>
      new Promise<void>((resolve) => {
        universeStore.dispose();
        mpHub.dispose();
        httpServer.close(() => resolve());
      }),
  };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url));

if (isMainModule) {
  void startServer();
}

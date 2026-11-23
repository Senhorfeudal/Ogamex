import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUILDING_DEFS,
  BUILDING_ORDER,
  biomeLabel,
  checkRequirements,
  computeFlightMetrics,
  computePlanetResourceFillScale,
  DARK_MARKET_ITEMS,
  DARK_MARKET_ORDER,
  DEFENSE_DEFS,
  DEFENSE_ORDER,
  formatCoords,
  getBuildingBuildDurationMs,
  getBuildingUpgradeCost,
  getResearchDurationMs,
  getTechUpgradeCost,
  getUnitBuildDurationMs,
  SHIP_DEFS,
  SHIP_ORDER,
  TECH_DEFS,
  TECH_ORDER,
} from "../shared/ogame_catalog";
import type {
  BuildingId,
  DarkMarketItemId,
  DefenseId,
  FleetMissionKind,
  OgameClientSnapshot,
  ShipId,
  TechId,
} from "../types";
import { audioSynth } from "./audio_synth";
import {
  type HoverTargetInfo,
  OgameVoxelEngine,
  type ViewMode,
} from "./ogame_engine";
import { useOnlineStatus, usePWAInstall } from "./usePWAInstall";

type DockTab =
  | "overview"
  | "resources"
  | "facilities"
  | "research"
  | "shipyard"
  | "defense"
  | "fleet"
  | "galaxy"
  | "reports"
  | "dark_market";

const VISITOR_STORAGE_KEY = "ogamex_visitor_token_v1";
const NAME_SAVED_STORAGE_KEY = "ogamex_name_saved_v1";
const PLANET_SPIN_STORAGE_KEY = "ogamex_planet_spin_v1";

function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString("pt-BR");
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function missionLabel(m: FleetMissionKind): string {
  switch (m) {
    case "attack":
      return "Atacar";
    case "espionage":
      return "Espionar";
    case "transport":
      return "Transportar";
    case "deploy":
      return "Transferir";
    case "recycle":
      return "Reciclar";
    case "colonize":
      return "Colonizar";
    case "expedition":
      return "Expedição";
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<OgameVoxelEngine | null>(null);

  const [snapshot, setSnapshot] = useState<OgameClientSnapshot | null>(null);
  const [activePlanetId, setActivePlanetId] = useState<string>("");
  const [galaxySystem, setGalaxySystem] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>("planet");
  const [activeTab, setActiveTab] = useState<DockTab>("overview");
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [hudHidden, setHudHidden] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [planetAutoSpin, setPlanetAutoSpin] = useState<boolean>(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(PLANET_SPIN_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [installGuideOpen, setInstallGuideOpen] = useState<boolean>(false);
  const [nameFormHidden, setNameFormHidden] = useState<boolean>(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(NAME_SAVED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [highlightedBuilding, setHighlightedBuilding] = useState<BuildingId | null>(null);
  const pwa = usePWAInstall();
  const isOnline = useOnlineStatus();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [hoverInfo, setHoverInfo] = useState<{
    info: HoverTargetInfo;
    x: number;
    y: number;
  } | null>(null);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Forms
  const [commanderInput, setCommanderInput] = useState<string>("");
  const [planetNameInput, setPlanetNameInput] = useState<string>("");
  const [unitQuantities, setUnitQuantities] = useState<Record<string, number>>({});

  // Fleet Planner State
  const [fleetShips, setFleetShips] = useState<Partial<Record<ShipId, number>>>({});
  const [targetSystem, setTargetSystem] = useState<number>(1);
  const [targetPosition, setTargetPosition] = useState<number>(3);
  const [fleetMission, setFleetMission] = useState<FleetMissionKind>("attack");
  const [fleetSpeedPct, setFleetSpeedPct] = useState<number>(100);
  const [fleetCargo, setFleetCargo] = useState<{ metal: number; crystal: number; deuterium: number }>({
    metal: 0,
    crystal: 0,
    deuterium: 0,
  });

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    if (isError) audioSynth.playAlert();
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3600);
  }, []);

  const visitorTokenRef = useRef<string>("");
  const playerIdRef = useRef<string>("");
  const galaxySystemRef = useRef<number>(1);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const lastWsSyncMsRef = useRef<number>(0);
  const [connError, setConnError] = useState<string | null>(null);

  const readVisitorToken = useCallback((): string => {
    if (visitorTokenRef.current) return visitorTokenRef.current;
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(VISITOR_STORAGE_KEY) || "";
        if (stored) visitorTokenRef.current = stored;
        return stored;
      }
    } catch {
      // Blocked storage in sandboxed iframe — keep in-memory ref
    }
    return "";
  }, []);

  const buildHeaders = useCallback(
    (isPost = false): HeadersInit => {
      const token = readVisitorToken();
      let tz = "America/Sao_Paulo";
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
      } catch {
        // ignore
      }
      const h: Record<string, string> = {
        "x-meadow-tz": tz,
      };
      if (token) h["x-meadow-visitor"] = token;
      if (isPost) {
        h["content-type"] = "application/json";
        h["x-meadow-client"] = "1";
      }
      return h;
    },
    [readVisitorToken],
  );

  const applyServerSnapshot = useCallback((data: OgameClientSnapshot & { visitorToken?: string }) => {
    if (data.visitorToken) {
      visitorTokenRef.current = data.visitorToken;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(VISITOR_STORAGE_KEY, data.visitorToken);
        }
      } catch {
        // ignore
      }
    }
    if (data.player?.id) {
      playerIdRef.current = data.player.id;
    }
    setConnError(null);
    setSnapshot(data);
    setNowMs(Date.now());
    setActivePlanetId((prev) => {
      if (prev && data.planets.some((p) => p.id === prev)) return prev;
      return data.planets[0]?.id ?? "";
    });
    setCommanderInput((prev) => prev || data.player.commanderName);
  }, []);

  const fetchState = useCallback(
    async (sysOverride?: number): Promise<void> => {
      if (fetchInFlightRef.current && sysOverride === undefined) {
        return fetchInFlightRef.current;
      }
      const run = (async () => {
        try {
          const sys = sysOverride ?? galaxySystemRef.current;
          const res = await fetch(`/api/ogame/state?system=${sys}`, {
            headers: buildHeaders(false),
            credentials: "same-origin",
          });
          const raw = await res.text();
          let data:
            | (OgameClientSnapshot & { ok?: boolean; error?: string; visitorToken?: string })
            | null = null;
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = null;
            }
          }
          if (!res.ok || !data?.ok) {
            setConnError(data?.error || `Servidor estelar indisponível (HTTP ${res.status}).`);
            return;
          }
          applyServerSnapshot(data);
        } catch {
          setConnError("Erro de conexão com o servidor estelar. Tentando reconectar...");
        }
      })();
      if (sysOverride === undefined) {
        fetchInFlightRef.current = run;
      }
      try {
        await run;
      } finally {
        if (fetchInFlightRef.current === run) {
          fetchInFlightRef.current = null;
        }
      }
    },
    [applyServerSnapshot, buildHeaders],
  );

  const postAction = useCallback(
    async (path: string, body: Record<string, unknown>, successMsg?: string) => {
      let res: Response;
      try {
        res = await fetch(path, {
          method: "POST",
          headers: buildHeaders(true),
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
      } catch {
        showToast("Erro de conexão com o servidor estelar.", true);
        return false;
      }

      let raw = "";
      try {
        raw = await res.text();
      } catch {
        showToast("Falha ao ler resposta do servidor estelar.", true);
        return false;
      }

      let data:
        | (OgameClientSnapshot & { ok?: boolean; error?: string; message?: string; visitorToken?: string })
        | null = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data?.ok) {
        showToast(data?.error || `Falha no servidor (HTTP ${res.status}).`, true);
        return false;
      }

      applyServerSnapshot(data);
      const toastMsg = successMsg || data.message;
      if (toastMsg) showToast(toastMsg);
      return true;
    },
    [applyServerSnapshot, buildHeaders, showToast],
  );

  // Active planet memo
  const activePlanet = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.planets.find((p) => p.id === activePlanetId) ?? snapshot.planets[0] ?? null;
  }, [snapshot, activePlanetId]);

  useEffect(() => {
    if (activePlanet) {
      setPlanetNameInput(activePlanet.name);
    }
  }, [activePlanet?.id, activePlanet?.name]);

  useEffect(() => {
    galaxySystemRef.current = galaxySystem;
  }, [galaxySystem]);

  // Mount Three.js engine once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    const engine = new OgameVoxelEngine(mount, {
      onSelectBuilding: (bId) => {
        audioSynth.playClick();
        const def = BUILDING_DEFS[bId];
        setHighlightedBuilding(bId);
        setViewMode("planet");
        setActiveTab(def.category === "resource" ? "resources" : "facilities");
        setDockCollapsed(false);
        engine.focusBuilding(bId);
      },
      onSelectGalaxySlot: (pos) => {
        audioSynth.playClick();
        setViewMode("galaxy");
        setTargetSystem(galaxySystemRef.current);
        setTargetPosition(pos);
        setActiveTab("galaxy");
        setDockCollapsed(false);
        engine.focusGalaxySlot(pos, galaxySystemRef.current);
      },
      onHoverChange: (info, x, y) => {
        setHoverInfo(info ? { info, x, y } : null);
      },
      onCameraModeChange: () => {
        // Modo de câmera acompanha automaticamente a visão ativa
      },
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Push snapshot into 3D engine whenever snapshot or activePlanet changes
  useEffect(() => {
    if (snapshot && engineRef.current) {
      engineRef.current.applySnapshot(snapshot, activePlanet);
    }
  }, [snapshot, activePlanet]);

  useEffect(() => {
    engineRef.current?.setDockCollapsed(dockCollapsed);
  }, [dockCollapsed]);

  useEffect(() => {
    engineRef.current?.setPlanetAutoSpin(planetAutoSpin);
  }, [planetAutoSpin]);

  // Initial fetch + polling + WebSocket live tick sync (stable lifetime effect)
  useEffect(() => {
    void fetchState(galaxySystemRef.current);

    const pollTimer = window.setInterval(() => {
      void fetchState();
    }, 3500);

    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            affectedPlayerIds?: string[];
          };
          if (msg?.type === "ogame_tick") {
            const myId = playerIdRef.current;
            if (
              !Array.isArray(msg.affectedPlayerIds) ||
              !myId ||
              msg.affectedPlayerIds.includes(myId)
            ) {
              const now = Date.now();
              if (now - lastWsSyncMsRef.current >= 900) {
                lastWsSyncMsRef.current = now;
                void fetchState();
              }
            }
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // HTTP polling handles updates cleanly
    }

    return () => {
      window.clearInterval(pollTimer);
      if (ws) ws.close();
    };
  }, [fetchState]);

  // Smooth 250ms UI clock for countdowns & interpolated resources
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Keyboard shortcut 'H' to toggle HUD
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key.toLowerCase() === "h") {
        setHudHidden((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Interpolated live resources & Dark Matter
  const liveResources = useMemo(() => {
    if (!activePlanet || !snapshot) {
      return { metal: 0, crystal: 0, deuterium: 0 };
    }
    const elapsedHours = Math.max(0, Math.min(120_000, nowMs - snapshot.serverTime)) / 3600000;
    return {
      metal: Math.min(
        activePlanet.rates.storageCap.metal,
        activePlanet.resources.metal + activePlanet.rates.metalPerHour * elapsedHours,
      ),
      crystal: Math.min(
        activePlanet.rates.storageCap.crystal,
        activePlanet.resources.crystal + activePlanet.rates.crystalPerHour * elapsedHours,
      ),
      deuterium: Math.min(
        activePlanet.rates.storageCap.deuterium,
        activePlanet.resources.deuterium + activePlanet.rates.deuteriumPerHour * elapsedHours,
      ),
    };
  }, [activePlanet, snapshot, nowMs]);

  const totalDarkMatterPerHour = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.planets.reduce((sum, p) => sum + (p.rates.darkMatterPerHour ?? 0), 0);
  }, [snapshot]);

  const liveDarkMatter = useMemo(() => {
    if (!snapshot) return 0;
    const elapsedHours = Math.max(0, Math.min(120_000, nowMs - snapshot.serverTime)) / 3600000;
    return snapshot.player.darkMatter + totalDarkMatterPerHour * elapsedHours;
  }, [snapshot, totalDarkMatterPerHour, nowMs]);

  const globeFillStats = useMemo(() => {
    if (!activePlanet) {
      return { totalResources: 0, totalCapacity: 30000, fillRatio: 0, globeScale: 0.78 };
    }
    return computePlanetResourceFillScale(
      liveResources,
      activePlanet.rates.storageCap,
      activePlanet.fieldsUsed,
      activePlanet.fieldsMax,
    );
  }, [activePlanet, liveResources]);

  const unreadReports = useMemo(
    () => (snapshot ? snapshot.player.reports.filter((r) => !r.read).length : 0),
    [snapshot],
  );

  const fleetPreviewMetrics = useMemo(() => {
    if (!activePlanet || !snapshot) {
      return { durationMs: 0, fuel: 0, cargoCap: 0, minSpeed: 0 };
    }
    return computeFlightMetrics(
      fleetShips,
      activePlanet.coords,
      { galaxy: 1, system: targetSystem, position: fleetMission === "expedition" ? 16 : targetPosition },
      snapshot.player.techs,
      fleetSpeedPct,
      snapshot.universeSpeed,
    );
  }, [activePlanet, snapshot, fleetShips, targetSystem, targetPosition, fleetMission, fleetSpeedPct]);

  const handleSwitchView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    engineRef.current?.setViewMode(mode);
  }, []);

  const handleSwitchSystem = (sys: number) => {
    const clean = Math.max(1, Math.min(5, sys));
    setGalaxySystem(clean);
    void fetchState(clean);
  };

  const handleQuickMissionFromGalaxy = (pos: number, mission: FleetMissionKind) => {
    if (!activePlanet) return;
    audioSynth.playClick();
    setTargetSystem(galaxySystem);
    setTargetPosition(pos);
    setFleetMission(mission);
    handleSwitchView("galaxy");
    engineRef.current?.focusGalaxySlot(pos, galaxySystem);

    if (mission === "espionage" && (activePlanet.ships.espionage_probe ?? 0) >= 1) {
      void postAction(
        "/api/ogame/fleet",
        {
          planetId: activePlanet.id,
          targetCoords: { galaxy: 1, system: galaxySystem, position: pos },
          mission: "espionage",
          ships: { espionage_probe: 1 },
          cargo: { metal: 0, crystal: 0, deuterium: 0 },
          speedPct: 100,
        },
        `Sonda de espionagem enviada para [1:${galaxySystem}:${pos}]!`,
      ).then((ok) => {
        if (ok) audioSynth.playFleetLaunch();
      });
      return;
    }

    setActiveTab("fleet");
    setDockCollapsed(false);
  };

  const renderBuildingCards = (category: "resource" | "facility") => {
    if (!activePlanet || !snapshot) return null;
    const list = BUILDING_ORDER.filter((id) => BUILDING_DEFS[id].category === category);
    const activeBuild = activePlanet.buildingQueue;

    return (
      <div className="cards-grid">
        {list.map((bId) => {
          const def = BUILDING_DEFS[bId];
          const level = activePlanet.buildings[bId] ?? 0;
          const cost = getBuildingUpgradeCost(bId, level);
          const req = checkRequirements(def.requires, activePlanet.buildings, snapshot.player.techs);
          const durMs = getBuildingBuildDurationMs(
            cost,
            activePlanet.buildings.robotics_factory ?? 0,
            activePlanet.buildings.nanite_factory ?? 0,
            snapshot.universeSpeed,
          );
          const canM = liveResources.metal >= cost.metal;
          const canC = liveResources.crystal >= cost.crystal;
          const canD = liveResources.deuterium >= cost.deuterium;
          const isThisBuilding = activeBuild?.buildingId === bId;
          const canStart =
            req.met &&
            !activeBuild &&
            activePlanet.fieldsUsed < activePlanet.fieldsMax &&
            canM &&
            canC &&
            canD;

          return (
            <div
              key={bId}
              className={`ogame-card ${highlightedBuilding === bId ? "is-highlighted" : ""} ${!req.met ? "is-locked" : ""}`}
            >
              <div>
                <div className="card-head">
                  <div className="card-title">{def.name}</div>
                  <div className="card-level">Nv. {level}</div>
                </div>
                <div className="card-desc">{def.description}</div>
              </div>

              <div>
                <div className="cost-row">
                  {cost.metal > 0 && (
                    <span className={`cost-tag ${!canM ? "is-missing" : ""}`}>
                      M: {formatNumber(cost.metal)}
                    </span>
                  )}
                  {cost.crystal > 0 && (
                    <span className={`cost-tag ${!canC ? "is-missing" : ""}`}>
                      C: {formatNumber(cost.crystal)}
                    </span>
                  )}
                  {cost.deuterium > 0 && (
                    <span className={`cost-tag ${!canD ? "is-missing" : ""}`}>
                      D: {formatNumber(cost.deuterium)}
                    </span>
                  )}
                  <span className="cost-tag">{formatDuration(durMs)}</span>
                </div>

                {!req.met && (
                  <div className="card-desc" style={{ color: "#fca5a5", marginTop: 4 }}>
                    Requer: {req.missing.join(", ")}
                  </div>
                )}

                <div className="card-actions" style={{ marginTop: 6 }}>
                  {level >= 1 ? (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => {
                        audioSynth.playClick();
                        handleSwitchView("planet");
                        setHighlightedBuilding(bId);
                        engineRef.current?.focusBuilding(bId);
                      }}
                    >
                      Ver 3D
                    </button>
                  ) : (
                    <span className="card-desc">Visível no 3D no Nv.1</span>
                  )}
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!canStart}
                    onClick={() => {
                      audioSynth.playBuildStart();
                      handleSwitchView("planet");
                      setHighlightedBuilding(bId);
                      if (level >= 1) {
                        engineRef.current?.focusBuilding(bId);
                      }
                      void postAction(
                        "/api/ogame/build",
                        { planetId: activePlanet.id, buildingId: bId },
                        `${def.name} em construção (Nível ${level + 1})!`,
                      );
                    }}
                  >
                    {isThisBuilding
                      ? `Construindo (${formatDuration((activeBuild?.finishesAt ?? nowMs) - nowMs)})`
                      : level === 0
                        ? "Construir"
                        : `Evoluir Nv.${level + 1}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderResearchTab = () => {
    if (!activePlanet || !snapshot) return null;
    const rq = snapshot.player.researchQueue;
    const labLevel = activePlanet.buildings.research_lab ?? 0;

    return (
      <div className="cards-grid">
        {TECH_ORDER.map((tId: TechId) => {
          const def = TECH_DEFS[tId];
          const level = snapshot.player.techs[tId] ?? 0;
          const cost = getTechUpgradeCost(tId, level);
          const req = checkRequirements(def.requires, activePlanet.buildings, snapshot.player.techs);
          const durMs = getResearchDurationMs(cost, Math.max(1, labLevel), snapshot.universeSpeed);
          const canM = liveResources.metal >= cost.metal;
          const canC = liveResources.crystal >= cost.crystal;
          const canD = liveResources.deuterium >= cost.deuterium;
          const isThis = rq?.techId === tId;
          const canStart = req.met && !rq && canM && canC && canD;

          return (
            <div key={tId} className={`ogame-card ${!req.met ? "is-locked" : ""}`}>
              <div>
                <div className="card-head">
                  <div className="card-title">{def.name}</div>
                  <div className="card-level">Nv. {level}</div>
                </div>
                <div className="card-desc">{def.description}</div>
              </div>

              <div>
                <div className="cost-row">
                  {cost.metal > 0 && (
                    <span className={`cost-tag ${!canM ? "is-missing" : ""}`}>
                      M: {formatNumber(cost.metal)}
                    </span>
                  )}
                  {cost.crystal > 0 && (
                    <span className={`cost-tag ${!canC ? "is-missing" : ""}`}>
                      C: {formatNumber(cost.crystal)}
                    </span>
                  )}
                  {cost.deuterium > 0 && (
                    <span className={`cost-tag ${!canD ? "is-missing" : ""}`}>
                      D: {formatNumber(cost.deuterium)}
                    </span>
                  )}
                  <span className="cost-tag">{formatDuration(durMs)}</span>
                </div>

                {!req.met && (
                  <div className="card-desc" style={{ color: "#fca5a5", marginTop: 4 }}>
                    Requer: {req.missing.join(", ")}
                  </div>
                )}

                <div className="card-actions" style={{ marginTop: 6 }}>
                  <span className="card-desc">Lab. Nv.{labLevel}</span>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!canStart}
                    onClick={() => {
                      audioSynth.playBuildStart();
                      void postAction(
                        "/api/ogame/research",
                        { planetId: activePlanet.id, techId: tId },
                        `Pesquisa iniciada: ${def.name} Nv.${level + 1}`,
                      );
                    }}
                  >
                    {isThis
                      ? `Pesquisando (${formatDuration((rq?.finishesAt ?? nowMs) - nowMs)})`
                      : `Pesquisar Nv.${level + 1}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderShipyardOrDefense = (kind: "ship" | "defense") => {
    if (!activePlanet || !snapshot) return null;
    const ids = kind === "ship" ? SHIP_ORDER : DEFENSE_ORDER;

    return (
      <div>
        {activePlanet.shipyardQueue.length > 0 && (
          <div
            className="panel-box"
            style={{ marginBottom: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
          >
            <strong style={{ fontSize: 12, color: "var(--accent-cyan)" }}>Fila do Hangar:</strong>
            {activePlanet.shipyardQueue.map((q, idx) => {
              const label =
                q.kind === "ship"
                  ? SHIP_DEFS[q.unitId as ShipId]?.shortName
                  : DEFENSE_DEFS[q.unitId as DefenseId]?.shortName;
              return (
                <span key={`${q.unitId}_${idx}`} className="queue-chip">
                  {label} ×{q.quantity}
                  {idx === 0 ? ` (${formatDuration(q.nextUnitAt - nowMs)})` : ""}
                </span>
              );
            })}
          </div>
        )}

        <div className="cards-grid">
          {ids.map((uId) => {
            const isShip = kind === "ship";
            const def = isShip ? SHIP_DEFS[uId as ShipId] : DEFENSE_DEFS[uId as DefenseId];
            const owned = isShip
              ? activePlanet.ships[uId as ShipId] ?? 0
              : activePlanet.defenses[uId as DefenseId] ?? 0;
            const req = checkRequirements(def.requires, activePlanet.buildings, snapshot.player.techs);
            const qty = Math.max(1, unitQuantities[uId] ?? 1);
            const totalM = def.cost.metal * qty;
            const totalC = def.cost.crystal * qty;
            const totalD = def.cost.deuterium * qty;
            const canM = liveResources.metal >= totalM;
            const canC = liveResources.crystal >= totalC;
            const canD = liveResources.deuterium >= totalD;
            const unitMs = getUnitBuildDurationMs(
              def.cost,
              activePlanet.buildings.shipyard ?? 0,
              activePlanet.buildings.nanite_factory ?? 0,
              snapshot.universeSpeed,
            );
            const maxAllowed = !isShip ? DEFENSE_DEFS[uId as DefenseId].maxCount : undefined;
            const atCap = maxAllowed !== undefined && owned >= maxAllowed;

            return (
              <div key={uId} className={`ogame-card ${!req.met ? "is-locked" : ""}`}>
                <div>
                  <div className="card-head">
                    <div className="card-title">{def.name}</div>
                    <div className="card-level">{owned} un.</div>
                  </div>
                  <div className="card-desc">{def.description}</div>
                  <div className="card-desc" style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                    Ataque {def.stats.attack} · Escudo {def.stats.shield} · Casco {def.stats.hull}
                    {isShip ? ` · Carga ${SHIP_DEFS[uId as ShipId].cargo}` : ""}
                  </div>
                </div>

                <div>
                  <div className="cost-row">
                    {totalM > 0 && (
                      <span className={`cost-tag ${!canM ? "is-missing" : ""}`}>
                        M: {formatNumber(totalM)}
                      </span>
                    )}
                    {totalC > 0 && (
                      <span className={`cost-tag ${!canC ? "is-missing" : ""}`}>
                        C: {formatNumber(totalC)}
                      </span>
                    )}
                    {totalD > 0 && (
                      <span className={`cost-tag ${!canD ? "is-missing" : ""}`}>
                        D: {formatNumber(totalD)}
                      </span>
                    )}
                    <span className="cost-tag">{formatDuration(unitMs)}/un</span>
                  </div>

                  {!req.met && (
                    <div className="card-desc" style={{ color: "#fca5a5", marginTop: 4 }}>
                      Requer: {req.missing.join(", ")}
                    </div>
                  )}

                  <div className="card-actions" style={{ marginTop: 6 }}>
                    {maxAllowed === 1 ? (
                      <span className="card-desc">Máx. 1 por planeta</span>
                    ) : (
                      <div className="qty-controls">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          className="qty-input"
                          value={qty}
                          onChange={(e) =>
                            setUnitQuantities((prev) => ({
                              ...prev,
                              [uId]: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() =>
                            setUnitQuantities((prev) => ({ ...prev, [uId]: Math.min(999, qty + 5) }))
                          }
                        >
                          +5
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className="primary-action"
                      disabled={!req.met || atCap || !canM || !canC || !canD}
                      onClick={() => {
                        audioSynth.playBuildStart();
                        void postAction(
                          "/api/ogame/shipyard",
                          {
                            planetId: activePlanet.id,
                            kind,
                            unitId: uId,
                            quantity: maxAllowed === 1 ? 1 : qty,
                          },
                          `Produção iniciada: ${maxAllowed === 1 ? 1 : qty}× ${def.shortName}`,
                        );
                      }}
                    >
                      {atCap ? "Construído" : "Produzir"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFleetTab = () => {
    if (!activePlanet || !snapshot) return null;
    const travelableShips = SHIP_ORDER.filter((s) => s !== "solar_satellite");
    const maxFleets = 1 + (snapshot.player.techs.computer_tech ?? 0);

    return (
      <div className="fleet-layout">
        <div className="panel-box">
          <h3 className="panel-heading">
            Despachar Frota ({snapshot.fleets.length}/{maxFleets} slots)
          </h3>

          <div className="cards-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 6 }}>
            {travelableShips.map((sId) => {
              const avail = activePlanet.ships[sId] ?? 0;
              const picked = fleetShips[sId] ?? 0;
              return (
                <div
                  key={sId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    padding: "5px 7px",
                    background: "#0a1220",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <div style={{ fontSize: 11.5 }}>
                    <div style={{ fontWeight: 600 }}>{SHIP_DEFS[sId].shortName}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Disp: {avail}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <input
                      type="number"
                      min={0}
                      max={avail}
                      className="qty-input"
                      style={{ width: 48, padding: "3px 4px" }}
                      value={picked}
                      disabled={avail === 0}
                      onChange={(e) =>
                        setFleetShips((prev) => ({
                          ...prev,
                          [sId]: Math.max(0, Math.min(avail, Number(e.target.value) || 0)),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="secondary-action"
                      style={{ padding: "3px 6px", fontSize: 10.5 }}
                      disabled={avail === 0}
                      onClick={() =>
                        setFleetShips((prev) => ({
                          ...prev,
                          [sId]: picked === avail ? 0 : avail,
                        }))
                      }
                    >
                      Máx
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8, marginTop: 10 }}>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Sistema (1-5)
              <input
                type="number"
                min={1}
                max={5}
                className="text-input"
                style={{ width: "100%", marginTop: 3 }}
                value={targetSystem}
                onChange={(e) => {
                  const nextSys = Math.max(1, Math.min(5, Number(e.target.value) || 1));
                  setTargetSystem(nextSys);
                  handleSwitchSystem(nextSys);
                  handleSwitchView("galaxy");
                  engineRef.current?.focusGalaxySlot(
                    fleetMission === "expedition" ? 16 : targetPosition,
                    nextSys,
                  );
                }}
              />
            </label>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Posição (1-15)
              <input
                type="number"
                min={1}
                max={15}
                className="text-input"
                style={{ width: "100%", marginTop: 3 }}
                value={targetPosition}
                disabled={fleetMission === "expedition"}
                onChange={(e) => {
                  const nextPos = Math.max(1, Math.min(15, Number(e.target.value) || 1));
                  setTargetPosition(nextPos);
                  handleSwitchView("galaxy");
                  engineRef.current?.focusGalaxySlot(nextPos, targetSystem);
                }}
              />
            </label>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Missão
              <select
                className="planet-select"
                style={{ width: "100%", marginTop: 3 }}
                value={fleetMission}
                onChange={(e) => {
                  const nextMission = e.target.value as FleetMissionKind;
                  setFleetMission(nextMission);
                  handleSwitchView("galaxy");
                  engineRef.current?.focusGalaxySlot(
                    nextMission === "expedition" ? 16 : targetPosition,
                    targetSystem,
                  );
                }}
              >
                <option value="attack">Atacar</option>
                <option value="espionage">Espionar</option>
                <option value="transport">Transportar</option>
                <option value="deploy">Transferir (Colônia)</option>
                <option value="recycle">Reciclar Destroços</option>
                <option value="colonize">Colonizar</option>
                <option value="expedition">Expedição</option>
              </select>
            </label>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Velocidade (%)
              <select
                className="planet-select"
                style={{ width: "100%", marginTop: 3 }}
                value={fleetSpeedPct}
                onChange={(e) => setFleetSpeedPct(Number(e.target.value))}
              >
                {[100, 90, 80, 70, 60, 50, 30, 10].map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(fleetMission === "transport" || fleetMission === "deploy" || fleetMission === "colonize") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
              <input
                type="number"
                min={0}
                className="text-input"
                placeholder="Carga Metal"
                value={fleetCargo.metal || ""}
                onChange={(e) => setFleetCargo((c) => ({ ...c, metal: Math.max(0, Number(e.target.value) || 0) }))}
              />
              <input
                type="number"
                min={0}
                className="text-input"
                placeholder="Carga Cristal"
                value={fleetCargo.crystal || ""}
                onChange={(e) => setFleetCargo((c) => ({ ...c, crystal: Math.max(0, Number(e.target.value) || 0) }))}
              />
              <input
                type="number"
                min={0}
                className="text-input"
                placeholder="Carga Deutério"
                value={fleetCargo.deuterium || ""}
                onChange={(e) => setFleetCargo((c) => ({ ...c, deuterium: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <div className="cost-row">
              <span className="cost-tag">Tempo ida: {formatDuration(fleetPreviewMetrics.durationMs)}</span>
              <span className={`cost-tag ${liveResources.deuterium < fleetPreviewMetrics.fuel ? "is-missing" : ""}`}>
                Combustível: {formatNumber(fleetPreviewMetrics.fuel)} D
              </span>
              <span className="cost-tag">Carga máx: {formatNumber(fleetPreviewMetrics.cargoCap)}</span>
            </div>

            <button
              type="button"
              className="primary-action"
              disabled={fleetPreviewMetrics.durationMs === 0 || liveResources.deuterium < fleetPreviewMetrics.fuel}
              onClick={() => {
                void postAction(
                  "/api/ogame/fleet",
                  {
                    planetId: activePlanet.id,
                    targetCoords: {
                      galaxy: 1,
                      system: targetSystem,
                      position: fleetMission === "expedition" ? 16 : targetPosition,
                    },
                    mission: fleetMission,
                    ships: fleetShips,
                    cargo: fleetCargo,
                    speedPct: fleetSpeedPct,
                  },
                  `Frota lançada em missão de ${missionLabel(fleetMission)}!`,
                ).then((ok) => {
                  if (ok) {
                    audioSynth.playFleetLaunch();
                    setFleetShips({});
                    setFleetCargo({ metal: 0, crystal: 0, deuterium: 0 });
                  }
                });
              }}
            >
              Enviar Frota
            </button>
          </div>
        </div>

        <div className="panel-box">
          <h3 className="panel-heading">Frotas em Movimento ({snapshot.fleets.length})</h3>
          {snapshot.fleets.length === 0 ? (
            <div className="card-desc">Nenhuma frota em trânsito no momento.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {snapshot.fleets.map((f) => {
                const eta = f.phase === "outbound" ? f.arrivalAt - nowMs : (f.returnAt ?? nowMs) - nowMs;
                const shipCount = Object.values(f.ships).reduce((a, b) => a + (b || 0), 0);
                return (
                  <div
                    key={f.id}
                    style={{
                      background: "#0a1220",
                      border: "1px solid rgba(56,189,248,0.22)",
                      borderRadius: 7,
                      padding: "8px 10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {missionLabel(f.mission)} · {shipCount} nave(s)
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {formatCoords(f.originCoords)} → {formatCoords(f.targetCoords)} (
                        {f.phase === "outbound" ? "Ida" : "Retorno"})
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                        ETA: {formatDuration(eta)}
                      </div>
                    </div>
                    {f.phase === "outbound" && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => {
                          audioSynth.playClick();
                          void postAction("/api/ogame/fleet/recall", { fleetId: f.id }, "Frota chamada de volta!");
                        }}
                      >
                        Recolher
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGalaxyTab = () => {
    if (!snapshot) return null;
    return (
      <div>
          <div className="galaxy-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Galáxia 1 · Sistema:</span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                className={`ctrl-btn ${galaxySystem === s ? "is-active" : ""}`}
                onClick={() => {
                  audioSynth.playClick();
                  handleSwitchSystem(s);
                  handleSwitchView("galaxy");
                }}
              >
                [1:{s}]
              </button>
            ))}
          </div>
          <span className="card-desc">
            Arraste o mapa 3D para girar, use o botão direito/2 dedos para mover ou clique em um planeta para agir.
          </span>
        </div>

        <div className="galaxy-table-wrap">
          <table className="galaxy-table">
            <thead>
              <tr>
                <th>Pos</th>
              <th>Planeta</th>
              <th>Bioma</th>
              <th>Comandante</th>
              <th>Destroços</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.activeSystem.slots.map((slot) => (
              <tr key={slot.position}>
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{slot.position}</td>
                <td>
                  {slot.planetId ? (
                    <span style={{ fontWeight: 700, color: slot.isOwn ? "var(--accent-emerald)" : "#f8fafc" }}>
                      {slot.name} {slot.hasMoon ? "🌙" : ""}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>— Espaço livre —</span>
                  )}
                </td>
                <td>{slot.biome ? biomeLabel(slot.biome) : "—"}</td>
                <td>
                  {slot.ownerName ? (
                    <span>
                      {slot.ownerName}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({slot.points} pts)</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {slot.debris
                    ? `${formatNumber(slot.debris.metal)}M / ${formatNumber(slot.debris.crystal)}C`
                    : "—"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {slot.planetId && !slot.isOwn && (
                      <>
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => handleQuickMissionFromGalaxy(slot.position, "espionage")}
                        >
                          Espionar
                        </button>
                        <button
                          type="button"
                          className="secondary-action"
                          style={{ borderColor: "rgba(239,68,68,0.45)", color: "#fca5a5" }}
                          onClick={() => handleQuickMissionFromGalaxy(slot.position, "attack")}
                        >
                          Atacar
                        </button>
                      </>
                    )}
                    {slot.isOwn && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => handleQuickMissionFromGalaxy(slot.position, "transport")}
                      >
                        Transportar
                      </button>
                    )}
                    {!slot.planetId && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => handleQuickMissionFromGalaxy(slot.position, "colonize")}
                      >
                        Colonizar
                      </button>
                    )}
                    {slot.debris && (
                      <button
                        type="button"
                        className="secondary-action"
                        style={{ borderColor: "rgba(245,158,11,0.5)", color: "#fde68a" }}
                        onClick={() => handleQuickMissionFromGalaxy(slot.position, "recycle")}
                      >
                        Reciclar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  const renderReportsTab = () => {
    if (!snapshot) return null;
    return (
      <div>
        <div className="galaxy-toolbar">
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Relatórios recentes ({snapshot.player.reports.length})
          </span>
          {unreadReports > 0 && (
            <button
              type="button"
              className="secondary-action"
              onClick={() => void postAction("/api/ogame/reports/read", {}, "Relatórios marcados como lidos.")}
            >
              Marcar todos como lidos ({unreadReports})
            </button>
          )}
        </div>

        <div className="reports-list">
          {snapshot.player.reports.map((rep) => (
            <div key={rep.id} className={`report-card ${!rep.read ? "is-unread" : ""}`}>
              <div className="card-head">
                <div className="card-title">{rep.title}</div>
                <span className="card-level">
                  {new Date(rep.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
              <div className="card-desc" style={{ color: "#e2e8f0", marginTop: 4 }}>
                {rep.summary}
              </div>

              {rep.rounds && rep.rounds.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {rep.rounds.map((r) => (
                    <span key={r.round} className="cost-tag" style={{ fontSize: 10.5 }}>
                      R{r.round}: Atq {r.attackerRemainingCount} vs Def {r.defenderRemainingCount}
                    </span>
                  ))}
                </div>
              )}

              {rep.espionageData && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  {rep.espionageData.ships && (
                    <div>
                      <strong>Frota:</strong>{" "}
                      {Object.entries(rep.espionageData.ships)
                        .filter(([, c]) => (c ?? 0) > 0)
                        .map(([k, c]) => `${SHIP_DEFS[k as ShipId]?.shortName ?? k}: ${c}`)
                        .join(", ") || "Nenhuma nave"}
                    </div>
                  )}
                  {rep.espionageData.defenses && (
                    <div>
                      <strong>Defesas:</strong>{" "}
                      {Object.entries(rep.espionageData.defenses)
                        .filter(([, c]) => (c ?? 0) > 0)
                        .map(([k, c]) => `${DEFENSE_DEFS[k as DefenseId]?.shortName ?? k}: ${c}`)
                        .join(", ") || "Sem defesas"}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderOverviewTab = () => {
    if (!activePlanet || !snapshot) return null;
    const bq = activePlanet.buildingQueue;
    const rq = snapshot.player.researchQueue;
    const shipCount = Object.values(activePlanet.ships).reduce((a, b) => a + (b || 0), 0);
    const defCount = Object.values(activePlanet.defenses).reduce((a, b) => a + (b || 0), 0);

    return (
      <div className="overview-grid">
        <div className="panel-box">
          <h3 className="panel-heading">Colônia & Comandante</h3>
          <div className="stat-line">
            <span>Comandante</span>
            <strong>{snapshot.player.commanderName}</strong>
          </div>
          <div className="stat-line">
            <span>Planeta</span>
            <strong>{activePlanet.name}</strong>
          </div>
          <div className="stat-line">
            <span>Coordenadas</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>{formatCoords(activePlanet.coords)}</strong>
          </div>
          <div className="stat-line">
            <span>Bioma / Temp. Máx.</span>
            <strong>
              {biomeLabel(activePlanet.biome)} · {activePlanet.temperatureMax}°C
            </strong>
          </div>
          <div className="stat-line">
            <span>Diâmetro / Campos</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {formatNumber(activePlanet.diameterKm)} km · {activePlanet.fieldsUsed}/{activePlanet.fieldsMax}
            </strong>
          </div>
          <div className="stat-line">
            <span>Pontuação / Matéria Negra</span>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent-amber)" }}>
              {formatNumber(snapshot.player.points)} pts ·{" "}
              <button
                type="button"
                className="inline-link-mn"
                onClick={() => {
                  audioSynth.playClick();
                  setActiveTab("dark_market");
                  setDockCollapsed(false);
                }}
              >
                {formatNumber(liveDarkMatter)} MN
              </button>
            </strong>
          </div>

          {!nameFormHidden && (
            <div className="inline-form">
              <input
                type="text"
                className="text-input"
                maxLength={24}
                value={commanderInput}
                onChange={(e) => setCommanderInput(e.target.value)}
                placeholder="Nome do Comandante"
              />
              <input
                type="text"
                className="text-input"
                maxLength={24}
                value={planetNameInput}
                onChange={(e) => setPlanetNameInput(e.target.value)}
                placeholder="Nome do Planeta"
              />
              <button
                type="button"
                className="secondary-action"
                onClick={async () => {
                  const ok = await postAction(
                    "/api/ogame/profile",
                    {
                      planetId: activePlanet.id,
                      commanderName: commanderInput,
                      planetName: planetNameInput,
                    },
                    "Identificação atualizada!",
                  );
                  if (ok) {
                    setNameFormHidden(true);
                    try {
                      if (typeof localStorage !== "undefined") {
                        localStorage.setItem(NAME_SAVED_STORAGE_KEY, "1");
                      }
                    } catch {
                      // ignore blocked storage
                    }
                  }
                }}
              >
                Salvar
              </button>
            </div>
          )}
        </div>

        <div className="panel-box">
          <h3 className="panel-heading">Produção & Armazéns</h3>
          <div className="stat-line">
            <span>Metal (+{formatNumber(activePlanet.rates.metalPerHour)}/h)</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {formatNumber(liveResources.metal)} / {formatNumber(activePlanet.rates.storageCap.metal)}
            </strong>
          </div>
          <div className="stat-line">
            <span>Cristal (+{formatNumber(activePlanet.rates.crystalPerHour)}/h)</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {formatNumber(liveResources.crystal)} / {formatNumber(activePlanet.rates.storageCap.crystal)}
            </strong>
          </div>
          <div className="stat-line">
            <span>Deutério (+{formatNumber(activePlanet.rates.deuteriumPerHour)}/h)</span>
            <strong style={{ fontFamily: "var(--font-mono)" }}>
              {formatNumber(liveResources.deuterium)} / {formatNumber(activePlanet.rates.storageCap.deuterium)}
            </strong>
          </div>
          <div className="stat-line">
            <span>Eficiência Energética</span>
            <strong
              style={{
                fontFamily: "var(--font-mono)",
                color:
                  activePlanet.rates.energyFactor < 1 ? "var(--accent-amber)" : "var(--accent-emerald)",
              }}
            >
              {Math.round(activePlanet.rates.energyFactor * 100)}% ({activePlanet.rates.energyProduced}/
              {activePlanet.rates.energyConsumed})
            </strong>
          </div>
          <div className="stat-line">
            <span>Espaço / Globo 3D</span>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent-cyan)" }}>
              {Math.round(globeFillStats.fillRatio * 100)}% cheio · {globeFillStats.globeScale.toFixed(2)}×
            </strong>
          </div>
          <div className="stat-line">
            <span>Guarnição Orbital</span>
            <strong>
              {shipCount} naves · {defCount} defesas
            </strong>
          </div>
        </div>

        <div className="panel-box">
          <h3 className="panel-heading">Operações Ativas</h3>
          {bq ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                Obra: {BUILDING_DEFS[bq.buildingId].shortName} Nv.{bq.targetLevel}
              </div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent-cyan)" }}>
                Restante: {formatDuration(bq.finishesAt - nowMs)}
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(4, ((nowMs - bq.startedAt) / Math.max(1, bq.finishesAt - bq.startedAt)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="card-desc" style={{ marginBottom: 6 }}>
              Nenhuma obra planetária em curso.
            </div>
          )}

          {rq ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                Pesquisa: {TECH_DEFS[rq.techId].name} Nv.{rq.targetLevel}
              </div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent-purple)" }}>
                Restante: {formatDuration(rq.finishesAt - nowMs)}
              </div>
            </div>
          ) : (
            <div className="card-desc" style={{ marginBottom: 6 }}>
              Laboratório ocioso.
            </div>
          )}

          <div className="card-desc">
            Clique diretamente nos blocos 3D dos edifícios no planeta ou nos planetas da Galáxia 3D para interagir.
          </div>
        </div>
      </div>
    );
  };

  const renderDarkMarketTab = () => {
    if (!activePlanet || !snapshot) return null;
    const categoryLabel: Record<"boost" | "resource" | "fleet" | "planet", string> = {
      boost: "Aceleração",
      resource: "Suprimento",
      fleet: "Frota",
      planet: "Expansão",
    };

    return (
      <div>
        <div className="galaxy-toolbar">
          <div>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: 13.5, color: "#e9d5ff" }}>
              Comércio Exclusivo de Matéria Negra
            </strong>
            <div className="card-desc">
              Todos os itens abaixo são adquiridos exclusivamente com Matéria Negra ({formatNumber(liveDarkMatter)} MN
              disponível · +{formatNumber(totalDarkMatterPerHour)}/h).
            </div>
          </div>
          <span className="queue-chip" style={{ color: "#d8b4fe", fontWeight: 700 }}>
            Saldo: {formatNumber(liveDarkMatter)} MN
          </span>
        </div>

        <div className="cards-grid">
          {DARK_MARKET_ORDER.map((itemId: DarkMarketItemId) => {
            const item = DARK_MARKET_ITEMS[itemId];
            const canAfford = liveDarkMatter >= item.costDarkMatter;
            let precondError: string | null = null;
            if (itemId === "instant_build" && !activePlanet.buildingQueue) {
              precondError = "Sem obra ativa neste planeta";
            } else if (itemId === "instant_research" && !snapshot.player.researchQueue) {
              precondError = "Sem pesquisa ativa";
            } else if (itemId === "instant_shipyard" && activePlanet.shipyardQueue.length === 0) {
              precondError = "Fila do hangar vazia";
            }

            return (
              <div key={itemId} className={`ogame-card dark-market-card ${!canAfford ? "is-locked" : ""}`}>
                <div>
                  <div className="card-head">
                    <div className="card-title">{item.name}</div>
                    <span className="card-level" style={{ color: "#c084fc" }}>
                      {categoryLabel[item.category]}
                    </span>
                  </div>
                  <div className="card-desc">{item.description}</div>
                </div>

                <div>
                  <div className="cost-row">
                    <span
                      className={`cost-tag ${!canAfford ? "is-missing" : ""}`}
                      style={canAfford ? { color: "#e9d5ff", fontWeight: 700 } : undefined}
                    >
                      Exclusivo: {formatNumber(item.costDarkMatter)} MN
                    </span>
                  </div>
                  {precondError && (
                    <div className="card-desc" style={{ color: "#fbbf24", marginTop: 4 }}>
                      {precondError}
                    </div>
                  )}
                  <div className="card-actions" style={{ marginTop: 8 }}>
                    <span className="card-desc">Planeta: {activePlanet.name}</span>
                    <button
                      type="button"
                      className="primary-action mn-buy-btn"
                      disabled={!canAfford || Boolean(precondError)}
                      onClick={() => {
                        audioSynth.playBuildStart();
                        void postAction("/api/ogame/dark-market", {
                          planetId: activePlanet.id,
                          itemId,
                        });
                      }}
                    >
                      Comprar ({formatNumber(item.costDarkMatter)} MN)
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const energyNet = activePlanet
    ? activePlanet.rates.energyProduced - activePlanet.rates.energyConsumed
    : 0;

  return (
    <div className="ogame-shell">
      {/* Isolated Three.js Voxel Viewport */}
      <div ref={canvasMountRef} className="canvas-layer" />

      {/* Show HUD button when hidden */}
      {hudHidden && (
        <button
          type="button"
          className="ctrl-btn show-hud-fab"
          onClick={() => setHudHidden(false)}
        >
          Mostrar Painel (H)
        </button>
      )}

      {/* Hover Tooltip */}
      {hoverInfo && !hudHidden && (
        <div
          className="hover-tooltip"
          style={{
            left: Math.min(window.innerWidth - 270, hoverInfo.x + 14),
            top: Math.max(12, hoverInfo.y - 46),
          }}
        >
          <div className="hover-tooltip-title">{hoverInfo.info.title}</div>
          <div className="hover-tooltip-sub">{hoverInfo.info.subtitle}</div>
        </div>
      )}

      {/* Offline indicator */}
      {!isOnline && (
        <div className="offline-banner" role="status">
          Modo Offline — Exibindo dados em cache
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-banner ${toast.isError ? "is-error" : ""}`} role="status">
          {toast.text}
        </div>
      )}

      {/* Main HUD Overlay */}
      {!hudHidden && (
        <div className="hud-layer">
          {/* Top Command & Resource Strip */}
          <header className="top-bar">
            <div className="top-cluster hud-interactive">
              <div className="brand-badge">
                <div className="brand-mark">OX</div>
                <span className="brand-title">Ogamex Pro</span>
              </div>

              {snapshot && (
                <>
                  <select
                    className="planet-select"
                    value={activePlanet?.id ?? ""}
                    onChange={(e) => {
                      audioSynth.playClick();
                      setActivePlanetId(e.target.value);
                      handleSwitchView("planet");
                    }}
                    aria-label="Selecionar colônia"
                  >
                    {snapshot.planets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {formatCoords(p.coords)}
                      </option>
                    ))}
                  </select>

                  <div className="speed-group" title="Velocidade do Universo">
                    {[10, 60, 300].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={`speed-btn ${snapshot.universeSpeed === spd ? "is-active" : ""}`}
                        onClick={() =>
                          void postAction("/api/ogame/speed", { speed: spd }, `Velocidade ajustada para ${spd}x`)
                        }
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {activePlanet && (
              <div className="resource-strip hud-interactive">
                <div className="res-item">
                  <span className="res-swatch" style={{ background: "#94a3b8" }} />
                  <div className="res-meta">
                    <span className="res-label">Metal</span>
                    <span className="res-val">{formatNumber(liveResources.metal)}</span>
                    <span className="res-rate">+{formatNumber(activePlanet.rates.metalPerHour)}/h</span>
                  </div>
                </div>
                <div className="res-item">
                  <span className="res-swatch" style={{ background: "#38bdf8" }} />
                  <div className="res-meta">
                    <span className="res-label">Cristal</span>
                    <span className="res-val">{formatNumber(liveResources.crystal)}</span>
                    <span className="res-rate">+{formatNumber(activePlanet.rates.crystalPerHour)}/h</span>
                  </div>
                </div>
                <div className="res-item">
                  <span className="res-swatch" style={{ background: "#2dd4bf" }} />
                  <div className="res-meta">
                    <span className="res-label">Deutério</span>
                    <span className="res-val">{formatNumber(liveResources.deuterium)}</span>
                    <span className="res-rate">+{formatNumber(activePlanet.rates.deuteriumPerHour)}/h</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`res-item res-item-btn ${activeTab === "dark_market" && !dockCollapsed ? "is-active" : ""}`}
                  onClick={() => {
                    audioSynth.playClick();
                    setActiveTab("dark_market");
                    setDockCollapsed(false);
                    if (viewMode !== "planet") handleSwitchView("planet");
                  }}
                  title="Clique para abrir o Comércio exclusivo de Matéria Negra"
                >
                  <span className="res-swatch" style={{ background: "#a855f7" }} />
                  <div className="res-meta">
                    <span className="res-label">Matéria Negra</span>
                    <span className="res-val" style={{ color: "#e9d5ff" }}>
                      {formatNumber(liveDarkMatter)}
                    </span>
                    <span className="res-rate" style={{ color: "#c084fc" }}>
                      {totalDarkMatterPerHour > 0 ? `+${formatNumber(totalDarkMatterPerHour)}/h · Loja` : "Abrir Loja"}
                    </span>
                  </div>
                </button>
                <div className="res-item">
                  <span className="res-swatch" style={{ background: "#fbbf24" }} />
                  <div className="res-meta">
                    <span className="res-label">Energia</span>
                    <span className="res-val">
                      {energyNet >= 0 ? `+${formatNumber(energyNet)}` : formatNumber(energyNet)}
                    </span>
                    <span className={`res-rate ${energyNet < 0 ? "is-negative" : ""}`}>
                      {activePlanet.rates.energyProduced}/{activePlanet.rates.energyConsumed}
                    </span>
                  </div>
                </div>
                <div className="res-item" title="O globo planetário cresce conforme o espaço de recursos enche">
                  <span className="res-swatch" style={{ background: "#38bdf8" }} />
                  <div className="res-meta">
                    <span className="res-label">Espaço</span>
                    <span className="res-val">{Math.round(globeFillStats.fillRatio * 100)}%</span>
                    <span className="res-rate" style={{ color: "var(--accent-cyan)" }}>
                      {globeFillStats.globeScale.toFixed(2)}×
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="top-cluster hud-interactive">
              {viewMode === "planet" && (
                <button
                  type="button"
                  className={`ctrl-btn is-purple ${planetAutoSpin ? "is-active" : ""}`}
                  aria-pressed={planetAutoSpin}
                  onClick={() => {
                    audioSynth.playClick();
                    const next = !planetAutoSpin;
                    setPlanetAutoSpin(next);
                    try {
                      if (typeof localStorage !== "undefined") {
                        localStorage.setItem(PLANET_SPIN_STORAGE_KEY, next ? "1" : "0");
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  title="Ativar ou pausar giro orbital suave do planeta"
                >
                  {planetAutoSpin ? "Giro Ativo" : "Giro Orbital"}
                </button>
              )}
              <button
                type="button"
                className="ctrl-btn"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  audioSynth.setMuted(next);
                }}
              >
                {muted ? "Som Off" : "Som On"}
              </button>
              <button
                type="button"
                className="ctrl-btn"
                onClick={() => setHudHidden(true)}
                title="Ocultar painel (H)"
              >
                Ocultar
              </button>
              {!pwa.isInstalled && (
                <button
                  type="button"
                  className="ctrl-btn install-app-btn"
                  onClick={() => {
                    if (pwa.isInstallable) {
                      void pwa.install();
                    } else {
                      setInstallGuideOpen(true);
                    }
                  }}
                  title="Instalar versão Android / App na tela inicial"
                >
                  {pwa.isInstallable ? "Instalar App" : "App Android"}
                </button>
              )}
            </div>
          </header>

          {/* Bottom Collapsible OGame Command Dock */}
          <section className="bottom-dock hud-interactive" aria-label="Centro de Comando OGame">
            <div className="dock-tabs-bar">
              <div className="dock-tabs-list">
                {(
                  [
                    ["overview", "Visão Geral"],
                    ["resources", "Recursos"],
                    ["facilities", "Instalações"],
                    ["research", "Pesquisa"],
                    ["shipyard", "Hangar"],
                    ["defense", "Defesa"],
                    ["fleet", "Frota"],
                    ["galaxy", "Galáxia"],
                    ["reports", "Relatórios"],
                    ["dark_market", "Comércio MN"],
                  ] as [DockTab, string][]
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    className={`dock-tab ${tabId === "dark_market" ? "is-purple" : ""} ${activeTab === tabId ? "is-active" : ""}`}
                    onClick={() => {
                      audioSynth.playClick();
                      setActiveTab(tabId);
                      setDockCollapsed(false);
                      if (tabId === "galaxy") {
                        handleSwitchView("galaxy");
                      } else if (tabId === "fleet") {
                        if (targetSystem !== galaxySystem) {
                          handleSwitchSystem(targetSystem);
                        }
                        handleSwitchView("galaxy");
                        engineRef.current?.focusGalaxySlot(
                          fleetMission === "expedition" ? 16 : targetPosition,
                          targetSystem,
                        );
                      } else {
                        handleSwitchView("planet");
                      }
                    }}
                  >
                    <span>{label}</span>
                    {tabId === "fleet" && snapshot && snapshot.fleets.length > 0 && (
                      <span className="badge-count">{snapshot.fleets.length}</span>
                    )}
                    {tabId === "reports" && unreadReports > 0 && (
                      <span className="badge-count">{unreadReports}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="dock-status-chips">
                {activePlanet?.buildingQueue && (
                  <span className="queue-chip">
                    {BUILDING_DEFS[activePlanet.buildingQueue.buildingId].shortName}{" "}
                    {formatDuration(activePlanet.buildingQueue.finishesAt - nowMs)}
                  </span>
                )}
                {snapshot?.player.researchQueue && (
                  <span className="queue-chip">
                    {TECH_DEFS[snapshot.player.researchQueue.techId].name}{" "}
                    {formatDuration(snapshot.player.researchQueue.finishesAt - nowMs)}
                  </span>
                )}
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setDockCollapsed((c) => !c)}
                >
                  {dockCollapsed ? "Expandir" : "Recolher"}
                </button>
              </div>
            </div>

            {!dockCollapsed && (
              <div className="dock-body">
                {!snapshot || !activePlanet ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="card-desc">
                      {connError || "Sincronizando com o setor orbital..."}
                    </span>
                    {connError && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void fetchState(galaxySystem)}
                      >
                        Reconectar
                      </button>
                    )}
                  </div>
                ) : activeTab === "overview" ? (
                  renderOverviewTab()
                ) : activeTab === "resources" ? (
                  renderBuildingCards("resource")
                ) : activeTab === "facilities" ? (
                  renderBuildingCards("facility")
                ) : activeTab === "research" ? (
                  renderResearchTab()
                ) : activeTab === "shipyard" ? (
                  renderShipyardOrDefense("ship")
                ) : activeTab === "defense" ? (
                  renderShipyardOrDefense("defense")
                ) : activeTab === "fleet" ? (
                  renderFleetTab()
                ) : activeTab === "galaxy" ? (
                  renderGalaxyTab()
                ) : activeTab === "dark_market" ? (
                  renderDarkMarketTab()
                ) : (
                  renderReportsTab()
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {installGuideOpen && (
        <div
          className="install-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-modal-title"
          onClick={() => setInstallGuideOpen(false)}
        >
          <div className="install-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="install-modal-title" className="panel-heading" style={{ fontSize: 15 }}>
              Instalar Ogamex Pro no Android
            </h3>
            {pwa.isIOS ? (
              <p className="card-desc" style={{ color: "#e2e8f0", marginTop: 6 }}>
                1. Toque em <strong>Compartilhar</strong> na barra do Safari.
                <br />
                2. Selecione <strong>Adicionar à Tela de Início</strong> para abrir em tela cheia.
              </p>
            ) : (
              <p className="card-desc" style={{ color: "#e2e8f0", marginTop: 6 }}>
                1. Abra este jogo no <strong>Google Chrome (Android)</strong>.
                <br />
                2. Toque no menu <strong>⋮</strong> (canto superior direito).
                <br />
                3. Escolha <strong>Instalar aplicativo</strong> ou{" "}
                <strong>Adicionar à tela inicial</strong> para rodar como App em tela cheia.
              </p>
            )}
            <div className="panel-box" style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, color: "var(--accent-cyan)", fontWeight: 700 }}>
                Controles Touch no Android
              </div>
              <div className="card-desc" style={{ marginTop: 4 }}>
                • 1 dedo: girar o planeta ou o sistema estelar 3D
                <br />• Pinça/arraste com 2 dedos: zoom no globo e mover na Galáxia 3D
                <br />• Toque duas vezes no fundo 3D para recentralizar a câmera
                <br />• Toque nos edifícios 3D para evoluir ou nos planetas da Galáxia para atacar
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              {pwa.isInstallable && (
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    void pwa.install();
                    setInstallGuideOpen(false);
                  }}
                >
                  Instalar Agora
                </button>
              )}
              <button
                type="button"
                className="secondary-action"
                onClick={() => setInstallGuideOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

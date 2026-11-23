import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCharacterAvatarRig } from "../../client/voxel/character_system.js";
import { buildCreationGroup, buildVoxelMesh, Vox } from "../../client/voxel/vox.js";
import {
  buildBuildingBlueprint,
  buildCommandNexusBlueprint,
  buildDefenseBlueprint,
  buildPlanetSphereBlueprint,
  buildShipBlueprint,
  buildStarBlueprint,
} from "../shared/ogame_blueprints";
import {
  biomeLabel,
  BUILDING_DEFS,
  BUILDING_ORDER,
  computePlanetResourceFillScale,
  DEFENSE_DEFS,
  DEFENSE_ORDER,
  formatCoords,
  SHIP_DEFS,
  SHIP_ORDER,
} from "../shared/ogame_catalog";
import type {
  BuildingId,
  Coordinates,
  FleetMission,
  GalaxySlotView,
  OgameClientSnapshot,
  PlanetBiome,
  PlanetRates,
  PlanetState,
  ShipId,
  VoxelBlueprint,
} from "../types";

interface AvatarRigHandle {
  root: THREE.Group;
  setFirstPersonMode(isFp: boolean): void;
  applyPose(params: {
    dt?: number;
    t?: number;
    yaw?: number;
    pitch?: number;
    speed?: number;
    anim?: string;
    jumpY?: number;
    waveTimer?: number;
    isFirstPerson?: boolean;
  }): void;
  dispose(): void;
}

export type ViewMode = "planet" | "galaxy";
export type CameraMode = "pan" | "orbit" | "walk";

export interface HoverTargetInfo {
  title: string;
  subtitle: string;
}

export interface EngineCallbacks {
  onSelectBuilding: (buildingId: BuildingId) => void;
  onSelectGalaxySlot: (position: number) => void;
  onHoverChange: (info: HoverTargetInfo | null, clientX: number, clientY: number) => void;
  onCameraModeChange: (mode: CameraMode) => void;
}

interface PickTargetData {
  kind: "building" | "galaxySlot";
  buildingId?: BuildingId;
  position?: number;
  title: string;
  subtitle: string;
}

interface PatrolShipEntry {
  group: THREE.Group;
  orbitRadius: number;
  inclination: number;
  speed: number;
  phase: number;
}

interface GalaxyFleetVisual {
  fleet: FleetMission;
  group: THREE.Group;
}

const GLOBE_VOX_R = 24;
const GLOBE_VOX_SCALE = 0.56;
const BASE_GLOBE_RADIUS = GLOBE_VOX_R * GLOBE_VOX_SCALE;

const PLANET_ZOOM_STORAGE_KEY = "ogamex_planet_zoom_v1";
const DEFAULT_PLANET_DIR = new THREE.Vector3(19, 17, 36).normalize();

const BUILDING_SPHERICAL_SLOTS: Record<BuildingId, { lat: number; lon: number; yaw: number }> = {
  metal_mine: { lat: 44, lon: -42, yaw: 0.45 },
  crystal_mine: { lat: 46, lon: 38, yaw: -0.45 },
  solar_plant: { lat: 42, lon: 118, yaw: 0.9 },
  robotics_factory: { lat: 48, lon: -125, yaw: 0.25 },
  research_lab: { lat: 36, lon: 175, yaw: -0.25 },
  deuterium_synthesizer: { lat: 10, lon: -8, yaw: 0.15 },
  dark_matter_mine: { lat: -48, lon: 92, yaw: 0.35 },
  metal_storage: { lat: 14, lon: -78, yaw: 0.3 },
  crystal_storage: { lat: 12, lon: 74, yaw: -0.3 },
  deuterium_tank: { lat: -12, lon: 22, yaw: -0.6 },
  shipyard: { lat: -8, lon: -45, yaw: 0.0 },
  fusion_reactor: { lat: -16, lon: 132, yaw: 0.75 },
  nanite_factory: { lat: -24, lon: -135, yaw: -0.75 },
  missile_silo: { lat: -42, lon: -18, yaw: 1.2 },
};

function sphericalDir(latDeg: number, lonDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return out
    .set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
    .normalize();
}

// Pre-allocated scratch math objects (zero GC allocations inside render loop)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _vec3D = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _upVec = new THREE.Vector3(0, 1, 0);
const _mat4A = new THREE.Matrix4();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function disposeGroupTree(root: THREE.Object3D): void {
  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (m && m.userData?.ownMaterial) m.dispose();
        }
      } else if (mat && mat.userData?.ownMaterial) {
        mat.dispose();
      }
    }
    const line = obj as THREE.Line;
    if (line.isLine) {
      if (line.geometry) line.geometry.dispose();
      const mat = line.material;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (m && m.userData?.ownMaterial) m.dispose();
        }
      } else if (mat && mat.userData?.ownMaterial) {
        mat.dispose();
      }
    }
  });
}

function slotOrbitAngle(system: number, pos: number): number {
  return ((pos * 2.17 + system * 1.37) % (Math.PI * 2));
}

function slotOrbitRadius(pos: number): number {
  return 11.5 + (pos - 1) * 4.15;
}

const BIOME_SURFACE: Record<
  PlanetBiome,
  { top: string; mid: string; cliff: string; road: string; pad: string; accent: string; glow: number }
> = {
  terran: { top: "#3d7a52", mid: "#2d5d40", cliff: "#3a3f4a", road: "#475569", pad: "#1e293b", accent: "#38bdf8", glow: 0 },
  oceanic: { top: "#0369a1", mid: "#075985", cliff: "#1e3a5f", road: "#334155", pad: "#1e293b", accent: "#38bdf8", glow: 0.25 },
  volcanic: { top: "#27272a", mid: "#3f2e2b", cliff: "#18181b", road: "#44403c", pad: "#1c1917", accent: "#f97316", glow: 0.6 },
  ice: { top: "#bae6fd", mid: "#7dd3fc", cliff: "#475569", road: "#64748b", pad: "#1e293b", accent: "#38bdf8", glow: 0.15 },
  desert: { top: "#c28538", mid: "#9a6324", cliff: "#574330", road: "#785a3a", pad: "#292524", accent: "#fbbf24", glow: 0 },
  crystal: { top: "#4c1d95", mid: "#3b0764", cliff: "#1e1b4b", road: "#312e81", pad: "#17153b", accent: "#c084fc", glow: 0.45 },
};

export class OgameVoxelEngine {
  private mount: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envTexture: THREE.Texture | null = null;

  private planetRoot = new THREE.Group();
  private planetScaleGroup = new THREE.Group();
  private galaxyRoot = new THREE.Group();
  private starField: THREE.Points | null = null;
  private starLight: THREE.PointLight;

  private viewMode: ViewMode = "planet";
  private cameraMode: CameraMode = "orbit";
  private dockCollapsed = false;
  private disposed = false;
  private frameId = 0;
  private startMs = performance.now();
  private lastTickMs = performance.now();

  // State signatures to avoid rebuilding identical voxel worlds
  private lastPlanetSig = "";
  private lastGalaxySig = "";
  private currentPlanet: (PlanetState & { rates: PlanetRates }) | null = null;
  private currentSnapshot: OgameClientSnapshot | null = null;

  // Dynamic planet elements
  private planetAnimatedGroups: Array<THREE.Group & { userData: { animate?: ((t: number) => void) | null } }> = [];
  private galaxyAnimatedGroups: Array<THREE.Group & { userData: { animate?: ((t: number) => void) | null } }> = [];
  private patrolShips: PatrolShipEntry[] = [];
  private planetMoon: THREE.Group | null = null;
  private shieldDomeMesh: THREE.Mesh | null = null;
  private resourceRingMesh: THREE.Mesh | null = null;
  private resourceRingMat: THREE.MeshStandardMaterial | null = null;
  private atmosphereMat: THREE.MeshBasicMaterial | null = null;
  private currentGlobeScale = 0.85;
  private targetGlobeScale = 0.85;
  private currentFillRatio = 0.1;
  private buildingAnchors = new Map<BuildingId, THREE.Vector3>();
  private interactiveRoots: THREE.Object3D[] = [];

  // Dynamic galaxy elements
  private galaxyFleetGroup = new THREE.Group();
  private galaxyFleets: GalaxyFleetVisual[] = [];

  // Camera transition glide & persisted zoom/spin
  private glideTargetPos: THREE.Vector3 | null = null;
  private glideTargetLook: THREE.Vector3 | null = null;
  private savedPlanetZoomDist: number | null = null;
  private lastObservedPlanetDist = 44.2;
  private lastZoomSaveMs = 0;
  private planetAutoSpin = false;

  // Spherical surface walk state
  private avatarRig: AvatarRigHandle | null = null;
  private walkDir = sphericalDir(68, 12);
  private walkForward = new THREE.Vector3(0, 0, 1);
  private walkPitch = -0.08;
  private walkJumpOffset = 0;
  private walkVelY = 0;
  private walkKeys = new Set<string>();
  private joystickVec = { x: 0, y: 0 };
  private walkDragging = false;
  private walkDragMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Pointer picking state
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastHoverCheckMs = 0;
  private currentHoverTitle = "";

  // DOM listeners
  private onResizeBound: () => void;
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;
  private onDblClickBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onContextLostBound: (e: Event) => void;

  constructor(mount: HTMLElement, callbacks: EngineCallbacks) {
    this.mount = mount;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#060b14");
    this.scene.fog = new THREE.FogExp2("#060b14", 0.0052);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(PLANET_ZOOM_STORAGE_KEY);
        if (raw) {
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= 14 && parsed <= 150) {
            this.savedPlanetZoomDist = parsed;
          }
        }
      }
    } catch {
      // Blocked storage in sandboxed iframe
    }

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(48, width / Math.max(1, height), 0.25, 420);
    if (this.savedPlanetZoomDist !== null) {
      this.camera.position.copy(DEFAULT_PLANET_DIR).multiplyScalar(this.savedPlanetZoomDist);
    } else {
      this.camera.position.set(19, 17, 36);
    }
    this.updateCameraViewOffset();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 150;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.lastObservedPlanetDist = this.camera.position.distanceTo(this.controls.target);
    this.applyControlMode();

    this.controls.addEventListener("start", () => {
      this.glideTargetPos = null;
      this.glideTargetLook = null;
    });
    this.controls.addEventListener("change", () => {
      this.captureManualPlanetZoom(false);
    });
    this.controls.addEventListener("end", () => {
      this.captureManualPlanetZoom(true);
    });

    // Studio Space Lighting (warm solar key + cool cosmic fill + rim)
    const hemi = new THREE.HemisphereLight("#7dd3fc", "#0f172a", 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#fff1d6", 2.05);
    keyLight.position.set(36, 48, 28);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -38;
      keyLight.shadow.camera.right = 38;
      keyLight.shadow.camera.top = 38;
      keyLight.shadow.camera.bottom = -38;
      keyLight.shadow.camera.near = 5;
      keyLight.shadow.camera.far = 120;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#38bdf8", 0.65);
    rimLight.position.set(-34, 22, -30);
    this.scene.add(rimLight);

    this.starLight = new THREE.PointLight("#fbbf24", 2.2, 160, 1.1);
    this.starLight.position.set(0, 3, 0);
    this.galaxyRoot.add(this.starLight);

    this.buildStarField();

    this.planetRoot.add(this.planetScaleGroup);
    this.scene.add(this.planetRoot);
    this.galaxyRoot.visible = false;
    this.galaxyRoot.add(this.galaxyFleetGroup);
    this.scene.add(this.galaxyRoot);

    this.initAvatarRig();
    this.buildPlaceholderPlanet();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Event bindings
    this.onResizeBound = () => this.handleResize();
    window.addEventListener("resize", this.onResizeBound);

    const dom = this.renderer.domElement;
    this.onPointerDownBound = (e) => this.handlePointerDown(e);
    this.onPointerMoveBound = (e) => this.handlePointerMove(e);
    this.onPointerUpBound = (e) => this.handlePointerUp(e);
    this.onDblClickBound = () => this.recenter();
    dom.addEventListener("pointerdown", this.onPointerDownBound);
    dom.addEventListener("pointermove", this.onPointerMoveBound);
    dom.addEventListener("dblclick", this.onDblClickBound);
    window.addEventListener("pointerup", this.onPointerUpBound);

    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    window.addEventListener("keydown", this.onKeyDownBound);
    window.addEventListener("keyup", this.onKeyUpBound);

    this.onContextLostBound = (e) => {
      e.preventDefault();
    };
    dom.addEventListener("webglcontextlost", this.onContextLostBound);

    this.scheduleNextTick();
  }

  private initAvatarRig(): void {
    this.avatarRig = buildCharacterAvatarRig(
      {
        skin: "#eab586",
        hairStyle: "short",
        hairColor: "#242024",
        hatStyle: "none",
        hatColor: "#38bdf8",
        eyeStyle: "visor",
        accessory: "jetpack",
        accessoryColor: "#38bdf8",
        topStyle: "jacket",
        topColor: "#1e293b",
        bottomStyle: "cargo",
        bottomColor: "#334155",
        shoeColor: "#f59e0b",
      },
      { isLocalPlayer: true, scale: 0.145, castShadow: !this.isSoftwareGl },
    );
    this.avatarRig.root.visible = false;
    this.planetRoot.add(this.avatarRig.root);
  }

  private buildStarField(): void {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = ((i * 73856093) % 10007) / 10007;
      const v = ((i * 19349663) % 10007) / 10007;
      const w = ((i * 83492791) % 10007) / 10007;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = 135 + w * 95;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const tint = (i % 5 === 0) ? [0.65, 0.85, 1.0] : (i % 7 === 0) ? [1.0, 0.86, 0.62] : [0.88, 0.92, 0.98];
      colors[i * 3] = tint[0];
      colors[i * 3 + 1] = tint[1];
      colors[i * 3 + 2] = tint[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      sizeAttenuation: true,
    });
    mat.userData.ownMaterial = true;
    this.starField = new THREE.Points(geo, mat);
    this.scene.add(this.starField);
  }

  private buildPlaceholderPlanet(): void {
    const vox = new Vox(42);
    vox.sphere(0, 0, 0, 16, 16, 16, "#2d5d40");
    vox.sphere(5, 6, 8, 6, 5, 6, "#1d4ed8");
    vox.sphere(-6, -4, 7, 5, 6, 5, "#3d7a52");
    const mesh = buildVoxelMesh(vox, { scale: 0.65, castShadow: false, receiveShadow: true });
    this.planetScaleGroup.add(mesh);
  }

  private clearGroupChildren(group: THREE.Group, preserve?: Set<THREE.Object3D>): void {
    const keep: THREE.Object3D[] = [];
    for (const child of [...group.children]) {
      if (preserve && preserve.has(child)) {
        keep.push(child);
        continue;
      }
      disposeGroupTree(child);
      group.remove(child);
    }
    for (const k of keep) {
      if (!group.children.includes(k)) group.add(k);
    }
  }

  private buildPlanetGlobe(planet: PlanetState): void {
    const biome = planet.biome;
    const pal = BIOME_SURFACE[biome];
    let seedHash = biome.length * 97 + 13;
    for (let i = 0; i < planet.id.length; i++) {
      seedHash += planet.id.charCodeAt(i) * (i + 1);
    }
    const vox = new Vox(seedHash);
    const R = GLOBE_VOX_R;
    const innerR = R - 2.6;

    // Build hollow multi-layered procedural voxel planet sphere with continents, seas, poles, and resource veins
    for (let x = -R - 1; x <= R; x++) {
      const cx = x + 0.5;
      for (let y = -R - 1; y <= R; y++) {
        const cy = y + 0.5;
        for (let z = -R - 1; z <= R; z++) {
          const cz = z + 0.5;
          const dist = Math.hypot(cx, cy, cz);
          if (dist < innerR - 1 || dist > R + 1.2) continue;

          const nx = cx / Math.max(0.001, dist);
          const ny = cy / Math.max(0.001, dist);
          const nz = cz / Math.max(0.001, dist);

          const elev =
            Math.sin(nx * 3.8 + seedHash * 0.13) * Math.cos(nz * 3.5 - seedHash * 0.09) +
            0.52 * Math.sin((nx + ny) * 6.4 + seedHash * 0.27) * Math.cos((nz - ny) * 5.6);

          const relief = elev > 0.56 ? 0.85 : elev < -0.35 ? -0.45 : 0;
          if (dist < innerR || dist > R + relief) continue;

          const polar = Math.abs(ny);
          const isGridVein =
            Math.abs(ny) < 0.045 ||
            (Math.abs(nx) < 0.04 && Math.abs(ny) < 0.65) ||
            (Math.abs(nz) < 0.04 && Math.abs(ny) < 0.65);

          let col = pal.top;
          let emit = 0;

          if (biome === "terran") {
            if (polar > 0.81) {
              col = "#e2e8f0";
            } else if (elev < -0.14) {
              col = elev < -0.48 ? "#1d4ed8" : "#2563eb";
            } else if (elev > 0.58) {
              col = "#64748b";
            } else {
              col = elev > 0.25 ? "#4a915f" : "#2d6a45";
            }
            if (isGridVein && elev >= -0.14 && polar <= 0.78) {
              col = "#475569";
            }
          } else if (biome === "oceanic") {
            if (polar > 0.82) {
              col = "#bae6fd";
            } else if (elev > 0.38) {
              col = "#2dd4bf";
              emit = 0.25;
            } else {
              col = elev < -0.3 ? "#0c4a6e" : "#0284c7";
            }
          } else if (biome === "volcanic") {
            if (elev < -0.28) {
              col = "#f97316";
              emit = 1.05;
            } else if (elev > 0.5) {
              col = "#3f3f46";
            } else {
              col = "#18181b";
            }
          } else if (biome === "ice") {
            if (elev < -0.25) {
              col = "#0ea5e9";
              emit = 0.25;
            } else if (elev > 0.45) {
              col = "#f8fafc";
            } else {
              col = "#93c5fd";
            }
          } else if (biome === "desert") {
            if (elev < -0.48) {
              col = "#2dd4bf";
            } else if (elev > 0.45) {
              col = "#9a6324";
            } else {
              col = "#d97706";
            }
          } else {
            // crystal
            if (elev > 0.42 || elev < -0.52) {
              col = elev > 0.42 ? "#c084fc" : "#38bdf8";
              emit = 0.95;
            } else {
              col = "#3b0764";
            }
          }

          if (dist < R - 1.2) {
            col = pal.cliff;
            emit = 0;
          }
          vox.put(x, y, z, col, emit);
        }
      }
    }

    const globeMesh = buildVoxelMesh(vox, {
      scale: GLOBE_VOX_SCALE,
      castShadow: false,
      receiveShadow: !this.isSoftwareGl,
      jitter: 0.04,
    });
    this.planetScaleGroup.add(globeMesh);

    // Subtle atmospheric outer glow sphere
    const atmoGeo = new THREE.SphereGeometry(BASE_GLOBE_RADIUS * 1.07, 36, 24);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: pal.accent,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.19,
      depthWrite: false,
    });
    atmoMat.userData.ownMaterial = true;
    this.atmosphereMat = atmoMat;
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    this.planetScaleGroup.add(atmoMesh);

    // Equatorial resource capacity ring — brightens & swells gently as storage fills
    const ringGeo = new THREE.TorusGeometry(BASE_GLOBE_RADIUS * 1.21, 0.18, 10, 72);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: pal.accent,
      emissive: new THREE.Color(pal.accent),
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.7,
      transparent: true,
      opacity: 0.35,
    });
    ringMat.userData.ownMaterial = true;
    this.resourceRingMat = ringMat;
    this.resourceRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.planetScaleGroup.add(this.resourceRingMesh);
  }

  private placeOnGlobe(
    obj: THREE.Object3D,
    latDeg: number,
    lonDeg: number,
    yaw = 0,
    radiusOffset = -0.34,
  ): THREE.Vector3 {
    const dir = sphericalDir(latDeg, lonDeg);
    obj.position.copy(dir).multiplyScalar(BASE_GLOBE_RADIUS + radiusOffset);
    _quatA.setFromUnitVectors(_upVec, dir);
    _quatB.setFromAxisAngle(_upVec, yaw);
    obj.quaternion.copy(_quatA).multiply(_quatB);
    return dir;
  }

  private rebuildPlanetScene(planet: PlanetState & { rates: PlanetRates }): void {
    const keepInRoot = new Set<THREE.Object3D>([this.planetScaleGroup]);
    if (this.avatarRig?.root) keepInRoot.add(this.avatarRig.root);
    this.clearGroupChildren(this.planetRoot, keepInRoot);
    this.clearGroupChildren(this.planetScaleGroup);

    this.planetAnimatedGroups = [];
    this.patrolShips = [];
    this.buildingAnchors.clear();
    this.interactiveRoots = [];
    this.planetMoon = null;
    this.shieldDomeMesh = null;
    this.resourceRingMesh = null;
    this.resourceRingMat = null;
    this.atmosphereMat = null;

    this.buildPlanetGlobe(planet);

    // 1. Central Command Nexus at North Crown
    const nexusGroup = buildCreationGroup(buildCommandNexusBlueprint(), { seed: 101 });
    nexusGroup.scale.setScalar(0.84);
    this.placeOnGlobe(nexusGroup, 82, 16, 0.25, -0.36);
    this.planetScaleGroup.add(nexusGroup);
    if (nexusGroup.userData.animate) {
      this.planetAnimatedGroups.push(nexusGroup);
    }

    // 2. Built Building Sectors (level >= 1) mounted radially across the globe
    for (let idx = 0; idx < BUILDING_ORDER.length; idx++) {
      const bId = BUILDING_ORDER[idx];
      const def = BUILDING_DEFS[bId];
      const slot = BUILDING_SPHERICAL_SLOTS[bId];
      const level = planet.buildings[bId] ?? 0;

      // Edifícios que ainda não evoluíram para o nível 1 não aparecem no planeta 3D
      if (level < 1) {
        continue;
      }

      const isUpgrading = planet.buildingQueue?.buildingId === bId;
      const bp = buildBuildingBlueprint(bId, level);
      const group = buildCreationGroup(bp, { seed: 300 + idx });
      group.scale.setScalar(0.72);

      const dir = this.placeOnGlobe(group, slot.lat, slot.lon, slot.yaw, -0.34);
      this.buildingAnchors.set(bId, dir);

      const pickData: PickTargetData = {
        kind: "building",
        buildingId: bId,
        title: `${def.name} (Nível ${level})`,
        subtitle: isUpgrading
          ? `Em construção para Nv.${planet.buildingQueue?.targetLevel}`
          : "Clique para evoluir ou inspecionar",
      };
      group.traverse((obj: THREE.Object3D) => {
        obj.userData.pickTarget = pickData;
      });
      this.interactiveRoots.push(group);
      this.planetScaleGroup.add(group);
      if (group.userData.animate) {
        this.planetAnimatedGroups.push(group);
      }

      // Active Construction Scaffolding
      if (isUpgrading) {
        const scaffVox = new Vox(900 + idx);
        scaffVox.box(-6, 0, -6, -5, 11, -5, "#f59e0b", 0.9);
        scaffVox.box(5, 0, -6, 6, 11, -5, "#f59e0b", 0.9);
        scaffVox.box(-6, 0, 5, -5, 11, 6, "#f59e0b", 0.9);
        scaffVox.box(5, 0, 5, 6, 11, 6, "#f59e0b", 0.9);
        scaffVox.box(-6, 10, -6, 6, 11, -5, "#38bdf8", 1.2);
        scaffVox.box(-6, 10, 5, 6, 11, 6, "#38bdf8", 1.2);
        const scaffMesh = buildVoxelMesh(scaffVox, { scale: 0.21, castShadow: false });
        this.placeOnGlobe(scaffMesh, slot.lat, slot.lon, slot.yaw, -0.25);
        this.planetScaleGroup.add(scaffMesh);
      }
    }

    // 3. Perimeter Defense Turrets & Shield Dome around the globe
    let turretSlot = 0;
    for (const dId of DEFENSE_ORDER) {
      const count = planet.defenses[dId] ?? 0;
      if (count <= 0) continue;
      if (dId === "small_shield_dome" || dId === "large_shield_dome") {
        const proj = buildCreationGroup(buildDefenseBlueprint(dId), { seed: 500 + turretSlot });
        proj.scale.setScalar(0.74);
        const lon = dId === "large_shield_dome" ? 135 : -135;
        this.placeOnGlobe(proj, 66, lon, 0, -0.32);
        this.planetScaleGroup.add(proj);
        if (proj.userData.animate) this.planetAnimatedGroups.push(proj);
        continue;
      }

      const visualCount = Math.min(3, Math.ceil(Math.sqrt(count)));
      for (let i = 0; i < visualCount; i++) {
        const lon = ((turretSlot * 47 + 20) % 360) - 180;
        const lat = turretSlot % 2 === 0 ? 27 : -29;
        const turret = buildCreationGroup(buildDefenseBlueprint(dId), { seed: 600 + turretSlot });
        turret.scale.setScalar(0.68);
        this.placeOnGlobe(turret, lat, lon, 0, -0.3);
        this.planetScaleGroup.add(turret);
        if (turret.userData.animate) this.planetAnimatedGroups.push(turret);
        turretSlot++;
      }
    }

    const hasLargeShield = (planet.defenses.large_shield_dome ?? 0) > 0;
    const hasSmallShield = (planet.defenses.small_shield_dome ?? 0) > 0;
    if (hasLargeShield || hasSmallShield) {
      const domeGeo = new THREE.IcosahedronGeometry(BASE_GLOBE_RADIUS + (hasLargeShield ? 5.2 : 4.2), 2);
      const domeMat = new THREE.MeshBasicMaterial({
        color: hasLargeShield ? "#38bdf8" : "#2dd4bf",
        wireframe: true,
        transparent: true,
        opacity: hasLargeShield ? 0.16 : 0.12,
        depthWrite: false,
      });
      domeMat.userData.ownMaterial = true;
      this.shieldDomeMesh = new THREE.Mesh(domeGeo, domeMat);
      this.planetScaleGroup.add(this.shieldDomeMesh);
    }

    // 4. Orbiting Patrol Fleet Ships (circling outside the scaled globe)
    let shipOrbitIdx = 0;
    for (const sId of SHIP_ORDER) {
      const cnt = planet.ships[sId] ?? 0;
      if (cnt <= 0) continue;
      const visualCount = sId === "deathstar" ? 1 : Math.min(3, Math.ceil(Math.sqrt(cnt)));
      for (let i = 0; i < visualCount; i++) {
        const shipGroup = buildCreationGroup(buildShipBlueprint(sId), { seed: 750 + shipOrbitIdx });
        shipGroup.scale.setScalar(sId === "deathstar" ? 1.05 : 0.66);
        this.planetRoot.add(shipGroup);
        if (shipGroup.userData.animate) this.planetAnimatedGroups.push(shipGroup);
        this.patrolShips.push({
          group: shipGroup,
          orbitRadius: sId === "solar_satellite" ? BASE_GLOBE_RADIUS + 4.4 : BASE_GLOBE_RADIUS + 5.8 + (shipOrbitIdx % 5) * 1.9,
          inclination: ((shipOrbitIdx % 5) - 2) * 0.28,
          speed: sId === "deathstar" ? 0.08 : 0.2 + (shipOrbitIdx % 3) * 0.07,
          phase: shipOrbitIdx * 1.45,
        });
        shipOrbitIdx++;
      }
    }

    // 5. Moon orbiting the planet globe if present
    if (planet.hasMoon) {
      const moonBp: VoxelBlueprint = buildPlanetSphereBlueprint("ice", false);
      this.planetMoon = buildCreationGroup(moonBp, { seed: 888 });
      this.planetMoon.scale.setScalar(0.82);
      this.planetRoot.add(this.planetMoon);
    }
  }

  private rebuildGalaxyScene(snapshot: OgameClientSnapshot): void {
    this.clearGroupChildren(this.galaxyRoot, new Set<THREE.Object3D>([this.starLight]));
    this.galaxyAnimatedGroups = [];
    this.galaxyRoot.add(this.galaxyFleetGroup);
    if (this.viewMode === "galaxy") {
      this.interactiveRoots = [];
    }

    // 1. Central Solar Star
    const starGroup = buildCreationGroup(buildStarBlueprint(), { seed: 11 });
    starGroup.scale.setScalar(1.35);
    this.galaxyRoot.add(starGroup);
    if (starGroup.userData.animate) {
      this.galaxyAnimatedGroups.push(starGroup);
    }

    const sys = snapshot.activeSystem.system;
    // 2. 15 Orbital Slots
    for (const slot of snapshot.activeSystem.slots) {
      const radius = slotOrbitRadius(slot.position);
      const angle = slotOrbitAngle(sys, slot.position);
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      // Orbit ring
      const pts: THREE.Vector3[] = [];
      const segs = 72;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const ringMat = new THREE.LineBasicMaterial({
        color: slot.isOwn ? "#10b981" : slot.planetId ? "#334155" : "#1e293b",
        transparent: true,
        opacity: slot.isOwn ? 0.55 : 0.35,
      });
      ringMat.userData.ownMaterial = true;
      this.galaxyRoot.add(new THREE.Line(ringGeo, ringMat));

      const slotContainer = new THREE.Group();
      slotContainer.position.set(px, 0, pz);

      if (slot.planetId && slot.biome) {
        const hasRings = slot.position === 6 || slot.position === 11;
        const planetGroup = buildCreationGroup(buildPlanetSphereBlueprint(slot.biome, hasRings), {
          seed: 400 + sys * 20 + slot.position,
        });
        planetGroup.scale.setScalar(slot.isOwn ? 0.92 : 0.78);
        slotContainer.add(planetGroup);

        // Selection ring under planet
        const markerGeo = new THREE.RingGeometry(2.6, 3.0, 28);
        markerGeo.rotateX(-Math.PI / 2);
        const markerMat = new THREE.MeshBasicMaterial({
          color: slot.isOwn ? "#10b981" : "#f59e0b",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        });
        markerMat.userData.ownMaterial = true;
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.y = -1.9;
        slotContainer.add(marker);

        if (slot.hasMoon) {
          const moonVox = new Vox(303 + slot.position);
          moonVox.sphere(0, 0, 0, 2, 2, 2, "#cbd5e1");
          const moonMesh = buildVoxelMesh(moonVox, { scale: 0.28, castShadow: false });
          moonMesh.position.set(2.9, 1.4, -1.6);
          slotContainer.add(moonMesh);
        }
      } else {
        // Colonizable empty sector beacon
        const padVox = new Vox(100 + slot.position);
        padVox.box(-1, 0, -1, 1, 0, 1, "#38bdf8", 1.1);
        const padMesh = buildVoxelMesh(padVox, { scale: 0.45, castShadow: false });
        slotContainer.add(padMesh);
      }

      if (slot.debris) {
        const debVox = new Vox(777 + slot.position);
        debVox.box(-3, 0, 2, -2, 1, 3, "#f59e0b", 0.9);
        debVox.box(2, -1, -3, 3, 0, -2, "#38bdf8", 0.9);
        debVox.box(3, 1, 2, 4, 1, 3, "#94a3b8");
        const debMesh = buildVoxelMesh(debVox, { scale: 0.32, castShadow: false });
        slotContainer.add(debMesh);
      }

      const pickData: PickTargetData = {
        kind: "galaxySlot",
        position: slot.position,
        title: slot.planetId
          ? `${slot.name} ${formatCoords({ galaxy: 1, system: sys, position: slot.position })}`
          : `Espaço Livre [1:${sys}:${slot.position}]`,
        subtitle: slot.planetId
          ? `${slot.ownerName ?? "Desconhecido"} · ${biomeLabel(slot.biome ?? "terran")}`
          : "Clique para selecionar coordenadas de colonização/expedição",
      };
      slotContainer.traverse((obj: THREE.Object3D) => {
        obj.userData.pickTarget = pickData;
      });
      if (this.viewMode === "galaxy") {
        this.interactiveRoots.push(slotContainer);
      }
      this.galaxyRoot.add(slotContainer);
    }

    this.rebuildGalaxyFleets(snapshot);
  }

  private rebuildGalaxyFleets(snapshot: OgameClientSnapshot): void {
    this.clearGroupChildren(this.galaxyFleetGroup);
    this.galaxyFleets = [];
    for (const f of snapshot.galaxyFleets) {
      const leadShip =
        (Object.entries(f.ships).find(([, c]) => (c ?? 0) > 0)?.[0] as ShipId | undefined) ??
        "light_fighter";
      const g = buildCreationGroup(buildShipBlueprint(leadShip), { seed: 55 });
      g.scale.setScalar(0.62);
      this.galaxyFleetGroup.add(g);
      this.galaxyFleets.push({ fleet: f, group: g });
    }
  }

  private computeLiveGlobeMetrics(nowMs: number): { fillRatio: number; globeScale: number } {
    if (!this.currentPlanet || !this.currentSnapshot) {
      return { fillRatio: 0.1, globeScale: 0.85 };
    }
    const p = this.currentPlanet;
    const elapsedHours =
      Math.max(0, Math.min(120_000, nowMs - this.currentSnapshot.serverTime)) / 3_600_000;
    const liveResources = {
      metal: Math.min(p.rates.storageCap.metal, p.resources.metal + p.rates.metalPerHour * elapsedHours),
      crystal: Math.min(
        p.rates.storageCap.crystal,
        p.resources.crystal + p.rates.crystalPerHour * elapsedHours,
      ),
      deuterium: Math.min(
        p.rates.storageCap.deuterium,
        p.resources.deuterium + p.rates.deuteriumPerHour * elapsedHours,
      ),
    };
    const res = computePlanetResourceFillScale(
      liveResources,
      p.rates.storageCap,
      p.fieldsUsed,
      p.fieldsMax,
    );
    return { fillRatio: res.fillRatio, globeScale: res.globeScale };
  }

  private updateCameraViewOffset(): void {
    const width = this.mount.clientWidth || window.innerWidth;
    const height = this.mount.clientHeight || window.innerHeight;
    if (this.viewMode === "planet" && this.cameraMode !== "walk") {
      const yShift = Math.round(height * (this.dockCollapsed ? 0.025 : 0.1));
      this.camera.setViewOffset(width, height, 0, yShift, width, height);
    } else {
      this.camera.clearViewOffset();
    }
  }

  setDockCollapsed(collapsed: boolean): void {
    if (this.dockCollapsed === collapsed) return;
    this.dockCollapsed = collapsed;
    this.updateCameraViewOffset();
  }

  applySnapshot(snapshot: OgameClientSnapshot, activePlanet: (PlanetState & { rates: PlanetRates }) | null): void {
    this.currentSnapshot = snapshot;
    this.currentPlanet = activePlanet;

    if (activePlanet) {
      const pSig = JSON.stringify({
        id: activePlanet.id,
        biome: activePlanet.biome,
        hasMoon: activePlanet.hasMoon,
        b: activePlanet.buildings,
        q: activePlanet.buildingQueue?.buildingId ?? null,
        s: activePlanet.ships,
        d: activePlanet.defenses,
      });
      if (pSig !== this.lastPlanetSig) {
        this.lastPlanetSig = pSig;
        this.rebuildPlanetScene(activePlanet);
      }
      const metrics = this.computeLiveGlobeMetrics(Date.now());
      this.targetGlobeScale = metrics.globeScale;
      this.currentFillRatio = metrics.fillRatio;
    }

    const gSig = JSON.stringify({
      sys: snapshot.activeSystem.system,
      slots: snapshot.activeSystem.slots.map((s) => ({
        p: s.position,
        id: s.planetId,
        own: s.isOwn,
        m: s.hasMoon,
        deb: s.debris,
      })),
    });
    if (gSig !== this.lastGalaxySig) {
      this.lastGalaxySig = gSig;
      this.rebuildGalaxyScene(snapshot);
    } else {
      this.rebuildGalaxyFleets(snapshot);
    }

    if (this.viewMode === "galaxy") {
      this.refreshInteractiveRootsForGalaxy();
    }
  }

  private refreshInteractiveRootsForGalaxy(): void {
    this.interactiveRoots = [];
    this.galaxyRoot.traverse((obj: THREE.Object3D) => {
      if (obj.userData?.pickTarget && obj.parent === this.galaxyRoot) {
        this.interactiveRoots.push(obj);
      }
    });
  }

  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    if (mode === "galaxy") {
      if (this.cameraMode === "walk") {
        this.cameraMode = "orbit";
        this.callbacks.onCameraModeChange("orbit");
      }
      this.planetRoot.visible = false;
      this.galaxyRoot.visible = true;
      this.controls.maxPolarAngle = Math.PI * 0.475;
      this.updateCameraViewOffset();
      this.applyControlMode();
      this.refreshInteractiveRootsForGalaxy();
      this.glideTargetLook = new THREE.Vector3(0, 0, 0);
      this.glideTargetPos = new THREE.Vector3(0, 56, 68);
    } else {
      this.galaxyRoot.visible = false;
      this.planetRoot.visible = true;
      this.cameraMode = "orbit";
      this.callbacks.onCameraModeChange("orbit");
      if (this.avatarRig) {
        this.avatarRig.root.visible = false;
      }
      this.camera.up.set(0, 1, 0);
      this.controls.maxPolarAngle = Math.PI - 0.08;
      this.updateCameraViewOffset();
      this.applyControlMode();
      if (this.currentPlanet) {
        this.lastPlanetSig = "";
        this.rebuildPlanetScene(this.currentPlanet);
      }
      this.recenter();
    }
  }

  private captureManualPlanetZoom(forceSave: boolean): void {
    if (this.viewMode !== "planet" || this.glideTargetPos !== null) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    if (!Number.isFinite(dist)) return;
    const changed = Math.abs(dist - this.lastObservedPlanetDist) > 0.04;
    if (!changed && !forceSave) return;
    if (changed) {
      const clamped = THREE.MathUtils.clamp(dist, 14, 150);
      this.lastObservedPlanetDist = clamped;
      this.savedPlanetZoomDist = clamped;
    }
    if (this.savedPlanetZoomDist === null) return;
    const now = performance.now();
    if (!forceSave && now - this.lastZoomSaveMs < 160) return;
    this.lastZoomSaveMs = now;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(PLANET_ZOOM_STORAGE_KEY, this.savedPlanetZoomDist.toFixed(3));
      }
    } catch {
      // Blocked storage in sandboxed iframe
    }
  }

  private applyControlMode(): void {
    if (this.viewMode === "planet") {
      // Planeta ao fundo opera exclusivamente em modo Orbit
      this.cameraMode = "orbit";
      this.controls.enabled = true;
      this.controls.enableRotate = true;
      this.controls.enablePan = false;
      this.controls.autoRotate = this.planetAutoSpin;
      this.controls.autoRotateSpeed = 0.72;
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
      return;
    }

    this.controls.autoRotate = false;
    if (this.cameraMode === "walk") {
      this.cameraMode = "orbit";
    }
    this.controls.enabled = true;
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    // Na Galáxia 3D, girar (botão esquerdo / 1 dedo) e mover (botão direito / 2 dedos) funcionam juntos
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
  }

  setPlanetAutoSpin(enabled: boolean): void {
    this.planetAutoSpin = enabled;
    this.applyControlMode();
  }

  setCameraMode(mode: CameraMode): void {
    if (this.viewMode === "planet") {
      mode = "orbit";
    } else if (mode === "walk") {
      mode = "orbit";
    }
    this.cameraMode = mode;
    this.glideTargetPos = null;
    this.glideTargetLook = null;

    if (this.avatarRig) {
      this.avatarRig.root.visible = false;
    }
    this.camera.up.set(0, 1, 0);
    this.updateCameraViewOffset();
    this.applyControlMode();
  }

  setJoystick(nx: number, ny: number): void {
    this.joystickVec.x = Math.max(-1, Math.min(1, nx));
    this.joystickVec.y = Math.max(-1, Math.min(1, ny));
  }

  jumpWalk(): void {
    if (this.cameraMode === "walk" && this.walkVelY === 0) {
      this.walkVelY = 7.4;
    }
  }

  recenter(): void {
    this.glideTargetLook = new THREE.Vector3(0, 0, 0);
    if (this.viewMode === "planet") {
      if (this.savedPlanetZoomDist !== null) {
        this.glideTargetPos = DEFAULT_PLANET_DIR.clone().multiplyScalar(this.savedPlanetZoomDist);
      } else {
        this.glideTargetPos = new THREE.Vector3(19, 17, 36).multiplyScalar(
          Math.max(1, this.currentGlobeScale * 0.96),
        );
      }
    } else {
      this.glideTargetPos = new THREE.Vector3(0, 56, 68);
    }
  }

  focusBuilding(bId: BuildingId): void {
    if (this.viewMode !== "planet") {
      this.setViewMode("planet");
    }
    const dir = this.buildingAnchors.get(bId);
    if (!dir) return;
    if (this.cameraMode !== "orbit") {
      this.setCameraMode("orbit");
      this.callbacks.onCameraModeChange("orbit");
    }
    const r = BASE_GLOBE_RADIUS * this.currentGlobeScale;
    _vec3A.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.92) _vec3A.set(0, 0, 1);
    const orbitDist = this.savedPlanetZoomDist ?? Math.max(29, r * 2.45);
    this.glideTargetLook = new THREE.Vector3(0, 0, 0);
    this.glideTargetPos = dir
      .clone()
      .multiplyScalar(orbitDist)
      .addScaledVector(_vec3A, 3.2)
      .normalize()
      .multiplyScalar(orbitDist);
  }

  focusGalaxySlot(position: number, systemOverride?: number): void {
    if (this.viewMode !== "galaxy") {
      this.setViewMode("galaxy");
    }
    const sys = systemOverride ?? this.currentSnapshot?.activeSystem.system ?? 1;
    if (position < 1 || position > 15) {
      this.glideTargetLook = new THREE.Vector3(0, 0, 0);
      this.glideTargetPos = new THREE.Vector3(0, 56, 68);
      return;
    }
    const radius = slotOrbitRadius(position);
    const angle = slotOrbitAngle(sys, position);
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    this.glideTargetLook = new THREE.Vector3(px, 0, pz);
    this.glideTargetPos = new THREE.Vector3(px * 0.72 + 11, 24, pz * 0.72 + 26);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = this.mount.clientWidth || window.innerWidth;
    const height = this.mount.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.updateCameraViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private pickAtClientPos(clientX: number, clientY: number): PickTargetData | null {
    if (this.interactiveRoots.length === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, this.camera);
    const hits = _raycaster.intersectObjects(this.interactiveRoots, true);
    for (const hit of hits) {
      const target = hit.object.userData?.pickTarget as PickTargetData | undefined;
      if (target) return target;
    }
    return null;
  }

  private handlePointerDown(e: PointerEvent): void {
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    if (this.cameraMode === "walk") {
      this.walkDragging = true;
      this.walkDragMoved = false;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.cameraMode === "walk" && this.walkDragging) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      if (Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY) > 4) {
        this.walkDragMoved = true;
      }
      this.walkForward.applyAxisAngle(this.walkDir, -dx * 0.0055).normalize();
      this.walkPitch = Math.max(-0.85, Math.min(0.65, this.walkPitch - dy * 0.0045));
      return;
    }

    if (e.pointerType === "touch") {
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverCheckMs < 50) return;
    this.lastHoverCheckMs = now;

    const hit = this.pickAtClientPos(e.clientX, e.clientY);
    if (hit) {
      this.renderer.domElement.style.cursor = "pointer";
      this.currentHoverTitle = hit.title;
      this.callbacks.onHoverChange({ title: hit.title, subtitle: hit.subtitle }, e.clientX, e.clientY);
    } else if (this.currentHoverTitle) {
      this.renderer.domElement.style.cursor = "default";
      this.currentHoverTitle = "";
      this.callbacks.onHoverChange(null, e.clientX, e.clientY);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.cameraMode === "walk") {
      const wasDrag = this.walkDragMoved;
      this.walkDragging = false;
      this.walkDragMoved = false;
      if (wasDrag) return;
    }
    const maxTapMove = e.pointerType === "touch" ? 12 : 6;
    const moveDist = Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY);
    if (moveDist > maxTapMove) return;
    if (e.target !== this.renderer.domElement) return;

    const hit = this.pickAtClientPos(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === "building" && hit.buildingId) {
      this.callbacks.onSelectBuilding(hit.buildingId);
    } else if (hit.kind === "galaxySlot" && typeof hit.position === "number") {
      this.callbacks.onSelectGalaxySlot(hit.position);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const key = e.key.toLowerCase();
    this.walkKeys.add(key);

    if (key === "escape" && this.cameraMode === "walk") {
      this.setCameraMode("pan");
      this.callbacks.onCameraModeChange("pan");
    } else if (key === " " && this.cameraMode === "walk" && this.walkVelY === 0) {
      this.walkVelY = 7.4;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.walkKeys.delete(e.key.toLowerCase());
  }

  private updateWalkMode(dt: number, tSec: number): void {
    if (!this.avatarRig) return;

    let fwd = 0;
    let strafe = 0;
    if (this.walkKeys.has("w") || this.walkKeys.has("arrowup")) fwd += 1;
    if (this.walkKeys.has("s") || this.walkKeys.has("arrowdown")) fwd -= 1;
    if (this.walkKeys.has("d") || this.walkKeys.has("arrowright")) strafe += 1;
    if (this.walkKeys.has("a") || this.walkKeys.has("arrowleft")) strafe -= 1;

    fwd += this.joystickVec.y;
    strafe += this.joystickVec.x;

    // Right vector tangent to sphere
    _vec3D.crossVectors(this.walkForward, this.walkDir).normalize();
    const surfaceR = BASE_GLOBE_RADIUS * this.currentGlobeScale;

    const mag = Math.hypot(fwd, strafe);
    let moveSpeed = 0;
    if (mag > 0.05) {
      const scale = Math.min(1, mag) / mag;
      const nf = fwd * scale;
      const ns = strafe * scale;
      const linearSpeed = 7.6;
      const stepDist = linearSpeed * dt;
      _vec3A
        .copy(this.walkForward)
        .multiplyScalar(nf)
        .addScaledVector(_vec3D, ns)
        .normalize();
      this.walkDir.addScaledVector(_vec3A, stepDist / Math.max(6, surfaceR)).normalize();
      // Re-orthogonalize forward vector onto tangent plane
      this.walkForward
        .addScaledVector(this.walkDir, -this.walkForward.dot(this.walkDir))
        .normalize();
      _vec3D.crossVectors(this.walkForward, this.walkDir).normalize();
      moveSpeed = linearSpeed;
    }

    if (this.walkJumpOffset > 0 || this.walkVelY > 0) {
      this.walkVelY -= 20 * dt;
      this.walkJumpOffset += this.walkVelY * dt;
      if (this.walkJumpOffset <= 0) {
        this.walkJumpOffset = 0;
        this.walkVelY = 0;
      }
    }

    const rNow = surfaceR - 0.1 + this.walkJumpOffset;
    _vec3B.copy(this.walkDir).multiplyScalar(rNow);
    this.avatarRig.root.position.copy(_vec3B);

    // Build orthonormal basis where +Y = walkDir and -Z = walkForward (or +Z = walkForward)
    _mat4A.makeBasis(_vec3D, this.walkDir, _vec3C.copy(this.walkForward).negate());
    this.avatarRig.root.quaternion.setFromRotationMatrix(_mat4A);

    this.avatarRig.applyPose({
      dt,
      t: tSec,
      yaw: 0,
      pitch: this.walkPitch,
      speed: moveSpeed,
      anim: moveSpeed > 0.4 ? "run" : "idle",
      jumpY: this.walkJumpOffset,
      isFirstPerson: false,
    });

    // Smooth spherical over-shoulder chase camera
    _vec3A
      .copy(_vec3B)
      .addScaledVector(this.walkForward, -5.4)
      .addScaledVector(this.walkDir, 2.7 - Math.sin(this.walkPitch) * 2.0);
    _vec3C
      .copy(_vec3B)
      .addScaledVector(this.walkForward, 4.2)
      .addScaledVector(this.walkDir, 1.45 + Math.sin(this.walkPitch) * 2.2);

    const alpha = 1 - Math.exp(-10 * dt);
    this.camera.up.lerp(this.walkDir, alpha).normalize();
    this.camera.position.lerp(_vec3A, alpha);
    this.camera.lookAt(_vec3C);
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (sync) {
        gl.flush();
        const poll = () => {
          if (this.disposed) {
            gl.deleteSync(sync);
            return;
          }
          const st = gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (st === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 5);
          } else {
            gl.deleteSync(sync);
            this.frameId = window.setTimeout(() => this.tick(), 75);
          }
        };
        this.frameId = window.setTimeout(poll, 5);
        return;
      }
      this.frameId = window.setTimeout(() => this.tick(), 80);
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTickMs) / 1000));
    const tSec = (now - this.startMs) / 1000;
    this.lastTickMs = now;

    // Animate voxel parts (drills, radars, turrets, solar wings, stars)
    const activeAnimList =
      this.viewMode === "planet" ? this.planetAnimatedGroups : this.galaxyAnimatedGroups;
    for (const g of activeAnimList) {
      if (g.userData?.animate) {
        g.userData.animate(tSec);
      }
    }

    if (this.viewMode === "planet") {
      // Continuously compute resource-space fullness and smoothly scale the planet globe
      const liveMetrics = this.computeLiveGlobeMetrics(Date.now());
      this.targetGlobeScale = liveMetrics.globeScale;
      this.currentFillRatio = THREE.MathUtils.damp(this.currentFillRatio, liveMetrics.fillRatio, 3.5, dt);
      this.currentGlobeScale = THREE.MathUtils.damp(this.currentGlobeScale, this.targetGlobeScale, 3.2, dt);
      this.planetScaleGroup.scale.setScalar(this.currentGlobeScale);

      if (this.resourceRingMat && this.resourceRingMesh) {
        this.resourceRingMat.emissiveIntensity = 0.35 + this.currentFillRatio * 1.45;
        this.resourceRingMat.opacity = 0.28 + this.currentFillRatio * 0.55;
        this.resourceRingMesh.rotation.z = tSec * 0.08;
      }
      if (this.atmosphereMat) {
        this.atmosphereMat.opacity = 0.14 + this.currentFillRatio * 0.18;
      }

      // Patrol ships orbiting around the 3D globe outside its scaled radius
      for (const p of this.patrolShips) {
        const ang = tSec * p.speed + p.phase;
        const r = p.orbitRadius * this.currentGlobeScale;
        const nx = Math.cos(ang) * r;
        const zFlat = Math.sin(ang) * r;
        const ny = zFlat * Math.sin(p.inclination);
        const nz = zFlat * Math.cos(p.inclination);
        p.group.position.set(nx, ny, nz);
        // Aim tangentially along orbital direction
        const nextAng = ang + 0.05;
        const tx = Math.cos(nextAng) * r;
        const tzFlat = Math.sin(nextAng) * r;
        _vec3A.set(tx, tzFlat * Math.sin(p.inclination), tzFlat * Math.cos(p.inclination));
        p.group.lookAt(_vec3A);
      }

      if (this.planetMoon) {
        const mAng = tSec * 0.09;
        const moonR = (BASE_GLOBE_RADIUS + 14.5) * this.currentGlobeScale;
        this.planetMoon.position.set(Math.cos(mAng) * moonR, 7.5 * this.currentGlobeScale, Math.sin(mAng) * moonR);
        this.planetMoon.rotation.y = tSec * 0.2;
      }

      if (this.shieldDomeMesh) {
        this.shieldDomeMesh.rotation.y = tSec * 0.06;
      }
    } else if (this.currentSnapshot) {
      // Animate active fleets traveling across Galaxy 3D system
      const elapsedSinceSnapshot = now - this.lastTickMs;
      const approxNow = this.currentSnapshot.serverTime + Math.max(0, elapsedSinceSnapshot) + (tSec % 1) * 1000;
      const sys = this.currentSnapshot.activeSystem.system;

      for (const fv of this.galaxyFleets) {
        const f = fv.fleet;
        const fromSlot = f.originCoords.system === sys ? f.originCoords.position : 15;
        const toSlot =
          f.targetCoords.system === sys ? Math.min(15, f.targetCoords.position) : 15;

        const rA = slotOrbitRadius(fromSlot);
        const aA = slotOrbitAngle(sys, fromSlot);
        const rB = slotOrbitRadius(toSlot);
        const aB = slotOrbitAngle(sys, toSlot);

        _vec3A.set(Math.cos(aA) * rA, 0.5, Math.sin(aA) * rA);
        _vec3B.set(Math.cos(aB) * rB, 0.5, Math.sin(aB) * rB);

        const span = Math.max(1000, f.arrivalAt - f.departedAt);
        let progress =
          f.phase === "outbound"
            ? Math.min(1, Math.max(0, (Date.now() - f.departedAt) / span))
            : Math.min(1, Math.max(0, ((f.returnAt ?? Date.now()) - Date.now()) / span));

        if (f.phase === "returning") {
          progress = 1 - progress;
        }
        _vec3C.lerpVectors(_vec3A, _vec3B, progress);
        _vec3C.y += Math.sin(progress * Math.PI) * 5.2;
        fv.group.position.copy(_vec3C);

        if (f.phase === "outbound") {
          fv.group.lookAt(_vec3B);
        } else {
          fv.group.lookAt(_vec3A);
        }
      }
      void approxNow;
    }

    if (this.cameraMode === "walk" && this.viewMode === "planet") {
      this.updateWalkMode(dt, tSec);
    } else {
      if (this.glideTargetPos && this.glideTargetLook) {
        const lambda = 7.5;
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.glideTargetPos.x, lambda, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.glideTargetPos.y, lambda, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.glideTargetPos.z, lambda, dt);
        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.glideTargetLook.x, lambda, dt);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.glideTargetLook.y, lambda, dt);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.glideTargetLook.z, lambda, dt);
        if (this.camera.position.distanceTo(this.glideTargetPos) < 0.15) {
          this.camera.position.copy(this.glideTargetPos);
          this.controls.target.copy(this.glideTargetLook);
          if (this.viewMode === "planet") {
            this.lastObservedPlanetDist = this.camera.position.distanceTo(this.controls.target);
          }
          this.glideTargetPos = null;
          this.glideTargetLook = null;
        }
      }
      this.controls.update(dt);
    }

    if (this.starField) {
      this.starField.rotation.y = tSec * 0.004;
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener("resize", this.onResizeBound);
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDownBound);
    dom.removeEventListener("pointermove", this.onPointerMoveBound);
    dom.removeEventListener("dblclick", this.onDblClickBound);
    window.removeEventListener("pointerup", this.onPointerUpBound);
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    dom.removeEventListener("webglcontextlost", this.onContextLostBound);

    this.controls.dispose();
    this.clearGroupChildren(this.planetRoot);
    this.clearGroupChildren(this.galaxyRoot);
    if (this.avatarRig) {
      this.avatarRig.dispose();
      this.avatarRig = null;
    }
    if (this.starField) {
      disposeGroupTree(this.starField);
      this.starField = null;
    }
    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
    }
    this.renderer.dispose();
    if (dom.parentNode === this.mount) {
      this.mount.removeChild(dom);
    }
  }
}

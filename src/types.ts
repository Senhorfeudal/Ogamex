export type CreationCategory = "vehicle" | "creature" | "building" | "prop" | "aircraft" | "watercraft";
export type ScaleClass = "tiny" | "small" | "medium" | "large" | "colossal";

export type VoxelPartKind =
  | "wheel"
  | "spinY"
  | "spinZ"
  | "spinX"
  | "bob"
  | "swingX"
  | "swingY"
  | "swingZ";

export type VoxelOp =
  | { op: "plinth"; sizeX: number; heightY: number; sizeZ: number; base: string; top: string; corner: string }
  | { op: "box"; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; color: string; emit?: number; mirrorX?: boolean }
  | { op: "roundedBox"; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; radius: number; color: string; emit?: number; mirrorX?: boolean }
  | { op: "clear"; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; mirrorX?: boolean }
  | { op: "hollowBox"; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; wall: number; color: string; trim?: string }
  | { op: "pillars"; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; color: string }
  | {
      op: "cylinder";
      axis?: "x" | "y" | "z";
      cx?: number;
      cy?: number;
      cz?: number;
      x0?: number;
      x1?: number;
      y0?: number;
      y1?: number;
      z0?: number;
      z1?: number;
      radius: number;
      color?: string;
      carve?: boolean;
      emit?: number;
      mirrorX?: boolean;
    }
  | {
      op: "ring";
      axis?: "x" | "y" | "z";
      cx?: number;
      cy?: number;
      cz?: number;
      x0?: number;
      x1?: number;
      y0?: number;
      y1?: number;
      z0?: number;
      z1?: number;
      outerR: number;
      innerR: number;
      color: string;
      emit?: number;
      mirrorX?: boolean;
    }
  | { op: "cone"; cx: number; y0: number; y1: number; cz: number; rBottom: number; rTop: number; color: string; emit?: number; mirrorX?: boolean }
  | { op: "sphere"; cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; color?: string; carve?: boolean; emit?: number; mirrorX?: boolean }
  | { op: "dome"; cx: number; yBase: number; cz: number; radius: number; color: string; emit?: number; mirrorX?: boolean }
  | { op: "roofGable"; x0: number; yBase: number; z0: number; x1: number; z1: number; rise: number; axis: "x" | "z"; color: string; trim?: string }
  | { op: "roofPyramid"; x0: number; yBase: number; z0: number; x1: number; z1: number; color: string; trim?: string }
  | { op: "stairs"; x0: number; y0: number; z0: number; steps: number; width: number; dir: "+z" | "-z" | "+x" | "-x"; color: string }
  | { op: "arch"; cx: number; y0: number; cz: number; halfSpan: number; height: number; depth: number; axis: "x" | "z"; color: string }
  | { op: "line"; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; radius: number; color: string; emit?: number; mirrorX?: boolean }
  | { op: "voxels"; list: [number, number, number, string, number?][]; mirrorX?: boolean };

export interface VoxelPart {
  name: string;
  kind: VoxelPartKind;
  speed: number;
  amp?: number;
  phase?: number;
  pivot: [number, number, number];
  ops: VoxelOp[];
}

export interface VoxelBlueprint {
  version: 1;
  name: string;
  description: string;
  category: CreationCategory;
  scaleClass: ScaleClass;
  palette: Record<string, string>;
  ops: VoxelOp[];
  parts: VoxelPart[];
}

// ---------------- Multiplayer Hub Types ----------------

export type MultiplayerMode = "walk" | "aerial";
export type MultiplayerAnim = "idle" | "walk" | "run" | "jump" | "ride" | "sit" | "wave";
export type MultiplayerEmoteKind = "wave" | "jump" | "cheer";

export interface MultiplayerAppearance {
  skin: string;
  hairStyle: string;
  hairColor: string;
  hatStyle: string;
  hatColor: string;
  eyeStyle: string;
  accessory: string;
  accessoryColor: string;
  topStyle: string;
  topColor: string;
  bottomStyle: string;
  bottomColor: string;
  shoeColor: string;
}

export interface MultiplayerPose {
  mode: MultiplayerMode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  anim: MultiplayerAnim;
  ride: string | null;
  seat: number;
  room: string | null;
}

export interface MultiplayerPlayerState extends MultiplayerPose {
  id: string;
  name: string;
  appearance: MultiplayerAppearance;
}

export interface MultiplayerSocketAttachment extends MultiplayerPlayerState {
  joined: boolean;
  connectedAt: number;
  lastSeenAt: number;
}

export type MultiplayerClientMessage =
  | ({
      t: "hello";
      name?: string;
      appearance?: Partial<MultiplayerAppearance>;
    } & Partial<MultiplayerPose>)
  | ({
      t: "pose";
    } & Partial<MultiplayerPose>)
  | {
      t: "profile";
      name?: string;
      appearance?: Partial<MultiplayerAppearance>;
    }
  | {
      t: "emote";
      kind: MultiplayerEmoteKind;
    };

export type MultiplayerServerMessage =
  | {
      type: "mp_welcome";
      selfId: string;
      onlineCount: number;
      players: MultiplayerPlayerState[];
    }
  | {
      type: "mp_join";
      onlineCount: number;
      player: MultiplayerPlayerState;
    }
  | ({
      type: "mp_pose";
      id: string;
    } & MultiplayerPose)
  | {
      type: "mp_profile";
      id: string;
      name: string;
      appearance: MultiplayerAppearance;
    }
  | {
      type: "mp_emote";
      id: string;
      kind: MultiplayerEmoteKind;
    }
  | {
      type: "mp_leave";
      id: string;
      onlineCount: number;
    };

// ---------------- OGame Domain Types ----------------

export type BuildingId =
  | "metal_mine"
  | "crystal_mine"
  | "deuterium_synthesizer"
  | "dark_matter_mine"
  | "solar_plant"
  | "fusion_reactor"
  | "metal_storage"
  | "crystal_storage"
  | "deuterium_tank"
  | "robotics_factory"
  | "shipyard"
  | "research_lab"
  | "nanite_factory"
  | "missile_silo";

export type TechId =
  | "energy_tech"
  | "laser_tech"
  | "ion_tech"
  | "hyperspace_tech"
  | "plasma_tech"
  | "combustion_drive"
  | "impulse_drive"
  | "hyperspace_drive"
  | "espionage_tech"
  | "computer_tech"
  | "astrophysics"
  | "weapons_tech"
  | "shielding_tech"
  | "armour_tech";

export type ShipId =
  | "small_cargo"
  | "large_cargo"
  | "light_fighter"
  | "heavy_fighter"
  | "cruiser"
  | "battleship"
  | "battlecruiser"
  | "bomber"
  | "destroyer"
  | "deathstar"
  | "recycler"
  | "espionage_probe"
  | "colony_ship"
  | "solar_satellite";

export type DefenseId =
  | "rocket_launcher"
  | "light_laser"
  | "heavy_laser"
  | "gauss_cannon"
  | "ion_cannon"
  | "plasma_turret"
  | "small_shield_dome"
  | "large_shield_dome";

export type PlanetBiome = "terran" | "oceanic" | "volcanic" | "ice" | "desert" | "crystal";

export interface Coordinates {
  galaxy: number;
  system: number;
  position: number;
}

export interface ResourceBundle {
  metal: number;
  crystal: number;
  deuterium: number;
}

export interface BuildingQueueItem {
  buildingId: BuildingId;
  targetLevel: number;
  startedAt: number;
  finishesAt: number;
}

export interface ResearchQueueItem {
  techId: TechId;
  planetId: string;
  targetLevel: number;
  startedAt: number;
  finishesAt: number;
}

export interface ShipyardQueueItem {
  kind: "ship" | "defense";
  unitId: ShipId | DefenseId;
  quantity: number;
  unitDurationMs: number;
  nextUnitAt: number;
}

export interface PlanetState {
  id: string;
  ownerId: string;
  ownerName: string;
  isNpc: boolean;
  name: string;
  coords: Coordinates;
  biome: PlanetBiome;
  temperatureMax: number;
  diameterKm: number;
  fieldsUsed: number;
  fieldsMax: number;
  hasMoon: boolean;
  resources: ResourceBundle;
  lastResourceUpdateAt: number;
  buildings: Record<BuildingId, number>;
  ships: Record<ShipId, number>;
  defenses: Record<DefenseId, number>;
  buildingQueue: BuildingQueueItem | null;
  shipyardQueue: ShipyardQueueItem[];
}

export type FleetMissionKind =
  | "attack"
  | "espionage"
  | "transport"
  | "deploy"
  | "recycle"
  | "colonize"
  | "expedition";

export interface FleetMission {
  id: string;
  ownerId: string;
  ownerName: string;
  mission: FleetMissionKind;
  originPlanetId: string;
  originCoords: Coordinates;
  originName: string;
  targetCoords: Coordinates;
  targetPlanetId: string | null;
  targetName: string;
  ships: Partial<Record<ShipId, number>>;
  cargo: ResourceBundle;
  fuelUsed: number;
  departedAt: number;
  arrivalAt: number;
  returnAt: number | null;
  phase: "outbound" | "returning";
}

export interface DebrisField {
  metal: number;
  crystal: number;
}

export interface GalaxySlotView {
  position: number;
  planetId: string | null;
  name: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isNpc: boolean;
  isOwn: boolean;
  biome: PlanetBiome | null;
  hasMoon: boolean;
  diameterKm: number | null;
  temperatureMax: number | null;
  debris: DebrisField | null;
  points: number;
}

export interface CombatRoundSummary {
  round: number;
  attackerShots: number;
  attackerPower: number;
  defenderShots: number;
  defenderPower: number;
  attackerRemainingCount: number;
  defenderRemainingCount: number;
}

export interface UniverseReport {
  id: string;
  kind: "combat" | "espionage" | "expedition" | "transport" | "colonize" | "recycle";
  title: string;
  createdAt: number;
  read: boolean;
  coords: Coordinates;
  summary: string;
  outcome?: "attacker_win" | "defender_win" | "draw";
  loot?: ResourceBundle;
  debrisCreated?: DebrisField;
  attackerLosses?: ResourceBundle;
  defenderLosses?: ResourceBundle;
  rounds?: CombatRoundSummary[];
  espionageData?: {
    targetName: string;
    ownerName: string;
    resources: ResourceBundle;
    buildings?: Partial<Record<BuildingId, number>>;
    ships?: Partial<Record<ShipId, number>>;
    defenses?: Partial<Record<DefenseId, number>>;
  };
}

export interface PlanetRates {
  metalPerHour: number;
  crystalPerHour: number;
  deuteriumPerHour: number;
  darkMatterPerHour: number;
  energyProduced: number;
  energyConsumed: number;
  energyFactor: number;
  storageCap: ResourceBundle;
}

export type DarkMarketItemId =
  | "instant_build"
  | "instant_research"
  | "instant_shipyard"
  | "pack_metal"
  | "pack_crystal"
  | "pack_deuterium"
  | "squad_fighters"
  | "terraform_fields";

export interface DarkMarketItemDef {
  id: DarkMarketItemId;
  name: string;
  description: string;
  costDarkMatter: number;
  category: "boost" | "resource" | "fleet" | "planet";
}

export interface PlayerEmpireState {
  id: string;
  commanderName: string;
  darkMatter: number;
  points: number;
  techs: Record<TechId, number>;
  researchQueue: ResearchQueueItem | null;
  planetIds: string[];
  reports: UniverseReport[];
}

export interface OgameClientSnapshot {
  serverTime: number;
  universeSpeed: number;
  player: PlayerEmpireState;
  planets: (PlanetState & { rates: PlanetRates })[];
  activeSystem: {
    galaxy: number;
    system: number;
    slots: GalaxySlotView[];
  };
  fleets: FleetMission[];
  galaxyFleets: FleetMission[];
  visitorToken?: string;
}

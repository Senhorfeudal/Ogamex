import type {
  BuildingId,
  Coordinates,
  DarkMarketItemDef,
  DarkMarketItemId,
  DefenseId,
  PlanetBiome,
  PlanetRates,
  PlanetState,
  ResourceBundle,
  ShipId,
  TechId,
} from "../types";

export interface CostRequirement {
  buildings?: Partial<Record<BuildingId, number>>;
  techs?: Partial<Record<TechId, number>>;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  shortName: string;
  category: "resource" | "facility";
  description: string;
  baseCost: ResourceBundle;
  costFactor: number;
  requires?: CostRequirement;
  sectorPos: [number, number];
  sectorYaw: number;
}

export interface TechDef {
  id: TechId;
  name: string;
  category: "basic" | "drive" | "advanced" | "combat";
  description: string;
  baseCost: ResourceBundle;
  costFactor: number;
  requires?: CostRequirement;
}

export interface UnitCombatStats {
  hull: number;
  shield: number;
  attack: number;
  rapidfire?: Partial<Record<ShipId | DefenseId, number>>;
}

export interface ShipDef {
  id: ShipId;
  name: string;
  shortName: string;
  description: string;
  cost: ResourceBundle;
  baseSpeed: number;
  drive: "combustion" | "impulse" | "hyperspace" | "none";
  cargo: number;
  fuelPerDistance: number;
  stats: UnitCombatStats;
  requires?: CostRequirement;
}

export interface DefenseDef {
  id: DefenseId;
  name: string;
  shortName: string;
  description: string;
  cost: ResourceBundle;
  maxCount?: number;
  stats: UnitCombatStats;
  requires?: CostRequirement;
}

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  metal_mine: {
    id: "metal_mine",
    name: "Mina de Metal",
    shortName: "Mina Metal",
    category: "resource",
    description: "Extrai minério de ferro bruto das placas tectônicas do planeta.",
    baseCost: { metal: 60, crystal: 15, deuterium: 0 },
    costFactor: 1.5,
    sectorPos: [-16, -12],
    sectorYaw: 0.45,
  },
  crystal_mine: {
    id: "crystal_mine",
    name: "Mina de Cristal",
    shortName: "Mina Cristal",
    category: "resource",
    description: "Extrai cristais de silício puro essenciais para circuitos e sensores.",
    baseCost: { metal: 48, crystal: 24, deuterium: 0 },
    costFactor: 1.6,
    sectorPos: [16, -12],
    sectorYaw: -0.45,
  },
  deuterium_synthesizer: {
    id: "deuterium_synthesizer",
    name: "Sintetizador de Deutério",
    shortName: "Sint. Deutério",
    category: "resource",
    description: "Separa isótopos pesados de hidrogênio para combustível de propulsão.",
    baseCost: { metal: 225, crystal: 75, deuterium: 0 },
    costFactor: 1.5,
    sectorPos: [20, 6],
    sectorYaw: -1.1,
  },
  dark_matter_mine: {
    id: "dark_matter_mine",
    name: "Mina de Matéria Negra",
    shortName: "Mina MN",
    category: "resource",
    description:
      "Extrator quântico profundo de Matéria Negra. Muito mais raro que Deutério e de evolução custosa.",
    baseCost: { metal: 1200, crystal: 900, deuterium: 450 },
    costFactor: 2.15,
    requires: { buildings: { deuterium_synthesizer: 4, research_lab: 3 }, techs: { energy_tech: 3 } },
    sectorPos: [-18, -20],
    sectorYaw: 0.35,
  },
  solar_plant: {
    id: "solar_plant",
    name: "Planta Solar",
    shortName: "Planta Solar",
    category: "resource",
    description: "Converte radiação estelar em energia limpa para alimentar as minas.",
    baseCost: { metal: 75, crystal: 30, deuterium: 0 },
    costFactor: 1.5,
    sectorPos: [-20, 6],
    sectorYaw: 1.0,
  },
  fusion_reactor: {
    id: "fusion_reactor",
    name: "Reator de Fusão",
    shortName: "Reator Fusão",
    category: "resource",
    description: "Funde deutério em plasma confinado para gerar alta carga elétrica.",
    baseCost: { metal: 900, crystal: 360, deuterium: 180 },
    costFactor: 1.8,
    requires: { buildings: { deuterium_synthesizer: 5 }, techs: { energy_tech: 3 } },
    sectorPos: [-22, 20],
    sectorYaw: 0.75,
  },
  metal_storage: {
    id: "metal_storage",
    name: "Armazém de Metal",
    shortName: "Arm. Metal",
    category: "resource",
    description: "Silos blindados para estocar grandes reservas de metal refinado.",
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2.0,
    sectorPos: [-11, -24],
    sectorYaw: 0.15,
  },
  crystal_storage: {
    id: "crystal_storage",
    name: "Armazém de Cristal",
    shortName: "Arm. Cristal",
    category: "resource",
    description: "Câmaras climatizadas para preservar cristais fotônicos.",
    baseCost: { metal: 1000, crystal: 500, deuterium: 0 },
    costFactor: 2.0,
    sectorPos: [11, -24],
    sectorYaw: -0.15,
  },
  deuterium_tank: {
    id: "deuterium_tank",
    name: "Tanque de Deutério",
    shortName: "Tanq. Deutério",
    category: "resource",
    description: "Tanques criogênicos pressurizados para reserva de combustível.",
    baseCost: { metal: 1000, crystal: 1000, deuterium: 0 },
    costFactor: 2.0,
    sectorPos: [25, -4],
    sectorYaw: -1.4,
  },
  robotics_factory: {
    id: "robotics_factory",
    name: "Fábrica de Robôs",
    shortName: "Robôs",
    category: "facility",
    description: "Drones construtores que aceleram obras e estruturas planetárias.",
    baseCost: { metal: 400, crystal: 120, deuterium: 200 },
    costFactor: 2.0,
    sectorPos: [-9, 14],
    sectorYaw: 0.25,
  },
  shipyard: {
    id: "shipyard",
    name: "Hangar / Estaleiro",
    shortName: "Hangar",
    category: "facility",
    description: "Doca espacial de montagem para naves de combate, carga e defesas.",
    baseCost: { metal: 400, crystal: 200, deuterium: 100 },
    costFactor: 2.0,
    requires: { buildings: { robotics_factory: 2 } },
    sectorPos: [0, 22],
    sectorYaw: 0.0,
  },
  research_lab: {
    id: "research_lab",
    name: "Laboratório de Pesquisa",
    shortName: "Laboratório",
    category: "facility",
    description: "Centro científico que desbloqueia propulsores, armas e astrofísica.",
    baseCost: { metal: 200, crystal: 400, deuterium: 200 },
    costFactor: 2.0,
    sectorPos: [10, 14],
    sectorYaw: -0.25,
  },
  nanite_factory: {
    id: "nanite_factory",
    name: "Fábrica de Nanites",
    shortName: "Nanites",
    category: "facility",
    description: "Montagem molecular que reduz pela metade o tempo de todas as obras.",
    baseCost: { metal: 1000000, crystal: 500000, deuterium: 100000 },
    costFactor: 2.0,
    requires: { buildings: { robotics_factory: 10 }, techs: { computer_tech: 10 } },
    sectorPos: [22, 20],
    sectorYaw: -0.75,
  },
  missile_silo: {
    id: "missile_silo",
    name: "Silo de Mísseis",
    shortName: "Silo Mísseis",
    category: "facility",
    description: "Plataforma subterrânea reforçada para mísseis interceptadores.",
    baseCost: { metal: 20000, crystal: 20000, deuterium: 1000 },
    costFactor: 2.0,
    requires: { buildings: { shipyard: 1 } },
    sectorPos: [-25, -4],
    sectorYaw: 1.4,
  },
};

export const TECH_DEFS: Record<TechId, TechDef> = {
  energy_tech: {
    id: "energy_tech",
    name: "Tecnologia de Energia",
    category: "basic",
    description: "Base energética necessária para reatores avançados e sistemas de escudo.",
    baseCost: { metal: 0, crystal: 800, deuterium: 400 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 1 } },
  },
  laser_tech: {
    id: "laser_tech",
    name: "Tecnologia Laser",
    category: "basic",
    description: "Feixes coerentes de alta energia para armamentos e sensores.",
    baseCost: { metal: 200, crystal: 100, deuterium: 0 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 1 }, techs: { energy_tech: 2 } },
  },
  ion_tech: {
    id: "ion_tech",
    name: "Tecnologia de Íons",
    category: "basic",
    description: "Focaliza partículas ionizadas para sobrecarga de escudos inimigos.",
    baseCost: { metal: 1000, crystal: 300, deuterium: 100 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 4 }, techs: { laser_tech: 5, energy_tech: 4 } },
  },
  hyperspace_tech: {
    id: "hyperspace_tech",
    name: "Tecnologia de Hiperespaço",
    category: "advanced",
    description: "Dobra espacial para propulsores capitais e expansão de carga (+5%/nível).",
    baseCost: { metal: 0, crystal: 4000, deuterium: 2000 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 7 }, techs: { energy_tech: 5, shielding_tech: 5 } },
  },
  plasma_tech: {
    id: "plasma_tech",
    name: "Tecnologia de Plasma",
    category: "advanced",
    description: "Otimiza extração (+1% Metal, +0.66% Cristal, +0.33% Deutério/nível) e torres de plasma.",
    baseCost: { metal: 2000, crystal: 4000, deuterium: 1000 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 4 }, techs: { energy_tech: 8, laser_tech: 10, ion_tech: 5 } },
  },
  combustion_drive: {
    id: "combustion_drive",
    name: "Motor de Combustão",
    category: "drive",
    description: "Aumenta velocidade de cargueiros, caças ligeiros e recicladores (+10%/nível).",
    baseCost: { metal: 400, crystal: 0, deuterium: 600 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 1 }, techs: { energy_tech: 1 } },
  },
  impulse_drive: {
    id: "impulse_drive",
    name: "Motor de Impulsão",
    category: "drive",
    description: "Acelera caças pesados, cruzadores, colonizadoras e bombardeiros (+20%/nível).",
    baseCost: { metal: 2000, crystal: 4000, deuterium: 600 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 2 }, techs: { energy_tech: 1 } },
  },
  hyperspace_drive: {
    id: "hyperspace_drive",
    name: "Propulsor de Hiperespaço",
    category: "drive",
    description: "Propulsão interestelar para naves capitais (+30%/nível).",
    baseCost: { metal: 10000, crystal: 20000, deuterium: 6000 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 7 }, techs: { hyperspace_tech: 3 } },
  },
  espionage_tech: {
    id: "espionage_tech",
    name: "Tecnologia de Espionagem",
    category: "advanced",
    description: "Melhora sondas de reconhecimento e protege contra espionagem inimiga.",
    baseCost: { metal: 200, crystal: 1000, deuterium: 200 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 3 } },
  },
  computer_tech: {
    id: "computer_tech",
    name: "Tecnologia de Computadores",
    category: "advanced",
    description: "Cada nível permite comandar +1 frota simultânea em voo.",
    baseCost: { metal: 0, crystal: 400, deuterium: 600 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 1 } },
  },
  astrophysics: {
    id: "astrophysics",
    name: "Astrofísica",
    category: "advanced",
    description: "A cada 2 níveis permite fundar +1 nova colônia e aumenta expedições.",
    baseCost: { metal: 4000, crystal: 8000, deuterium: 4000 },
    costFactor: 1.75,
    requires: { buildings: { research_lab: 3 }, techs: { espionage_tech: 4, impulse_drive: 3 } },
  },
  weapons_tech: {
    id: "weapons_tech",
    name: "Tecnologia Militar",
    category: "combat",
    description: "Aumenta o poder de fogo de todas as naves e defesas em +10% por nível.",
    baseCost: { metal: 800, crystal: 200, deuterium: 0 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 4 } },
  },
  shielding_tech: {
    id: "shielding_tech",
    name: "Tecnologia de Escudos",
    category: "combat",
    description: "Reforça a absorção de escudos defletores em +10% por nível.",
    baseCost: { metal: 200, crystal: 600, deuterium: 0 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 6 }, techs: { energy_tech: 3 } },
  },
  armour_tech: {
    id: "armour_tech",
    name: "Tecnologia de Blindagem",
    category: "combat",
    description: "Aumenta a integridade estrutural de cascos e torres em +10% por nível.",
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2.0,
    requires: { buildings: { research_lab: 2 } },
  },
};

export const SHIP_DEFS: Record<ShipId, ShipDef> = {
  small_cargo: {
    id: "small_cargo",
    name: "Cargueiro Pequeno",
    shortName: "Carg. Pequeno",
    description: "Transporte ágil de carga e saque rápido entre sistemas.",
    cost: { metal: 2000, crystal: 2000, deuterium: 0 },
    baseSpeed: 5000,
    drive: "combustion",
    cargo: 5000,
    fuelPerDistance: 10,
    stats: { hull: 400, shield: 10, attack: 5 },
    requires: { buildings: { shipyard: 2 }, techs: { combustion_drive: 2 } },
  },
  large_cargo: {
    id: "large_cargo",
    name: "Cargueiro Grande",
    shortName: "Carg. Grande",
    description: "Cargueiro pesado de alta capacidade logística.",
    cost: { metal: 6000, crystal: 6000, deuterium: 0 },
    baseSpeed: 7500,
    drive: "combustion",
    cargo: 25000,
    fuelPerDistance: 50,
    stats: { hull: 1200, shield: 25, attack: 5 },
    requires: { buildings: { shipyard: 4 }, techs: { combustion_drive: 6 } },
  },
  light_fighter: {
    id: "light_fighter",
    name: "Caça Ligeiro",
    shortName: "Caça Ligeiro",
    description: "Interceptador rápido de baixo custo, ideal em enxames de cobertura.",
    cost: { metal: 3000, crystal: 1000, deuterium: 0 },
    baseSpeed: 12500,
    drive: "combustion",
    cargo: 50,
    fuelPerDistance: 20,
    stats: { hull: 400, shield: 10, attack: 50, rapidfire: { espionage_probe: 5, solar_satellite: 5 } },
    requires: { buildings: { shipyard: 1 }, techs: { combustion_drive: 1 } },
  },
  heavy_fighter: {
    id: "heavy_fighter",
    name: "Caça Pesado",
    shortName: "Caça Pesado",
    description: "Caça blindado com canhões laser reforçados.",
    cost: { metal: 6000, crystal: 4000, deuterium: 0 },
    baseSpeed: 10000,
    drive: "impulse",
    cargo: 100,
    fuelPerDistance: 75,
    stats: { hull: 1000, shield: 25, attack: 150, rapidfire: { small_cargo: 3, espionage_probe: 5, solar_satellite: 5 } },
    requires: { buildings: { shipyard: 3 }, techs: { armour_tech: 2, impulse_drive: 2 } },
  },
  cruiser: {
    id: "cruiser",
    name: "Cruzador",
    shortName: "Cruzador",
    description: "Belonave veloz devastadora contra enxames de caças ligeiros.",
    cost: { metal: 20000, crystal: 7000, deuterium: 2000 },
    baseSpeed: 15000,
    drive: "impulse",
    cargo: 800,
    fuelPerDistance: 300,
    stats: { hull: 2700, shield: 50, attack: 400, rapidfire: { light_fighter: 6, rocket_launcher: 10, espionage_probe: 5, solar_satellite: 5 } },
    requires: { buildings: { shipyard: 5 }, techs: { impulse_drive: 4, ion_tech: 2 } },
  },
  battleship: {
    id: "battleship",
    name: "Nave de Batalha",
    shortName: "Nave Batalha",
    description: "Espinha dorsal da frota de guerra pesada com grande poder de fogo.",
    cost: { metal: 45000, crystal: 15000, deuterium: 0 },
    baseSpeed: 10000,
    drive: "hyperspace",
    cargo: 1500,
    fuelPerDistance: 500,
    stats: { hull: 6000, shield: 200, attack: 1000, rapidfire: { espionage_probe: 5, solar_satellite: 5 } },
    requires: { buildings: { shipyard: 7 }, techs: { hyperspace_drive: 4 } },
  },
  battlecruiser: {
    id: "battlecruiser",
    name: "Interceptador",
    shortName: "Interceptador",
    description: "Caçador de frotas especializado contra naves médias e pesadas.",
    cost: { metal: 30000, crystal: 40000, deuterium: 15000 },
    baseSpeed: 10000,
    drive: "hyperspace",
    cargo: 750,
    fuelPerDistance: 250,
    stats: {
      hull: 7000,
      shield: 400,
      attack: 700,
      rapidfire: { small_cargo: 3, large_cargo: 3, heavy_fighter: 4, cruiser: 4, battleship: 7, espionage_probe: 5, solar_satellite: 5 },
    },
    requires: { buildings: { shipyard: 8 }, techs: { hyperspace_tech: 5, hyperspace_drive: 5, laser_tech: 12 } },
  },
  bomber: {
    id: "bomber",
    name: "Bombardeiro",
    shortName: "Bombardeiro",
    description: "Projetado para pulverizar defesas planetárias fortificadas.",
    cost: { metal: 50000, crystal: 25000, deuterium: 15000 },
    baseSpeed: 4000,
    drive: "impulse",
    cargo: 500,
    fuelPerDistance: 700,
    stats: {
      hull: 7500,
      shield: 500,
      attack: 1000,
      rapidfire: { rocket_launcher: 20, light_laser: 20, heavy_laser: 10, ion_cannon: 10, espionage_probe: 5, solar_satellite: 5 },
    },
    requires: { buildings: { shipyard: 8 }, techs: { impulse_drive: 6, plasma_tech: 5 } },
  },
  destroyer: {
    id: "destroyer",
    name: "Destruidor",
    shortName: "Destruidor",
    description: "Couraçado titânico que destrói interceptadores e lasers leves.",
    cost: { metal: 60000, crystal: 50000, deuterium: 15000 },
    baseSpeed: 5000,
    drive: "hyperspace",
    cargo: 2000,
    fuelPerDistance: 1000,
    stats: {
      hull: 11000,
      shield: 500,
      attack: 2000,
      rapidfire: { light_laser: 10, battlecruiser: 2, espionage_probe: 5, solar_satellite: 5 },
    },
    requires: { buildings: { shipyard: 9 }, techs: { hyperspace_drive: 6, hyperspace_tech: 5 } },
  },
  deathstar: {
    id: "deathstar",
    name: "Estrela da Morte",
    shortName: "Estrela Morte",
    description: "Fortaleza esférica colossal equipada com superlaser gravitacional.",
    cost: { metal: 5000000, crystal: 4000000, deuterium: 1000000 },
    baseSpeed: 100,
    drive: "hyperspace",
    cargo: 1000000,
    fuelPerDistance: 1,
    stats: {
      hull: 900000,
      shield: 50000,
      attack: 200000,
      rapidfire: {
        small_cargo: 250,
        large_cargo: 250,
        light_fighter: 200,
        heavy_fighter: 100,
        cruiser: 33,
        battleship: 30,
        battlecruiser: 15,
        bomber: 25,
        destroyer: 5,
        recycler: 250,
        espionage_probe: 1250,
        colony_ship: 250,
        solar_satellite: 1250,
        rocket_launcher: 200,
        light_laser: 200,
        heavy_laser: 100,
        gauss_cannon: 50,
        ion_cannon: 100,
      },
    },
    requires: { buildings: { shipyard: 12 }, techs: { hyperspace_tech: 6, hyperspace_drive: 7 } },
  },
  recycler: {
    id: "recycler",
    name: "Reciclador",
    shortName: "Reciclador",
    description: "Coleta metal e cristal de campos de destroços após batalhas espaciais.",
    cost: { metal: 10000, crystal: 6000, deuterium: 2000 },
    baseSpeed: 2000,
    drive: "combustion",
    cargo: 20000,
    fuelPerDistance: 300,
    stats: { hull: 1600, shield: 10, attack: 1 },
    requires: { buildings: { shipyard: 4 }, techs: { combustion_drive: 6, shielding_tech: 2 } },
  },
  espionage_probe: {
    id: "espionage_probe",
    name: "Sonda de Espionagem",
    shortName: "Sonda",
    description: "Drone ultrarrápido que escaneia recursos, frotas e edifícios inimigos.",
    cost: { metal: 0, crystal: 1000, deuterium: 0 },
    baseSpeed: 100000000,
    drive: "combustion",
    cargo: 5,
    fuelPerDistance: 1,
    stats: { hull: 100, shield: 0, attack: 0 },
    requires: { buildings: { shipyard: 3 }, techs: { combustion_drive: 3, espionage_tech: 2 } },
  },
  colony_ship: {
    id: "colony_ship",
    name: "Nave Colonizadora",
    shortName: "Colonizadora",
    description: "Arca orbital capaz de fundar uma nova colônia planetária permanente.",
    cost: { metal: 10000, crystal: 20000, deuterium: 10000 },
    baseSpeed: 2500,
    drive: "impulse",
    cargo: 7500,
    fuelPerDistance: 1000,
    stats: { hull: 3000, shield: 100, attack: 50 },
    requires: { buildings: { shipyard: 4 }, techs: { impulse_drive: 3 } },
  },
  solar_satellite: {
    id: "solar_satellite",
    name: "Satélite Solar",
    shortName: "Sat. Solar",
    description: "Estacionado em órbita para gerar energia bônus ao planeta.",
    cost: { metal: 0, crystal: 2000, deuterium: 500 },
    baseSpeed: 0,
    drive: "none",
    cargo: 0,
    fuelPerDistance: 0,
    stats: { hull: 200, shield: 1, attack: 1 },
    requires: { buildings: { shipyard: 1 } },
  },
};

export const DEFENSE_DEFS: Record<DefenseId, DefenseDef> = {
  rocket_launcher: {
    id: "rocket_launcher",
    name: "Lançador de Mísseis",
    shortName: "Lanç. Mísseis",
    description: "Bateria de foguetes de resposta rápida contra atacantes leves.",
    cost: { metal: 2000, crystal: 0, deuterium: 0 },
    stats: { hull: 200, shield: 20, attack: 80 },
    requires: { buildings: { shipyard: 1 } },
  },
  light_laser: {
    id: "light_laser",
    name: "Laser Ligeiro",
    shortName: "Laser Ligeiro",
    description: "Torre defensiva de precisão alimentada por energia focalizada.",
    cost: { metal: 1500, crystal: 500, deuterium: 0 },
    stats: { hull: 200, shield: 25, attack: 100 },
    requires: { buildings: { shipyard: 2 }, techs: { energy_tech: 1, laser_tech: 3 } },
  },
  heavy_laser: {
    id: "heavy_laser",
    name: "Laser Pesado",
    shortName: "Laser Pesado",
    description: "Torre laser dupla capaz de perfurar cascos de cruzadores.",
    cost: { metal: 6000, crystal: 2000, deuterium: 0 },
    stats: { hull: 800, shield: 100, attack: 250 },
    requires: { buildings: { shipyard: 4 }, techs: { energy_tech: 3, laser_tech: 6 } },
  },
  gauss_cannon: {
    id: "gauss_cannon",
    name: "Canhão de Gauss",
    shortName: "Canhão Gauss",
    description: "Acelerador magnético de projéteis de alta massa.",
    cost: { metal: 20000, crystal: 15000, deuterium: 2000 },
    stats: { hull: 3500, shield: 200, attack: 1100 },
    requires: { buildings: { shipyard: 6 }, techs: { energy_tech: 6, weapons_tech: 3, shielding_tech: 1 } },
  },
  ion_cannon: {
    id: "ion_cannon",
    name: "Canhão de Íons",
    shortName: "Canhão Íons",
    description: "Alta blindagem de escudo que retém fogo inimigo por várias rodadas.",
    cost: { metal: 5000, crystal: 3000, deuterium: 0 },
    stats: { hull: 800, shield: 500, attack: 150 },
    requires: { buildings: { shipyard: 4 }, techs: { ion_tech: 4 } },
  },
  plasma_turret: {
    id: "plasma_turret",
    name: "Canhão de Plasma",
    shortName: "Torre Plasma",
    description: "Artilharia suprema capaz de destruir naves de batalha e destruidores.",
    cost: { metal: 50000, crystal: 50000, deuterium: 30000 },
    stats: { hull: 10000, shield: 300, attack: 3000 },
    requires: { buildings: { shipyard: 8 }, techs: { plasma_tech: 7 } },
  },
  small_shield_dome: {
    id: "small_shield_dome",
    name: "Pequeno Escudo Planetário",
    shortName: "Escudo Peq.",
    description: "Domo defletor que absorve rajadas inimigas sobre toda a colônia (máx. 1).",
    cost: { metal: 10000, crystal: 10000, deuterium: 0 },
    maxCount: 1,
    stats: { hull: 2000, shield: 2000, attack: 1 },
    requires: { buildings: { shipyard: 1 }, techs: { shielding_tech: 2 } },
  },
  large_shield_dome: {
    id: "large_shield_dome",
    name: "Grande Escudo Planetário",
    shortName: "Escudo Grd.",
    description: "Cúpula orbital de alta densidade para resistir a cercos pesados (máx. 1).",
    cost: { metal: 50000, crystal: 50000, deuterium: 0 },
    maxCount: 1,
    stats: { hull: 10000, shield: 10000, attack: 1 },
    requires: { buildings: { shipyard: 6 }, techs: { shielding_tech: 6 } },
  },
};

export const BUILDING_ORDER: BuildingId[] = [
  "metal_mine",
  "crystal_mine",
  "deuterium_synthesizer",
  "dark_matter_mine",
  "solar_plant",
  "fusion_reactor",
  "metal_storage",
  "crystal_storage",
  "deuterium_tank",
  "robotics_factory",
  "shipyard",
  "research_lab",
  "nanite_factory",
  "missile_silo",
];

export const DARK_MARKET_ITEMS: Record<DarkMarketItemId, DarkMarketItemDef> = {
  instant_build: {
    id: "instant_build",
    name: "Acelerador Orbital de Obra",
    description: "Conclui instantaneamente a construção em andamento no planeta atual.",
    costDarkMatter: 200,
    category: "boost",
  },
  instant_research: {
    id: "instant_research",
    name: "Protocolo Científico Instantâneo",
    description: "Finaliza imediatamente a pesquisa em andamento no laboratório.",
    costDarkMatter: 250,
    category: "boost",
  },
  instant_shipyard: {
    id: "instant_shipyard",
    name: "Sobrecarga do Hangar",
    description: "Entrega todas as naves e defesas atualmente na fila do hangar deste planeta.",
    costDarkMatter: 300,
    category: "boost",
  },
  pack_metal: {
    id: "pack_metal",
    name: "Contêiner de Liga Metálica",
    description: "Injeta +15.000 de Metal diretamente nos depósitos do planeta ativo.",
    costDarkMatter: 120,
    category: "resource",
  },
  pack_crystal: {
    id: "pack_crystal",
    name: "Núcleo de Cristal Puro",
    description: "Fornece +10.000 de Cristal refinado para o planeta ativo.",
    costDarkMatter: 160,
    category: "resource",
  },
  pack_deuterium: {
    id: "pack_deuterium",
    name: "Célula de Deutério Refinado",
    description: "Abastece +7.500 de Deutério imediato nos tanques do planeta ativo.",
    costDarkMatter: 200,
    category: "resource",
  },
  squad_fighters: {
    id: "squad_fighters",
    name: "Esquadrão Mercenário (5 Caças)",
    description: "Comissiona +5 Caças Ligeiros diretamente na órbita do planeta ativo.",
    costDarkMatter: 320,
    category: "fleet",
  },
  terraform_fields: {
    id: "terraform_fields",
    name: "Terraformador Gravitacional",
    description: "Expande permanentemente o planeta ativo em +10 campos construtíveis.",
    costDarkMatter: 450,
    category: "planet",
  },
};

export const DARK_MARKET_ORDER: DarkMarketItemId[] = [
  "instant_build",
  "instant_research",
  "instant_shipyard",
  "pack_metal",
  "pack_crystal",
  "pack_deuterium",
  "squad_fighters",
  "terraform_fields",
];

export const TECH_ORDER: TechId[] = [
  "energy_tech",
  "laser_tech",
  "ion_tech",
  "hyperspace_tech",
  "plasma_tech",
  "combustion_drive",
  "impulse_drive",
  "hyperspace_drive",
  "espionage_tech",
  "computer_tech",
  "astrophysics",
  "weapons_tech",
  "shielding_tech",
  "armour_tech",
];

export const SHIP_ORDER: ShipId[] = [
  "small_cargo",
  "large_cargo",
  "light_fighter",
  "heavy_fighter",
  "cruiser",
  "battleship",
  "battlecruiser",
  "bomber",
  "destroyer",
  "deathstar",
  "recycler",
  "espionage_probe",
  "colony_ship",
  "solar_satellite",
];

export const DEFENSE_ORDER: DefenseId[] = [
  "rocket_launcher",
  "light_laser",
  "heavy_laser",
  "gauss_cannon",
  "ion_cannon",
  "plasma_turret",
  "small_shield_dome",
  "large_shield_dome",
];

export function getBuildingUpgradeCost(id: BuildingId, currentLevel: number): ResourceBundle {
  const def = BUILDING_DEFS[id];
  const mul = Math.pow(def.costFactor, currentLevel);
  return {
    metal: Math.floor(def.baseCost.metal * mul),
    crystal: Math.floor(def.baseCost.crystal * mul),
    deuterium: Math.floor(def.baseCost.deuterium * mul),
  };
}

export function getTechUpgradeCost(id: TechId, currentLevel: number): ResourceBundle {
  const def = TECH_DEFS[id];
  const mul = Math.pow(def.costFactor, currentLevel);
  return {
    metal: Math.floor(def.baseCost.metal * mul),
    crystal: Math.floor(def.baseCost.crystal * mul),
    deuterium: Math.floor(def.baseCost.deuterium * mul),
  };
}

export function checkRequirements(
  req: CostRequirement | undefined,
  buildings: Record<BuildingId, number>,
  techs: Record<TechId, number>,
): { met: boolean; missing: string[] } {
  if (!req) return { met: true, missing: [] };
  const missing: string[] = [];
  if (req.buildings) {
    for (const [bId, lvl] of Object.entries(req.buildings) as [BuildingId, number][]) {
      if ((buildings[bId] ?? 0) < lvl) {
        missing.push(`${BUILDING_DEFS[bId].shortName} Nv.${lvl}`);
      }
    }
  }
  if (req.techs) {
    for (const [tId, lvl] of Object.entries(req.techs) as [TechId, number][]) {
      if ((techs[tId] ?? 0) < lvl) {
        missing.push(`${TECH_DEFS[tId].name} Nv.${lvl}`);
      }
    }
  }
  return { met: missing.length === 0, missing };
}

export function getStorageCapacity(level: number): number {
  return Math.floor(5000 * Math.floor(2.5 * Math.exp((20 * level) / 33)));
}

export function computePlanetRates(
  planet: PlanetState,
  techs: Record<TechId, number>,
  universeSpeed: number,
): PlanetRates {
  const mLvl = planet.buildings.metal_mine ?? 0;
  const cLvl = planet.buildings.crystal_mine ?? 0;
  const dLvl = planet.buildings.deuterium_synthesizer ?? 0;
  const dmLvl = planet.buildings.dark_matter_mine ?? 0;
  const sLvl = planet.buildings.solar_plant ?? 0;
  const fLvl = planet.buildings.fusion_reactor ?? 0;
  const satCount = planet.ships.solar_satellite ?? 0;
  const energyTech = techs.energy_tech ?? 0;
  const plasmaTech = techs.plasma_tech ?? 0;

  const metalEnergyNeed = mLvl > 0 ? Math.ceil(10 * mLvl * Math.pow(1.1, mLvl)) : 0;
  const crystalEnergyNeed = cLvl > 0 ? Math.ceil(10 * cLvl * Math.pow(1.1, cLvl)) : 0;
  const deutEnergyNeed = dLvl > 0 ? Math.ceil(20 * dLvl * Math.pow(1.1, dLvl)) : 0;
  const dmEnergyNeed = dmLvl > 0 ? Math.ceil(35 * dmLvl * Math.pow(1.12, dmLvl)) : 0;
  const energyConsumed = metalEnergyNeed + crystalEnergyNeed + deutEnergyNeed + dmEnergyNeed;

  const solarEnergy = sLvl > 0 ? Math.floor(20 * sLvl * Math.pow(1.1, sLvl)) : 0;
  const fusionEnergy =
    fLvl > 0 ? Math.floor(30 * fLvl * Math.pow(1.05 + energyTech * 0.01, fLvl)) : 0;
  const satEnergy = satCount * Math.max(10, Math.floor((planet.temperatureMax + 140) / 6));
  const energyProduced = solarEnergy + fusionEnergy + satEnergy;

  const energyFactor =
    energyConsumed <= 0 ? 1 : Math.max(0.1, Math.min(1, energyProduced / energyConsumed));

  const mineMetal =
    mLvl > 0
      ? Math.floor(30 * mLvl * Math.pow(1.1, mLvl) * universeSpeed * energyFactor * (1 + plasmaTech * 0.01))
      : 0;
  const mineCrystal =
    cLvl > 0
      ? Math.floor(20 * cLvl * Math.pow(1.1, cLvl) * universeSpeed * energyFactor * (1 + plasmaTech * 0.0066))
      : 0;
  const tempMult = Math.max(0.4, 1.36 - 0.004 * planet.temperatureMax);
  const synthDeut =
    dLvl > 0
      ? Math.floor(10 * dLvl * Math.pow(1.1, dLvl) * tempMult * universeSpeed * energyFactor * (1 + plasmaTech * 0.0033))
      : 0;
  const fusionDeutDrain = fLvl > 0 ? Math.floor(10 * fLvl * Math.pow(1.1, fLvl) * universeSpeed * 0.45) : 0;
  const mineDarkMatter =
    dmLvl > 0
      ? Math.max(1, Math.floor(2.2 * dmLvl * Math.pow(1.08, dmLvl) * universeSpeed * energyFactor))
      : 0;

  return {
    metalPerHour: mineMetal,
    crystalPerHour: mineCrystal,
    deuteriumPerHour: Math.max(0, synthDeut - fusionDeutDrain),
    darkMatterPerHour: mineDarkMatter,
    energyProduced,
    energyConsumed,
    energyFactor,
    storageCap: {
      metal: getStorageCapacity(planet.buildings.metal_storage ?? 0),
      crystal: getStorageCapacity(planet.buildings.crystal_storage ?? 0),
      deuterium: getStorageCapacity(planet.buildings.deuterium_tank ?? 0),
    },
  };
}

export function getBuildingBuildDurationMs(
  cost: ResourceBundle,
  roboticsLevel: number,
  naniteLevel: number,
  universeSpeed: number,
): number {
  const hours =
    (cost.metal + cost.crystal) /
    (2500 * (1 + roboticsLevel) * Math.pow(2, naniteLevel) * Math.max(1, universeSpeed));
  return Math.max(2500, Math.round(hours * 3600 * 1000));
}

export function getResearchDurationMs(
  cost: ResourceBundle,
  labLevel: number,
  universeSpeed: number,
): number {
  const hours = (cost.metal + cost.crystal) / (1000 * (1 + labLevel) * Math.max(1, universeSpeed));
  return Math.max(3000, Math.round(hours * 3600 * 1000));
}

export function getUnitBuildDurationMs(
  cost: ResourceBundle,
  shipyardLevel: number,
  naniteLevel: number,
  universeSpeed: number,
): number {
  const hours =
    (cost.metal + cost.crystal) /
    (2500 * (1 + shipyardLevel) * Math.pow(2, naniteLevel) * Math.max(1, universeSpeed));
  return Math.max(1200, Math.round(hours * 3600 * 1000));
}

export function getShipEffectiveSpeed(shipId: ShipId, techs: Record<TechId, number>): number {
  const def = SHIP_DEFS[shipId];
  if (def.baseSpeed <= 0 || def.drive === "none") return 0;
  if (def.drive === "combustion") {
    return Math.round(def.baseSpeed * (1 + 0.1 * (techs.combustion_drive ?? 0)));
  }
  if (def.drive === "impulse") {
    return Math.round(def.baseSpeed * (1 + 0.2 * (techs.impulse_drive ?? 0)));
  }
  return Math.round(def.baseSpeed * (1 + 0.3 * (techs.hyperspace_drive ?? 0)));
}

export function computeCoordsDistance(a: Coordinates, b: Coordinates): number {
  if (a.galaxy !== b.galaxy) {
    return Math.abs(a.galaxy - b.galaxy) * 20000;
  }
  if (a.system !== b.system) {
    return Math.abs(a.system - b.system) * 95 + 2700;
  }
  if (a.position !== b.position) {
    return Math.abs(a.position - b.position) * 5 + 1000;
  }
  return 5;
}

export function computeFlightMetrics(
  ships: Partial<Record<ShipId, number>>,
  origin: Coordinates,
  target: Coordinates,
  techs: Record<TechId, number>,
  speedPct: number,
  universeSpeed: number,
): { durationMs: number; fuel: number; cargoCap: number; minSpeed: number } {
  let minSpeed = Infinity;
  let cargoCap = 0;
  let totalFuelFactor = 0;

  const hyperBonus = 1 + 0.05 * (techs.hyperspace_tech ?? 0);

  for (const [sId, count] of Object.entries(ships) as [ShipId, number][]) {
    if (!count || count <= 0) continue;
    const def = SHIP_DEFS[sId];
    if (!def || def.baseSpeed <= 0) continue;
    const effSpeed = getShipEffectiveSpeed(sId, techs);
    if (effSpeed > 0 && effSpeed < minSpeed) minSpeed = effSpeed;
    cargoCap += def.cargo * count * hyperBonus;
    totalFuelFactor += def.fuelPerDistance * count;
  }

  if (!Number.isFinite(minSpeed) || minSpeed <= 0) {
    return { durationMs: 0, fuel: 0, cargoCap: 0, minSpeed: 0 };
  }

  const dist = computeCoordsDistance(origin, target);
  const pct = Math.max(10, Math.min(100, speedPct)) / 100;
  const rawSeconds =
    (10 + (35000 / pct) * Math.sqrt((dist * 10) / minSpeed)) / Math.max(1, universeSpeed);
  const durationMs = Math.max(3500, Math.round(rawSeconds * 1000));
  const fuel = Math.max(
    1,
    Math.ceil(1 + (totalFuelFactor * dist * Math.pow(pct + 1, 2)) / 350000),
  );

  return {
    durationMs,
    fuel,
    cargoCap: Math.floor(cargoCap),
    minSpeed,
  };
}

export function biomeLabel(biome: PlanetBiome): string {
  switch (biome) {
    case "terran":
      return "Terrano";
    case "oceanic":
      return "Oceânico";
    case "volcanic":
      return "Vulcânico";
    case "ice":
      return "Glacial";
    case "desert":
      return "Desértico";
    case "crystal":
      return "Cristalino";
  }
}

export function formatCoords(c: Coordinates): string {
  return `[${c.galaxy}:${c.system}:${c.position}]`;
}

export function computePlanetResourceFillScale(
  resources: ResourceBundle,
  storageCap: ResourceBundle,
  fieldsUsed: number,
  fieldsMax: number,
): {
  totalResources: number;
  totalCapacity: number;
  fillRatio: number;
  globeScale: number;
} {
  const capM = Math.max(1, storageCap.metal);
  const capC = Math.max(1, storageCap.crystal);
  const capD = Math.max(1, storageCap.deuterium);
  const resM = Math.max(0, Math.min(capM, resources.metal));
  const resC = Math.max(0, Math.min(capC, resources.crystal));
  const resD = Math.max(0, Math.min(capD, resources.deuterium));

  const totalResources = resM + resC + resD;
  const totalCapacity = capM + capC + capD;
  const fillRatio = Math.max(0, Math.min(1, totalResources / Math.max(1, totalCapacity)));
  const capacityExpansion = Math.min(0.22, Math.log10(1 + totalResources / 8000) * 0.11);
  const fieldsExpansion = Math.min(0.08, (Math.max(0, fieldsUsed) / Math.max(1, fieldsMax)) * 0.08);
  const globeScale = Number((0.78 + fillRatio * 0.5 + capacityExpansion + fieldsExpansion).toFixed(4));

  return {
    totalResources,
    totalCapacity,
    fillRatio,
    globeScale,
  };
}


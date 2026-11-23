import nodeCrypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BUILDING_DEFS,
  BUILDING_ORDER,
  checkRequirements,
  computeFlightMetrics,
  computePlanetRates,
  DARK_MARKET_ITEMS,
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
} from "./shared/ogame_catalog";
import type {
  BuildingId,
  CombatRoundSummary,
  Coordinates,
  DarkMarketItemId,
  DebrisField,
  DefenseId,
  FleetMission,
  FleetMissionKind,
  GalaxySlotView,
  OgameClientSnapshot,
  PlanetBiome,
  PlanetState,
  PlayerEmpireState,
  ResourceBundle,
  ShipId,
  TechId,
  UniverseReport,
} from "./types";

const MAX_GALAXIES = 1;
const MAX_SYSTEMS = 5;
const SLOTS_PER_SYSTEM = 15;

function emptyBuildings(): Record<BuildingId, number> {
  const out = {} as Record<BuildingId, number>;
  for (const id of BUILDING_ORDER) out[id] = 0;
  return out;
}

function emptyTechs(): Record<TechId, number> {
  const out = {} as Record<TechId, number>;
  for (const id of TECH_ORDER) out[id] = 0;
  return out;
}

function emptyShips(): Record<ShipId, number> {
  const out = {} as Record<ShipId, number>;
  for (const id of SHIP_ORDER) out[id] = 0;
  return out;
}

function emptyDefenses(): Record<DefenseId, number> {
  const out = {} as Record<DefenseId, number>;
  for (const id of DEFENSE_ORDER) out[id] = 0;
  return out;
}

function coordKey(c: Coordinates): string {
  return `${c.galaxy}:${c.system}:${c.position}`;
}

function biomeForPosition(pos: number, seed: number): { biome: PlanetBiome; tempMax: number; diameter: number; fields: number } {
  const biomes: PlanetBiome[] =
    pos <= 3
      ? ["volcanic", "desert"]
      : pos <= 6
        ? ["terran", "oceanic"]
        : pos <= 10
          ? ["terran", "crystal", "desert"]
          : ["ice", "crystal", "oceanic"];
  const biome = biomes[(pos + seed) % biomes.length];
  const tempMax = Math.round(130 - pos * 11 + ((seed % 25) - 12));
  const diameter = 9600 + ((pos * 731 + seed * 313) % 5200);
  const fields = Math.round((diameter / 1000) ** 2 * 1.35);
  return { biome, tempMax, diameter, fields };
}

interface PersistedUniverse {
  version: number;
  universeSpeed: number;
  players: Record<string, PlayerEmpireState>;
  planets: Record<string, PlanetState>;
  debris: Record<string, DebrisField>;
  fleets: FleetMission[];
}

export interface UniverseUpdateEvent {
  type: "ogame_tick";
  affectedPlayerIds: string[];
  serverTime: number;
}

export class OgameUniverseStore {
  private state: PersistedUniverse;
  private persistPath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onUpdate?: (evt: UniverseUpdateEvent) => void;

  constructor(opts: { persistPath?: string; onUpdate?: (evt: UniverseUpdateEvent) => void } = {}) {
    this.persistPath =
      opts.persistPath ||
      process.env.WORLD_STATE_PATH ||
      path.join(os.tmpdir(), "ogamex_pro_universe_v1.json");
    this.onUpdate = opts.onUpdate;
    this.state = this.loadOrSeed();
    this.tickInterval = setInterval(() => {
      const affected = this.advanceUniverse(Date.now());
      if (affected.length > 0) {
        this.schedulePersist();
        this.onUpdate?.({
          type: "ogame_tick",
          affectedPlayerIds: affected,
          serverTime: Date.now(),
        });
      }
    }, 1000);
  }

  dispose(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.flushPersistSync();
  }

  private loadOrSeed(): PersistedUniverse {
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = JSON.parse(fs.readFileSync(this.persistPath, "utf8")) as PersistedUniverse;
        if (raw && raw.version === 1 && raw.players && raw.planets) {
          for (const planet of Object.values(raw.planets)) {
            planet.buildings = { ...emptyBuildings(), ...(planet.buildings ?? {}) };
            planet.ships = { ...emptyShips(), ...(planet.ships ?? {}) };
            planet.defenses = { ...emptyDefenses(), ...(planet.defenses ?? {}) };
          }
          for (const player of Object.values(raw.players)) {
            player.techs = { ...emptyTechs(), ...(player.techs ?? {}) };
            if (typeof player.darkMatter !== "number" || !Number.isFinite(player.darkMatter)) {
              player.darkMatter = 0;
            }
          }
          return raw;
        }
      }
    } catch {
      // fall through to fresh seed
    }
    return this.createSeedUniverse();
  }

  private createSeedUniverse(): PersistedUniverse {
    const now = Date.now();
    const players: Record<string, PlayerEmpireState> = {};
    const planets: Record<string, PlanetState> = {};
    const debris: Record<string, DebrisField> = {};

    const npcConfigs: Array<{
      id: string;
      name: string;
      planetName: string;
      coords: Coordinates;
      tier: "pirate" | "abandoned" | "imperial";
    }> = [
      { id: "npc_pirate_1", name: "Corsário Kael", planetName: "Ninho Sombrio", coords: { galaxy: 1, system: 1, position: 3 }, tier: "pirate" },
      { id: "npc_abandoned_1", name: "Colônia Antiga", planetName: "Éden Esquecido", coords: { galaxy: 1, system: 1, position: 5 }, tier: "abandoned" },
      { id: "npc_pirate_2", name: "Sindicato Vex", planetName: "Forja Rubra", coords: { galaxy: 1, system: 1, position: 8 }, tier: "pirate" },
      { id: "npc_imperial_1", name: "Império Krynn", planetName: "Bastilha Aurora", coords: { galaxy: 1, system: 1, position: 11 }, tier: "imperial" },
      { id: "npc_abandoned_2", name: "Mineradora Zeta", planetName: "Veio Dourado", coords: { galaxy: 1, system: 1, position: 13 }, tier: "abandoned" },
      { id: "npc_pirate_3", name: "Frota Ferro", planetName: "Cinturão IX", coords: { galaxy: 1, system: 2, position: 4 }, tier: "pirate" },
      { id: "npc_abandoned_3", name: "Estação Silício", planetName: "Cristália", coords: { galaxy: 1, system: 2, position: 7 }, tier: "abandoned" },
      { id: "npc_imperial_2", name: "Legião Solaris", planetName: "Cidadela Alta", coords: { galaxy: 1, system: 2, position: 10 }, tier: "imperial" },
      { id: "npc_pirate_4", name: "Corsários Bruma", planetName: "Abismo Azul", coords: { galaxy: 1, system: 3, position: 6 }, tier: "pirate" },
      { id: "npc_imperial_3", name: "Arcontes Ômega", planetName: "Núcleo Prime", coords: { galaxy: 1, system: 3, position: 9 }, tier: "imperial" },
    ];

    for (let i = 0; i < npcConfigs.length; i++) {
      const cfg = npcConfigs[i];
      const techs = emptyTechs();
      const buildings = emptyBuildings();
      const ships = emptyShips();
      const defenses = emptyDefenses();

      if (cfg.tier === "abandoned") {
        buildings.metal_mine = 6;
        buildings.crystal_mine = 5;
        buildings.deuterium_synthesizer = 3;
        buildings.solar_plant = 7;
        debris[coordKey(cfg.coords)] = { metal: 3200 + i * 700, crystal: 1800 + i * 400 };
      } else if (cfg.tier === "pirate") {
        techs.weapons_tech = 2;
        techs.shielding_tech = 2;
        techs.armour_tech = 2;
        buildings.metal_mine = 7;
        buildings.crystal_mine = 6;
        buildings.solar_plant = 8;
        buildings.shipyard = 4;
        ships.light_fighter = 10 + i * 2;
        ships.small_cargo = 4;
        defenses.rocket_launcher = 6;
        defenses.light_laser = 4;
        debris[coordKey(cfg.coords)] = { metal: 4500, crystal: 2400 };
      } else {
        techs.weapons_tech = 5;
        techs.shielding_tech = 5;
        techs.armour_tech = 5;
        buildings.metal_mine = 11;
        buildings.crystal_mine = 9;
        buildings.deuterium_synthesizer = 7;
        buildings.solar_plant = 12;
        buildings.shipyard = 7;
        ships.light_fighter = 28;
        ships.cruiser = 8;
        ships.battleship = 3;
        defenses.rocket_launcher = 20;
        defenses.light_laser = 15;
        defenses.heavy_laser = 6;
        defenses.small_shield_dome = 1;
      }

      const geo = biomeForPosition(cfg.coords.position, i + 7);
      const planetId = `p_${cfg.id}`;
      const resources: ResourceBundle =
        cfg.tier === "abandoned"
          ? { metal: 9500, crystal: 5800, deuterium: 2200 }
          : cfg.tier === "pirate"
            ? { metal: 12500, crystal: 7400, deuterium: 3600 }
            : { metal: 28000, crystal: 16500, deuterium: 8800 };

      planets[planetId] = {
        id: planetId,
        ownerId: cfg.id,
        ownerName: cfg.name,
        isNpc: true,
        name: cfg.planetName,
        coords: cfg.coords,
        biome: geo.biome,
        temperatureMax: geo.tempMax,
        diameterKm: geo.diameter,
        fieldsUsed: Object.values(buildings).reduce((a, b) => a + b, 0),
        fieldsMax: geo.fields,
        hasMoon: cfg.tier === "imperial",
        resources,
        lastResourceUpdateAt: now,
        buildings,
        ships,
        defenses,
        buildingQueue: null,
        shipyardQueue: [],
      };

      players[cfg.id] = {
        id: cfg.id,
        commanderName: cfg.name,
        darkMatter: 0,
        points: cfg.tier === "imperial" ? 2850 : cfg.tier === "pirate" ? 640 : 190,
        techs,
        researchQueue: null,
        planetIds: [planetId],
        reports: [],
      };
    }

    return {
      version: 1,
      universeSpeed: 60,
      players,
      planets,
      debris,
      fleets: [],
    };
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void fsPromises
        .writeFile(this.persistPath, JSON.stringify(this.state), "utf8")
        .catch(() => {});
    }, 600);
  }

  private flushPersistSync(): void {
    try {
      fs.writeFileSync(this.persistPath, JSON.stringify(this.state), "utf8");
    } catch {
      // ignore
    }
  }

  private findFreeHomeworldSlot(): Coordinates {
    const occupied = new Set(Object.values(this.state.planets).map((p) => coordKey(p.coords)));
    for (let sys = 1; sys <= MAX_SYSTEMS; sys++) {
      for (const pos of [4, 6, 7, 9, 10, 12, 5, 11, 8, 3, 13, 2, 14, 1, 15]) {
        const coords = { galaxy: 1, system: sys, position: pos };
        if (!occupied.has(coordKey(coords))) return coords;
      }
    }
    return { galaxy: 1, system: 1, position: 4 };
  }

  ensurePlayer(playerId: string): PlayerEmpireState {
    const existing = this.state.players[playerId];
    if (existing) {
      const validPlanets = existing.planetIds.filter((pid) => Boolean(this.state.planets[pid]));
      if (validPlanets.length > 0) {
        existing.planetIds = validPlanets;
        return existing;
      }
    }

    const now = Date.now();
    const coords = this.findFreeHomeworldSlot();
    const planetId = `p_${nodeCrypto.randomBytes(5).toString("hex")}`;
    const numSuffix = (Object.keys(this.state.players).length % 900) + 100;
    const commanderName = `Comandante #${numSuffix}`;
    const buildings = emptyBuildings();
    const ships = emptyShips();
    const defenses = emptyDefenses();
    const techs = emptyTechs();

    const planet: PlanetState = {
      id: planetId,
      ownerId: playerId,
      ownerName: commanderName,
      isNpc: false,
      name: "Terra Nova",
      coords,
      biome: "terran",
      temperatureMax: 42,
      diameterKm: 12800,
      fieldsUsed: 0,
      fieldsMax: 185,
      hasMoon: false,
      resources: { metal: 950, crystal: 650, deuterium: 250 },
      lastResourceUpdateAt: now,
      buildings,
      ships,
      defenses,
      buildingQueue: null,
      shipyardQueue: [],
    };

    const player: PlayerEmpireState = {
      id: playerId,
      commanderName,
      darkMatter: 500,
      points: 10,
      techs,
      researchQueue: null,
      planetIds: [planetId],
      reports: [
        {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "expedition",
          title: "Base Colonial Ativada",
          createdAt: now,
          read: false,
          coords,
          summary:
            "Bem-vindo ao Ogamex Pro! Construa sua Mina de Metal, Mina de Cristal e Planta Solar, desbloqueie o Hangar e explore a Galáxia em blocos 3D.",
        },
      ],
    };

    this.state.planets[planetId] = planet;
    this.state.players[playerId] = player;
    this.schedulePersist();
    return player;
  }

  private accruePlanetResources(planet: PlanetState, now: number): void {
    const owner = this.state.players[planet.ownerId];
    if (!owner) return;
    const elapsedMs = Math.max(0, now - planet.lastResourceUpdateAt);
    if (elapsedMs < 50) return;

    const rates = computePlanetRates(planet, owner.techs, this.state.universeSpeed);
    const hours = elapsedMs / 3600000;

    if (rates.metalPerHour > 0 && planet.resources.metal < rates.storageCap.metal) {
      planet.resources.metal = Math.min(
        rates.storageCap.metal,
        planet.resources.metal + rates.metalPerHour * hours,
      );
    }
    if (rates.crystalPerHour > 0 && planet.resources.crystal < rates.storageCap.crystal) {
      planet.resources.crystal = Math.min(
        rates.storageCap.crystal,
        planet.resources.crystal + rates.crystalPerHour * hours,
      );
    }
    if (rates.deuteriumPerHour > 0 && planet.resources.deuterium < rates.storageCap.deuterium) {
      planet.resources.deuterium = Math.min(
        rates.storageCap.deuterium,
        planet.resources.deuterium + rates.deuteriumPerHour * hours,
      );
    }
    if (rates.darkMatterPerHour > 0) {
      owner.darkMatter = (owner.darkMatter ?? 0) + rates.darkMatterPerHour * hours;
    }
    planet.lastResourceUpdateAt = now;
  }

  private recalculatePlayerPoints(player: PlayerEmpireState): void {
    let spent = 0;
    for (const pid of player.planetIds) {
      const p = this.state.planets[pid];
      if (!p) continue;
      for (const bId of BUILDING_ORDER) {
        const lvl = p.buildings[bId] ?? 0;
        for (let l = 0; l < lvl; l++) {
          const c = getBuildingUpgradeCost(bId, l);
          spent += c.metal + c.crystal + c.deuterium;
        }
      }
      for (const sId of SHIP_ORDER) {
        const cnt = p.ships[sId] ?? 0;
        if (cnt > 0) {
          const c = SHIP_DEFS[sId].cost;
          spent += cnt * (c.metal + c.crystal + c.deuterium);
        }
      }
      for (const dId of DEFENSE_ORDER) {
        const cnt = p.defenses[dId] ?? 0;
        if (cnt > 0) {
          const c = DEFENSE_DEFS[dId].cost;
          spent += cnt * (c.metal + c.crystal + c.deuterium);
        }
      }
    }
    for (const tId of TECH_ORDER) {
      const lvl = player.techs[tId] ?? 0;
      for (let l = 0; l < lvl; l++) {
        const c = getTechUpgradeCost(tId, l);
        spent += c.metal + c.crystal + c.deuterium;
      }
    }
    player.points = Math.max(1, Math.floor(spent / 1000));
  }

  private pushReport(player: PlayerEmpireState, report: UniverseReport): void {
    player.reports.unshift(report);
    if (player.reports.length > 40) {
      player.reports.length = 40;
    }
  }

  advanceUniverse(now = Date.now()): string[] {
    const affected = new Set<string>();

    for (const planet of Object.values(this.state.planets)) {
      this.accruePlanetResources(planet, now);

      if (planet.buildingQueue && now >= planet.buildingQueue.finishesAt) {
        const q = planet.buildingQueue;
        planet.buildings[q.buildingId] = q.targetLevel;
        planet.fieldsUsed = Object.values(planet.buildings).reduce((a, b) => a + b, 0);
        planet.buildingQueue = null;
        const owner = this.state.players[planet.ownerId];
        if (owner) {
          this.recalculatePlayerPoints(owner);
          affected.add(owner.id);
        }
      }

      while (planet.shipyardQueue.length > 0 && now >= planet.shipyardQueue[0].nextUnitAt) {
        const job = planet.shipyardQueue[0];
        if (job.kind === "ship") {
          const sId = job.unitId as ShipId;
          planet.ships[sId] = (planet.ships[sId] ?? 0) + 1;
        } else {
          const dId = job.unitId as DefenseId;
          planet.defenses[dId] = (planet.defenses[dId] ?? 0) + 1;
        }
        job.quantity -= 1;
        if (job.quantity <= 0) {
          planet.shipyardQueue.shift();
          if (planet.shipyardQueue.length > 0) {
            planet.shipyardQueue[0].nextUnitAt = Math.max(
              job.nextUnitAt + planet.shipyardQueue[0].unitDurationMs,
              now + planet.shipyardQueue[0].unitDurationMs,
            );
          }
        } else {
          job.nextUnitAt += job.unitDurationMs;
        }
        const owner = this.state.players[planet.ownerId];
        if (owner) {
          this.recalculatePlayerPoints(owner);
          affected.add(owner.id);
        }
      }
    }

    for (const player of Object.values(this.state.players)) {
      if (player.researchQueue && now >= player.researchQueue.finishesAt) {
        const rq = player.researchQueue;
        player.techs[rq.techId] = rq.targetLevel;
        player.researchQueue = null;
        this.recalculatePlayerPoints(player);
        affected.add(player.id);
      }
    }

    const remainingFleets: FleetMission[] = [];
    for (const fleet of this.state.fleets) {
      if (fleet.phase === "outbound" && now >= fleet.arrivalAt) {
        const keepFleet = this.resolveFleetArrival(fleet, now, affected);
        if (keepFleet) remainingFleets.push(keepFleet);
      } else if (fleet.phase === "returning" && fleet.returnAt && now >= fleet.returnAt) {
        this.resolveFleetReturn(fleet, affected);
      } else {
        remainingFleets.push(fleet);
      }
    }
    this.state.fleets = remainingFleets;

    return Array.from(affected);
  }

  private findPlanetAtCoords(coords: Coordinates): PlanetState | null {
    for (const p of Object.values(this.state.planets)) {
      if (
        p.coords.galaxy === coords.galaxy &&
        p.coords.system === coords.system &&
        p.coords.position === coords.position
      ) {
        return p;
      }
    }
    return null;
  }

  private makeReturnFleet(fleet: FleetMission, now: number): FleetMission | null {
    const totalShips = Object.values(fleet.ships).reduce((a, b) => a + (b || 0), 0);
    if (totalShips <= 0) return null;
    const travelMs = Math.max(3000, fleet.arrivalAt - fleet.departedAt);
    return {
      ...fleet,
      phase: "returning",
      returnAt: now + travelMs,
    };
  }

  private resolveFleetReturn(fleet: FleetMission, affected: Set<string>): void {
    const home = this.state.planets[fleet.originPlanetId];
    const owner = this.state.players[fleet.ownerId];
    if (home) {
      for (const [sId, count] of Object.entries(fleet.ships) as [ShipId, number][]) {
        if (count > 0) home.ships[sId] = (home.ships[sId] ?? 0) + count;
      }
      home.resources.metal += fleet.cargo.metal;
      home.resources.crystal += fleet.cargo.crystal;
      home.resources.deuterium += fleet.cargo.deuterium;
    }
    if (owner) {
      this.recalculatePlayerPoints(owner);
      affected.add(owner.id);
    }
  }

  private resolveFleetArrival(
    fleet: FleetMission,
    now: number,
    affected: Set<string>,
  ): FleetMission | null {
    const attacker = this.state.players[fleet.ownerId];
    if (!attacker) return null;
    affected.add(attacker.id);

    const target = this.findPlanetAtCoords(fleet.targetCoords);

    if (fleet.mission === "transport") {
      if (target) {
        this.accruePlanetResources(target, now);
        target.resources.metal += fleet.cargo.metal;
        target.resources.crystal += fleet.cargo.crystal;
        target.resources.deuterium += fleet.cargo.deuterium;
        const targetOwner = this.state.players[target.ownerId];
        if (targetOwner) affected.add(targetOwner.id);
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "transport",
          title: `Transporte entregue em ${target.name}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Entregue: ${Math.floor(fleet.cargo.metal)} Metal, ${Math.floor(fleet.cargo.crystal)} Cristal, ${Math.floor(fleet.cargo.deuterium)} Deutério.`,
        });
      }
      fleet.cargo = { metal: 0, crystal: 0, deuterium: 0 };
      return this.makeReturnFleet(fleet, now);
    }

    if (fleet.mission === "deploy") {
      if (target && target.ownerId === attacker.id) {
        this.accruePlanetResources(target, now);
        for (const [sId, count] of Object.entries(fleet.ships) as [ShipId, number][]) {
          if (count > 0) target.ships[sId] = (target.ships[sId] ?? 0) + count;
        }
        target.resources.metal += fleet.cargo.metal;
        target.resources.crystal += fleet.cargo.crystal;
        target.resources.deuterium += fleet.cargo.deuterium;
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "transport",
          title: `Frota transferida para ${target.name}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Frota estacionada com sucesso em ${formatCoords(fleet.targetCoords)}.`,
        });
        return null;
      }
      return this.makeReturnFleet(fleet, now);
    }

    if (fleet.mission === "colonize") {
      const maxColonies = 1 + Math.floor(((attacker.techs.astrophysics ?? 0) + 1) / 2);
      const colonyCount = fleet.ships.colony_ship ?? 0;
      if (!target && colonyCount >= 1 && attacker.planetIds.length < maxColonies) {
        const geo = biomeForPosition(fleet.targetCoords.position, attacker.planetIds.length + 3);
        const newId = `p_${nodeCrypto.randomBytes(5).toString("hex")}`;
        const newPlanet: PlanetState = {
          id: newId,
          ownerId: attacker.id,
          ownerName: attacker.commanderName,
          isNpc: false,
          name: `Colônia ${formatCoords(fleet.targetCoords)}`,
          coords: fleet.targetCoords,
          biome: geo.biome,
          temperatureMax: geo.tempMax,
          diameterKm: geo.diameter,
          fieldsUsed: 0,
          fieldsMax: geo.fields,
          hasMoon: false,
          resources: {
            metal: 500 + fleet.cargo.metal,
            crystal: 500 + fleet.cargo.crystal,
            deuterium: fleet.cargo.deuterium,
          },
          lastResourceUpdateAt: now,
          buildings: emptyBuildings(),
          ships: emptyShips(),
          defenses: emptyDefenses(),
          buildingQueue: null,
          shipyardQueue: [],
        };
        fleet.ships.colony_ship = colonyCount - 1;
        for (const [sId, count] of Object.entries(fleet.ships) as [ShipId, number][]) {
          if (count > 0) newPlanet.ships[sId] = (newPlanet.ships[sId] ?? 0) + count;
        }
        this.state.planets[newId] = newPlanet;
        attacker.planetIds.push(newId);
        this.recalculatePlayerPoints(attacker);
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "colonize",
          title: `Nova Colônia fundada em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Planeta ${newPlanet.name} (${geo.fields} campos, ${geo.tempMax}°C) agora faz parte do seu império!`,
        });
        return null;
      }
      this.pushReport(attacker, {
        id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
        kind: "colonize",
        title: `Colonização falhou em ${formatCoords(fleet.targetCoords)}`,
        createdAt: now,
        read: false,
        coords: fleet.targetCoords,
        summary: target
          ? "A posição já estava ocupada por outro planeta."
          : `Limite de colônias atingido (${maxColonies}). Pesquise Astrofísica para expandir.`,
      });
      return this.makeReturnFleet(fleet, now);
    }

    if (fleet.mission === "recycle") {
      const dk = coordKey(fleet.targetCoords);
      const deb = this.state.debris[dk];
      const recCount = fleet.ships.recycler ?? 0;
      const cap = recCount * SHIP_DEFS.recycler.cargo;
      if (deb && cap > 0 && (deb.metal > 0 || deb.crystal > 0)) {
        const takeMetal = Math.min(deb.metal, Math.floor(cap * 0.6));
        const remCap = cap - takeMetal;
        const takeCrystal = Math.min(deb.crystal, remCap);
        const extraMetal = Math.min(deb.metal - takeMetal, cap - takeMetal - takeCrystal);
        const gotM = takeMetal + extraMetal;
        const gotC = takeCrystal;
        deb.metal -= gotM;
        deb.crystal -= gotC;
        if (deb.metal <= 0 && deb.crystal <= 0) delete this.state.debris[dk];
        fleet.cargo.metal += gotM;
        fleet.cargo.crystal += gotC;
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "recycle",
          title: `Coleta de Destroços em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Recicladores coletaram ${gotM} Metal e ${gotC} Cristal do campo orbital.`,
        });
      } else {
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "recycle",
          title: `Nenhum destroço em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: "Não havia destroços recicláveis na órbita selecionada.",
        });
      }
      return this.makeReturnFleet(fleet, now);
    }

    if (fleet.mission === "espionage") {
      if (!target) {
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "espionage",
          title: `Sonda retornou de ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: "Espaço vazio — nenhum planeta detectado nesta coordenada.",
        });
        return this.makeReturnFleet(fleet, now);
      }
      this.accruePlanetResources(target, now);
      const defender = this.state.players[target.ownerId];
      const probes = fleet.ships.espionage_probe ?? 1;
      const diff = (attacker.techs.espionage_tech ?? 0) - (defender?.techs.espionage_tech ?? 0);
      const intelScore = diff + Math.floor(Math.sqrt(probes));

      const espData: UniverseReport["espionageData"] = {
        targetName: target.name,
        ownerName: target.ownerName,
        resources: {
          metal: Math.floor(target.resources.metal),
          crystal: Math.floor(target.resources.crystal),
          deuterium: Math.floor(target.resources.deuterium),
        },
        ...(intelScore >= 0 ? { ships: { ...target.ships } } : {}),
        ...(intelScore >= 1 ? { defenses: { ...target.defenses } } : {}),
        ...(intelScore >= 2 ? { buildings: { ...target.buildings } } : {}),
      };

      this.pushReport(attacker, {
        id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
        kind: "espionage",
        title: `Espionagem: ${target.name} ${formatCoords(fleet.targetCoords)}`,
        createdAt: now,
        read: false,
        coords: fleet.targetCoords,
        summary: `Recursos detectados: ${espData.resources.metal} Metal, ${espData.resources.crystal} Cristal, ${espData.resources.deuterium} Deutério.`,
        espionageData: espData,
      });
      return this.makeReturnFleet(fleet, now);
    }

    if (fleet.mission === "expedition") {
      const roll = Math.random();
      if (roll < 0.45) {
        const m = Math.round(600 + Math.random() * 2600);
        const c = Math.round(400 + Math.random() * 1600);
        fleet.cargo.metal += m;
        fleet.cargo.crystal += c;
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "expedition",
          title: `Expedição bem-sucedida em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Sua frota encontrou um cargueiro abandonado contendo ${m} Metal e ${c} Cristal!`,
        });
      } else if (roll < 0.72) {
        const dm = Math.round(40 + Math.random() * 90);
        attacker.darkMatter += dm;
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "expedition",
          title: `Anomalia de Matéria Negra em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Sensores coletaram +${dm} Matéria Negra de uma nebulosa instável.`,
        });
      } else if (roll < 0.9) {
        const foundFighters = 1 + Math.floor(Math.random() * 3);
        fleet.ships.light_fighter = (fleet.ships.light_fighter ?? 0) + foundFighters;
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "expedition",
          title: `Frota à deriva recuperada em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: `Engenheiros reativaram ${foundFighters} Caça(s) Ligeiro(s) que agora acompanham a frota.`,
        });
      } else {
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "expedition",
          title: `Silêncio Cósmico em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: "A expedição mapeou o setor sem incidentes ou anomalias.",
        });
      }
      return this.makeReturnFleet(fleet, now);
    }

    if (fleet.mission === "attack") {
      if (!target) {
        this.pushReport(attacker, {
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "combat",
          title: `Ataque cancelado em ${formatCoords(fleet.targetCoords)}`,
          createdAt: now,
          read: false,
          coords: fleet.targetCoords,
          summary: "Nenhum planeta alvo encontrado nesta coordenada.",
        });
        return this.makeReturnFleet(fleet, now);
      }

      this.accruePlanetResources(target, now);
      const defender = this.state.players[target.ownerId];
      if (defender) affected.add(defender.id);

      const combat = this.runOgameCombat(fleet.ships, attacker.techs, target, defender?.techs ?? emptyTechs());

      fleet.ships = combat.survivingAttackerShips;
      target.ships = combat.survivingDefenderShips;
      target.defenses = combat.repairedDefenderDefenses;

      if (combat.debris.metal > 0 || combat.debris.crystal > 0) {
        const dk = coordKey(fleet.targetCoords);
        const curDeb = this.state.debris[dk] ?? { metal: 0, crystal: 0 };
        this.state.debris[dk] = {
          metal: curDeb.metal + combat.debris.metal,
          crystal: curDeb.crystal + combat.debris.crystal,
        };
      }

      const loot: ResourceBundle = { metal: 0, crystal: 0, deuterium: 0 };
      if (combat.outcome === "attacker_win") {
        let cap = 0;
        const hyperBonus = 1 + 0.05 * (attacker.techs.hyperspace_tech ?? 0);
        for (const [sId, cnt] of Object.entries(fleet.ships) as [ShipId, number][]) {
          if (cnt > 0) cap += SHIP_DEFS[sId].cargo * cnt * hyperBonus;
        }
        const usedCap = fleet.cargo.metal + fleet.cargo.crystal + fleet.cargo.deuterium;
        const freeCap = Math.max(0, Math.floor(cap - usedCap));

        const availM = Math.floor(target.resources.metal * 0.5);
        const availC = Math.floor(target.resources.crystal * 0.5);
        const availD = Math.floor(target.resources.deuterium * 0.5);
        const totalAvail = availM + availC + availD;

        if (totalAvail > 0 && freeCap > 0) {
          const ratio = Math.min(1, freeCap / totalAvail);
          loot.metal = Math.floor(availM * ratio);
          loot.crystal = Math.floor(availC * ratio);
          loot.deuterium = Math.floor(availD * ratio);

          target.resources.metal = Math.max(0, target.resources.metal - loot.metal);
          target.resources.crystal = Math.max(0, target.resources.crystal - loot.crystal);
          target.resources.deuterium = Math.max(0, target.resources.deuterium - loot.deuterium);

          fleet.cargo.metal += loot.metal;
          fleet.cargo.crystal += loot.crystal;
          fleet.cargo.deuterium += loot.deuterium;
        }
      }

      if (defender) this.recalculatePlayerPoints(defender);
      this.recalculatePlayerPoints(attacker);

      const outcomeText =
        combat.outcome === "attacker_win"
          ? "Vitória do Atacante!"
          : combat.outcome === "defender_win"
            ? "Vitória do Defensor!"
            : "Empate após 6 rodadas.";

      const reportBase = {
        createdAt: now,
        read: false,
        coords: fleet.targetCoords,
        outcome: combat.outcome,
        loot,
        debrisCreated: combat.debris,
        attackerLosses: combat.attackerLosses,
        defenderLosses: combat.defenderLosses,
        rounds: combat.rounds,
      };

      this.pushReport(attacker, {
        ...reportBase,
        id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
        kind: "combat",
        title: `Batalha em ${target.name} ${formatCoords(fleet.targetCoords)} — ${outcomeText}`,
        summary: `Saque: ${loot.metal} M, ${loot.crystal} C, ${loot.deuterium} D · Destroços gerados: ${combat.debris.metal} M / ${combat.debris.crystal} C.`,
      });

      if (defender && !target.isNpc) {
        this.pushReport(defender, {
          ...reportBase,
          id: `rep_${nodeCrypto.randomBytes(4).toString("hex")}`,
          kind: "combat",
          title: `Ataque sofrido em ${target.name} ${formatCoords(fleet.targetCoords)} — ${outcomeText}`,
          summary: `${attacker.commanderName} atacou ${target.name}. Perdas saqueadas: ${loot.metal} M, ${loot.crystal} C, ${loot.deuterium} D.`,
        });
      }

      return this.makeReturnFleet(fleet, now);
    }

    return this.makeReturnFleet(fleet, now);
  }

  private runOgameCombat(
    attackerShips: Partial<Record<ShipId, number>>,
    attackerTechs: Record<TechId, number>,
    targetPlanet: PlanetState,
    defenderTechs: Record<TechId, number>,
  ): {
    outcome: "attacker_win" | "defender_win" | "draw";
    survivingAttackerShips: Partial<Record<ShipId, number>>;
    survivingDefenderShips: Record<ShipId, number>;
    repairedDefenderDefenses: Record<DefenseId, number>;
    attackerLosses: ResourceBundle;
    defenderLosses: ResourceBundle;
    debris: DebrisField;
    rounds: CombatRoundSummary[];
  } {
    interface SimUnit {
      side: "A" | "D";
      kind: "ship" | "defense";
      unitId: ShipId | DefenseId;
      hull: number;
      maxHull: number;
      shield: number;
      maxShield: number;
      attack: number;
      rapidfire?: Partial<Record<ShipId | DefenseId, number>>;
      dead: boolean;
    }

    const attUnits: SimUnit[] = [];
    const defUnits: SimUnit[] = [];

    const aWep = 1 + 0.1 * (attackerTechs.weapons_tech ?? 0);
    const aShd = 1 + 0.1 * (attackerTechs.shielding_tech ?? 0);
    const aArm = 1 + 0.1 * (attackerTechs.armour_tech ?? 0);

    const dWep = 1 + 0.1 * (defenderTechs.weapons_tech ?? 0);
    const dShd = 1 + 0.1 * (defenderTechs.shielding_tech ?? 0);
    const dArm = 1 + 0.1 * (defenderTechs.armour_tech ?? 0);

    for (const [sId, count] of Object.entries(attackerShips) as [ShipId, number][]) {
      const def = SHIP_DEFS[sId];
      if (!def || !count) continue;
      for (let i = 0; i < count; i++) {
        attUnits.push({
          side: "A",
          kind: "ship",
          unitId: sId,
          hull: def.stats.hull * aArm,
          maxHull: def.stats.hull * aArm,
          shield: def.stats.shield * aShd,
          maxShield: def.stats.shield * aShd,
          attack: def.stats.attack * aWep,
          rapidfire: def.stats.rapidfire,
          dead: false,
        });
      }
    }

    for (const [sId, count] of Object.entries(targetPlanet.ships) as [ShipId, number][]) {
      const def = SHIP_DEFS[sId];
      if (!def || !count) continue;
      for (let i = 0; i < count; i++) {
        defUnits.push({
          side: "D",
          kind: "ship",
          unitId: sId,
          hull: def.stats.hull * dArm,
          maxHull: def.stats.hull * dArm,
          shield: def.stats.shield * dShd,
          maxShield: def.stats.shield * dShd,
          attack: def.stats.attack * dWep,
          rapidfire: def.stats.rapidfire,
          dead: false,
        });
      }
    }

    for (const [dId, count] of Object.entries(targetPlanet.defenses) as [DefenseId, number][]) {
      const def = DEFENSE_DEFS[dId];
      if (!def || !count) continue;
      for (let i = 0; i < count; i++) {
        defUnits.push({
          side: "D",
          kind: "defense",
          unitId: dId,
          hull: def.stats.hull * dArm,
          maxHull: def.stats.hull * dArm,
          shield: def.stats.shield * dShd,
          maxShield: def.stats.shield * dShd,
          attack: def.stats.attack * dWep,
          rapidfire: def.stats.rapidfire,
          dead: false,
        });
      }
    }

    const rounds: CombatRoundSummary[] = [];

    const fireVolley = (shooters: SimUnit[], targets: SimUnit[]) => {
      let shots = 0;
      let totalPower = 0;
      if (targets.length === 0) return { shots, totalPower };

      for (const shooter of shooters) {
        let keepFiring = true;
        let safety = 0;
        while (keepFiring && safety < 16) {
          safety++;
          const target = targets[Math.floor(Math.random() * targets.length)];
          shots++;
          totalPower += shooter.attack;

          if (!target.dead) {
            if (shooter.attack < target.maxShield * 0.01) {
              // Shield bounce rule
            } else if (target.shield >= shooter.attack) {
              target.shield -= shooter.attack;
            } else {
              const bleed = shooter.attack - target.shield;
              target.shield = 0;
              target.hull -= bleed;
              if (target.hull <= 0) {
                target.dead = true;
              } else if (target.hull < target.maxHull * 0.7) {
                const explodeChance = 1 - target.hull / target.maxHull;
                if (Math.random() < explodeChance) {
                  target.dead = true;
                }
              }
            }
          }

          const rf = shooter.rapidfire?.[target.unitId];
          if (rf && rf > 1 && Math.random() < (rf - 1) / rf) {
            keepFiring = true;
          } else {
            keepFiring = false;
          }
        }
      }
      return { shots, totalPower };
    };

    let liveA = attUnits;
    let liveD = defUnits;

    for (let r = 1; r <= 6; r++) {
      if (liveA.length === 0 || liveD.length === 0) break;
      for (const u of liveA) u.shield = u.maxShield;
      for (const u of liveD) u.shield = u.maxShield;

      const aVolley = fireVolley(liveA, liveD);
      const dVolley = fireVolley(liveD, liveA);

      liveA = liveA.filter((u) => !u.dead);
      liveD = liveD.filter((u) => !u.dead);

      rounds.push({
        round: r,
        attackerShots: aVolley.shots,
        attackerPower: Math.round(aVolley.totalPower),
        defenderShots: dVolley.shots,
        defenderPower: Math.round(dVolley.totalPower),
        attackerRemainingCount: liveA.length,
        defenderRemainingCount: liveD.length,
      });
    }

    const outcome: "attacker_win" | "defender_win" | "draw" =
      liveD.length === 0 && liveA.length > 0
        ? "attacker_win"
        : liveA.length === 0 && liveD.length > 0
          ? "defender_win"
          : "draw";

    const survivingAttackerShips: Partial<Record<ShipId, number>> = {};
    for (const u of liveA) {
      const sId = u.unitId as ShipId;
      survivingAttackerShips[sId] = (survivingAttackerShips[sId] ?? 0) + 1;
    }

    const survivingDefenderShips = emptyShips();
    const survivingDefenderDefenses = emptyDefenses();
    for (const u of liveD) {
      if (u.kind === "ship") {
        const sId = u.unitId as ShipId;
        survivingDefenderShips[sId] += 1;
      } else {
        const dId = u.unitId as DefenseId;
        survivingDefenderDefenses[dId] += 1;
      }
    }

    const attackerLosses: ResourceBundle = { metal: 0, crystal: 0, deuterium: 0 };
    const defenderLosses: ResourceBundle = { metal: 0, crystal: 0, deuterium: 0 };
    const debris: DebrisField = { metal: 0, crystal: 0 };

    for (const sId of SHIP_ORDER) {
      const lost = Math.max(0, (attackerShips[sId] ?? 0) - (survivingAttackerShips[sId] ?? 0));
      if (lost > 0) {
        const c = SHIP_DEFS[sId].cost;
        attackerLosses.metal += lost * c.metal;
        attackerLosses.crystal += lost * c.crystal;
        attackerLosses.deuterium += lost * c.deuterium;
        debris.metal += Math.floor(lost * c.metal * 0.3);
        debris.crystal += Math.floor(lost * c.crystal * 0.3);
      }
      const defLost = Math.max(0, (targetPlanet.ships[sId] ?? 0) - (survivingDefenderShips[sId] ?? 0));
      if (defLost > 0) {
        const c = SHIP_DEFS[sId].cost;
        defenderLosses.metal += defLost * c.metal;
        defenderLosses.crystal += defLost * c.crystal;
        defenderLosses.deuterium += defLost * c.deuterium;
        debris.metal += Math.floor(defLost * c.metal * 0.3);
        debris.crystal += Math.floor(defLost * c.crystal * 0.3);
      }
    }

    const repairedDefenderDefenses = emptyDefenses();
    for (const dId of DEFENSE_ORDER) {
      const orig = targetPlanet.defenses[dId] ?? 0;
      const surv = survivingDefenderDefenses[dId] ?? 0;
      const lost = Math.max(0, orig - surv);
      let repaired = 0;
      for (let i = 0; i < lost; i++) {
        if (Math.random() < 0.7) repaired++;
      }
      repairedDefenderDefenses[dId] = surv + repaired;
      const permLost = lost - repaired;
      if (permLost > 0) {
        const c = DEFENSE_DEFS[dId].cost;
        defenderLosses.metal += permLost * c.metal;
        defenderLosses.crystal += permLost * c.crystal;
        defenderLosses.deuterium += permLost * c.deuterium;
      }
    }

    return {
      outcome,
      survivingAttackerShips,
      survivingDefenderShips,
      repairedDefenderDefenses,
      attackerLosses,
      defenderLosses,
      debris,
      rounds,
    };
  }

  getGalaxySystemView(playerId: string, galaxy: number, system: number): { galaxy: number; system: number; slots: GalaxySlotView[] } {
    const g = Math.max(1, Math.min(MAX_GALAXIES, Math.trunc(galaxy)));
    const s = Math.max(1, Math.min(MAX_SYSTEMS, Math.trunc(system)));
    const slots: GalaxySlotView[] = [];
    for (let pos = 1; pos <= SLOTS_PER_SYSTEM; pos++) {
      const c = { galaxy: g, system: s, position: pos };
      const planet = this.findPlanetAtCoords(c);
      const deb = this.state.debris[coordKey(c)] ?? null;
      const owner = planet ? this.state.players[planet.ownerId] : null;
      slots.push({
        position: pos,
        planetId: planet?.id ?? null,
        name: planet?.name ?? null,
        ownerId: planet?.ownerId ?? null,
        ownerName: planet?.ownerName ?? null,
        isNpc: planet?.isNpc ?? false,
        isOwn: planet?.ownerId === playerId,
        biome: planet?.biome ?? null,
        hasMoon: planet?.hasMoon ?? false,
        diameterKm: planet?.diameterKm ?? null,
        temperatureMax: planet?.temperatureMax ?? null,
        debris: deb && (deb.metal > 0 || deb.crystal > 0) ? deb : null,
        points: owner?.points ?? 0,
      });
    }
    return { galaxy: g, system: s, slots };
  }

  getSnapshot(playerId: string, requestedSystem?: number): OgameClientSnapshot {
    const now = Date.now();
    const player = this.ensurePlayer(playerId);
    this.advanceUniverse(now);

    const planets = player.planetIds
      .map((pid) => this.state.planets[pid])
      .filter((p): p is PlanetState => Boolean(p))
      .map((p) => ({
        ...p,
        resources: {
          metal: Math.floor(p.resources.metal),
          crystal: Math.floor(p.resources.crystal),
          deuterium: Math.floor(p.resources.deuterium),
        },
        rates: computePlanetRates(p, player.techs, this.state.universeSpeed),
      }));

    const sys = requestedSystem ?? planets[0]?.coords.system ?? 1;
    const activeSystem = this.getGalaxySystemView(playerId, 1, sys);

    return {
      serverTime: now,
      universeSpeed: this.state.universeSpeed,
      player: {
        ...player,
        darkMatter: Math.floor(player.darkMatter ?? 0),
      },
      planets,
      activeSystem,
      fleets: this.state.fleets.filter((f) => f.ownerId === playerId),
      galaxyFleets: this.state.fleets.filter(
        (f) => f.originCoords.system === activeSystem.system || f.targetCoords.system === activeSystem.system,
      ),
    };
  }

  updateProfile(playerId: string, planetId: string, commanderName?: string, planetName?: string): { ok: true } | { ok: false; error: string } {
    const player = this.ensurePlayer(playerId);
    if (commanderName && commanderName.trim()) {
      const clean = commanderName.trim().slice(0, 24);
      player.commanderName = clean;
      for (const pid of player.planetIds) {
        const p = this.state.planets[pid];
        if (p) p.ownerName = clean;
      }
    }
    if (planetName && planetName.trim()) {
      const p = this.state.planets[planetId];
      if (!p || p.ownerId !== playerId) return { ok: false, error: "Planeta inválido." };
      p.name = planetName.trim().slice(0, 24);
    }
    this.schedulePersist();
    return { ok: true };
  }

  setUniverseSpeed(speed: number): { ok: true; speed: number } {
    const allowed = [10, 60, 300];
    const clean = allowed.includes(speed) ? speed : 60;
    this.advanceUniverse(Date.now());
    this.state.universeSpeed = clean;
    this.schedulePersist();
    return { ok: true, speed: clean };
  }

  startBuildingUpgrade(playerId: string, planetId: string, buildingId: BuildingId): { ok: true } | { ok: false; error: string } {
    const now = Date.now();
    this.advanceUniverse(now);
    const player = this.ensurePlayer(playerId);
    const planet = this.state.planets[planetId];
    if (!planet || planet.ownerId !== playerId) return { ok: false, error: "Planeta não encontrado." };
    if (!BUILDING_DEFS[buildingId]) return { ok: false, error: "Edifício inválido." };
    if (planet.buildingQueue) return { ok: false, error: "Já existe uma construção em andamento neste planeta." };
    if (planet.fieldsUsed >= planet.fieldsMax) return { ok: false, error: "Sem campos disponíveis no planeta." };

    const req = checkRequirements(BUILDING_DEFS[buildingId].requires, planet.buildings, player.techs);
    if (!req.met) return { ok: false, error: `Requer: ${req.missing.join(", ")}` };

    const curLvl = planet.buildings[buildingId] ?? 0;
    const cost = getBuildingUpgradeCost(buildingId, curLvl);
    if (
      planet.resources.metal < cost.metal ||
      planet.resources.crystal < cost.crystal ||
      planet.resources.deuterium < cost.deuterium
    ) {
      return { ok: false, error: "Recursos insuficientes." };
    }

    planet.resources.metal -= cost.metal;
    planet.resources.crystal -= cost.crystal;
    planet.resources.deuterium -= cost.deuterium;

    const dur = getBuildingBuildDurationMs(
      cost,
      planet.buildings.robotics_factory ?? 0,
      planet.buildings.nanite_factory ?? 0,
      this.state.universeSpeed,
    );

    planet.buildingQueue = {
      buildingId,
      targetLevel: curLvl + 1,
      startedAt: now,
      finishesAt: now + dur,
    };
    this.schedulePersist();
    return { ok: true };
  }

  startResearch(playerId: string, planetId: string, techId: TechId): { ok: true } | { ok: false; error: string } {
    const now = Date.now();
    this.advanceUniverse(now);
    const player = this.ensurePlayer(playerId);
    const planet = this.state.planets[planetId];
    if (!planet || planet.ownerId !== playerId) return { ok: false, error: "Planeta não encontrado." };
    if (!TECH_DEFS[techId]) return { ok: false, error: "Pesquisa inválida." };
    if (player.researchQueue) return { ok: false, error: "Já existe uma pesquisa em andamento." };

    const req = checkRequirements(TECH_DEFS[techId].requires, planet.buildings, player.techs);
    if (!req.met) return { ok: false, error: `Requer: ${req.missing.join(", ")}` };

    const curLvl = player.techs[techId] ?? 0;
    const cost = getTechUpgradeCost(techId, curLvl);
    if (
      planet.resources.metal < cost.metal ||
      planet.resources.crystal < cost.crystal ||
      planet.resources.deuterium < cost.deuterium
    ) {
      return { ok: false, error: "Recursos insuficientes neste planeta." };
    }

    planet.resources.metal -= cost.metal;
    planet.resources.crystal -= cost.crystal;
    planet.resources.deuterium -= cost.deuterium;

    const dur = getResearchDurationMs(
      cost,
      planet.buildings.research_lab ?? 0,
      this.state.universeSpeed,
    );

    player.researchQueue = {
      techId,
      planetId,
      targetLevel: curLvl + 1,
      startedAt: now,
      finishesAt: now + dur,
    };
    this.schedulePersist();
    return { ok: true };
  }

  buildShipyardUnit(
    playerId: string,
    planetId: string,
    kind: "ship" | "defense",
    unitId: ShipId | DefenseId,
    quantity: number,
  ): { ok: true } | { ok: false; error: string } {
    const now = Date.now();
    this.advanceUniverse(now);
    const player = this.ensurePlayer(playerId);
    const planet = this.state.planets[planetId];
    if (!planet || planet.ownerId !== playerId) return { ok: false, error: "Planeta não encontrado." };

    const qty = Math.max(1, Math.min(999, Math.trunc(quantity)));
    const def = kind === "ship" ? SHIP_DEFS[unitId as ShipId] : DEFENSE_DEFS[unitId as DefenseId];
    if (!def) return { ok: false, error: "Unidade inválida." };

    if (kind === "defense") {
      const dDef = DEFENSE_DEFS[unitId as DefenseId];
      if (dDef.maxCount) {
        const queued = planet.shipyardQueue
          .filter((q) => q.kind === "defense" && q.unitId === unitId)
          .reduce((a, q) => a + q.quantity, 0);
        if ((planet.defenses[unitId as DefenseId] ?? 0) + queued + qty > dDef.maxCount) {
          return { ok: false, error: `Máximo de ${dDef.maxCount} unidade(s) permitido.` };
        }
      }
    }

    const req = checkRequirements(def.requires, planet.buildings, player.techs);
    if (!req.met) return { ok: false, error: `Requer: ${req.missing.join(", ")}` };

    const totalM = def.cost.metal * qty;
    const totalC = def.cost.crystal * qty;
    const totalD = def.cost.deuterium * qty;
    if (
      planet.resources.metal < totalM ||
      planet.resources.crystal < totalC ||
      planet.resources.deuterium < totalD
    ) {
      return { ok: false, error: "Recursos insuficientes." };
    }

    planet.resources.metal -= totalM;
    planet.resources.crystal -= totalC;
    planet.resources.deuterium -= totalD;

    const unitDurationMs = getUnitBuildDurationMs(
      def.cost,
      planet.buildings.shipyard ?? 0,
      planet.buildings.nanite_factory ?? 0,
      this.state.universeSpeed,
    );

    const hasPrev = planet.shipyardQueue.length > 0;
    planet.shipyardQueue.push({
      kind,
      unitId,
      quantity: qty,
      unitDurationMs,
      nextUnitAt: hasPrev ? now + unitDurationMs * 9999 : now + unitDurationMs,
    });
    if (!hasPrev && planet.shipyardQueue[0]) {
      planet.shipyardQueue[0].nextUnitAt = now + unitDurationMs;
    }
    this.schedulePersist();
    return { ok: true };
  }

  dispatchFleet(
    playerId: string,
    originPlanetId: string,
    targetCoords: Coordinates,
    mission: FleetMissionKind,
    ships: Partial<Record<ShipId, number>>,
    cargo: Partial<ResourceBundle>,
    speedPct = 100,
  ): { ok: true; fleet: FleetMission } | { ok: false; error: string } {
    const now = Date.now();
    this.advanceUniverse(now);
    const player = this.ensurePlayer(playerId);
    const origin = this.state.planets[originPlanetId];
    if (!origin || origin.ownerId !== playerId) return { ok: false, error: "Planeta de origem inválido." };

    const maxFleets = 1 + (player.techs.computer_tech ?? 0);
    const activeCount = this.state.fleets.filter((f) => f.ownerId === playerId).length;
    if (activeCount >= maxFleets) {
      return { ok: false, error: `Limite de frotas atingido (${activeCount}/${maxFleets}). Pesquise Computadores.` };
    }

    const cleanShips: Partial<Record<ShipId, number>> = {};
    let totalShips = 0;
    for (const sId of SHIP_ORDER) {
      const cnt = Math.max(0, Math.trunc(Number(ships[sId] ?? 0)));
      if (cnt > 0) {
        if (sId === "solar_satellite") return { ok: false, error: "Satélites Solares não viajam entre planetas." };
        if ((origin.ships[sId] ?? 0) < cnt) return { ok: false, error: `Naves insuficientes: ${SHIP_DEFS[sId].name}.` };
        cleanShips[sId] = cnt;
        totalShips += cnt;
      }
    }
    if (totalShips <= 0) return { ok: false, error: "Selecione ao menos uma nave." };

    const g = 1;
    const s = Math.max(1, Math.min(MAX_SYSTEMS, Math.trunc(targetCoords.system || origin.coords.system)));
    const p =
      mission === "expedition"
        ? 16
        : Math.max(1, Math.min(SLOTS_PER_SYSTEM, Math.trunc(targetCoords.position || 1)));
    const cleanTarget: Coordinates = { galaxy: g, system: s, position: p };

    const targetPlanet = mission === "expedition" ? null : this.findPlanetAtCoords(cleanTarget);
    if (mission === "attack" && targetPlanet?.ownerId === playerId) {
      return { ok: false, error: "Você não pode atacar seu próprio planeta." };
    }
    if (mission === "deploy" && (!targetPlanet || targetPlanet.ownerId !== playerId)) {
      return { ok: false, error: "Transferir só pode ser enviado para outra colônia sua." };
    }
    if (mission === "colonize" && (cleanShips.colony_ship ?? 0) < 1) {
      return { ok: false, error: "Colonizar requer ao menos 1 Nave Colonizadora." };
    }
    if (mission === "recycle" && (cleanShips.recycler ?? 0) < 1) {
      return { ok: false, error: "Reciclar requer ao menos 1 Reciclador." };
    }

    const metrics = computeFlightMetrics(
      cleanShips,
      origin.coords,
      cleanTarget,
      player.techs,
      speedPct,
      this.state.universeSpeed,
    );

    const cargoClean: ResourceBundle = {
      metal: Math.max(0, Math.floor(Number(cargo.metal ?? 0))),
      crystal: Math.max(0, Math.floor(Number(cargo.crystal ?? 0))),
      deuterium: Math.max(0, Math.floor(Number(cargo.deuterium ?? 0))),
    };
    const cargoSum = cargoClean.metal + cargoClean.crystal + cargoClean.deuterium;
    if (cargoSum > metrics.cargoCap) {
      return { ok: false, error: `Carga excede a capacidade da frota (${metrics.cargoCap}).` };
    }

    if (
      origin.resources.metal < cargoClean.metal ||
      origin.resources.crystal < cargoClean.crystal ||
      origin.resources.deuterium < cargoClean.deuterium + metrics.fuel
    ) {
      return { ok: false, error: `Recursos/Deutério insuficientes (combustível: ${metrics.fuel}).` };
    }

    for (const [sId, cnt] of Object.entries(cleanShips) as [ShipId, number][]) {
      origin.ships[sId] = Math.max(0, (origin.ships[sId] ?? 0) - cnt);
    }
    origin.resources.metal -= cargoClean.metal;
    origin.resources.crystal -= cargoClean.crystal;
    origin.resources.deuterium -= cargoClean.deuterium + metrics.fuel;

    const fleet: FleetMission = {
      id: `flt_${nodeCrypto.randomBytes(5).toString("hex")}`,
      ownerId: playerId,
      ownerName: player.commanderName,
      mission,
      originPlanetId: origin.id,
      originCoords: { ...origin.coords },
      originName: origin.name,
      targetCoords: cleanTarget,
      targetPlanetId: targetPlanet?.id ?? null,
      targetName: targetPlanet?.name ?? (mission === "expedition" ? "Espaço Profundo" : `Posição ${formatCoords(cleanTarget)}`),
      ships: cleanShips,
      cargo: cargoClean,
      fuelUsed: metrics.fuel,
      departedAt: now,
      arrivalAt: now + metrics.durationMs,
      returnAt: null,
      phase: "outbound",
    };

    this.state.fleets.push(fleet);
    this.schedulePersist();
    return { ok: true, fleet };
  }

  recallFleet(playerId: string, fleetId: string): { ok: true } | { ok: false; error: string } {
    const now = Date.now();
    const fleet = this.state.fleets.find((f) => f.id === fleetId && f.ownerId === playerId);
    if (!fleet) return { ok: false, error: "Frota não encontrada." };
    if (fleet.phase === "returning") return { ok: false, error: "Frota já está retornando." };

    const elapsed = Math.max(2000, now - fleet.departedAt);
    fleet.phase = "returning";
    fleet.returnAt = now + elapsed;
    this.schedulePersist();
    return { ok: true };
  }

  markReportsRead(playerId: string): { ok: true } {
    const player = this.ensurePlayer(playerId);
    for (const r of player.reports) r.read = true;
    this.schedulePersist();
    return { ok: true };
  }

  buyDarkMarketItem(
    playerId: string,
    planetId: string,
    itemId: DarkMarketItemId,
  ): { ok: true; message: string } | { ok: false; error: string } {
    const now = Date.now();
    this.advanceUniverse(now);
    const player = this.ensurePlayer(playerId);
    const planet = this.state.planets[planetId];
    if (!planet || planet.ownerId !== playerId) {
      return { ok: false, error: "Planeta não encontrado." };
    }
    const item = DARK_MARKET_ITEMS[itemId];
    if (!item) {
      return { ok: false, error: "Item de Matéria Negra inválido." };
    }

    if (itemId === "instant_build" && !planet.buildingQueue) {
      return { ok: false, error: "Nenhuma construção em andamento neste planeta." };
    }
    if (itemId === "instant_research" && !player.researchQueue) {
      return { ok: false, error: "Nenhuma pesquisa em andamento no laboratório." };
    }
    if (itemId === "instant_shipyard" && planet.shipyardQueue.length === 0) {
      return { ok: false, error: "A fila do hangar está vazia neste planeta." };
    }

    if (Math.floor(player.darkMatter ?? 0) < item.costDarkMatter) {
      return {
        ok: false,
        error: `Matéria Negra insuficiente (necessário ${item.costDarkMatter} MN).`,
      };
    }

    player.darkMatter -= item.costDarkMatter;
    let message = `${item.name} ativado!`;

    switch (itemId) {
      case "instant_build": {
        const q = planet.buildingQueue!;
        planet.buildings[q.buildingId] = q.targetLevel;
        planet.fieldsUsed = Object.values(planet.buildings).reduce((a, b) => a + b, 0);
        planet.buildingQueue = null;
        this.recalculatePlayerPoints(player);
        message = `${BUILDING_DEFS[q.buildingId].shortName} Nv.${q.targetLevel} concluído instantaneamente!`;
        break;
      }
      case "instant_research": {
        const rq = player.researchQueue!;
        player.techs[rq.techId] = rq.targetLevel;
        player.researchQueue = null;
        this.recalculatePlayerPoints(player);
        message = `${TECH_DEFS[rq.techId].name} Nv.${rq.targetLevel} concluída!`;
        break;
      }
      case "instant_shipyard": {
        for (const job of planet.shipyardQueue) {
          if (job.kind === "ship") {
            const sId = job.unitId as ShipId;
            planet.ships[sId] = (planet.ships[sId] ?? 0) + job.quantity;
          } else {
            const dId = job.unitId as DefenseId;
            planet.defenses[dId] = (planet.defenses[dId] ?? 0) + job.quantity;
          }
        }
        planet.shipyardQueue = [];
        this.recalculatePlayerPoints(player);
        message = `Fila do hangar de ${planet.name} entregue imediatamente!`;
        break;
      }
      case "pack_metal": {
        planet.resources.metal += 15000;
        message = `+15.000 Metal entregues em ${planet.name}!`;
        break;
      }
      case "pack_crystal": {
        planet.resources.crystal += 10000;
        message = `+10.000 Cristal entregues em ${planet.name}!`;
        break;
      }
      case "pack_deuterium": {
        planet.resources.deuterium += 7500;
        message = `+7.500 Deutério entregues em ${planet.name}!`;
        break;
      }
      case "squad_fighters": {
        planet.ships.light_fighter = (planet.ships.light_fighter ?? 0) + 5;
        this.recalculatePlayerPoints(player);
        message = `+5 Caças Ligeiros posicionados em órbita de ${planet.name}!`;
        break;
      }
      case "terraform_fields": {
        planet.fieldsMax += 10;
        planet.diameterKm += 450;
        message = `${planet.name} expandido em +10 campos (${planet.fieldsMax} máx.)!`;
        break;
      }
    }

    this.schedulePersist();
    return { ok: true, message };
  }
}

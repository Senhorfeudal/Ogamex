import type {
  BuildingId,
  DefenseId,
  PlanetBiome,
  ShipId,
  VoxelBlueprint,
  VoxelOp,
  VoxelPart,
} from "../types";

export function buildCommandNexusBlueprint(): VoxelBlueprint {
  return {
    version: 1,
    name: "Núcleo de Comando",
    description: "Central de comando orbital da colônia.",
    category: "building",
    scaleClass: "large",
    palette: {
      base: "#262c38",
      hull: "#3d4659",
      armor: "#5a667d",
      trim: "#8a99ad",
      glow: "#38bdf8",
      core: "#f59e0b",
      pad: "#1c212b",
    },
    ops: [
      { op: "plinth", sizeX: 20, heightY: 2, sizeZ: 20, base: "pad", top: "base", corner: "glow" },
      { op: "box", x0: -7, y0: 2, z0: -7, x1: 7, y1: 7, z1: 7, color: "hull" },
      { op: "pillars", x0: -7, y0: 2, z0: -7, x1: 7, y1: 9, z1: 7, color: "armor" },
      { op: "box", x0: -5, y0: 7, z0: -5, x1: 5, y1: 12, z1: 5, color: "armor" },
      { op: "box", x0: -3, y0: 12, z0: -3, x1: 3, y1: 17, z1: 3, color: "trim" },
      { op: "box", x0: -4, y0: 9, z0: 4, x1: 4, y1: 10, z1: 5, color: "glow", emit: 1.35 },
      { op: "box", x0: -4, y0: 9, z0: -5, x1: 4, y1: 10, z1: -4, color: "glow", emit: 1.35 },
      { op: "box", x0: 4, y0: 9, z0: -4, x1: 5, y1: 10, z1: 4, color: "glow", emit: 1.35, mirrorX: true },
      { op: "stairs", x0: -3, y0: 2, z0: 7, steps: 3, width: 6, dir: "+z", color: "trim" },
      { op: "box", x0: -1, y0: 17, z0: -1, x1: 1, y1: 21, z1: 1, color: "armor" },
    ],
    parts: [
      {
        name: "command-radar",
        kind: "spinY",
        speed: 0.75,
        pivot: [0, 21, 0],
        ops: [
          { op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 4.4, innerR: 3.1, color: "trim" },
          { op: "box", x0: -4, y0: 0, z0: 0, x1: 4, y1: 1, z1: 1, color: "armor" },
          { op: "box", x0: 0, y0: 1, z0: 0, x1: 1, y1: 4, z1: 1, color: "glow", emit: 1.5 },
          { op: "box", x0: 3, y0: 1, z0: 0, x1: 4, y1: 2, z1: 1, color: "core", emit: 1.4, mirrorX: true },
        ],
      },
    ],
  };
}

export function buildBuildingBlueprint(id: BuildingId, level: number): VoxelBlueprint {
  const tier = level >= 6 ? 3 : level >= 3 ? 2 : 1;
  const scaleClass = tier === 3 ? "large" : "medium";

  switch (id) {
    case "metal_mine": {
      const ops: VoxelOp[] = [
        { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#22262e", top: "#383e4a", corner: "#f59e0b" },
        { op: "pillars", x0: -6, y0: 2, z0: -6, x1: 6, y1: 12 + tier * 3, z1: 6, color: "#5e6878" },
        { op: "box", x0: -5, y0: 2, z0: -5, x1: 5, y1: 6, z1: 5, color: "#434b59" },
        { op: "box", x0: -2, y0: 3, z0: -2, x1: 2, y1: 6, z1: 2, color: "#ff6b2b", emit: 1.4 },
        { op: "box", x0: -7, y0: 10 + tier * 2, z0: -1, x1: 7, y1: 12 + tier * 2, z1: 1, color: "#f5b82e" },
        { op: "box", x0: -1, y0: 10 + tier * 2, z0: -7, x1: 1, y1: 12 + tier * 2, z1: 7, color: "#f5b82e" },
      ];
      if (tier >= 2) {
        ops.push({ op: "box", x0: -7, y0: 2, z0: 4, x1: -4, y1: 8, z1: 7, color: "#707a8a" });
        ops.push({ op: "box", x0: 4, y0: 2, z0: -7, x1: 7, y1: 9, z1: -4, color: "#707a8a" });
      }
      if (tier >= 3) {
        ops.push({ op: "box", x0: -3, y0: 15, z0: -3, x1: 3, y1: 22, z1: 3, color: "#8a95a5" });
      }
      const parts: VoxelPart[] = [
        {
          name: "drill-head",
          kind: "spinY",
          speed: 2.4,
          pivot: [0, 7, 0],
          ops: [
            { op: "cone", cx: 0, y0: 0, y1: 8, cz: 0, rBottom: 0.6, rTop: 2.8, color: "#d8e2eb" },
            { op: "ring", axis: "y", cx: 0, y0: 6, y1: 7, cz: 0, outerR: 3.3, innerR: 2.0, color: "#f59e0b" },
          ],
        },
      ];
      return {
        version: 1,
        name: "Mina de Metal",
        description: "Perfuratriz pesada de minério.",
        category: "building",
        scaleClass,
        palette: {},
        ops,
        parts,
      };
    }

    case "crystal_mine": {
      const ops: VoxelOp[] = [
        { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#1d2436", top: "#2b364d", corner: "#38bdf8" },
        { op: "box", x0: -6, y0: 2, z0: -6, x1: 6, y1: 5, z1: 6, color: "#3d4c66" },
        { op: "cone", cx: -2, y0: 4, y1: 14 + tier * 3, cz: -1, rBottom: 2.6, rTop: 0.5, color: "#38bdf8", emit: 1.25 },
        { op: "cone", cx: 3, y0: 4, y1: 12 + tier * 2, cz: 2, rBottom: 2.1, rTop: 0.5, color: "#7dd3fc", emit: 1.2 },
        { op: "cone", cx: 1, y0: 4, y1: 10 + tier * 2, cz: -3, rBottom: 1.8, rTop: 0.4, color: "#a855f7", emit: 1.15 },
      ];
      if (tier >= 2) {
        ops.push({ op: "pillars", x0: -7, y0: 2, z0: -7, x1: 7, y1: 10, z1: 7, color: "#64748b" });
      }
      const parts: VoxelPart[] = [
        {
          name: "crystal-ring",
          kind: "spinY",
          speed: 1.1,
          pivot: [0, 11 + tier * 2, 0],
          ops: [
            { op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 5.2, innerR: 4.0, color: "#94a3b8" },
            { op: "box", x0: 4, y0: 0, z0: -1, x1: 6, y1: 2, z1: 1, color: "#38bdf8", emit: 1.4, mirrorX: true },
          ],
        },
      ];
      return {
        version: 1,
        name: "Mina de Cristal",
        description: "Extrator fotônico de cristais.",
        category: "building",
        scaleClass,
        palette: {},
        ops,
        parts,
      };
    }

    case "deuterium_synthesizer": {
      const ops: VoxelOp[] = [
        { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#1a282b", top: "#273b40", corner: "#2dd4bf" },
        { op: "cylinder", axis: "y", cx: -3, y0: 2, y1: 12 + tier * 2, cz: -2, radius: 2.6, color: "#64748b" },
        { op: "cylinder", axis: "y", cx: 3, y0: 2, y1: 12 + tier * 2, cz: -2, radius: 2.6, color: "#64748b" },
        { op: "cylinder", axis: "y", cx: -3, y0: 5, y1: 10 + tier * 2, cz: -2, radius: 2.8, color: "#2dd4bf", emit: 1.15 },
        { op: "cylinder", axis: "y", cx: 3, y0: 5, y1: 10 + tier * 2, cz: -2, radius: 2.8, color: "#2dd4bf", emit: 1.15 },
        { op: "box", x0: -4, y0: 7, z0: -3, x1: 4, y1: 9, z1: 4, color: "#94a3b8" },
        { op: "dome", cx: 0, yBase: 2, cz: 4, radius: 3.4, color: "#14b8a6", emit: 0.9 },
      ];
      const parts: VoxelPart[] = [
        {
          name: "deut-pump",
          kind: "bob",
          speed: 1.6,
          amp: 0.65,
          pivot: [0, 12 + tier * 2, -2],
          ops: [
            { op: "box", x0: -4, y0: 0, z0: -1, x1: 4, y1: 2, z1: 1, color: "#cbd5e1" },
            { op: "box", x0: -1, y0: 2, z0: -1, x1: 1, y1: 3, z1: 1, color: "#5ce6db", emit: 1.5 },
          ],
        },
      ];
      return {
        version: 1,
        name: "Sintetizador de Deutério",
        description: "Refinaria isotópica de deutério.",
        category: "building",
        scaleClass,
        palette: {},
        ops,
        parts,
      };
    }

    case "dark_matter_mine": {
      const ops: VoxelOp[] = [
        { op: "plinth", sizeX: 18, heightY: 2, sizeZ: 18, base: "#120f1d", top: "#1e1633", corner: "#a855f7" },
        { op: "pillars", x0: -7, y0: 2, z0: -7, x1: 7, y1: 12 + tier * 2, z1: 7, color: "#3b2d5c" },
        { op: "ring", axis: "y", cx: 0, y0: 2, y1: 4, cz: 0, outerR: 6.4, innerR: 3.8, color: "#2e1065" },
        { op: "cylinder", axis: "y", cx: 0, y0: 2, y1: 6, cz: 0, radius: 2.2, color: "#090612" },
        { op: "sphere", cx: 0, cy: 9 + tier, cz: 0, rx: 2.6, ry: 2.6, rz: 2.6, color: "#a855f7", emit: 1.65 },
        { op: "box", x0: -2, y0: 12 + tier * 2, z0: -2, x1: 2, y1: 14 + tier * 2, z1: 2, color: "#c084fc", emit: 1.4 },
      ];
      if (tier >= 2) {
        ops.push({ op: "box", x0: -7, y0: 6, z0: -1, x1: -4, y1: 8, z1: 1, color: "#c084fc", emit: 1.1, mirrorX: true });
      }
      const parts: VoxelPart[] = [
        {
          name: "void-containment-ring",
          kind: "spinY",
          speed: 1.75,
          pivot: [0, 9 + tier, 0],
          ops: [
            { op: "ring", axis: "y", cx: 0, y0: -1, y1: 1, cz: 0, outerR: 5.8, innerR: 4.5, color: "#c084fc", emit: 1.4 },
            { op: "box", x0: 4, y0: -1, z0: -1, x1: 6, y1: 1, z1: 1, color: "#38bdf8", emit: 1.5, mirrorX: true },
          ],
        },
      ];
      return {
        version: 1,
        name: "Mina de Matéria Negra",
        description: "Extrator quântico raro de Matéria Negra.",
        category: "building",
        scaleClass: "large",
        palette: {},
        ops,
        parts,
      };
    }

    case "solar_plant": {
      const ops: VoxelOp[] = [
        { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#1f2430", top: "#2e3545", corner: "#fbbf24" },
        { op: "cylinder", axis: "y", cx: 0, y0: 2, y1: 12 + tier * 2, cz: 0, radius: 2.4, color: "#cbd5e1" },
        { op: "sphere", cx: 0, cy: 13 + tier * 2, cz: 0, rx: 2.6, ry: 2.6, rz: 2.6, color: "#fbbf24", emit: 1.4 },
      ];
      const parts: VoxelPart[] = [
        {
          name: "solar-wings",
          kind: "swingX",
          speed: 0.45,
          amp: 0.16,
          pivot: [0, 8 + tier, 0],
          ops: [
            { op: "box", x0: -8, y0: 0, z0: -3, x1: -2, y1: 1, z1: 3, color: "#1d4ed8", mirrorX: true },
            { op: "box", x0: -7, y0: 1, z0: -2, x1: -3, y1: 2, z1: 2, color: "#38bdf8", emit: 0.55, mirrorX: true },
            { op: "box", x0: -2, y0: 0, z0: -1, x1: 2, y1: 1, z1: 1, color: "#94a3b8" },
          ],
        },
      ];
      return {
        version: 1,
        name: "Planta Solar",
        description: "Usina fotovoltaica orbital.",
        category: "building",
        scaleClass,
        palette: {},
        ops,
        parts,
      };
    }

    case "fusion_reactor": {
      const ops: VoxelOp[] = [
        { op: "plinth", sizeX: 18, heightY: 2, sizeZ: 18, base: "#1b1f29", top: "#2b3242", corner: "#f59e0b" },
        { op: "ring", axis: "y", cx: 0, y0: 2, y1: 6, cz: 0, outerR: 6.8, innerR: 4.0, color: "#475569" },
        { op: "pillars", x0: -6, y0: 2, z0: -6, x1: 6, y1: 14, z1: 6, color: "#64748b" },
        { op: "sphere", cx: 0, cy: 9, cz: 0, rx: 3.0, ry: 3.0, rz: 3.0, color: "#38bdf8", emit: 1.5 },
      ];
      const parts: VoxelPart[] = [
        {
          name: "plasma-torus",
          kind: "spinY",
          speed: 2.2,
          pivot: [0, 9, 0],
          ops: [
            { op: "ring", axis: "y", cx: 0, y0: -1, y1: 1, cz: 0, outerR: 6.2, innerR: 4.5, color: "#f59e0b", emit: 1.3 },
          ],
        },
      ];
      return {
        version: 1,
        name: "Reator de Fusão",
        description: "Tokamak de confinamento magnético.",
        category: "building",
        scaleClass: "large",
        palette: {},
        ops,
        parts,
      };
    }

    case "metal_storage":
    case "crystal_storage":
    case "deuterium_tank": {
      const accent =
        id === "metal_storage" ? "#f59e0b" : id === "crystal_storage" ? "#38bdf8" : "#2dd4bf";
      const tankCol =
        id === "metal_storage" ? "#64748b" : id === "crystal_storage" ? "#475569" : "#334155";
      return {
        version: 1,
        name: id === "metal_storage" ? "Armazém de Metal" : id === "crystal_storage" ? "Armazém de Cristal" : "Tanque de Deutério",
        description: "Estrutura de estocagem.",
        category: "building",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "plinth", sizeX: 14, heightY: 2, sizeZ: 14, base: "#1f242d", top: "#2f3744", corner: accent },
          { op: "cylinder", axis: "y", cx: -3, y0: 2, y1: 10 + tier * 2, cz: -2, radius: 2.5, color: tankCol },
          { op: "cylinder", axis: "y", cx: 3, y0: 2, y1: 10 + tier * 2, cz: -2, radius: 2.5, color: tankCol },
          { op: "cylinder", axis: "y", cx: 0, y0: 2, y1: 12 + tier * 2, cz: 3, radius: 2.8, color: tankCol },
          { op: "ring", axis: "y", cx: 0, y0: 6, y1: 8, cz: 3, outerR: 3.1, innerR: 2.5, color: accent, emit: 1.1 },
        ],
        parts: [],
      };
    }

    case "robotics_factory": {
      return {
        version: 1,
        name: "Fábrica de Robôs",
        description: "Linha automatizada de drones construtores.",
        category: "building",
        scaleClass,
        palette: {},
        ops: [
          { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#1e222a", top: "#2c323f", corner: "#f59e0b" },
          { op: "hollowBox", x0: -6, y0: 2, z0: -6, x1: 6, y1: 10, z1: 6, wall: 1, color: "#475569", trim: "#f59e0b" },
          { op: "box", x0: -2, y0: 2, z0: -2, x1: 2, y1: 5, z1: 2, color: "#38bdf8", emit: 1.1 },
        ],
        parts: [
          {
            name: "gantry-arm",
            kind: "swingY",
            speed: 1.2,
            amp: 0.75,
            pivot: [0, 11, 0],
            ops: [
              { op: "box", x0: -1, y0: 0, z0: -1, x1: 7, y1: 2, z1: 1, color: "#f5b82e" },
              { op: "box", x0: 5, y0: -3, z0: -1, x1: 7, y1: 0, z1: 1, color: "#e2e8f0" },
              { op: "box", x0: 5, y0: -4, z0: 0, x1: 6, y1: -3, z1: 1, color: "#ff7426", emit: 1.5 },
            ],
          },
        ],
      };
    }

    case "shipyard": {
      return {
        version: 1,
        name: "Hangar / Estaleiro",
        description: "Doca espacial de naves e defesa.",
        category: "building",
        scaleClass: "large",
        palette: {},
        ops: [
          { op: "plinth", sizeX: 20, heightY: 2, sizeZ: 20, base: "#181c24", top: "#252c38", corner: "#38bdf8" },
          { op: "box", x0: -8, y0: 2, z0: -8, x1: -5, y1: 14, z1: 8, color: "#475569" },
          { op: "box", x0: 5, y0: 2, z0: -8, x1: 8, y1: 14, z1: 8, color: "#475569" },
          { op: "box", x0: -8, y0: 13, z0: -4, x1: 8, y1: 15, z1: 4, color: "#64748b" },
          { op: "box", x0: -4, y0: 2, z0: -7, x1: 4, y1: 3, z1: 7, color: "#1e293b" },
          { op: "box", x0: -4, y0: 2, z0: 6, x1: 4, y1: 3, z1: 7, color: "#38bdf8", emit: 1.3 },
          { op: "box", x0: -4, y0: 2, z0: -7, x1: 4, y1: 3, z1: -6, color: "#38bdf8", emit: 1.3 },
        ],
        parts: [
          {
            name: "docked-hull",
            kind: "bob",
            speed: 1.0,
            amp: 0.45,
            pivot: [0, 7, 0],
            ops: [
              { op: "box", x0: -2, y0: 0, z0: -4, x1: 2, y1: 2, z1: 4, color: "#cbd5e1" },
              { op: "box", x0: -4, y0: 0, z0: -2, x1: 4, y1: 1, z1: 1, color: "#64748b" },
              { op: "box", x0: -1, y0: 0, z0: -5, x1: 1, y1: 2, z1: -4, color: "#38bdf8", emit: 1.5 },
            ],
          },
        ],
      };
    }

    case "research_lab": {
      return {
        version: 1,
        name: "Laboratório de Pesquisa",
        description: "Observatório científico e pesquisa de tecnologias.",
        category: "building",
        scaleClass,
        palette: {},
        ops: [
          { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#1d2230", top: "#2e364a", corner: "#38bdf8" },
          { op: "cylinder", axis: "y", cx: 0, y0: 2, y1: 9, cz: 0, radius: 5.5, color: "#e2e8f0" },
          { op: "dome", cx: 0, yBase: 9, cz: 0, radius: 5.2, color: "#cbd5e1" },
          { op: "box", x0: -2, y0: 4, z0: 4, x1: 2, y1: 7, z1: 6, color: "#38bdf8", emit: 1.3 },
        ],
        parts: [
          {
            name: "sensor-dish",
            kind: "spinY",
            speed: 0.85,
            pivot: [0, 15, 0],
            ops: [
              { op: "box", x0: -1, y0: 0, z0: -1, x1: 1, y1: 3, z1: 1, color: "#64748b" },
              { op: "ring", axis: "z", cx: 0, y0: 2, y1: 5, z0: 1, z1: 2, outerR: 3.2, innerR: 1.2, color: "#f8fafc" },
              { op: "box", x0: 0, y0: 3, z0: 2, x1: 1, y1: 4, z1: 4, color: "#38bdf8", emit: 1.5 },
            ],
          },
        ],
      };
    }

    case "nanite_factory": {
      return {
        version: 1,
        name: "Fábrica de Nanites",
        description: "Superestrutura de montagem molecular.",
        category: "building",
        scaleClass: "large",
        palette: {},
        ops: [
          { op: "plinth", sizeX: 16, heightY: 2, sizeZ: 16, base: "#141a1c", top: "#1e292b", corner: "#4ade80" },
          { op: "box", x0: -5, y0: 2, z0: -5, x1: 5, y1: 14, z1: 5, color: "#1e293b" },
          { op: "box", x0: -3, y0: 4, z0: -6, x1: 3, y1: 12, z1: 6, color: "#4ade80", emit: 1.2 },
          { op: "box", x0: -6, y0: 4, z0: -3, x1: 6, y1: 12, z1: 3, color: "#4ade80", emit: 1.2 },
        ],
        parts: [
          {
            name: "nanite-halo",
            kind: "spinY",
            speed: 1.8,
            pivot: [0, 16, 0],
            ops: [
              { op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 5.5, innerR: 4.2, color: "#4ade80", emit: 1.4 },
            ],
          },
        ],
      };
    }

    case "missile_silo": {
      return {
        version: 1,
        name: "Silo de Mísseis",
        description: "Plataforma subterrânea de mísseis.",
        category: "building",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "plinth", sizeX: 14, heightY: 2, sizeZ: 14, base: "#1f242c", top: "#333945", corner: "#ef4444" },
          { op: "box", x0: -5, y0: 2, z0: -5, x1: 5, y1: 6, z1: 5, color: "#475569" },
          { op: "cylinder", axis: "y", cx: -2, y0: 4, y1: 12, cz: 0, radius: 1.2, color: "#e2e8f0" },
          { op: "cylinder", axis: "y", cx: 2, y0: 4, y1: 12, cz: 0, radius: 1.2, color: "#e2e8f0" },
          { op: "cone", cx: -2, y0: 12, y1: 15, cz: 0, rBottom: 1.2, rTop: 0.4, color: "#ef4444", emit: 0.8 },
          { op: "cone", cx: 2, y0: 12, y1: 15, cz: 0, rBottom: 1.2, rTop: 0.4, color: "#ef4444", emit: 0.8 },
        ],
        parts: [],
      };
    }
  }
}

export function buildShipBlueprint(shipId: ShipId): VoxelBlueprint {
  const hull = "#cbd5e1";
  const dark = "#334155";
  const steel = "#64748b";
  const glow = "#38bdf8";
  const fire = "#f59e0b";

  switch (shipId) {
    case "small_cargo":
      return {
        version: 1,
        name: "Cargueiro Pequeno",
        description: "Transporte rápido.",
        category: "aircraft",
        scaleClass: "small",
        palette: {},
        ops: [
          { op: "box", x0: -3, y0: 1, z0: -5, x1: 3, y1: 4, z1: 5, color: "#d97706" },
          { op: "box", x0: -2, y0: 2, z0: 5, x1: 2, y1: 4, z1: 7, color: hull },
          { op: "box", x0: -1, y0: 3, z0: 6, x1: 1, y1: 4, z1: 7, color: glow, emit: 1.3 },
          { op: "box", x0: -2, y0: 1, z0: -6, x1: 2, y1: 3, z1: -5, color: fire, emit: 1.4 },
        ],
        parts: [],
      };

    case "large_cargo":
      return {
        version: 1,
        name: "Cargueiro Grande",
        description: "Transporte pesado.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "box", x0: -4, y0: 1, z0: -8, x1: 4, y1: 5, z1: 6, color: "#b45309" },
          { op: "box", x0: -5, y0: 2, z0: -6, x1: 5, y1: 4, z1: 4, color: steel },
          { op: "box", x0: -3, y0: 2, z0: 6, x1: 3, y1: 5, z1: 9, color: hull },
          { op: "box", x0: -2, y0: 3, z0: 8, x1: 2, y1: 4, z1: 9, color: glow, emit: 1.3 },
          { op: "box", x0: 2, y0: 2, z0: -9, x1: 4, y1: 4, z1: -8, color: fire, emit: 1.4, mirrorX: true },
        ],
        parts: [],
      };

    case "light_fighter":
      return {
        version: 1,
        name: "Caça Ligeiro",
        description: "Caça ágil.",
        category: "aircraft",
        scaleClass: "small",
        palette: {},
        ops: [
          { op: "box", x0: -1, y0: 1, z0: -5, x1: 1, y1: 3, z1: 6, color: hull },
          { op: "box", x0: -5, y0: 1, z0: -3, x1: 5, y1: 2, z1: 1, color: steel },
          { op: "box", x0: -1, y0: 3, z0: 0, x1: 1, y1: 4, z1: 3, color: glow, emit: 1.2 },
          { op: "box", x0: -1, y0: 1, z0: -6, x1: 1, y1: 3, z1: -5, color: glow, emit: 1.5 },
        ],
        parts: [],
      };

    case "heavy_fighter":
      return {
        version: 1,
        name: "Caça Pesado",
        description: "Caça blindado.",
        category: "aircraft",
        scaleClass: "small",
        palette: {},
        ops: [
          { op: "box", x0: -2, y0: 1, z0: -6, x1: 2, y1: 4, z1: 6, color: dark },
          { op: "box", x0: -6, y0: 2, z0: -4, x1: 6, y1: 3, z1: 2, color: "#475569" },
          { op: "box", x0: 4, y0: 1, z0: 0, x1: 6, y1: 3, z1: 5, color: "#ef4444", mirrorX: true },
          { op: "box", x0: -1, y0: 3, z0: 2, x1: 1, y1: 4, z1: 4, color: glow, emit: 1.3 },
          { op: "box", x0: 1, y0: 2, z0: -7, x1: 2, y1: 3, z1: -6, color: fire, emit: 1.5, mirrorX: true },
        ],
        parts: [],
      };

    case "cruiser":
      return {
        version: 1,
        name: "Cruzador",
        description: "Cruzador rápido.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "box", x0: -2, y0: 1, z0: -10, x1: 2, y1: 4, z1: 10, color: hull },
          { op: "box", x0: -4, y0: 2, z0: -7, x1: 4, y1: 3, z1: 4, color: steel },
          { op: "box", x0: -1, y0: 4, z0: -3, x1: 1, y1: 6, z1: 2, color: dark },
          { op: "box", x0: 2, y0: 1, z0: -11, x1: 4, y1: 3, z1: -10, color: glow, emit: 1.5, mirrorX: true },
          { op: "box", x0: -1, y0: 2, z0: 10, x1: 1, y1: 3, z1: 11, color: fire, emit: 1.2 },
        ],
        parts: [],
      };

    case "battleship":
      return {
        version: 1,
        name: "Nave de Batalha",
        description: "Belonave pesada.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "box", x0: -4, y0: 1, z0: -12, x1: 4, y1: 5, z1: 11, color: dark },
          { op: "box", x0: -3, y0: 2, z0: -10, x1: 3, y1: 6, z1: 8, color: steel },
          { op: "box", x0: -6, y0: 2, z0: -8, x1: 6, y1: 4, z1: -1, color: hull },
          { op: "box", x0: -1, y0: 6, z0: -4, x1: 1, y1: 8, z1: 1, color: hull },
          { op: "box", x0: 2, y0: 2, z0: -13, x1: 4, y1: 4, z1: -12, color: glow, emit: 1.6, mirrorX: true },
        ],
        parts: [],
      };

    case "battlecruiser":
      return {
        version: 1,
        name: "Interceptador",
        description: "Caçador de frotas.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "box", x0: -2, y0: 1, z0: -11, x1: 2, y1: 4, z1: 12, color: "#1e293b" },
          { op: "box", x0: -8, y0: 2, z0: -6, x1: 8, y1: 3, z1: 2, color: "#334155" },
          { op: "box", x0: -3, y0: 3, z0: -2, x1: 3, y1: 5, z1: 5, color: "#a855f7", emit: 1.1 },
          { op: "box", x0: 3, y0: 2, z0: -12, x1: 5, y1: 3, z1: -11, color: "#ec4899", emit: 1.5, mirrorX: true },
        ],
        parts: [],
      };

    case "bomber":
      return {
        version: 1,
        name: "Bombardeiro",
        description: "Destruidor de defesas.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "box", x0: -6, y0: 1, z0: -8, x1: -2, y1: 4, z1: 8, color: dark, mirrorX: true },
          { op: "box", x0: -2, y0: 2, z0: -4, x1: 2, y1: 4, z1: 5, color: "#64748b" },
          { op: "box", x0: 3, y0: 2, z0: -9, x1: 5, y1: 3, z1: -8, color: fire, emit: 1.5, mirrorX: true },
        ],
        parts: [],
      };

    case "destroyer":
      return {
        version: 1,
        name: "Destruidor",
        description: "Couraçado titânico.",
        category: "aircraft",
        scaleClass: "large",
        palette: {},
        ops: [
          { op: "box", x0: -4, y0: 1, z0: -14, x1: 4, y1: 6, z1: 14, color: "#1f2937" },
          { op: "box", x0: -7, y0: 2, z0: -10, x1: 7, y1: 4, z1: 4, color: "#475569" },
          { op: "box", x0: -2, y0: 6, z0: -5, x1: 2, y1: 9, z1: 2, color: hull },
          { op: "box", x0: 3, y0: 2, z0: -15, x1: 5, y1: 5, z1: -14, color: glow, emit: 1.6, mirrorX: true },
        ],
        parts: [],
      };

    case "deathstar":
      return {
        version: 1,
        name: "Estrela da Morte",
        description: "Fortaleza gravitacional colossal.",
        category: "aircraft",
        scaleClass: "large",
        palette: {},
        ops: [
          { op: "sphere", cx: 0, cy: 11, cz: 0, rx: 10, ry: 10, rz: 10, color: "#475569" },
          { op: "clear", x0: -11, y0: 10, z0: -11, x1: 11, y1: 12, z1: 11 },
          { op: "cylinder", axis: "y", cx: 0, y0: 10, y1: 12, cz: 0, radius: 8.6, color: "#1e293b" },
          { op: "sphere", cx: 4, cy: 15, cz: 7, rx: 3.2, ry: 3.2, rz: 2.0, carve: true },
          { op: "box", x0: 3, y0: 14, z0: 7, x1: 5, y1: 16, z1: 9, color: "#4ade80", emit: 1.6 },
        ],
        parts: [
          {
            name: "deathstar-orbit",
            kind: "spinY",
            speed: 0.35,
            pivot: [0, 11, 0],
            ops: [{ op: "box", x0: 11, y0: 0, z0: 0, x1: 12, y1: 1, z1: 1, color: "#4ade80", emit: 1.4 }],
          },
        ],
      };

    case "recycler":
      return {
        version: 1,
        name: "Reciclador",
        description: "Coletor de destroços.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "box", x0: -3, y0: 1, z0: -7, x1: 3, y1: 4, z1: 5, color: "#64748b" },
          { op: "box", x0: 3, y0: 1, z0: 4, x1: 5, y1: 3, z1: 10, color: "#f59e0b", mirrorX: true },
          { op: "box", x0: -2, y0: 2, z0: -8, x1: 2, y1: 3, z1: -7, color: "#2dd4bf", emit: 1.4 },
        ],
        parts: [],
      };

    case "espionage_probe":
      return {
        version: 1,
        name: "Sonda de Espionagem",
        description: "Drone de reconhecimento.",
        category: "aircraft",
        scaleClass: "tiny",
        palette: {},
        ops: [
          { op: "sphere", cx: 0, cy: 3, cz: 0, rx: 2.2, ry: 2.2, rz: 2.2, color: hull },
          { op: "box", x0: -1, y0: 2, z0: 2, x1: 1, y1: 4, z1: 3, color: glow, emit: 1.6 },
        ],
        parts: [
          {
            name: "probe-ring",
            kind: "spinY",
            speed: 2.6,
            pivot: [0, 3, 0],
            ops: [{ op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 4.0, innerR: 3.1, color: "#38bdf8", emit: 1.1 }],
          },
        ],
      };

    case "colony_ship":
      return {
        version: 1,
        name: "Nave Colonizadora",
        description: "Arca colonizadora.",
        category: "aircraft",
        scaleClass: "medium",
        palette: {},
        ops: [
          { op: "cylinder", axis: "z", cx: 0, cy: 4, z0: -9, z1: 9, radius: 2.4, color: hull },
          { op: "box", x0: -1, y0: 3, z0: 9, x1: 1, y1: 5, z1: 12, color: glow, emit: 1.3 },
          { op: "box", x0: -2, y0: 3, z0: -10, x1: 2, y1: 5, z1: -9, color: fire, emit: 1.5 },
        ],
        parts: [
          {
            name: "hab-drum",
            kind: "spinZ",
            speed: 0.9,
            pivot: [0, 4, 1],
            ops: [{ op: "ring", axis: "z", cx: 0, cy: 0, z0: -2, z1: 2, outerR: 5.5, innerR: 4.0, color: "#2dd4bf" }],
          },
        ],
      };

    case "solar_satellite":
      return {
        version: 1,
        name: "Satélite Solar",
        description: "Gerador solar orbital.",
        category: "aircraft",
        scaleClass: "small",
        palette: {},
        ops: [{ op: "sphere", cx: 0, cy: 3, cz: 0, rx: 1.8, ry: 1.8, rz: 1.8, color: "#fbbf24", emit: 1.3 }],
        parts: [
          {
            name: "sat-wings",
            kind: "spinY",
            speed: 0.5,
            pivot: [0, 3, 0],
            ops: [{ op: "box", x0: -7, y0: 0, z0: -2, x1: 7, y1: 1, z1: 2, color: "#2563eb" }],
          },
        ],
      };
  }
}

export function buildDefenseBlueprint(defenseId: DefenseId): VoxelBlueprint {
  switch (defenseId) {
    case "rocket_launcher":
      return {
        version: 1,
        name: "Lançador de Mísseis",
        description: "Bateria de foguetes.",
        category: "prop",
        scaleClass: "small",
        palette: {},
        ops: [{ op: "cylinder", axis: "y", cx: 0, y0: 0, y1: 4, cz: 0, radius: 3.4, color: "#475569" }],
        parts: [
          {
            name: "turret",
            kind: "swingY",
            speed: 0.55,
            amp: 0.7,
            pivot: [0, 4, 0],
            ops: [
              { op: "box", x0: -3, y0: 0, z0: -3, x1: 3, y1: 4, z1: 4, color: "#64748b" },
              { op: "box", x0: -2, y0: 2, z0: 4, x1: -1, y1: 3, z1: 5, color: "#ef4444", emit: 1.2 },
              { op: "box", x0: 1, y0: 2, z0: 4, x1: 2, y1: 3, z1: 5, color: "#ef4444", emit: 1.2 },
            ],
          },
        ],
      };

    case "light_laser":
    case "heavy_laser": {
      const col = defenseId === "light_laser" ? "#38bdf8" : "#f59e0b";
      return {
        version: 1,
        name: defenseId === "light_laser" ? "Laser Ligeiro" : "Laser Pesado",
        description: "Torre laser.",
        category: "prop",
        scaleClass: defenseId === "light_laser" ? "small" : "medium",
        palette: {},
        ops: [{ op: "cylinder", axis: "y", cx: 0, y0: 0, y1: 4, cz: 0, radius: 3.5, color: "#334155" }],
        parts: [
          {
            name: "laser-head",
            kind: "swingY",
            speed: 0.7,
            amp: 0.85,
            pivot: [0, 4, 0],
            ops: [
              { op: "dome", cx: 0, yBase: 0, cz: 0, radius: 3.0, color: "#94a3b8" },
              { op: "box", x0: -1, y0: 1, z0: 2, x1: 1, y1: 2, z1: 8, color: col, emit: 1.45 },
            ],
          },
        ],
      };
    }

    case "gauss_cannon":
      return {
        version: 1,
        name: "Canhão de Gauss",
        description: "Acelerador magnético.",
        category: "prop",
        scaleClass: "medium",
        palette: {},
        ops: [{ op: "box", x0: -4, y0: 0, z0: -4, x1: 4, y1: 4, z1: 4, color: "#334155" }],
        parts: [
          {
            name: "gauss-rails",
            kind: "swingY",
            speed: 0.45,
            amp: 0.65,
            pivot: [0, 4, 0],
            ops: [
              { op: "box", x0: -3, y0: 0, z0: -3, x1: 3, y1: 4, z1: 3, color: "#64748b" },
              { op: "box", x0: 1, y0: 2, z0: 2, x1: 2, y1: 3, z1: 10, color: "#cbd5e1", mirrorX: true },
              { op: "box", x0: 0, y0: 2, z0: 3, x1: 1, y1: 3, z1: 9, color: "#38bdf8", emit: 1.4 },
            ],
          },
        ],
      };

    case "ion_cannon":
      return {
        version: 1,
        name: "Canhão de Íons",
        description: "Emissor iônico.",
        category: "prop",
        scaleClass: "medium",
        palette: {},
        ops: [{ op: "cylinder", axis: "y", cx: 0, y0: 0, y1: 5, cz: 0, radius: 4.0, color: "#475569" }],
        parts: [
          {
            name: "ion-core",
            kind: "spinY",
            speed: 1.8,
            pivot: [0, 6, 0],
            ops: [{ op: "sphere", cx: 0, cy: 1, cz: 0, rx: 2.5, ry: 2.5, rz: 2.5, color: "#a855f7", emit: 1.5 }],
          },
        ],
      };

    case "plasma_turret":
      return {
        version: 1,
        name: "Canhão de Plasma",
        description: "Artilharia de plasma.",
        category: "prop",
        scaleClass: "medium",
        palette: {},
        ops: [{ op: "box", x0: -5, y0: 0, z0: -5, x1: 5, y1: 5, z1: 5, color: "#1e293b" }],
        parts: [
          {
            name: "plasma-barrel",
            kind: "swingY",
            speed: 0.4,
            amp: 0.6,
            pivot: [0, 5, 0],
            ops: [
              { op: "sphere", cx: 0, cy: 2, cz: 0, rx: 3.5, ry: 3.0, rz: 3.5, color: "#334155" },
              { op: "cylinder", axis: "z", cx: 0, cy: 2, z0: 2, z1: 10, radius: 1.4, color: "#ec4899", emit: 1.55 },
            ],
          },
        ],
      };

    case "small_shield_dome":
    case "large_shield_dome": {
      const col = defenseId === "large_shield_dome" ? "#38bdf8" : "#2dd4bf";
      return {
        version: 1,
        name: defenseId === "large_shield_dome" ? "Grande Escudo" : "Pequeno Escudo",
        description: "Projetor de escudo planetário.",
        category: "prop",
        scaleClass: defenseId === "large_shield_dome" ? "large" : "medium",
        palette: {},
        ops: [
          { op: "cylinder", axis: "y", cx: 0, y0: 0, y1: 4, cz: 0, radius: 4.5, color: "#334155" },
          { op: "cylinder", axis: "y", cx: 0, y0: 4, y1: 12, cz: 0, radius: 1.6, color: "#94a3b8" },
        ],
        parts: [
          {
            name: "shield-emitter",
            kind: "spinY",
            speed: 1.5,
            pivot: [0, 12, 0],
            ops: [
              { op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 4.4, innerR: 3.0, color: col, emit: 1.4 },
              { op: "sphere", cx: 0, cy: 1, cz: 0, rx: 1.8, ry: 1.8, rz: 1.8, color: col, emit: 1.6 },
            ],
          },
        ],
      };
    }
  }
}

export function buildPlanetSphereBlueprint(biome: PlanetBiome, hasRings = false): VoxelBlueprint {
  const colors: Record<PlanetBiome, [string, string, string]> = {
    terran: ["#2f855a", "#3b82f6", "#f8fafc"],
    oceanic: ["#0284c7", "#38bdf8", "#f1f5f9"],
    volcanic: ["#27272a", "#ea580c", "#fbbf24"],
    ice: ["#bae6fd", "#e0f2fe", "#7dd3fc"],
    desert: ["#d97706", "#f59e0b", "#fde68a"],
    crystal: ["#6d28d9", "#38bdf8", "#c084fc"],
  };
  const [c1, c2, c3] = colors[biome];
  const ops: VoxelOp[] = [
    { op: "sphere", cx: 0, cy: 0, cz: 0, rx: 6, ry: 6, rz: 6, color: c1 },
    { op: "sphere", cx: 2, cy: 2, cz: 3, rx: 2.5, ry: 2.0, rz: 2.2, color: c2, emit: biome === "volcanic" || biome === "crystal" ? 0.9 : 0 },
    { op: "sphere", cx: -3, cy: -1, cz: 2, rx: 2.2, ry: 2.4, rz: 2.0, color: c2 },
    { op: "sphere", cx: 0, cy: 5, cz: 0, rx: 2.4, ry: 1.4, rz: 2.4, color: c3 },
  ];
  if (hasRings) {
    ops.push({ op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 9.8, innerR: 7.4, color: c3 });
  }
  return {
    version: 1,
    name: `Planeta ${biome}`,
    description: "Planeta voxel.",
    category: "prop",
    scaleClass: "medium",
    palette: {},
    ops,
    parts: [],
  };
}

export function buildStarBlueprint(): VoxelBlueprint {
  return {
    version: 1,
    name: "Estrela Solar",
    description: "Estrela central do sistema.",
    category: "prop",
    scaleClass: "colossal",
    palette: {},
    ops: [
      { op: "sphere", cx: 0, cy: 0, cz: 0, rx: 9, ry: 9, rz: 9, color: "#f59e0b", emit: 1.4 },
      { op: "sphere", cx: 3, cy: 4, cz: 5, rx: 3.5, ry: 3.5, rz: 3.5, color: "#fde047", emit: 1.6 },
      { op: "sphere", cx: -5, cy: -2, cz: 4, rx: 3.0, ry: 3.0, rz: 3.0, color: "#fb923c", emit: 1.5 },
    ],
    parts: [
      {
        name: "corona",
        kind: "spinY",
        speed: 0.4,
        pivot: [0, 0, 0],
        ops: [{ op: "ring", axis: "y", cx: 0, y0: 0, y1: 1, cz: 0, outerR: 12.2, innerR: 10.6, color: "#fbbf24", emit: 1.3 }],
      },
    ],
  };
}

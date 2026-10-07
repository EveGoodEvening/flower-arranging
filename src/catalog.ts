export type FlowerKind =
  | "rose"
  | "tulip"
  | "cosmos"
  | "hydrangea"
  | "chamomile"
  | "eucalyptus";
export type VaseKind = "ceramic" | "glass" | "terracotta" | "ribbed";
export type FlowerCategory = "main" | "filler" | "greenery";

export interface FlowerDefinition {
  id: FlowerKind;
  name: string;
  latin: string;
  category: FlowerCategory;
  color: string;
  colors: string[];
  description: string;
}
export interface Stem {
  id: string;
  kind: FlowerKind;
  color: string;
  x: number;
  z: number;
  height: number;
  tilt: number;
  rotation: number;
  seed: number;
}
export interface Arrangement {
  name: string;
  vase: VaseKind;
  vaseColor: string;
  background: "linen" | "sage" | "rose";
  stems: Stem[];
}

export const FLOWERS: FlowerDefinition[] = [
  {
    id: "rose",
    name: "花园玫瑰",
    latin: "Garden rose",
    category: "main",
    color: "#eed8b8",
    colors: ["#eed8b8", "#dca1a1", "#c8838d", "#f2e6d6"],
    description: "层层舒展的花瓣，藏着温柔的心事。",
  },
  {
    id: "tulip",
    name: "郁金香",
    latin: "Tulip",
    category: "main",
    color: "#dfa394",
    colors: ["#dfa394", "#f1ddc1", "#bd7890", "#ddbd61"],
    description: "向光生长，为花束留一笔轻盈。",
  },
  {
    id: "cosmos",
    name: "波斯菊",
    latin: "Cosmos",
    category: "filler",
    color: "#cf8d9d",
    colors: ["#cf8d9d", "#eedbd9", "#b65e7c", "#e6b176"],
    description: "细细的枝，托起一小片自在的风。",
  },
  {
    id: "hydrangea",
    name: "绣球花",
    latin: "Hydrangea",
    category: "main",
    color: "#a4b9c6",
    colors: ["#a4b9c6", "#b5b299", "#c7b2c5", "#e3dfcb"],
    description: "一簇细碎的花，把浪漫聚在一起。",
  },
  {
    id: "chamomile",
    name: "小雏菊",
    latin: "Chamomile",
    category: "filler",
    color: "#f4edda",
    colors: ["#f4edda", "#e8d293", "#ead4cf"],
    description: "像散落的日光，让每一处空隙发亮。",
  },
  {
    id: "eucalyptus",
    name: "尤加利",
    latin: "Eucalyptus",
    category: "greenery",
    color: "#819889",
    colors: ["#819889", "#637d6b", "#a3ae8c"],
    description: "灰绿的圆叶，为花与花留一点呼吸。",
  },
];
export const VASES: {
  id: VaseKind;
  name: string;
  english: string;
  color: string;
  description: string;
}[] = [
  {
    id: "ceramic",
    name: "素白陶瓶",
    english: "Soft ceramic",
    color: "#e6dfcf",
    description: "手作肌理 · 温润哑光",
  },
  {
    id: "glass",
    name: "烟色玻璃",
    english: "Smoked glass",
    color: "#b4b9a2",
    description: "半透烟绿 · 轻盈通透",
  },
  {
    id: "terracotta",
    name: "赤陶花器",
    english: "Terracotta",
    color: "#bf8065",
    description: "天然陶土 · 质朴暖意",
  },
  {
    id: "ribbed",
    name: "褶影瓷瓶",
    english: "Pleated porcelain",
    color: "#d9dbcf",
    description: "竖向细褶 · 细腻青瓷",
  },
];

function stem(
  kind: FlowerKind,
  x: number,
  z: number,
  height: number,
  tilt: number,
  rotation: number,
  seed: number,
  color?: string,
): Stem {
  return {
    id: `stem-${seed}`,
    kind,
    color: color ?? FLOWERS.find((f) => f.id === kind)!.color,
    x,
    z,
    height,
    tilt,
    rotation,
    seed,
  };
}
export const PRESETS: {
  id: string;
  name: string;
  english: string;
  mood: string;
  arrangement: Arrangement;
}[] = [
  {
    id: "spring",
    name: "春日来信",
    english: "A letter from spring",
    mood: "自然 · 轻盈",
    arrangement: {
      name: "一隅春光",
      vase: "ceramic",
      vaseColor: "#e6dfcf",
      background: "linen",
      stems: [
        stem("eucalyptus", -0.14, -0.1, 1.18, 32, 195, 11),
        stem("eucalyptus", 0.08, -0.13, 1.26, 31, 32, 12),
        stem("tulip", 0.02, -0.05, 1.14, 16, 350, 21, "#e3ab9b"),
        stem("tulip", -0.04, 0.03, 1.04, 24, 250, 22, "#d89c8c"),
        stem("rose", -0.04, 0.02, 0.84, 29, 210, 31),
        stem("rose", 0.05, 0.03, 0.93, 13, 77, 32, "#eddcc3"),
        stem("rose", 0.01, 0.14, 0.72, 24, 120, 33, "#dfb1a0"),
        stem("cosmos", -0.12, -0.02, 1.12, 36, 185, 41),
        stem("cosmos", 0.1, 0.03, 1.09, 37, 25, 42, "#eedbd9"),
        stem("chamomile", -0.08, 0.11, 0.88, 32, 165, 51),
        stem("chamomile", 0.09, 0.02, 0.96, 29, 55, 52),
      ],
    },
  },
  {
    id: "sunset",
    name: "落日花园",
    english: "The golden hour",
    mood: "温暖 · 丰盈",
    arrangement: {
      name: "把落日留下",
      vase: "terracotta",
      vaseColor: "#bf8065",
      background: "rose",
      stems: [
        stem("eucalyptus", -0.1, -0.08, 1.22, 29, 250, 61),
        stem("eucalyptus", 0.1, -0.11, 1.14, 32, 45, 62),
        stem("rose", -0.06, 0.02, 0.98, 20, 260, 63, "#c8838d"),
        stem("rose", 0.08, 0.04, 0.81, 22, 87, 64, "#dfa394"),
        stem("rose", 0.03, 0.17, 0.7, 19, 170, 65, "#eed8b8"),
        stem("tulip", 0.03, -0.12, 1.19, 22, 15, 66, "#ddbd61"),
        stem("tulip", -0.11, 0.04, 1.03, 30, 265, 67, "#dfa394"),
        stem("cosmos", 0.12, -0.04, 1.11, 33, 74, 68, "#b65e7c"),
        stem("chamomile", -0.09, 0.13, 0.87, 29, 248, 69, "#e8d293"),
      ],
    },
  },
  {
    id: "moon",
    name: "月光白",
    english: "A quiet kind of beauty",
    mood: "清雅 · 留白",
    arrangement: {
      name: "月光落在花上",
      vase: "ribbed",
      vaseColor: "#d9dbcf",
      background: "sage",
      stems: [
        stem("eucalyptus", 0.07, -0.12, 1.3, 30, 45, 71),
        stem("eucalyptus", -0.1, -0.08, 1.17, 31, 240, 72),
        stem("hydrangea", -0.08, 0.05, 0.78, 21, 252, 73, "#e3dfcb"),
        stem("hydrangea", 0.1, -0.04, 0.98, 19, 57, 74, "#a4b9c6"),
        stem("tulip", -0.08, -0.09, 1.18, 19, 314, 75, "#f1ddc1"),
        stem("rose", 0.02, 0.13, 0.78, 21, 155, 76, "#f2e6d6"),
        stem("cosmos", 0.1, 0.04, 1.1, 31, 70, 77, "#eedbd9"),
        stem("chamomile", -0.05, 0.11, 1.0, 30, 267, 78),
      ],
    },
  },
];
export const cloneArrangement = (value: Arrangement): Arrangement =>
  structuredClone(value);

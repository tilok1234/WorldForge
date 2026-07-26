/**
 * Structure vocabulary (settlements.plans v2). Layer values are index + 1;
 * the list is append-only so layer values never shift between versions.
 */
export const STRUCTURE_TYPES = [
  "structure.fortress_gate",
  "structure.fortress_wall",
  "structure.house",
  "structure.town_hall",
  "structure.watchtower",
  "structure.well",
  "structure.cottage",
  "structure.tavern",
  "structure.smithy",
  "structure.chapel",
  "structure.manor",
  "structure.bakery",
  "structure.farmhouse",
  "structure.barn",
  "structure.stall",
  "structure.fountain",
  "structure.cave_mouth",
  "structure.mine_shaft",
  "structure.stone_circle",
  "structure.den",
  "structure.crypt",
  "structure.ruin",
  "structure.giant_skeleton",
  "structure.camp_wall",
] as const;

export type StructureType = (typeof STRUCTURE_TYPES)[number];

export const STRUCTURE_LAYER_VALUE: { readonly [key in StructureType]: number } =
  Object.fromEntries(STRUCTURE_TYPES.map((key, index) => [key, index + 1])) as {
    [key in StructureType]: number;
  };

/** Atomic footprints (width, height), matching the pinned package. */
export const STRUCTURE_FOOTPRINTS: { readonly [key in StructureType]?: readonly [number, number] } = {
  "structure.town_hall": [3, 3],
  "structure.house": [3, 3],
  "structure.watchtower": [2, 3],
  "structure.well": [1, 1],
  "structure.cottage": [2, 2],
  "structure.tavern": [3, 3],
  "structure.smithy": [2, 2],
  "structure.chapel": [2, 3],
  "structure.manor": [3, 3],
  "structure.bakery": [2, 2],
  "structure.farmhouse": [3, 2],
  "structure.barn": [3, 2],
  "structure.stall": [2, 1],
  "structure.fountain": [2, 2],
  "structure.cave_mouth": [2, 1],
  "structure.mine_shaft": [2, 2],
  "structure.stone_circle": [3, 3],
  "structure.den": [2, 2],
  "structure.crypt": [2, 2],
  "structure.ruin": [3, 2],
  "structure.giant_skeleton": [4, 2],
};

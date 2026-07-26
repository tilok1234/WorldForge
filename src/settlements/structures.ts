/** Structure vocabulary (settlements.plans v1). Layer values are index + 1. */
export const STRUCTURE_TYPES = [
  "structure.fortress_gate",
  "structure.fortress_wall",
  "structure.house",
  "structure.town_hall",
  "structure.watchtower",
  "structure.well",
] as const;

export type StructureType = (typeof STRUCTURE_TYPES)[number];

export const STRUCTURE_LAYER_VALUE: { readonly [key in StructureType]: number } =
  Object.fromEntries(STRUCTURE_TYPES.map((key, index) => [key, index + 1])) as {
    [key in StructureType]: number;
  };

/** Atomic footprints (width, height) for planner-placed structures. */
export const STRUCTURE_FOOTPRINTS: { readonly [key in StructureType]?: readonly [number, number] } = {
  "structure.town_hall": [4, 4],
  "structure.house": [3, 3],
  "structure.watchtower": [2, 2],
  "structure.well": [1, 1],
};

# WorldForge Generation Rules

Status: **Normative draft**

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** indicate requirement
strength.

## Global rules

1. WorldForge MUST generate semantic meaning before visual tile resolution.
2. The same generation identity MUST reproduce the same world.
3. Chunk generation order MUST NOT change output.
4. A pass MUST use its own named deterministic channel.
5. A new pass MUST NOT reshuffle unrelated existing passes.
6. Invalid topology MUST be reported; it MUST NOT be silently hidden.
7. Global systems MUST derive from a global plan, not isolated chunk noise.
8. WorldForge MUST NOT modify the TileForge repository.

## World-scale coherence

- The first supported world SHOULD be finite.
- Regions SHOULD be large enough to establish a readable identity.
- Biome changes SHOULD form transition zones or meaningful boundaries.
- One-cell material confetti SHOULD be removed unless it represents an
  intentional feature.
- World edges, coasts, mountains, and basins MUST be decided before local
  decoration.
- Macro-scale fields MAY use noise, but named places and routes MUST use
  graph and constraint logic.

## Elevation and hydrology

- Rivers MUST have a source and a valid downstream destination.
- River routing SHOULD generally descend or remain level.
- Unavoidable uphill steps MUST be explicit authored features.
- Lakes MUST have a basin explanation or an intentional closed-basin tag.
- Wetlands SHOULD appear from drainage and moisture conditions, not arbitrary
  scattered water cells.
- Water crossings MUST be selected from actual route-water intersections.
- Major rivers MUST remain stable across chunk boundaries.
- Decorative streams MAY use simplified rules but must remain connected.

## Regions and biomes

- Biome classification MUST consider more than a single unfiltered noise value.
- Each biome definition SHOULD specify suitability, minimum area, allowed
  neighbors, terrain palette, traversal cost, settlement suitability, and
  decoration profile.
- Rare biomes MUST have explicit frequency or placement budgets.
- Hazardous regions SHOULD have readable approaches and escape routes.
- Regions SHOULD have names or stable IDs for debugging and game integration.

## Roads and routes

- A primary route MUST connect meaningful destinations.
- Route generation MUST distinguish graph intent from rendered cell paths.
- Country roads SHOULD use a wider semantic corridor with a one-cell road
  centerline rather than a bare line across uniform terrain.
- A TileForge country-road corridor SHOULD be two to three cells of soil or
  gravel beneath and beside the road band.
- Mixed road-type junctions MUST use the wider family at the shared junction
  cell.
- Road type MUST NOT switch at an arbitrary mid-run butt joint.
- Dirt paths SHOULD serve local spurs, shortcuts, shrines, and minor access.
- Primary settlement and inter-region routes SHOULD prefer road or ruined road.
- Widths equivalent to TileForge's 8–10 px road setting are curb or alley
  treatments and MUST have a painted supporting area.
- Roads SHOULD prefer plausible grade and crossing cost.
- Required route connectivity MUST be validated after decoration.

## Settlements

- A settlement candidate MUST satisfy terrain, water, route, and footprint
  constraints.
- Settlement placement SHOULD be driven by purpose: crossing, harbor, resource,
  defense, farming, administration, or pilgrimage.
- Every settlement MUST have at least one valid approach.
- District and building plans MUST reserve routes before prop decoration.
- Structures MUST be placed atomically with their full footprint.
- Structure pass cells and entrances MUST remain reachable.
- Settlement decoration MUST NOT block the only required route.
- A settlement's generated economy or purpose MAY be extension data supplied
  by the game.

## Landmarks and authored content

- Authored landmarks MUST declare footprint, anchor, substrate, approach,
  orientation, and exclusion area.
- A landmark stamp MUST NOT overwrite protected world systems without an
  explicit merge policy.
- Landmark surroundings SHOULD be procedurally blended, not cut as a hard
  rectangle.
- The authored artifact remains data owned by WorldForge or the game; it must
  not be written back to TileForge.

## Props and decoration

- Decoration happens after terrain, hydrology, routes, settlements, and
  traversal-critical features.
- Each prop species MUST have a named deterministic channel.
- Prop placement MUST honor substrate, spacing, footprint, and blocking rules.
- Blocking props MUST NOT occupy protected navigation cells.
- Density SHOULD vary at low frequency; uniform independent scatter SHOULD be
  avoided.
- Important landmarks and interactables SHOULD have local contrast and clear
  space.
- Decoration budgets MUST prevent pathological cell counts.

## TileForge resolution rules

These rules apply only in the TileForge adapter:

- Read all material, family, structure, prop, decal, selector, and transition
  mappings from the pinned manifest.
- Blob and overlay masks MUST use real neighboring semantic data.
- Chunk resolution MUST include a neighbor halo.
- Sand dual-grid placement MUST follow the package convention and margin rule.
- Network layers are one cell wide by contract.
- Underlays MUST be resolved using the package's transition rules.
- Structures MUST expand to complete atomic footprints.
- Two-part props MUST place their overhang at the package-declared offset.
- Layer order MUST follow the package guide.
- Semantic IDs MUST be used for lookup; atlas coordinates are derived output.
- Unknown or missing mappings MUST fail compatibility validation.

## Chunk streaming rules

- World planning occurs independently of runtime load order.
- A chunk MUST know the semantic cells required to resolve its border.
- A chunk MAY store a halo or query a global semantic store.
- Unloaded visual neighbors MUST NOT cause permanent closed masks at chunk edges.
- Re-entering a chunk MUST reproduce the same semantic and resolved content.
- Persistent player changes MUST be stored as explicit deltas over the
  deterministic base world.
- Regeneration MUST NOT erase persistent deltas without a migration decision.

## Performance restraints

Initial targets should be explicit and modest:

- finite world;
- bounded region and route counts;
- bounded settlement and landmark budgets;
- bounded retries for constraint solvers;
- deterministic failure after retry exhaustion;
- chunk compilation suitable for background or offline generation;
- compact runtime data separated from debug metadata.

The generator MUST NOT enter unbounded retry loops to find a perfect world.

## Validation gates

A world fails release validation if any of these occur:

- nondeterministic output;
- unresolved semantic IDs;
- inconsistent chunk borders;
- overlapping atomic structures;
- required route disconnection;
- invalid settlement entrance;
- route through forbidden terrain without a crossing;
- orphan river segment;
- missing dependency identity;
- incompatible TileForge manifest format;
- generator error silently replaced with default terrain.

Warnings may cover:

- excessive isolated biome islands;
- visually long straight boundaries;
- sparse or overcrowded regions;
- repeated settlement layouts;
- route detours above a configured ratio;
- unusual but still valid river topology;
- decoration density outside the preferred range.

## Review rule

Passing structural validation does not automatically approve the world.

Every milestone with visual output requires:

1. a macro-map review;
2. a chunk-border review;
3. a native-scale TileForge-resolved review;
4. explicit acceptance or an iteration brief.

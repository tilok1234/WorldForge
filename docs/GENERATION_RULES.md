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
9. WorldForge MUST accept the same recipe contract from human and AI authoring
   clients.
10. Deterministic generation MUST NOT require an AI model.
11. Semantic generation decisions MUST NOT depend on unspecified
    floating-point, hash, iteration-order, or serialization behavior.

## Numeric determinism

- Coordinate hashing MUST use explicitly sized integers and documented wrapping
  semantics.
- Language-default string or object hash functions MUST NOT define generation.
- Integer or fixed-point values SHOULD drive thresholds and classifications.
- A floating-point noise implementation, when unavoidable, MUST be pinned and
  covered by golden vectors on every supported platform.
- Floating-point field output MUST be quantized before it changes semantic
  identity.
- Platform transcendental functions MUST NOT serve as undocumented random
  sources.
- Artifact serialization MUST define key order, number encoding, text encoding,
  and newline behavior.
- A supported platform MUST reproduce the canonical kernel and small-world
  vectors byte-for-byte.

## AI and recipe authoring

- Natural-language intent MAY be translated into a draft `WorldRecipe`.
- A prose prompt or conversation transcript MUST NOT be the only canonical
  world definition.
- Every draft MUST pass schema validation and normalization, then compile
  deterministically into `ResolvedWorldConfig`, before generation.
- `WorldRecipe` MUST include the seed and remain the only author-facing root
  generation document. Versioned authored assets MAY be referenced by it.
- `ResolvedWorldConfig` MUST be treated as derived data, not a second
  independently edited source of truth.
- Recipe vocabulary MUST be rejected until the corresponding generator pass and
  validator exist.
- W0 recipe vocabulary MUST remain limited to named presets, integer counts,
  integer biases, budgets, and simple supported toggles.
- Relational placement constraints MUST NOT enter the schema before their
  versioned solver milestone.
- AI-authored recipes MUST obey the same topology, budget, path-safety,
  compatibility, and validation rules as manually authored recipes.
- AI MUST NOT silently change an accepted seed, constraint, dependency, or
  baseline.
- AI-suggested iterations SHOULD be expressed as structured recipe diffs.
- AI MUST NOT directly rewrite generated cells to hide a generator or validator
  failure.
- AI-authored landmark stamps MUST pass the same footprint, substrate,
  traversal, and overlap checks as manually authored stamps.
- Accepted recipes MUST remain readable, editable, and reproducible offline.
- Prompt and model metadata MAY be stored as provenance, but MUST NOT replace
  the normalized recipe and recipe-compiler version in generation identity.
- AI access to TileForge remains read-only and package-based.

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

Doctrine lineage: the 2026-07-26 corridor doctrine (routes as ground-material
corridors, road band deprecated) was overturned in designer rulings. The
behavior-56/57 rounds proved the "wide roads" complaint was cobble/packed
BLOB-RENDERING and ruled the band the one-tile look; behavior 72 extended
the band to country roads; behavior 74 (sl-0049) briefly routed settlement
streets onto the trail band while no street art existed; behavior 75
(sl-0053, on the e2699cc cut) gave streets their own class when the
designer shipped the 10px sett "street" band, and folded the no-diagonal
arc; behavior 76 (sl-0058, the arc-closing 9b8b2a2 cut) added the
hand-authored road-joint transitions. Current law:

- A primary route MUST connect meaningful destinations.
- Route generation MUST distinguish graph intent from rendered cell paths.
- Path-layer vocabulary (validator range 0..3 — the pin moves WITH the
  vocabulary, the b70 lesson): 0 none / 1 TRAIL class (wilderness trails,
  dirtpath art) / 2 ROAD class (country routes and the necked
  through-route inside settlement bounds — the inter-city road and its
  continuation; road_network art) / 3 STREET class (every
  settlement-written street surface — arms, city ring, house lanes, civic
  approaches, dock lanes; the package's sett-paved street band, behavior
  75). Corridors still CARVE as material internally; the composer necks
  them to centerline and restores the flank ground (behaviors 52/56/72).
- NO DIAGONAL ROADS — STANDING RULE (sl-0059, designer, revisit only as a
  deliberate design act): no road lane of any class, from any writer, may
  step diagonally; direction changes are orthogonal L-step pairs. Encoded
  end to end: turn-cost routing (the route search charges every turn four
  steps, so paths plan as straight legs, routes.graph 19), direction
  persistence in the BFS carvers (landmark approaches, house lanes, POI
  spurs), and the compose-time normalization chain (de-braid: trail-hug
  and flank-line merges onto the road; junction-remnant repaint; L-step
  insertion; 2x2 block thinning LAST — a junction is a T or an L, never a
  filled square). The packaged GAME-GUIDE carries the same doctrine.
- ROAD JOINTS (behavior 76, adapter v9): class switches on straight runs
  render the package's hand-authored joint tile per mappings.roadJoints
  (A = the senior class by the classes ranking, B = the cell; one side
  fires; junction/corner switches keep the wider-class doctrine;
  threshold never joints). PURE RENDER SUBSTITUTION — the road grid byte
  never changes and no writer places anything for joints.
- Lamps (behavior 61) light settlement streets, never wilderness trails:
  eligibility is band VALUE {2, 3} (behavior 75 made street distinct
  again; the b74 bandLaneMask workaround is retired).
- Road types 5-8 (gravelway / flagway / corduroy / threshold, the 9b8b2a2
  cut) are rostered but UNUSED — their route-hierarchy round (country
  highway = gravelway, processional = flagway, swamp causeway = corduroy,
  threshold pads at ceremonial switches) is its own designed round.
- Style-free worlds keep the classic material corridors byte-identically:
  packed-road country routes, cobble town streets (the pre-56 contract that
  approved worlds bake in).
- A band cell MUST NOT ride rock material — every band writer grades rock
  (gravel or an adopted neighbor; behaviors 21/71), which is what keeps the
  adapter's cliff relief off traversal ("walkable cells stay level 0").
- Plazas and civic cores stay paved areas in every mode.
- Route legs SHOULD stay axis-aligned with explicit corner turns; diagonal
  legs stair-step at gameplay zoom in the pinned tile system.
- Major water crossings MUST be bridge structures; minor crossings SHOULD use
  the ford decal at valid route-water intersections.
- Roads SHOULD prefer plausible grade and crossing cost.
- Required route connectivity MUST be validated after decoration, and a
  restored corridor flank that a trail joins MUST become a band cell — bare
  ground there strands the trail one cell short of the centerline (the
  behavior-72 first cut severed two landmarks exactly this way).

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
- PROP COMPOSITION IS ART DIRECTION (sl-0075 closed SUPERSEDED,
  2026-08-01): generated prop fields ship AS AUTHORED — WorldForge
  performs no re-spacing, thinning, or porosity editing of the
  composition; navigation through prop fields is solved GAME-SIDE
  (art-matched prop collision, sl-0078). The fully-built walkable-woods
  re-spacing pass is archived dormant at src/decoration/respace.ts
  (designer-render-approved before the park; a possible future
  designer-OPT-IN art tool) — wiring it into generation is a designer
  decision, never a refactor.
- WALKABILITY CLASSES — STANDING RULE (behavior 77, planning sl-0063,
  designer: keep the density, convert instead of thin): every prop species
  carries exactly one class in PROP_WALKABILITY. CARPET ground clutter
  (tufts, debris, low bushes, piles) renders but never blocks — four
  species deliberately override the package's walkable:false (stump,
  fallen_log, bone_pile, loot_pile; the pinned divergence IS the ruling,
  extending it is a new ruling). CANOPY (the package's two-part species)
  blocks only its trunk cell; the _over crown at (x, y-1) never blocks and
  the game must render props-overhang ABOVE the player for the pass-under
  to read. SOLID must visibly read as a blocker (trunks, boulders, built
  walls — CORE-32). Placement guards stay frozen at the b76 roster so the
  conversion left every prop layer byte-identical; relaxing them is its
  own designed round. Edge-case reclassification is designer taste, never
  a refactor.
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

## Multi-game consumer rules

- The canonical world artifact MUST remain engine-neutral.
- Godot and TypeScript consumers MUST validate artifact format, generator
  identity, and pinned dependency identity before loading.
- Consumer adapters MUST NOT change the semantic meaning of cells, routes,
  structures, or metadata.
- Consumer-specific caches MUST record the base artifact hash and adapter
  version.
- The same base fixture MUST produce matching chunk coordinates, semantic IDs,
  walkability, and topology in both official consumer lanes.
- A TypeScript game MUST use the public loader or artifact schema and MUST NOT
  couple itself to private generator-pass modules.
- Game-specific extension data MUST be namespaced and optional to the reusable
  core.
- Production game recipes and authored content SHOULD live with the consuming
  game or its explicitly versioned content pack.
- Runtime generation inside either game engine is a separate capability from
  artifact consumption and MUST NOT be assumed by the initial adapters.

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
- missing or invalid recipe identity;
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

Standing macro-map criterion (from the W2 acceptance brief): a post-hydrology
world SHOULD read as one dominant landform per map — a mountain mass, a basin,
a coastline — not as same-scale biome blobs. If it does not, revisit the
elevation octave weights before adding features.

# Zone composition assessment (DRAFT — awaiting designer ratification)

2026-07-27, mobile session. User prompt: "assess what we can do to put
zones we build together into 1 world — craft like 8-ish detailed zones
and then put them together."

Status: **assessment only.** Nothing here is on the plan until the
decision points at the bottom are ratified. Relationship to the game
integration plan: this generalizes Phase 5 (single slice-zone drafting)
into a composed multi-zone world; it does not replace phases 4-5.

## What we already have that this builds on

- The **hollow workflow** (behaviors 40-42, ratified): craft one 64²
  zone-sized world at a time — pin an outpost, choose landmarks, tune
  cover — verdict it on the phone viewer, iterate. This IS zone
  crafting; the question is only how crafted zones become one world.
- **Authored placement** (36-38): pins, ranks, per-recipe stamps, cell
  overrides — all zone-local by coordinates already.
- **Sector floors** (routes.graph v11+): the solver already thinks in
  map sectors; a zone grid is the same shape one level up.
- **Terrain texture** (39): edge dithering is exactly the tool for
  softening zone transitions.
- **Coastal moisture halo**: precedent for spatially modulated climate
  fields — the mechanism zoned climate needs.

## Three ways to put zones together

### A. Macro-first zone partition
One recipe, one generation; the world declares a zone grid and each
zone carries its own climate/density character applied as masked field
offsets. Hydrology, routes, settlements all solve ONCE, globally.

- Seamless by construction: rivers cross zones, one road web, every
  validator holds globally, determinism unchanged in kind.
- Con: zones are specs, not artifacts — you re-verdict the world, not
  a zone in isolation.

### B. Artifact stitching
Generate each zone as today's standalone hollow, then a composer
stitches N artifacts edge-to-edge, bridges the road networks across
seams, and re-validates the composite.

- Pro: zones stay fully independent, reusable, individually ratified.
- Cons are structural: **sea level differs per climate** (arid 280 /
  wet 350 / frozen 370) so coastlines clash at seams; border hydrology
  cannot reconcile after the fact; cross-seam route bridging is a new
  solver; composite identity/determinism is a new story; every
  validator needs a composite mode. This is the largest build and
  fights the engine's one-world assumptions.

### C. Zone vocabulary inside one recipe (RECOMMENDED)
A + authoring ergonomics. The recipe declares a zone grid; each zone
entry is a sub-spec (climate character as masked offsets, density,
zone-local pins/landmarks/stamps). Generation stays single-pipeline —
one hydrology at one sea level, one route solve, seamless — with
climate offsets blended across seam bands (~8-16 cells, then behavior
39's dithering textures the transition). The crafting loop stays the
hollow loop: edit ONE zone's sub-spec, regenerate (deterministic),
verdict that zone's crop in the viewer.

- Sea level must be a WORLD choice (zones express wet/dry/frozen via
  temperature/moisture offsets, not their own sea level) — the honest
  cost of seamlessness, and why frozen zones read as snow via cold
  rather than a different ocean.
- Engine work, in order: (1) zoned macro-field offsets with seam
  blending; (2) recipe zone vocabulary + validation; (3) zone-scoped
  route/settlement budget floors (sector floors generalized); (4)
  zone-crop preview tooling for the verdict loop.

## Sizing an 8-zone world

Size presets are square today. Options:
- **medium 512² with a 4×2 grid of 128² zones** plus intrinsic wilds
  between — no new size vocabulary, zones the size of 4 hollows each.
- 256² with 8 × 64² zones (2×4): zones exactly hollow-sized, but the
  world is only "small" and non-square grids sit oddly in 256².
- New rectangular size vocabulary (e.g. 512×256): cleanest fit for
  exactly-8 but adds dimension vocabulary everywhere (renders, chunk
  math, viewer). Not recommended for v1.

## Decision points (designer)

1. **Approach**: A, B, or C (recommendation: C).
2. **World shape for the 8-zone pilot**: medium 512² / 4×2 zones of
   128² (recommendation) vs exact-64² zones vs new rectangular sizes.
3. **Zone transitions**: blended seam bands + texture dithering
   (recommendation) vs hard readable borders.
4. **Sequencing**: start this arc now, or after Phase 4 + dusk pin so
   the first composed world ships straight into the game.

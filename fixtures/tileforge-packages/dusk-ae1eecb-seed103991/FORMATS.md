# TileForge package — format reference

Lookup material for writing importers or tooling against this package. Task-based
instructions (including the full procedural rendering algorithm) live in
GAME-GUIDE.md. (As of format 1, 2026-07.)

## Semantic tile ids

Stable, human-readable, authoritative — and **zero-padded**. Exact formats (also
machine-readable with examples in `manifest.mappings.semanticIds`):

    terrain.<image basename>.mask_###.variant_##.frame_0#    blob47
    terrain.<image basename>.corner_##.variant_##.frame_00   corner16 (sand)
    network.<family key>.c_##.variant_##[.frame_0#]          net16
    fill.<family key>.variant_##                             seamless floors
    prop.<part label>.variant_##                             prop parts
    crop.<crop name>.stage_0#.variant_##                     crop growth stages
    ramp.<type name>.dir_<n|e|s|w>.variant_##                elevation ramps/stairs
    structure.<name>_<cellIndex>.variant_##                  metatile cells

Note the name forms: blob47/corner16 use the family's `image` basename
(`grass_on_soil`), network/fill use the short family key (`river`, `soil`).
Atlas coordinates are derived; if you re-pack atlases, key on these ids.

## tileforge-manifest.json

Top level: `formatVersion` (1), `generator`, `projectSeed`, `tileSize` (32),
`projection` ("orthographic-top-down"), `compatibilityMode` ("universal" |
"coordinated"), `style` (the forge sliders), `familyOverrides`, `palette`
(role name -> hex, e.g. `"water.foam": "#b8e0f2"`), `families`, `mappings`.

**`mappings` — the machine-readable id tables** (never transcribe these from
prose — enumerations here are examples, the JSON is the authority):
`materials` (grid material id -> family key, 0-26), `decals` (decal id
-> family key, 1-23), `props` (prop type id -> species name; part codes are
`type*10+part`), `crops` (crop type id -> name) + `cropStages` (stage index
-> name; crop layer byte = `type*16+stage`), `roadTypes` (road layer byte ->
family key: 1 road, 2 dirtpath, 3 ruinedroad) + `roadTypesLegacy` (the
display-retired ids [1,3] — render them for legacy content, never author
new runs; dirtpath is the one live band), `minimap` (material id ->
representative hex for far-zoom/minimap rendering, derived from the live
theme), `pierTypes` (pier layer byte ->
family key: 1 pier, 2 boardwalk, 3 jetty), `fenceTypes` (fence layer byte ->
family key: 1 fence, 2 penfence, 3 ironfence, 4 hedge), `wallTypes` (wall
layer byte -> family key: 1 wall, 2 palisade, 3 ruinedwall, 4 seawall,
5 cavewall, 6 dungeonwall), `rampTypes` + `rampDirs` (ramp layer byte =
`type*8+dir`, dir = ascent), `cliffBiomes` (substrate material ids ->
cliff/ramp reskin family per biome), `structures` (structure type id
-> `{w, h, name, pass?}` where `pass` lists walkable cell indices;
state siblings carry `{base, state}`), `transitions` (matPriority +
flushPairs + gutterPairs, derived at export — see section 2.5/2.6),
`selector` (variant-selection contract: `version` 1 = uniform
`hash % variants`; version 2 adds `families.<key>` entries with
`baseVariants` + `extrasPct` — the last indices are weighted rare
accents — and optionally `tones` `{n, period, smooth}`: the variant
axis splits pattern × tone, tone picked from a smooth `period`-cell
value-noise field, `vi = tone*baseVariants + pattern`, accents past
every tone copy; exact pick recipe in section 2.4), `semanticIds`
(id format strings + examples).

Per family (`families.<key>`):

| field | meaning |
|---|---|
| `id` | family display id (e.g. `water-on-soil`) |
| `kind` | `blob47` / `corner16` / `net16` / `seamless` / `prop` / `meta` |
| `image` | atlas PNG filename |
| `variants`, `frames` | counts; frames > 1 means animated (180 ms/frame) |
| `maskCount` | number of distinct masks/parts |
| `walkable` | family default |
| `hazard` | optional: `thin-ice`, `scalding`, `current`, `corruption` |
| `depth`, `swim`, `wade` | optional water-group movement flags |
| `atlas` | `{width, height, columns, padding, extruded}` |
| `tiles[]` | `{id, mask, variant, frame, atlas:[x,y]}` + optional per-tile `walkable` override |

`tiles[].atlas` is the pixel position of the 32x32 tile inside the padded atlas
cell — grid coords are `(x - padding) / (32 + 2*padding)`.

## Mask encodings

- **blob47** (8-neighbor, normalized): N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128.
  A diagonal bit is only set when both adjacent cardinals are set — 256 raw
  configurations normalize to 47. Connection semantics (which neighbors count,
  incl. out-of-world = connected) are in GAME-GUIDE 2.4-2.5.
- **corner16** (dual grid): TL=1 TR=2 BR=4 BL=8; dual point (x,y) samples cells
  (x,y), (x+1,y), (x+1,y+1), (x,y+1); the visual tile sits at a half-cell offset
  (+16 px). Out-of-world cells never count as sand.
- **net16** (ports): N=1 E=2 S=4 W=8 from the network's own layer;
  **out-of-world does NOT connect** (runs end in a closed cap at world edges).
  Port pixel bands: wall rows/cols 10–21, fence rows 14–16, pier 12–19, road
  `16-w/2 .. 16+w/2-1`, river its band ± damp rim.
- **prop codes**: `type*10 + part` (part 1 = overhang, drawn one cell up).
- **crop codes**: `type*16 + stage` (stages 1-4; 0 = no crop). Stage tiles are
  mask-free — variant-hash placement like fills; art is inset 2 px so field
  cells tile without seam contracts.
- **ramp codes**: `type*8 + dir` (dir 1-4 = n/e/s/w ascent; 0 = none).
  Mask-free like crops; ramp tiles carry per-tile `ascend` in tsj properties,
  manifest tiles and Godot custom data.
- **meta codes**: `type*256 + cellIndex` (row-major in the structure footprint).

## Atlas layout

12 columns. Entry order: masks (outer) x variants x frames (innermost) — so an
animated tile's 4 frames are horizontally consecutive and never wrap a row
(4 divides 12; validated per export). Padding: each cell is `32 + 2*pad` px with
the tile inset by `pad`; `extruded` means 1 px edge duplication for bleed-safe
filtering. In Tiled terms: margin = pad, spacing = 2*pad.

## .tsj (Tiled tilesets)

- Wang sets: type `mixed` for blob47 with wangid order [N,NE,E,SE,S,SW,W,NW];
  type `corner` for corner16. Wang rules on frame-0 tiles only.
- `probability`: 1/variants on frame-0 tiles, 0 on animation frames (keeps
  Tiled's terrain brush off them).
- `animation`: [{tileid, duration:180} x 4] on animated frame-0 tiles.
- Custom properties per tile: `semanticId`, `walkable`, `mask`.

## map.tmj (the workbench map)

Layer stack, bottom to top (identical to the forge draw order):

    underlay, sand, terrain, moss, tallgrass, crops, river, cliff, ramps, pier,
    road, fence, decals, wall, structures, props, props-overhang

- `sand` carries offsetx/offsety = 16 (dual-grid half-cell shift).
- The `road` layer mixes gids from three tilesets (road / dirt_path /
  ruined_road), the `pier` layer from three (pier / boardwalk / jetty), the
`fence` layer from four, the `wall` layer from six, `decals` from all 23
decal families and `cliff` from the four biome reskins — one per cell
  by type; gid resolution below handles it.
- gid -> tile: find the tileset entry with the greatest `firstgid <= gid`;
  `local = gid - firstgid` is the atlas entry index (row-major, 12 columns).
  Animated families may reference any frame; normalize with
  `local -= local % frames` if your engine animates from frame 0.
- The `underlay` layer bakes the bank logic (GAME-GUIDE 2.6) — no game-side
  computation needed when consuming this file.
- `map-reference.png` is the forge's frame-0 render of exactly this file — the
  acceptance-test ground truth (GAME-GUIDE section 4).
- `map-data.json` carries ALL raw grid layers of the exported map
  (mat, road, fence, wall, river, moss, tall, pier, decal, prop, crop,
  meta, elev, ramp — row-major ints, `mapW`×`mapH`; meta holds the packed
  `type*256+cellIndex` codes). This is the EDITABLE source representation
  of the map — the tmj is derived from it (2026-07-20 audit fix: gids alone
  cannot recover sand vs soil vs the mask-free floors) — heights are NOT reconstructible from cliff gids.
- Border caveat: the sand dual row/col at map coordinate -1 falls outside the
  grid; keep a 1-cell sand margin when stitching chunks.

## Underlay bank priority

Water-group / lava / ice / hot-spring cells take their dominant cardinal land
neighbor as underlay; ties break in exactly this order:

    grass, dry grass, mud, bog, snow, gravel, ash, basalt, cave dirt, cave stone,
    fungal, sand, stone floor, dungeon floor, temple floor, rock

(sand renders as corner 15; stone/dungeon/temple as their fill tiles; all others
as mask 255. Materials not in the list — and cells with no qualifying neighbor —
bank on `fill.soil`.)

Land cells use the ladder rule instead (GAME-GUIDE 2.6): dominant
strictly-lower-`matPriority` neighbor over all 8 surrounding cells, cardinals
counted double, ties to the lower priority then the lower material id
(sand renders as corner 15; `gutterPairs` partners never qualify). The baked
`underlay` layer in this file
already contains the result — no game-side computation needed when consuming
`map.tmj`.

## Decal layer ids

1 cracks · 2 leaves · 3 rubble · 4 scorch · 5 puddles · 6 blood · 7 webs ·
8 bones · 9 rapids (water, animated, hazard current) · 10 waterfall (cliffs,
animated) · 11 lilypads (water) · 12 stepping stones (water, walk-granting) ·
13 driftwood (banks incl. shallow) · 14 frost (water, walk-granting, hazard
thin-ice; animated — a slow sparkle twinkle on a still ice skin) ·
15 ford (water/shallow/river only — never deep; walk-granting,
wade) · 16 geyser (hot spring or open water — water/shallow/deep, never rivers; animated, hazard scalding) · 17 steam vent
(rock/gravel/cracked-earth/ash/basalt/cave floors, animated, hazard scalding) ·
18 crater (dry land — siege impact) · 19 arrows (dry land — spent volley) ·
20 battle gear (dry land — dropped swords/shields/helmets) · 21 rune circle
(dry land — arcane ground ring, animated; place it on the portal
structure's pass cells and it shimmers through the transparent arch) ·
22 crystal field (dry land incl. cave floors — walkable crystal growth;
the crystals prop is its blocking big kin) · 23 paving apron (dry land —
clustered paving crumbs / worn spill for floor|ground edges; lay short
runs along ~30-50% of a floor edge, not every cell).
One decal per cell; masks by id-equality. (Machine-readable copy:
`manifest.mappings.decals`.)

## Determinism

Everything derives from `projectSeed` + theme + style: the same forge inputs
produce byte-identical atlases and manifests (verified browser vs headless CLI).
Treat the package as a build artifact — regenerate rather than hand-edit.
`validation-report.json` in the package is the forge's own validation run for
this export.

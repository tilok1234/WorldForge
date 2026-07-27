# TileForge package — game integration guide

How to render these tiles in a game so the world looks exactly like it does in the
forge. Written for a **procedurally generated open world** (the primary consumer):
section 2 is the complete runtime rendering algorithm, section 4 is the test that
proves your implementation is correct. Godot is the primary engine target.
Generated with the package, 2026-07.

---

## 1. Setup: import the tileset (always required)

1. Copy this `tileforge/` folder into your project as `res://tileforge/`.
2. Open `tileforge_importer.gd` in the script editor, File > Run (Ctrl+Shift+X).

That builds `res://tileforge/tileforge.tres` (Godot 4.2+): one atlas source per
family, native 4-frame animation (180 ms) on the water group, lava, rivers and the
animated decals, collision on non-walkable tiles, terrain peering bits, and
per-tile custom data (`semantic_id`, `walkable`, `hazard`, `depth`, `swim`,
`wade`). Everything in section 2 renders through this one TileSet.

---

## 2. Rendering a procedural world (the core of this guide)

### 2.1 The one rule

**Never stamp a family's interior tile across a region.** Every cell's tile is
chosen from its 8-neighborhood. Stamping interiors is what produces hard
rectangular edges, wallpaper repetition and soap-bubble ponds.

### 2.2 The layer stack

Your world renderer needs these layers (bottom → top), matching `map.tmj`
exactly. Each is a TileMapLayer with the same TileSet; skipping a layer removes
that feature but never breaks the rest:

| # | layer | contents |
|---|---|---|
| 1 | underlay | ground fill under everything (2.6 — banks under water, the lower material under every land seam) |
| 2 | sand | corner16 dual grid at +16 px x/y offset (2.7) |
| 3 | terrain | blob47 mask tiles for the cell's material (2.4) |
| 4 | moss, tallgrass | 0/1 ground overlays (2.8) |
| 5 | crops | growth-stage tiles from the crop layer (2.8) |
| 6 | river | net16 port masks (2.8) |
| 7 | cliff | blob47 masks from elevation (2.8) |
| 8 | ramps | elevation transitions from the ramp layer (2.8) |
| 9 | pier, road, fence | net16 port masks (2.8) |
| 10 | decals | one decal id per cell (2.8) |
| 11 | wall | net16; also connects to `gate` structure cells (2.8) |
| 12 | structures | metatile cells, placed atomically (2.9) |
| 13 | props | prop ground parts (2.10) |
| 14 | props-overhang | the `_over` parts of two-part props, at (x, y−1) (2.10) |

### 2.3 Materials and the id tables

Your world data stores one material id per cell (0-27: soil, grass, water, sand,
rock, stone floor, lava, cobble, dry grass, mud, muck, snow, ice, gravel, cracked
earth, ash, basalt, cave dirt, cave stone, fungal, dungeon floor, temple floor,
shallow water, deep water, bog, hot spring, corrupted ground — walkable
blight, hazard corruption — and packed road, the graded roadbed your route
corridors are laid from).

**Do not transcribe id tables from prose.** The manifest ships them machine-
readable under `mappings`: `materials` (id → family key), `decals` (id →
family key), `props` (type id → species), `structures` (type id → {w, h, name,
pass, and for state siblings base + state — e.g. `house_burned` carries
`{base: 1, state: "burned"}` so a game can swap a structure to its damaged
state mechanically}), and `semanticIds` (the exact zero-padded id formats with
examples). Build every lookup from there.

Seamless floors (soil, stone, cobble, dungeon, temple) have no masks — they render
on the underlay layer only (their `fill.<key>` tile, any variant). Sand is
corner16 (2.7). Everything else is blob47 (2.4).

### 2.4 Blob47 masks — the algorithm

For each cell of a blob47 material:

1. Test each of the 8 neighbors with `connected()` (rules in 2.5).
2. Sum the bits of connected neighbors: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64,
   NW=128. **For blob47, a neighbor outside the loaded world counts as
   connected** (other systems differ — see 2.7/2.8).
3. Normalize: a diagonal bit survives only if BOTH adjacent cardinal bits are set
   (NE needs N and E; SE needs S and E; SW needs S and W; NW needs N and W).
4. Place the family's tile for that mask, picking a variant with a stable
   position hash. Every variant shares identical edges (validated contract), so
   any per-cell choice is seam-safe. (Your hash won't match the forge's internal
   one — different, equally valid variant picks. Rendering `map.tmj` from
   stored gids IS pixel-identical; see section 4.)

   **Variant selection (`mappings.selector`).** If `selector.version` is 1 —
   or a family is not listed under `selector.families` — pick uniformly:
   `hash(x, y) % variants`. At `version` 2, listed families carry weighted
   pools: the LAST `extrasPct.length` variant indices are rare ACCENTS (e.g.
   grass's flower meadow) and must stay rare. A family with a `tones` block
   additionally splits its axis pattern × tone (e.g. grass: `variants` 13 =
   `baseVariants` 6 patterns × `tones.n` 2 + 1 accent): the tone comes from
   a smooth low-frequency field so it drifts in broad irregular patches —
   never from the per-cell hash, which would scatter it into confetti.
   Replicate the forge's pick with integer math (`tones.n` = 1 and tone = 0
   when the block is absent):

       # tone bucket — smoothstep-bilinear value noise, own seed stream
       P  = tones.period                  # lattice spacing in cells
       ix = floor(x / P); qx = x - ix*P   # FLOOR division (negatives too)
       iy = floor(y / P); qy = y - iy*P
       sx = tones.smooth[qx]; sy = tones.smooth[qy]
       n00 = tone_hash(ix, iy) % 1000; n10 = tone_hash(ix+1, iy) % 1000
       n01 = tone_hash(ix, iy+1) % 1000; n11 = tone_hash(ix+1, iy+1) % 1000
       v = ((n00*(1000-sx) + n10*sx) * (1000-sy)
          + (n01*(1000-sx) + n11*sx) * sy)
       tone = 1 if v >= 500000000 else 0

       roll = hash(x, y) % 100
       acc  = 0
       for i in extrasPct.length:          # accents claim bands off the TOP
           acc += extrasPct[i]
           if roll >= 100 - acc:
               return baseVariants * tones.n + i   # accents: PAST every tone copy, never toned
       pattern = roll * baseVariants / (100 - acc)   # integer division
       return tone * baseVariants + pattern

   `tones.smooth` ships the per-offset smoothstep table
   (`round(1000·q²·(3P−2q)/P³)`); `tone_hash` is any stable integer hash
   seeded separately from your variant hash. Uniform `% variants` picks
   over-show the accents and scatter tone — a flower meadow at 1-in-13
   instead of ≤1-in-10 reads as wallpaper, and per-cell tone loses the
   macro drift that is its entire point. One caveat specific to toned
   families: tone variants carry a solid ~⅛-ramp-step tint that runs to
   the tile edge (so tone regions join without visible tile borders), so
   edges of tone siblings differ by exactly that faint tint. Picked from
   the smooth field, adjacent cells share a tone and the tint step lands
   only on real region boundaries; scattered uniformly it shows as a
   faint per-tile tint checker at seams. Structural pixels on every edge
   remain variant-identical, so masks and geometry always join — but use
   the field selector for the intended ground look; the worldgen
   example's `pick_variant()` is this exact function.

Tile ids are zero-padded — `terrain.grass_on_soil.mask_127.variant_02.frame_00`,
not `mask_127.variant_2`; blob47/corner16 ids use the family's image basename,
`network.*`/`fill.*` ids use the short family key. Formats with examples:
`manifest.mappings.semanticIds`.

```
func blob_mask(cell: Vector2i, mat: int) -> int:
    var bits := [[1,Vector2i(0,-1)],[2,Vector2i(1,-1)],[4,Vector2i(1,0)],
                 [8,Vector2i(1,1)],[16,Vector2i(0,1)],[32,Vector2i(-1,1)],
                 [64,Vector2i(-1,0)],[128,Vector2i(-1,-1)]]
    var m := 0
    for b in bits:
        if connected(mat, cell + b[1]): m |= b[0]
    if m & 2   and not (m & 1 and m & 4):   m &= ~2     # NE
    if m & 8   and not (m & 16 and m & 4):  m &= ~8     # SE
    if m & 32  and not (m & 16 and m & 64): m &= ~32    # SW
    if m & 128 and not (m & 1 and m & 64):  m &= ~128   # NW
    return m
```

### 2.5 Connection rules (the complete table)

`connected(mat, neighbor_cell)` is true when any of these hold. Skipping rules
2-4 is the #1 cause of wrong shorelines:

1. The neighbor has the **same material**.
2. **Land runs flush to water**: if `mat` is any land terrain (grass, rock, dry
   grass, mud, muck, snow, ice, gravel, packed road, cracked earth, ash, basalt, cave dirt,
   cave stone, fungal, bog, corrupted ground) and the neighbor is water, shallow, deep, hot spring,
   lava, **or has a river flag** → connected. Land extends to the waterline; the
   water side draws the shore.
3. **The water group is one body**: water ⇄ shallow ⇄ deep all inter-connect
   (depth zones, no internal shorelines). Water/shallow/deep also connect to
   river-flagged cells (mouths merge) and to ice cells (floating sheets).
   Hot spring is deliberately NOT in this group — it keeps its own rim.
4. **Flush pairs**: snow ⇄ ice · ash ⇄ basalt · bog ⇄ muck · cave dirt ⇄ cave
   stone ⇄ fungal (all three inter-connect). No soil seams inside one biome
   surface.
5. The neighbor is **outside the loaded world** (blob47 and cliffs only; see
   2.11 for chunk streaming).
6. **The priority ladder — cross-material transitions**: every material has a
   priority in `mappings.transitions.matPriority`. If the neighbor's priority
   is HIGHER than `mat`'s and the pair is not in
   `transitions.gutterPairs` → connected: your region runs full-bleed under
   the higher neighbor, and the higher side draws its masked edge over an
   underlay of yours (2.6) — grass laps over gravel, snow lies onto grass,
   with no soil strip between. Rules 2-4 are special cases that beat the
   ladder. Sand (corner16) follows matPriority like everything else, but
   renders through the dual FIELD instead of blob masks — see 2.7 for how
   its field extends under higher-priority neighbors. **Trust
   `mappings.transitions`** — matPriority, flushPairs and gutterPairs are
   derived from the forge's actual connection function at export time.

### 2.6 The underlay (banks under water, the lower material under land edges)

Fill the underlay layer for EVERY cell:

- stone floor / cobble / dungeon floor / temple floor → their `fill.<key>` tile.
- water / shallow / deep / lava / ice / hot spring → the **dominant land
  neighbor's interior tile**: count the 4 in-world cardinal neighbors that are
  grass, dry grass, mud, bog, snow, gravel, packed road, ash, basalt, cave dirt, cave stone,
  fungal, sand, stone floor, dungeon floor, temple floor or rock; take the winner
  by count, ties broken in exactly that priority order. Render the winner as its
  mask-255 tile (sand: corner 15; the floors: their fill tile). No qualifying
  neighbor → `fill.soil`. (Any material not in that list deliberately banks on
  soil.)
- any other land cell → the **dominant strictly-lower-priority neighbor**
  (`transitions.matPriority`): scan all 8 surrounding cells, skip same
  material and `gutterPairs` partners; count cardinals DOUBLE,
  diagonals once; winner by count, ties to the lower priority, then the lower
  material id. **Open-side rule:** the winner must be a material that an
  OPEN side actually faces — collect the distinct materials across the 4
  CARDINAL neighbors that are strictly-lower, non-gutter and unconnected
  per 2.5. If any exist, pick the HIGHEST-priority of them (ties: the
  bigger 8-scan count, then the lower id) — a higher material's fringe on
  a lower side reads as its natural lap, while a lower material's fringe
  inside a higher mass reads as a hole. If none (diagonal-only contact),
  keep the unrestricted count — that is what fills the corner notch. Render
  the winner at mask 255 (sand: corner 15; floors: their fill tile). No
  qualifying neighbor → `fill.soil`. This is what shows in your edge band at
  a ladder seam (rule 6 of 2.5) — the lower material continuing beneath.
- everything else → `fill.soil`.

This is what makes a pond in a bog sit on bog, lava in ash sit on ash — and a
grass edge lap directly onto gravel with no soil strip.

### 2.7 Sand (corner16 dual grid)

Sand renders on its own layer offset +16 px in x and y. Dual points run from
(-1, -1) to (W-1, H-1); the dual point (x, y) samples exactly these four cells:
**TL = (x, y), TR = (x+1, y), BR = (x+1, y+1), BL = (x, y+1)** → bits TL=1,
TR=2, BR=4, BL=8. A cell counts as sand if its material is sand, OR it is
water/shallow **with at least one cardinal true-sand neighbor** (that rule makes
beaches run into the waves), OR it is any land material with a HIGHER
`matPriority` than sand **with at least one cardinal true-sand neighbor**
(the ladder, rule 6 of 2.5: the field extends one cell under the higher
neighbor so the marching band never cuts at the seam — the neighbor draws its
blob edge over a corner-15 sand underlay instead, per 2.6). Floors stay out
(sand's band laps over them). Out-of-world cells do NOT count as sand. Place
`terrain.sand_on_soil.corner_<mask>` so its top-left lands at pixel
(x*32+16, y*32+16); skip mask 0. Keep a 1-cell sand margin at streamed-chunk
borders (the dual row at -1 needs a real neighbor).

### 2.8 Networks, overlays, cliffs, decals

- **Networks** (river, pier, road, fence, wall): 4-bit port mask from the SAME
  layer's cardinal neighbors — N=1, E=2, S=4, W=8; **out-of-world neighbors do
  NOT connect** (unlike blob47 — a network run ends at the world edge with a
  closed cap). Two extra rules: **river also counts water/shallow/deep cells as
  connected** (river mouths open into lakes instead of ending in a capped port),
  and **wall counts cells of the `gate` structure (type 7) AND its state
  siblings (any structure whose `base` is 7 — the drawbridge and ruined
  gates) as connected** (wall runs meet
  gates flush). River draws under roads; pier and road make wet cells walkable
  (section 3).
- **The road, pier, fence and wall layers are typed**: one byte per cell —
  `mappings.roadTypes` (1 paved road + 3 ruined road — LEGACY, display-
  retired, listed in `mappings.roadTypesLegacy`; 2 dirt path — the live
  trail band), `mappings.pierTypes` (1 pier — narrow, posted; 2 boardwalk — wide
  flat deck; 3 jetty — stone mole, wider band swallows pier joins) and `mappings.fenceTypes` (1 town fence, 2 pen fence — split-rail
  paddock, 3 iron fence — spear-picket cemetery rail, 4 hedge — trimmed
  garden boundary) and `mappings.wallTypes` (1 stone city wall, 2 wooden
  palisade — sharpened lashed logs, 3 ruined wall — a breached crumbling
  run whose holes are transparent like ruined road's potholes, 4 seawall —
  cyclopean coastal armor; paint a run offshore and it reads as a
  breakwater, 5 cave wall — natural rock mass for cave/mine/fungal
  interiors, 6 dungeon wall — dressed dark masonry for crypt/sewer/temple
  interiors; interior walls are drawn one value step darker than their
  matching floors so runs never camouflage; all join gatehouses flush). Within a layer ALL types count as connected for each other's
  port masks (a dirt path tees into a paved road flush; a boardwalk meets a
  pier; a pen ties into a fence line); render each cell with its own type's
  family using the shared mask. **Where road types mix (legacy content), the
  shared cell takes the WIDER family** (road or ruined road over dirt path):
  a path teeing into a road works because the T cell is road-typed; a path
  CROSSING a road keeps the crossing cell road-typed too — a narrow-typed
  cell inside a wider run visually severs it (the wider band's open face
  steps down mid-run). Never butt-join a type switch mid-run either: switch
  types at a junction cell, or end one band and start the other a cell later
  (a deliberate trailhead gap). Road and pier types grant walkability the
  same way in section 3 (fences always block); only the LEGACY paved-road
  band bridges water — new routes cross on bridge STRUCTURES. Ruined-road
  potholes are transparent and show the terrain beneath.
- **Network runs are 1 cell wide by contract.** A net16 tile fills its center
  band plus arms toward connected edges only — diagonal corners stay open — so
  a filled 2×N block of any band family (road, path, pier, fence, wall, river)
  leaves a substrate square at every interior corner point. Do not generate
  wide roads on the road layer. A wide paved surface is an AREA: set the
  material to cobble (`fill.cobble` shares the old road palette, so any
  LEGACY band cells blend straight into it). A route that meets a plaza ENDS
  at the square rim — the cobble area itself carries passage (no marked
  lane). Wide water works the same way: paint the water material
  and let river runs merge into it (the river rule above). Dirt squares
  (market grounds, farmyards) are soil or gravel areas. **A road is a
  corridor of ground material, and nothing else**: paint a PACKED ROAD
  ribbon (mat 27 — the warm graded roadbed built for exactly this) 2-4
  cells wide along the route. **Do NOT lay the dark road band on top —
  the ROAD band is deprecated for display (ruling 2026-07-26)**: a 1-cell
  band reads as a line drawn on the map, which is the exact failure the
  corridor doctrine replaced; the road layer is being retired from route
  rendering and survives only as a legacy data layer (old saves, walkable
  marks). The route hierarchy, one recipe per class: trail = dirt path
  band alone (the faint dotted backtrail — the one band with a display
  job left) · street = packed road corridor 2 cells wide · highway =
  packed road corridor 3-4 wide + hashed rim lay-bys (keep the route legs
  STRAIGHT and let the corridor rim carry the organic read) · town street
  = cobble area · major river crossing = a bridge STRUCTURE
  (wbridge/sbridge) · minor crossing = the ford decal on shallow water.
  Soil and gravel corridors stay in the kit for character routes (farm
  lanes, quarry tracks). Corridors survive zoomed-out play; bands do not.
- **Ground overlays**: moss and tall grass are 0/1 flags on their own layers,
  masked like blob47 where any flagged neighbor connects (out-of-world:
  CONNECTED, exactly like blob47 -- border overlays stay full). Substrate rules: moss never on water-group or lava cells; tall
  grass only on grass or dry grass.
- **Cliffs**: for each cell with elevation > 0, the mask counts neighbors whose
  elevation is **>= this cell's** (out-of-world connected); normalize as blob47.
  Faces for drops of 2+ are a forge-render-only extra — treat tall cliffs as one
  step visually. **The cliff family is substrate-picked per cell**
  (`mappings.cliffBiomes`): materials 3/8/14 → `cliffsand`, 11/12 →
  `cliffsnow`, 15/16 → `cliffvolc`, everything else → `cliff`. Ramps mirror
  this with `rampFamilies` keyed the same way (reskin ids are namespaced,
  e.g. `ramp.sand_ramp.dir_n.variant_00`). Same masks, same rules — only the
  role-map changes.
- **Ramps** (elevation transitions): one byte per cell on its own layer —
  `type*8 + dir` (`mappings.rampTypes`: 1 earthen ramp, 2 stairs;
  `mappings.rampDirs` index = dir, the direction of **ascent**). A ramp cell
  must sit on dry land at the LOWER level with the neighbor toward `dir` at
  exactly elev+1 — single-step transitions only. Mask-free: place
  `ramp.<type>.dir_<n|e|s|w>` with a position-hashed variant, drawn above the
  cliff layer (the overdrawn rim reads as the cut). Ramp tiles carry an
  `ascend` custom-data string ("n"/"e"/"s"/"w") — see section 3 for what to
  do with it.
- **Crops**: one byte per cell on its own layer — `type*16 + stage` (types in
  `manifest.mappings.crops`: 1 wheat, 2 pumpkin, 3 corn, 4 grapes-trellis;
  stages 1-4 = planted/young/mature/harvested, names in `mappings.cropStages`). No masks:
  place `crop.<name>.stage_0<stage>` with a position-hashed variant, exactly
  like a fill tile. **The stage is game state** — your growth simulation
  rewrites the byte and re-places the tile; the forge just previews all four.
  Crop tiles never block (walkable: true) and sit above ground overlays, below
  networks. Art is inset 2 px from every tile edge, so adjacent field cells
  read as planting rows with furrow gutters — no seam matching needed.
- **Decals** (one id per cell): mask like blob47 but a neighbor connects only if
  it has the SAME decal id (out-of-world: CONNECTED, like blob47 -- a decal
  at the world border keeps its full art). Substrate rules:
  rapids/lilypads/stepping stones only on water-group or river cells; waterfall
  only on elevated cells; frost only on water/shallow/deep; ford (a walkable
  gravel crossing) only on water/shallow/river — never deep; driftwood on land
  incl. shallow; geyser on hot-spring or open-water cells (water/shallow/deep,
  never rivers); steam vent only on
  rock/gravel/cracked-earth/ash/basalt/cave floors; everything else (including
  the crater/spent-arrows/battle-gear war marks, the rune circle and the
  paving apron) only on
  dry land. Rapids, waterfall,
  geyser, steam vent, the rune circle and frost are animated — place the
  frame-0
  tile, the tileset animates. **Waterfall placement (worldgen):** put the
  decal on the face-row cell (elev>0) and RUN THE RIVER THROUGH that same
  cell — the curtain is sized to the river band and overlays it, so the
  stream pours visibly into the crest and continues (or lands in a pool)
  below; stack two vertically-adjacent decal cells for a tall fall, and
  paint E-W adjacent cells for a wide one. **Apron placement (worldgen):** the apron
  (23) dresses FLOOR|ground edges — lay short 2-4 cell runs on the ground
  cells alongside a stone/cobble/dungeon/temple floor edge, covering
  roughly 30-50% of the edge, never every cell: clustered runs with clean
  stretches read as wear; a continuous fringe reads as a border stroke.

### 2.9 Structures (metatiles)

Placed atomically: a structure occupies a w×h footprint (footprints in
`manifest.mappings.structures`); cell (cx, cy) of a structure renders tile
`structure.<name>_<cy*w+cx>` — and **every cell uses the variant of the anchor
cell** (the top-left cell of the footprint; pick its variant with a stable hash
of the anchor's coordinates), so internal seams always match. All cells block
except listed `pass` cells — e.g. the `gate` arch cells 1 and 4 (its
drawbridge and ruined siblings inherit them), every cell of the four bridges,
both cave-mouth cells, the mine shaft's entry row, the dock's working
deck (only its crane cell blocks), the stone circle's middle column
(the processional axis — you walk through the ring past the altar), the
den + crypt entry rows, the ruined temple's west/center steps (its
toppled-column cell blocks — collision follows the story), the giant
skeleton's open rib-gap cells (you walk between the titan's ribs; the
skull column and spine row block), and the portal's arch column (a
magical gate follows the gatehouse grammar). Always
per the `pass` array in
`mappings.structures` — trust the data, the examples here are not exhaustive.

### 2.10 Props

One per cell, bottom-center anchored. Ground part = `prop.<name>_ground` (or the
single part) at the cell; two-part props (oak, pine, lamp, birch, willow, dead
tree, fruit tree, palm, giant mushroom, pillar) also have `prop.<name>_over`, drawn on
the props-overhang layer at (x, y−1) as a normal full tile, **unmodified** —
the art already sits in that tile's lower half, so any extra offset creates a
floating head. Both parts must use the same variant. Blocking props: oak, pine,
birch, willow, dead tree, burned tree, fruit tree, palm, giant mushroom,
cactus, fallen log, beehive, signpost, milestone, bench, notice board, cart,
broken wagon, rock outcrop, ore vein, crystals, trough, coop, haybales,
log pile, chopping block, stone blocks, mine cart, gravestones, topiary,
flower bed, planter urn, sundial, spike barricade, banner, campfire,
watchfire, bollard, cargo crates, fishing boat, wreck, buoy, standing
stone, runestone, game rack, archery target, skull pole, loot pile, bone
pile, pillar, brazier, altar, abandoned wagon, lone grave, corrupted tree,
sacks, chest, baskets, table + chairs, cookfire, laundry line, firewood,
anvil, workbench, wheelbarrow, tool rack, rubble pile,
boulder, stump,
barrels, lamp, statue, rowboat.
Non-blocking: bush, flowers, sapling, mushrooms, ferns, desert shrub, snow
shrub, roots, leaf pile, reeds, cattails, fishnets, bedroll, broken
boards, ash pile.
(Machine-readable: each blocking ground part keeps the family's
`walkable: false`; non-blocking parts and every `_over` part carry a per-tile
`walkable: true` override — trust the tile data, not this prose.)

### 2.11 Streamed / chunked worlds

Masks must be computed with **real neighbor data across chunk borders** — if you
evaluate a chunk in isolation, rule 5 of 2.5 fires at every chunk edge and
re-loading the neighbor changes the tiles, so borders visibly pop. Either keep a
1-cell data apron per chunk, or re-mask border cells when a neighbor chunk loads.
The margin applies to MASKS only (they read neighbors): variant/tone selection
(2.4) is pure coordinate math — `pick_variant`/`tone_at` need no margin and
never change when a neighbor chunk loads. For minimap / far-zoom rendering,
skip tiles entirely and paint each cell `mappings.minimap[mat]` — the
per-theme representative hex the manifest ships per material id.

### 2.12 Animation

Every animated family has 4 frames at 180 ms -- water, shallow, deep, hot
spring, lava, river, rapids, waterfall, geyser, steam vent, the rune
circle and frost (a slow sparkle twinkle; its ice skin stays still).
**Trust `frames: 4` in the manifest family entries, not this
list.** Playback runs in TWO groups:

- **Per-cell phase (standing water / area / single-cell features):** water,
  shallow, deep, lava, hotspring, geyser, steamvent, frost. Offset each
  CELL's
  cycle by a stable position hash -- `frame = (int(t / 0.18) + hash(x, y))
  % 4` -- so neighbors animate out of step and the sea never ticks
  1-2-3-4-reset in unison. Any phase mix is seam-safe: edge contracts hold
  per frame. The shipped `tileforge_importer.gd` does this natively via
  `TILE_ANIMATION_MODE_RANDOM_START_TIMES`.
- **Global clock (coherent motion):** river, rapids, waterfall, runecircle.
  These read as flow or as one multi-cell glyph -- desyncing their cells
  breaks the motion. One clock: `frame = int(t / 0.18) % 4`.

Caveat: Tiled's own preview plays every animation on the global clock (its
format has no per-cell phase), so map.tmj previews show the synchronized
look; implement the per-cell offset in your renderer.

### 2.13 Authoring a map.tmj from scratch (for map-generating AIs)

You can author new maps two ways. **The reliable way**: write the raw grid
layers (the map-data.json schema — mat/road/fence/wall/river/moss/tall/
pier/decal/prop/crop/meta/elev/ramp) and derive the tmj exactly as the
forge does; every rule you need is section 2. **The direct way**: write the
map.tmj yourself. Either way, these are the traps:

1. **Copy the `tilesets` block (sources + firstgids) verbatim from the
   shipped map.tmj** — it is data, not spec; firstgids are contiguous in a
   fixed family order and nothing else documents them.
2. **The underlay layer is baked by the AUTHOR** (rule 2.6): every wet cell
   and every land cell bordering a lower-priority neighbor needs its
   underlay tile placed by you. Consumers of your map never compute it.
3. **Typed layers resolve per cell**: the road/pier/fence/wall byte picks
   the FAMILY (mappings.roadTypes etc.), the port mask picks the tile —
   both from section 2.8. Different types of one layer inter-connect for
   masks but each cell renders its own type's family.
4. **Ramps and elevation live in map-data.json** — cliff gids cannot
   reconstruct heights. If you author elevation, ship the sidecar too, and
   keep every ramp single-step with a valid ascent neighbor (2.8).
5. **Structures are placed atomically**: expand each to its full w×h cell
   block (`structure.<name>_<cellIndex>` with cellIndex = cy*w + cx), one
   variant for the whole footprint (hash the anchor), no overlaps.
6. **Sand may not touch row 0 or column 0** — its −1 dual row/column
   cannot be stored in the tmj (2.7). Keep 1 cell of margin (the world
   edge on the right/bottom is fine: out-of-world is not sand).
7. **Props**: ground part at the cell; if the species has an `_over` part,
   place it at (x, y−1) on the props-overhang layer, same variant.
8. **Never set Tiled flip bits** on any gid — every tile is authored with
   fixed NW light and edge contracts; the importers do not mask flips.

Compositing model, stated plainly: painter's algorithm in the 2.2 layer
order, binary alpha (a pixel is fully opaque or fully absent), no blending,
no per-layer tinting.

---

## 3. Gameplay data at runtime

Every tile carries custom data: `semantic_id` (String), `walkable` (bool, with
per-tile overrides), `hazard` ("" / `thin-ice` on ice + frost / `scalding` on
hot spring + geyser + steam vent / `current` on rapids), `depth` ("" / shallow /
normal / deep), `swim`, `wade` (bool).

**The walkability ladder** — evaluate per cell, first hit wins; this reproduces
the forge's collision view exactly:

1. structure cell present → its `walkable` (gate passages true, all else false)
2. blocking prop present → blocked
3. fence or wall present → blocked
4. any road-layer type present (road, dirt path, ruined road) → walkable. Any
   pier-layer type present (pier, boardwalk, jetty) → walkable **unless the ground is
   lava** (a pier may be drawn over lava but does not unblock it; only the
   road layer bridges lava).
5. walk-granting decal (stepping stones, frost, ford — `walkable` true on the
   decal tile) over water/river → walkable (frost still carries
   `hazard: thin-ice`; ford carries `wade`)
6. the waterfall decal → blocked (cascading water: its tiles ship
   `walkable: false` and the Godot importer gives them colliders — the one
   decal that REMOVES walkability from otherwise-walkable ground)
7. river present → blocked
8. otherwise → the terrain tile's `walkable` (water, deep, hot spring, lava,
   rock, muck are false; the rest true)

**Elevation is opt-in.** The base contract stays flat: cliffs are visual and
every level is walkable — nothing above changes if you ignore elevation. A game
that wants cliff gameplay adds the **elevation profile** on top (this is a
game-side movement rule; per-tile `walkable` cannot express blocking BETWEEN
cells, so the engine deliberately does not encode it):

- block any cardinal step where `elev(a) != elev(b)`, UNLESS the lower cell
  has a ramp whose `ascend` custom data points at the higher cell;
- diagonal steps across an elevation change are always blocked;
- ramps only ever span one step (the forge validates this at export).

```gdscript
func can_step(a: Vector2i, b: Vector2i) -> bool:
    if not is_walkable(b): return false
    var da := elev(a); var db := elev(b)
    if da == db: return true
    if a.x != b.x and a.y != b.y: return false      # diagonal across a change
    var lo := a if da < db else b
    var hi := b if da < db else a
    if absi(da - db) != 1: return false
    var r := _data("ramps", lo)
    if r == null: return false
    var d := String(r.get_custom_data("ascend"))
    var to_hi := hi - lo
    return (d == "n" and to_hi == Vector2i(0, -1))         or (d == "e" and to_hi == Vector2i(1, 0))         or (d == "s" and to_hi == Vector2i(0, 1))         or (d == "w" and to_hi == Vector2i(-1, 0))
```

For landmark chunks, `map-data.json` in the package carries EVERY raw
grid layer of the exported map (mat, road, fence, wall, river, moss, tall,
pier, decal, prop, crop, meta, elev, ramp — row-major ints), so heights,
materials and every typed layer are recoverable without parsing gids. Procedural worlds
use their own elevation field and never need it.

```gdscript
func is_walkable(cell: Vector2i) -> bool:
    var s := _data("structures", cell)
    if s: return s.get_custom_data("walkable")
    var p := _data("props", cell)
    if p and not p.get_custom_data("walkable"): return false
    if _data("fence", cell) or _data("wall", cell): return false
    if _data("road", cell): return true
    var t := _data("terrain", cell)
    var on_lava := t != null and String(t.get_custom_data("semantic_id")).begins_with("terrain.lava")
    if _data("pier", cell) and not on_lava: return true
    var d := _data("decals", cell)
    var wet := t != null and not t.get_custom_data("walkable")
    if d and d.get_custom_data("walkable") and (wet or _data("river", cell)):
        return true
    if _data("river", cell): return false
    if t: return t.get_custom_data("walkable")
    var u := _data("underlay", cell)
    return u == null or u.get_custom_data("walkable")

func _data(layer: String, cell: Vector2i) -> TileData:
    return layers[layer].get_cell_tile_data(cell) if layers.has(layer) else null
```

**Physics caveat**: collision polygons exist on every non-walkable tile, including
water under piers, stones and frost. Move actors with the ladder above, or strip
the terrain collider where a higher layer grants walkability.

(GDScript here is written against the generated tileset but not executed in
Godot — if the editor flags anything, trust Godot and adjust.)

---

## 4. Acceptance test — prove your renderer is forge-identical

The package ships `map-reference.png`: the forge's own frame-0 render of
`map.tmj`. Verify a custom renderer in two steps:

1. Draw `map.tmj` through your pipeline using its **stored gids** (layer order
   and offsets from 2.2, gid math from FORMATS.md, animation held at frame 0) and
   pixel-diff against `map-reference.png`. **Zero differing pixels** proves your
   compositing, layer order, offsets and gid resolution.
2. Feed the same pipeline from section 2's mask algorithm instead of stored gids
   and compare the **masks** you derive against the stored ones. Variant picks
   will differ from the forge's internal hash (both valid); masks must not.

Honesty note: a package's map exercises whatever was on the workbench at
export time. The forge's showcase pattern produces a FULL-COVERAGE map
(every family, network type, decal, crop stage, ramp code, structure and
prop) — if your map.tmj covers few families, ask for a showcase export;
pixel-matching its reference proves the complete catalog.8 cover the
content it doesn't show. A full-coverage reference map is planned.

Godot note: the tileset's terrain peering bits describe same-family adjacency
only — Godot's terrain paint tool cannot express the 2.5 cross-material flush
rules (grass painted beside water gets a shoreline ring instead of running
flush). Terrain tools are fine for blocking out; forge-identical output comes
from the section-2 code path.

## 5. Landmark chunks (the secondary path)

Compose set pieces in the forge (fishing pond, walled city), export, then run
`tileforge_map_importer.gd` (Godot 4.3+) — it rebuilds `map.tmj` as
`res://tileforge/map.tscn` with the exact layer stack of 2.2. Stitch it into the
world as a scene, or use it as the visual reference for your renderer.

## 6. Tiled and Unity

- **Tiled**: open `map.tmj` directly; wang sets paint terrain; animations play.
  Keep the 1-cell sand margin when stitching.
- **Unity**: **known limitation** — the bundled `TileForgeImporter.cs` predates
  the keyed `families` manifest format and cannot parse it as shipped (and it
  only covered blob47 RuleTiles). Treat Godot and Tiled as the supported paths;
  a Unity consumer should read `tileforge-manifest.json` with a real JSON
  library and build RuleTiles from `mappings` + `families`.

## 7. Troubleshooting

| symptom | cause | fix |
|---|---|---|
| hard rectangular edges between materials | interior tiles stamped region-wide | per-cell masks (2.4) |
| same 32 px pattern wallpapering | one variant everywhere | `hash(x,y) % variants` (2.4) |
| pond looks like soap bubbles | each cell placed as mask 0 | connected masks over the body (2.4-2.5) |
| shoreline ring shows plain soil | underlay skipped or wrong priority | bank algorithm (2.6) |
| beach stops dead at the water | sand shoreline rule missing | corner rule in 2.7 |
| beaches shifted one cell diagonally | wrong dual-point sampling | exact convention in 2.7 |
| river ends in a capped port at a lake | river↔water connection missing | 2.8 networks |
| lamp/tree head floats above trunk | overhang offset added | draw `_over` at (x, y−1) unmodified (2.10) |
| tile lookups miss (no such id) | ids built from prose, unpadded | use `mappings.semanticIds` (2.3) |
| chunk borders pop when neighbors load | masks computed per-chunk | data apron / re-mask (2.11) |
| water animates out of sync | per-tile clocks | one global 180 ms clock (2.12) |
| walk into water beside a pier | physics colliders, not the ladder | section 3 caveat |

## 8. Limits worth knowing

Multi-story cliff faces (drops ≥ 2) are forge-render-only; one decal per cell;
hot springs never merge with the water group; manifest `formatVersion` is 1 —
if a future package bumps it, re-import rather than mixing exports.

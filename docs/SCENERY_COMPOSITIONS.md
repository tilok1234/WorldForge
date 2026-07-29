# Scenery compositions — pack content assessment (2026-07-29)

A full inventory of the pinned dusk package
(`dusk-ae1eecb-seed103991`) against what WorldForge actually
generates today, and a catalog of candidate scenery COMPOSITIONS —
multi-piece arrangements in the church+graveyard mold (behavior 59's
quarter machinery made these cheap to add). Written for the designer's
parallel pass; merge your own findings into §3.

Legend: **UNUSED** = art exists in the package, nothing in WorldForge
ever places it. All names are package families from
`tileforge-manifest.json`.

## 1. Inventory — what the package has vs what we place

### Structures (52 in package, 46 rostered)

Everything is rostered EXCEPT:

| art | size | note |
| --- | --- | --- |
| `gate` (pristine) | 3x2, pass arch | the city-walls lever's front door |
| `gate_drawbridge` | 3x2, pass arch | moat/water variant of the same |
| `wbridge`/`wbridgev`/`sbridge`/`sbridgev` | 3x1/1x3 | placed indirectly by route crossings — not placeable as scenery pieces yet (a stone bridge as a LANDMARK, e.g. a ruined span, is open) |

### Props (88 in package, 68 rostered)

**UNUSED (20):** `lamp`, `barrels`, `bench`, `noticeboard`,
`tablechairs`, `cookfire`, `laundryline`, `anvil`, `workbench`,
`baskets`, `coop`, `topiary`, `planterurn`, `sundial`, `bollard`,
`fishingboat`, `abandonedwagon`, `leafpile`, `palm`, `rubblepile`.

Note the shape of that list: it is almost entirely the LIVED-IN layer —
street furniture, workshop interiors, dockside clutter, formal-garden
dressing. The wilderness roster is essentially complete; the
settlement-life roster is where the pack is under-exploited.

### Ground materials (28 in package, ~14 in the semantic palette)

**UNUSED families:** `stone` (dressed floor), `templefloor`,
`dungeonfloor`, `cavedirt`, `cavestone`, `crackedearth`, `ash`,
`basalt`, `lava`, `ice`, `bog`, `hotspring`, `fungal`, `corrupt`.

Two clusters: an UNDERGROUND/INTERIOR vocabulary (cave, dungeon,
temple floors + their wall families) and an EXTREME-BIOME vocabulary
(volcanic ash/basalt/lava, true ice, peat bog, hot springs, fungal and
corrupt ground). Each would be a real generator arc, not a dressing
pass — but the art is sitting there.

### Walls (6) / fences (4) / piers (3)

- Walls used: `wall` (landmark fortresses), `palisade` (bandit camps),
  `ruinedwall` (ruined city). **UNUSED: `seawall`, `cavewall`,
  `dungeonwall`.**
- Fences used: `penfence`, `ironfence`. **UNUSED: `fence` (plain
  wood), `hedge`.**
- Piers used: `pier`. **UNUSED: `boardwalk`, `jetty` (stone).**

### Decals (23, 19 reachable)

Authored or auto-placed today: leaves, puddles, lilypads, driftwood,
rubble, crater, arrows, battle_gear, bones, scorch, cracks, webs,
rune_circle, crystal_field, steam_vent, ford, waterfall, rapids,
apron. **UNUSED: `blood`, `steppingstones`, `frost`, `geyser`.**

### Crops (4) and other

Crops used: wheat, pumpkin, corn. **UNUSED: `grapes`.** Crop stages
(planted→harvested) exist and are used. Ramps used; **`stairs`
UNUSED.** Road/path/ruined-road bands: all three in service.

## 2. The composition patterns we already own

Every idea in §3 maps onto machinery that exists today:

- **QUARTER** (behavior 59): a reserved square inside a settlement,
  keep-outs via laneSet, furniture with verified lanes + rollback.
  Church+graveyard, market, greens shipped this way.
- **POI** (decoration/pois.ts): a wilderness site with placement
  rules, protected trails (behavior 47), optional structure.
  Hunter camp, witch hut, bandit camp shipped this way.
- **WATERLINE** (behavior 60): ring-scan against water + carved
  approach lane. Docks shipped this way.
- **FARM EXTENSION**: the farmhouse/field/pen planner already rolls
  outbuildings — new pieces slot into its tables.
- **DRESSING PASS** (decoration): decals + props keyed off existing
  geometry (yards, shores, battle sites).

## 3. Composition catalog

Ordered roughly by (visual payoff / effort). ✓ = shipped already.

### Settlement life (QUARTER or dressing; the biggest gap)

1. ✓ **Smithy yard** (behavior 61) — anvil, workbench, tool rack, and
   firewood on the smithy's free perimeter cells, walked clockwise
   from past the entrance (doorways stay clear). PLACEMENT DOCTRINE:
   default-on wherever a smithy stands — completing an existing
   building, like plaza furniture.
2. ✓ **Tavern terrace** (behavior 61) — two table sets, barrels, a
   lamp, and a laundry line on the tavern perimeter, same ring rule.
   Default-on.
3. ✓ **Market upgrade** (behavior 61) — noticeboard, bench, and
   baskets on the market square's frame corners (middle stays clear
   for the stall row). Rides urbanBlocks with the rest of b59.
4. **Manicured plaza / manor garden** — `topiary` + `planterurn` +
   `sundial` + `hedge` fence + `flowerbed`. Hedge is a whole unused
   FENCE family; manor + garden = instant wealth signal.
5. **Chicken run** — `coop` + `penfence` + `trough` beside
   farmhouses. One new prop in the pen-planner tables.
6. **Vineyard** — `grapes` crop rows + plain `fence` + a farmhouse.
   An entire unused crop; warm-climate farm variant.
7. ✓ **Street lamps** (behavior 61) — lamps seated BESIDE city-lane
   band cells (never on them), spaced, cities 10 / towns 4 / outposts
   dark. PLACEMENT DOCTRINE: pathLayer CITY_LANE only, so wilderness
   trails never lamp and style-free worlds are untouched; plaza-edge
   lamps and a broader "everywhere" ruling stay OPEN (§4).
8. ✓ Church + graveyard, market + stalls + well, greens (b59).

### City edge (the parked lever, now with named art)

9. ✓ **City walls + gates** (behavior 62) — stone `wall` circuit +
   the pristine `gate` gatehouse (arch pass [1,4]) on north/south
   through-streets. PLACEMENT DOCTRINE: opt-in
   `settlementStyle.cityWalls`, CITIES only; the radius is chosen to
   MAXIMIZE fittable gatehouses ("the wall stands where its gates
   can") with streets crossing at least three sides; every street
   crossing is an opening (b47 outranks the wall); water, rivers, and
   rock break the circuit (open waterfront); scatter houses beyond it
   are suburbs outside the walls. East/west crossings stay plain
   openings — the package has no vertical gate art (UPSTREAM ASK:
   east/west gatehouse variant; `gate_drawbridge` also still unused,
   wants a wall-over-water case).
10. **Guard post** — `guardhouse` + `banner` + `brazier` +
    `archerytarget` at gates/bridge ends. Furniture only.

### Waterfront (WATERLINE pattern, docks proved it)

11. **Harbor row** — dock ✓ + `fishingboat` moored + `bollard` +
    `crates`/`fishnets` on the shore row + `jetty` (stone pier) for
    city harbors vs wooden `pier` for villages.
12. **Boardwalk shore** — `boardwalk` pier family along swamp/fen
    settlement waterlines instead of plank piers.
13. **Seawall front** — `seawall` along city coast edges (pairs with
    walls+gates for a fortified port look).
14. **Lighthouse point** — lighthouse ✓ + `seawall` spur + `bollard`
    + `buoy` line offshore.
15. **Shipwreck cove** — `wreck` ✓ + `driftwood` + `crates` +
    `lootpile` on a beach arc (POI pattern; pieces all rostered, just
    never composed).

### Farmland (FARM EXTENSION)

16. **Windmill hill** — `windmill` on open high ground + wheat
    fields + `haybales` + `cart`. Windmill is rostered (b49 variety)
    but places without its supporting cast.
17. **Orchard** — `fruittree` grid + `beehive` + `baskets` + plain
    `fence`. Fruit trees exist scattered; the ORCHARD is the
    composition.
18. **Watermill reach** — `watermill` ✓ + `ford`/`steppingstones`
    crossing + willow pair. Stepping stones are unused ford-class
    art.

### Wilderness set pieces (POI pattern)

19. **Logging camp** — `sawmill` + `stump` field + `logpile` +
    `choppingblock` + `cart`. Sawmill rostered, never staged.
20. **Battlefield** — existing arrows/battlegear/bones + **`blood`**
    decal + `brokenwagon` + `banner`. Blood is unused; one table row.
21. **Processional way** — `standingstone` pairs marching to the
    `stonecircle` + `runestone` + `rune_circle` decal. All rostered,
    composition only.
22. **Hot-spring glade** — `hotspring` material pool + `steam_vent` +
    `frost` ring (both unused) in snow biomes. First toe into the
    extreme-biome vocabulary, small enough to pilot.
23. **Geyser field** — `geyser` + `gravel` + `steam_vent` (dust/ash
    country cousin of 22).
24. **Corrupt grove** — `corrupt` ground patch + `corruptedtree` +
    `webs` + `fungal` fringe. The dark-forest set piece; material
    bump required.
25. **Hermit garden** — `hermithut` ✓ + `flowerbed` + `beehive` +
    `laundryline`. Humanizes the lone hut.

### Bigger arcs the art already supports (note, don't schedule)

26. **Underground layer** — `cavemouth`/`mineshaft` doors already
    open (WYSIWYG); `cavedirt`/`cavestone`/`cavewall` +
    `dungeonfloor`/`dungeonwall` + `stairs` ramps are a complete
    interior vocabulary waiting for a cave/dungeon zone arc.
27. **Temple precinct** — `ruintemple` + `templefloor` courts +
    `pillar` rows + `brazier`. Landmark-compound pattern.
28. **Volcanic / true-ice / bog climates** — `ash`/`basalt`/`lava`,
    `ice`, `bog` grounds with their cliff+ramp biome variants
    (`cliffvolc`, `rampsnow`, ...) — future climate-library entries.

## 4. Open questions for the designer pass

- Which of §3 reads as DUSK-WORLD canon vs off-theme? (e.g. blood
  decals, corrupt grove — tone call.)
- Street lamps: everywhere, cities-only, or plaza-only?
- Walls+gates: every city, or a settlementStyle flag like quarters?
- Any compositions you spotted that this list missed — add them here.

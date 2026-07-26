TileForge package — generated tile system
seed 103991 · theme forest · 6 terrain variants (net16 2, fills+ramps+crops 4) · mode coordinated

Contents:
  *.png                     atlases (one per family, 32px tiles)
  *.tsj                     Tiled tilesets (wang sets on terrain families)
  map.tmj                   the current workbench map as a Tiled map
  map-reference.png         frame-0 ground-truth render of map.tmj (acceptance test)
  map-data.json             ALL raw grid layers of the map (editable source)
  tileforge-manifest.json   engine-neutral manifest (ids, masks, atlas coords)
  tileforge_importer.gd     Godot 4.2+ EditorScript — builds tileforge.tres
  tileforge_map_importer.gd Godot 4.3+ EditorScript — builds map.tscn from map.tmj
  tileforge_worldgen_example.gd  runnable procedural-worldgen reference (guide section 2)
  TileForgeImporter.cs      Unity importer (KNOWN LIMITATION: predates the keyed manifest — see GAME-GUIDE section 6)
  GAME-GUIDE.md             full game-integration guide (start here)
  FORMATS.md                format reference for custom importers
  validation-report.json    last validation run

Godot quick start (the map appears in-game exactly as in the forge editor):
  1. copy this tileforge/ folder into your project as res://tileforge/
  2. open tileforge_importer.gd, File > Run  -> tileforge.tres
     (atlas sources, native 4-frame animations, collision, terrain peering,
      custom data: semantic_id / walkable / hazard / depth / swim / wade)
  3. open tileforge_map_importer.gd, File > Run -> map.tscn
     (full layer stack in editor draw order; animations play in-game)

Semantic IDs are authoritative; atlas coordinates are derived.
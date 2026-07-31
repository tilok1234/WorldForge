@tool
extends EditorScript
# TileForge map importer — generated from seed 103991 · theme dusk
# Rebuilds the forge workbench map as res://tileforge/map.tscn: one TileMapLayer
# per exported layer in the exact editor draw order (underlay -> props-overhang,
# sand as a half-cell offset layer), so the scene renders in-game pixel-identical
# to the forge, animations included. Collision and custom data ride in from the
# tileset. Requires Godot 4.3+ (TileMapLayer) and a prior run of
# tileforge_importer.gd (File > Run) so tileforge.tres exists.

const ROOT := "res://tileforge/"

func _run() -> void:
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ROOT + "tileforge-manifest.json"))
	var tmj: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ROOT + "map.tmj"))
	var ts: TileSet = load(ROOT + "tileforge.tres")
	if ts == null:
		push_error("TileForge: run tileforge_importer.gd first (tileforge.tres missing)")
		return
	# atlas sources were added in manifest.families order; map image basename -> source id + fam meta
	var by_base := {}
	var si := 0
	for fam_id in manifest.families:
		var fam: Dictionary = manifest.families[fam_id]
		var base: String = String(fam.image).get_basename()
		by_base[base] = {
			"sid": ts.get_source_id(si),
			"frames": int(fam.get("frames", 1)),
			"cols": int(fam.atlas.get("columns", 12)),
		}
		si += 1
	# tmj tilesets: firstgid + source "<file>.tsj" — sort descending for gid lookup
	var sets := []
	for t in tmj.tilesets:
		sets.append({"first": int(t.firstgid), "base": String(t.source).get_basename()})
	sets.sort_custom(func(a, b): return a.first > b.first)
	var root := Node2D.new()
	root.name = "TileForgeMap"
	for lay_d in tmj.layers:
		var lay := TileMapLayer.new()
		lay.name = String(lay_d.name)
		lay.tile_set = ts
		lay.position = Vector2(float(lay_d.get("offsetx", 0)), float(lay_d.get("offsety", 0)))
		root.add_child(lay)
		lay.owner = root
		var w: int = int(lay_d.width)
		var data: Array = lay_d.data
		for i in data.size():
			var gid: int = int(data[i])
			if gid == 0:
				continue
			for s in sets:
				if gid >= s.first:
					var fam: Dictionary = by_base[s.base]
					var frames: int = fam.frames
					var cols: int = fam.cols
					var local: int = gid - s.first
					if frames > 1:
						local -= local % frames # animation lives on the frame-0 tile
					var cell := Vector2i(i % w, int(i / float(w)))
					lay.set_cell(cell, fam.sid, Vector2i(local % cols, int(local / float(cols))))
					break
	var packed := PackedScene.new()
	packed.pack(root)
	ResourceSaver.save(packed, ROOT + "map.tscn")
	print("TileForge: map.tscn saved — ", tmj.layers.size(), " layers")
extends SceneTree
# Verifies the tileforge.tres built by the PACKAGED importer against the
# manifest contract (W7 entry gate 1, importer leg): every frame-0 tile
# exists at its atlas position with the manifest's semantic_id, walkability
# (with per-tile overrides), hazard/depth/swim/wade family data, collision on
# non-walkable tiles, 4-frame animation on animated families, and blob47
# terrain peering bits matching the tile mask. Trusts the data, not prose.

const TILE := 32


func _init() -> void:
	var manifest: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string("res://tileforge/tileforge-manifest.json")
	)
	var ts: TileSet = load("res://tileforge/tileforge.tres")
	if ts == null:
		push_error("tileforge.tres missing: run import_tileforge.gd first")
		quit(1)
		return
	var errors := 0
	var tiles_checked := 0
	var source_index := 0
	var terrain_index := 0
	if ts.get_source_count() != manifest.families.size():
		push_error("source count %d != family count %d" % [ts.get_source_count(), manifest.families.size()])
		errors += 1
	for fam_id in manifest.families:
		var fam: Dictionary = manifest.families[fam_id]
		var pad: int = int(fam.atlas.get("padding", 0))
		var cell: int = TILE + pad * 2
		var frames: int = int(fam.get("frames", 1))
		var src: TileSetAtlasSource = ts.get_source(ts.get_source_id(source_index))
		var fam_terrain := -1
		if fam.kind == "blob47":
			fam_terrain = terrain_index
			terrain_index += 1
		for t in fam.tiles:
			if frames > 1 and int(t.get("frame", 0)) > 0:
				continue
			var coords := Vector2i(
				int((int(t.atlas[0]) - pad) / float(cell)),
				int((int(t.atlas[1]) - pad) / float(cell))
			)
			if not src.has_tile(coords):
				push_error("%s: no tile at %s (%s)" % [fam_id, coords, t.id])
				errors += 1
				continue
			var td := src.get_tile_data(coords, 0)
			var walk: bool = bool(t.get("walkable", fam.walkable))
			if String(td.get_custom_data("semantic_id")) != String(t.id):
				push_error("%s: semantic_id %s != %s" % [fam_id, td.get_custom_data("semantic_id"), t.id])
				errors += 1
			if bool(td.get_custom_data("walkable")) != walk:
				push_error("%s: walkable mismatch" % t.id)
				errors += 1
			if String(td.get_custom_data("hazard")) != String(fam.get("hazard", "")):
				push_error("%s: hazard mismatch" % t.id)
				errors += 1
			if String(td.get_custom_data("depth")) != String(fam.get("depth", "")):
				push_error("%s: depth mismatch" % t.id)
				errors += 1
			if bool(td.get_custom_data("swim")) != bool(fam.get("swim", false)):
				push_error("%s: swim mismatch" % t.id)
				errors += 1
			if bool(td.get_custom_data("wade")) != bool(fam.get("wade", false)):
				push_error("%s: wade mismatch" % t.id)
				errors += 1
			if String(td.get_custom_data("ascend")) != String(t.get("ascend", "")):
				push_error("%s: ascend mismatch" % t.id)
				errors += 1
			var polys := td.get_collision_polygons_count(0)
			if walk and polys != 0:
				push_error("%s: walkable tile has collision" % t.id)
				errors += 1
			if not walk and polys != 1:
				push_error("%s: blocking tile lacks collision" % t.id)
				errors += 1
			if frames > 1 and src.get_tile_animation_frames_count(coords) != frames:
				push_error("%s: animation frames %d != %d" % [t.id, src.get_tile_animation_frames_count(coords), frames])
				errors += 1
			if fam_terrain >= 0:
				if td.terrain_set != 0 or td.terrain != fam_terrain:
					push_error("%s: terrain %d != %d" % [t.id, td.terrain, fam_terrain])
					errors += 1
				var mask: int = int(t.mask)
				var bits := {
					1: TileSet.CELL_NEIGHBOR_TOP_SIDE,
					2: TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER,
					4: TileSet.CELL_NEIGHBOR_RIGHT_SIDE,
					8: TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER,
					16: TileSet.CELL_NEIGHBOR_BOTTOM_SIDE,
					32: TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER,
					64: TileSet.CELL_NEIGHBOR_LEFT_SIDE,
					128: TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER,
				}
				for bit in bits:
					var expected: int = fam_terrain if (mask & bit) else -1
					if td.get_terrain_peering_bit(bits[bit]) != expected:
						push_error("%s: peering bit %d wrong" % [t.id, bit])
						errors += 1
			tiles_checked += 1
		source_index += 1
	print("verify_tileset: %d frame-0 tiles checked across %d families, %d errors" % [
		tiles_checked, manifest.families.size(), errors
	])
	quit(0 if errors == 0 else 1)

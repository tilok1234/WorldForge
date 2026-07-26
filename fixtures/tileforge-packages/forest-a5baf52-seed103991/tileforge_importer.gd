@tool
extends EditorScript
# TileForge tileset importer — generated from seed 103991 · theme forest
# 1. Copy the exported tileforge/ folder into your project as res://tileforge/
# 2. Open this script in the editor and run it (File > Run, Ctrl+Shift+X).
# It builds res://tileforge/tileforge.tres through Godot's own APIs:
# one atlas source per family, native 4-frame tile animation for the water
# group and animated decals, square collision on non-walkable tiles, terrain
# peering bits for blob47 families, and custom data (semantic_id, walkable,
# hazard, depth, swim, wade) on every tile.
# Requires Godot 4.2+. Run tileforge_map_importer.gd afterwards for map.tscn.

const TILE := 32
# R1b: standing-water / area animations start at a random per-cell phase
# (kills the whole-sea 1-2-3-4 metronome tick). Coherent-motion families
# (river, rapids, waterfall, runecircle) stay synchronized on purpose -
# flow and multi-cell glyphs break if their cells desync.
const DESYNC := ["water", "shallow", "deep", "lava", "hotspring", "geyser", "steamvent", "frost"]
const MANIFEST := "res://tileforge/tileforge-manifest.json"
const CUSTOM := ["semantic_id", "walkable", "hazard", "depth", "swim", "wade", "ascend"]

func _run() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)
	ts.add_physics_layer(0)
	ts.add_terrain_set(0)
	ts.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
	for ci in CUSTOM.size():
		ts.add_custom_data_layer(ci)
		ts.set_custom_data_layer_name(ci, CUSTOM[ci])
		ts.set_custom_data_layer_type(ci, TYPE_STRING if ci in [0, 2, 3, 6] else TYPE_BOOL)
	for fam_id in data.families:
		var fam: Dictionary = data.families[fam_id]
		var pad: int = int(fam.atlas.get("padding", 0))
		var cell: int = TILE + pad * 2
		var frames: int = int(fam.get("frames", 1))
		var src := TileSetAtlasSource.new()
		src.texture = load("res://tileforge/" + fam.image)
		src.texture_region_size = Vector2i(TILE, TILE)
		src.margins = Vector2i(pad, pad)
		src.separation = Vector2i(pad * 2, pad * 2)
		ts.add_source(src)
		var terrain := -1
		if fam.kind == "blob47":
			terrain = ts.get_terrains_count(0)
			ts.add_terrain(0, terrain)
			ts.set_terrain_name(0, terrain, fam_id)
		for t in fam.tiles:
			if frames > 1 and int(t.get("frame", 0)) > 0:
				continue # frame cells are claimed by the frame-0 tile's animation
			var coords := Vector2i(int((int(t.atlas[0]) - pad) / float(cell)), int((int(t.atlas[1]) - pad) / float(cell)))
			src.create_tile(coords)
			if frames > 1:
				src.set_tile_animation_columns(coords, 0) # frames extend rightward
				src.set_tile_animation_frames_count(coords, frames)
				if fam_id in DESYNC:
					src.set_tile_animation_mode(coords, TileSetAtlasSource.TILE_ANIMATION_MODE_RANDOM_START_TIMES)
				for fi in frames:
					src.set_tile_animation_frame_duration(coords, fi, 0.18)
			var td := src.get_tile_data(coords, 0)
			if terrain >= 0:
				td.terrain_set = 0
				td.terrain = terrain
				_apply_peering(td, int(t.mask), terrain)
			var walk: bool = bool(t.get("walkable", fam.walkable))
			td.set_custom_data("semantic_id", String(t.id))
			td.set_custom_data("walkable", walk)
			td.set_custom_data("hazard", String(fam.get("hazard", "")))
			td.set_custom_data("depth", String(fam.get("depth", "")))
			td.set_custom_data("swim", bool(fam.get("swim", false)))
			td.set_custom_data("wade", bool(fam.get("wade", false)))
			td.set_custom_data("ascend", String(t.get("ascend", "")))
			if not walk:
				td.add_collision_polygon(0)
				td.set_collision_polygon_points(0, 0, PackedVector2Array([
					Vector2(-16,-16), Vector2(16,-16), Vector2(16,16), Vector2(-16,16)]))
	ResourceSaver.save(ts, "res://tileforge/tileforge.tres")
	print("TileForge: tileset saved — ", ts.get_source_count(), " sources")

# mask bits: N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128 (diagonals pre-normalized)
func _apply_peering(td: TileData, mask: int, terrain: int) -> void:
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
		if mask & bit:
			td.set_terrain_peering_bit(bits[bit], terrain)
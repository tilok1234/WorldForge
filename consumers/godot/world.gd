extends Node2D
# WorldForge W7 vertical slice: streams the resolved world (resolved-map.tmj,
# authored per GAME-GUIDE §2.13) in 32x32-cell chunks through the TileSet the
# PACKAGED importer built, moves a grid player on the §3 walkability ladder
# (importer-built tile custom data, not a parallel table — the one deliberate
# exception is CARPET_PROPS, the behavior-77/sl-0063 walk-over ruling that
# overrides four package walkable:false species), renders a minimap
# from mappings.minimap, and persists explicit world deltas over the
# deterministic base (user://worldforge-deltas.json).
#
# Controls: arrows/WASD step · E toggle a mark delta · M toggle minimap.

const TILE := 32
const CHUNK := 32
const LOAD_RADIUS := 1
const WORLD_DIR := "res://world/"
const DELTAS_PATH := "user://worldforge-deltas.json"
# Carpet debris walks (behavior 77, planning sl-0063): these species keep the
# package's walkable:false on their tiles, but the WF walkability contract
# converts them to walk-over ground clutter — a recorded designer ruling,
# mirrored from the TS loader's BLOCKING_PROPS omissions (semantic_id
# prefixes; the trailing dot pins the species name exactly).
const CARPET_PROPS: Array[String] = [
	"prop.stump.", "prop.fallenlog.", "prop.bonepile.", "prop.lootpile.",
]

var map_w := 0
var map_h := 0
var layers: Array[TileMapLayer] = []
var layer_index := {}          # name -> index
var layer_data: Array = []     # per layer: PackedInt32Array of gids
var gid_sets: Array = []       # sorted asc: {first, source, frames, key}
var minimap_colors := {}       # material id -> Color
var mat_grid: Array = []
var destinations: Array = []
var loaded := {}               # Vector2i chunk -> true
var marks := {}                # "x,y" -> true (explicit world deltas)
var player := Vector2i.ZERO
var player_node: Node2D
var marks_node: Node2D
var minimap_node: TextureRect
var player_dot: ColorRect
var status := ""


func _ready() -> void:
	var err := _load_world()
	if err != "":
		push_error(err)
		return
	_spawn_player()
	_load_deltas()
	_update_streaming()
	_build_minimap()
	print("world ready: %dx%d, player at %s" % [map_w, map_h, player])


func _load_world() -> String:
	var ts: TileSet = load("res://tileforge/tileforge.tres")
	if ts == null:
		return "tileforge.tres missing: run node dist/tools/godot-consumer.js"
	if not FileAccess.file_exists(WORLD_DIR + "resolved-map.tmj"):
		return "world missing: run node dist/tools/godot-consumer.js --world <dir>"
	var manifest: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string("res://tileforge/tileforge-manifest.json")
	)
	var tmj: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string(WORLD_DIR + "resolved-map.tmj")
	)
	var slice: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string(WORLD_DIR + "tileforge-slice.json")
	)
	var map_data: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string(WORLD_DIR + "tileforge-map-data.json")
	)
	map_w = int(tmj.width)
	map_h = int(tmj.height)
	destinations = slice.destinations
	mat_grid = map_data.mat
	for id in manifest.mappings.minimap:
		minimap_colors[int(id)] = Color(manifest.mappings.minimap[id])

	# Family key -> atlas source index (importer adds sources in manifest
	# family iteration order) and frames (frame cells collapse onto frame 0).
	var source_of := {}
	var frames_of := {}
	var si := 0
	for fam_id in manifest.families:
		source_of[fam_id] = si
		frames_of[fam_id] = int(manifest.families[fam_id].get("frames", 1))
		si += 1
	var base_of := {}
	for fam_id in manifest.families:
		var image: String = manifest.families[fam_id].image
		base_of[image.get_basename()] = fam_id
	for entry in tmj.tilesets:
		var base: String = String(entry.source).get_file().get_basename()
		if not base_of.has(base):
			return "tmj tileset %s matches no family" % entry.source
		var key: String = base_of[base]
		gid_sets.append({
			"first": int(entry.firstgid),
			"source": source_of[key],
			"frames": frames_of[key],
		})
	gid_sets.sort_custom(func(a, b): return a.first < b.first)

	for tmj_layer in tmj.layers:
		if tmj_layer.type != "tilelayer":
			continue
		var tl := TileMapLayer.new()
		tl.name = tmj_layer.name
		tl.tile_set = ts
		if tmj_layer.name == "sand":
			tl.position = Vector2(16, 16)
		add_child(tl)
		layer_index[tmj_layer.name] = layers.size()
		layers.append(tl)
		var data := PackedInt32Array()
		data.resize(map_w * map_h)
		var src: Array = tmj_layer.data
		for i in src.size():
			data[i] = int(src[i])
		layer_data.append(data)
	return ""


func _decode(gid: int) -> Array:
	# -> [source_index, atlas_coords]; animated gids snap to frame 0.
	var found = null
	for s in gid_sets:
		if s.first <= gid:
			found = s
		else:
			break
	if found == null:
		return []
	var local: int = gid - found.first
	local -= local % int(found.frames)
	return [found.source, Vector2i(local % 12, local / 12)]


func _load_chunk(c: Vector2i) -> void:
	if loaded.has(c):
		return
	loaded[c] = true
	var x0: int = c.x * CHUNK
	var y0: int = c.y * CHUNK
	for li in layers.size():
		var data: PackedInt32Array = layer_data[li]
		var tl: TileMapLayer = layers[li]
		for y in range(y0, mini(y0 + CHUNK, map_h)):
			for x in range(x0, mini(x0 + CHUNK, map_w)):
				var gid := data[y * map_w + x]
				if gid == 0:
					continue
				var dec := _decode(gid)
				if dec.is_empty():
					continue
				tl.set_cell(Vector2i(x, y), dec[0], dec[1])


func _unload_chunk(c: Vector2i) -> void:
	if not loaded.has(c):
		return
	loaded.erase(c)
	var x0: int = c.x * CHUNK
	var y0: int = c.y * CHUNK
	for tl in layers:
		for y in range(y0, mini(y0 + CHUNK, map_h)):
			for x in range(x0, mini(x0 + CHUNK, map_w)):
				tl.erase_cell(Vector2i(x, y))


func _update_streaming() -> void:
	var pc := Vector2i(player.x / CHUNK, player.y / CHUNK)
	for cy in range(maxi(0, pc.y - LOAD_RADIUS), mini(ceili(float(map_h) / CHUNK), pc.y + LOAD_RADIUS + 1)):
		for cx in range(maxi(0, pc.x - LOAD_RADIUS), mini(ceili(float(map_w) / CHUNK), pc.x + LOAD_RADIUS + 1)):
			_load_chunk(Vector2i(cx, cy))
	for c in loaded.keys():
		if absi(c.x - pc.x) > LOAD_RADIUS + 1 or absi(c.y - pc.y) > LOAD_RADIUS + 1:
			_unload_chunk(c)


func _tile_data(layer_name: String, cell: Vector2i) -> TileData:
	if not layer_index.has(layer_name):
		return null
	return layers[layer_index[layer_name]].get_cell_tile_data(cell)


func _is_carpet(p: TileData) -> bool:
	var sid := String(p.get_custom_data("semantic_id"))
	for prefix in CARPET_PROPS:
		if sid.begins_with(prefix):
			return true
	return false


func is_walkable(cell: Vector2i) -> bool:
	# GAME-GUIDE §3, the walkability ladder — first hit wins, reading the
	# custom data the PACKAGED importer stamped on every tile.
	if cell.x < 0 or cell.y < 0 or cell.x >= map_w or cell.y >= map_h:
		return false
	var s := _tile_data("structures", cell)
	if s != null:
		return bool(s.get_custom_data("walkable"))
	var p := _tile_data("props", cell)
	if p != null and not bool(p.get_custom_data("walkable")) and not _is_carpet(p):
		return false
	if _tile_data("fence", cell) != null or _tile_data("wall", cell) != null:
		return false
	if _tile_data("road", cell) != null:
		return true
	var t := _tile_data("terrain", cell)
	var on_lava := t != null and String(t.get_custom_data("semantic_id")).begins_with("terrain.lava")
	if _tile_data("pier", cell) != null and not on_lava:
		return true
	# Walk-granting decals per the guide PROSE: stepping stones, frost, ford
	# over water/river. (The packaged reference implementation grants for ANY
	# walkable-true decal over any blocked terrain, which turns cosmetic
	# decals into passage; upstream question recorded in the handoff.)
	var d := _tile_data("decals", cell)
	var wet := t != null and not bool(t.get_custom_data("walkable"))
	if d != null and bool(d.get_custom_data("walkable")) and (wet or _tile_data("river", cell) != null):
		var decal_id := String(d.get_custom_data("semantic_id"))
		for grant in ["terrain.ford_decal", "terrain.stepping_stones_decal", "terrain.frost_decal"]:
			if decal_id.begins_with(grant):
				return true
	if d != null and String(d.get_custom_data("semantic_id")).begins_with("terrain.waterfall"):
		return false
	if _tile_data("river", cell) != null:
		return false
	if t != null:
		return bool(t.get_custom_data("walkable"))
	var u := _tile_data("underlay", cell)
	return u == null or bool(u.get_custom_data("walkable"))


func _spawn_player() -> void:
	var start := Vector2i(map_w / 2, map_h / 2)
	if destinations.size() > 0:
		start = Vector2i(int(destinations[0].x), int(destinations[0].y))
	player = start
	player_node = Node2D.new()
	player_node.z_index = 100
	var body := ColorRect.new()
	body.size = Vector2(20, 20)
	body.position = Vector2(6, 6)
	body.color = Color(0.9, 0.15, 0.1)
	player_node.add_child(body)
	add_child(player_node)
	marks_node = Node2D.new()
	marks_node.z_index = 90
	add_child(marks_node)
	var cam := Camera2D.new()
	cam.zoom = Vector2(1.5, 1.5)
	player_node.add_child(cam)
	cam.make_current()
	_place_player()
	# The spawn cell must be steppable; walk outward if the anchor is not.
	if not is_walkable(player):
		_update_streaming()
		for radius in range(1, 12):
			for dy in range(-radius, radius + 1):
				for dx in range(-radius, radius + 1):
					var c := player + Vector2i(dx, dy)
					_load_around(c)
					if is_walkable(c):
						player = c
						_place_player()
						return


func _load_around(cell: Vector2i) -> void:
	var pc := Vector2i(cell.x / CHUNK, cell.y / CHUNK)
	_load_chunk(pc)


func _place_player() -> void:
	player_node.position = Vector2(player.x * TILE, player.y * TILE)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var step := Vector2i.ZERO
	match event.keycode:
		KEY_LEFT, KEY_A: step = Vector2i(-1, 0)
		KEY_RIGHT, KEY_D: step = Vector2i(1, 0)
		KEY_UP, KEY_W: step = Vector2i(0, -1)
		KEY_DOWN, KEY_S: step = Vector2i(0, 1)
		KEY_E:
			_toggle_mark(player)
			return
		KEY_M:
			if minimap_node != null:
				minimap_node.visible = not minimap_node.visible
			return
		_:
			return
	var target := player + step
	if is_walkable(target):
		player = target
		_place_player()
		_update_streaming()
		_update_minimap_player()


# --- explicit world deltas -------------------------------------------------

func _toggle_mark(cell: Vector2i) -> void:
	var key := "%d,%d" % [cell.x, cell.y]
	if marks.has(key):
		marks.erase(key)
	else:
		marks[key] = true
	_save_deltas()
	_redraw_marks()


func _save_deltas() -> void:
	var out: Array = []
	for key in marks:
		var parts: PackedStringArray = String(key).split(",")
		out.append({"x": int(parts[0]), "y": int(parts[1]), "op": "mark"})
	var file := FileAccess.open(DELTAS_PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify({"formatVersion": 1, "deltas": out}))


func _load_deltas() -> void:
	if not FileAccess.file_exists(DELTAS_PATH):
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DELTAS_PATH))
	if parsed == null or int(parsed.get("formatVersion", 0)) != 1:
		return
	for delta in parsed.deltas:
		if String(delta.op) == "mark":
			marks["%d,%d" % [int(delta.x), int(delta.y)]] = true
	_redraw_marks()


func _redraw_marks() -> void:
	if marks_node == null:
		return
	for child in marks_node.get_children():
		child.queue_free()
	for key in marks:
		var parts: PackedStringArray = String(key).split(",")
		var rect := ColorRect.new()
		rect.size = Vector2(10, 10)
		rect.position = Vector2(int(parts[0]) * TILE + 11, int(parts[1]) * TILE + 11)
		rect.color = Color(1.0, 0.85, 0.1)
		marks_node.add_child(rect)


# --- minimap ---------------------------------------------------------------

func _build_minimap() -> void:
	var image := Image.create(map_w, map_h, false, Image.FORMAT_RGB8)
	for y in map_h:
		for x in map_w:
			var mat := int(mat_grid[y * map_w + x])
			image.set_pixel(x, y, minimap_colors.get(mat, Color.MAGENTA))
	var canvas := CanvasLayer.new()
	add_child(canvas)
	minimap_node = TextureRect.new()
	minimap_node.texture = ImageTexture.create_from_image(image)
	minimap_node.position = Vector2(8, 8)
	minimap_node.scale = Vector2(0.75, 0.75)
	canvas.add_child(minimap_node)
	player_dot = ColorRect.new()
	player_dot.size = Vector2(3, 3)
	player_dot.color = Color(1, 0, 0)
	minimap_node.add_child(player_dot)
	_update_minimap_player()


func _update_minimap_player() -> void:
	if player_dot != null:
		player_dot.position = Vector2(player.x, player.y) - Vector2(1, 1)

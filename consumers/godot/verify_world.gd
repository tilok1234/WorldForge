extends SceneTree
# Headless W7 integration check. Instantiates the streamed world scene and
# proves the slice exit criteria that are provable without a window:
#   1. the world loads from the versioned resolve output;
#   2. re-entered chunks are byte-stable (load -> snapshot -> unload -> reload);
#   3. every destination is reachable from the first one walking the §3
#      ladder over importer-built tile metadata (route traversal);
#   4. TileForge metadata drives walkability: walls block, water blocks,
#      the ford crossing cells walk;
#   5. explicit deltas round-trip through user:// persistence.

var world: Node2D
var errors := 0


func fail(message: String) -> void:
	push_error(message)
	errors += 1


func _init() -> void:
	world = (load("res://world.tscn") as PackedScene).instantiate()
	root.add_child(world)
	# _ready() runs on the first process frame; check after it.
	process_frame.connect(_run_checks, CONNECT_ONE_SHOT)


func _run_checks() -> void:
	if world.map_w == 0:
		fail("world did not load")
		_finish()
		return
	print("world loaded: %dx%d, %d layers, %d destinations" % [
		world.map_w, world.map_h, world.layers.size(), world.destinations.size(),
	])

	_check_chunk_stability()
	_check_traversal()
	_check_walkability_rules()
	_check_deltas()
	_finish()


func _snapshot_chunk(c: Vector2i) -> String:
	var parts := PackedStringArray()
	for li in world.layers.size():
		var tl: TileMapLayer = world.layers[li]
		for y in range(c.y * 32, mini(c.y * 32 + 32, world.map_h)):
			for x in range(c.x * 32, mini(c.x * 32 + 32, world.map_w)):
				var cell := Vector2i(x, y)
				var source := tl.get_cell_source_id(cell)
				if source == -1:
					continue
				parts.append("%d:%d,%d:%d:%s" % [li, x, y, source, tl.get_cell_atlas_coords(cell)])
	return "\n".join(parts)


func _check_chunk_stability() -> void:
	var probe := Vector2i(world.player.x / 32, world.player.y / 32)
	world._load_chunk(probe)
	var before := _snapshot_chunk(probe)
	if before == "":
		fail("probe chunk %s loaded empty" % probe)
	world._unload_chunk(probe)
	var during := _snapshot_chunk(probe)
	if during != "":
		fail("unload left %d entries placed" % during.split("\n").size())
	world._load_chunk(probe)
	var after := _snapshot_chunk(probe)
	if after != before:
		fail("chunk %s not stable across re-entry" % probe)
	else:
		print("chunk %s stable across unload/reload (%d placed entries)" % [
			probe, before.split("\n").size(),
		])


func _check_traversal() -> void:
	# Load everything once: BFS reads placed-tile metadata.
	for cy in ceili(world.map_h / 32.0):
		for cx in ceili(world.map_w / 32.0):
			world._load_chunk(Vector2i(cx, cy))
	var start := Vector2i(int(world.destinations[0].x), int(world.destinations[0].y))
	start = _nudge_walkable(start)
	if start == Vector2i(-1, -1):
		fail("no walkable start near destination 0")
		return
	var reached := {}
	var queue: Array[Vector2i] = [start]
	reached[start] = true
	var head := 0
	while head < queue.size():
		var cell: Vector2i = queue[head]
		head += 1
		for d in [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]:
			var next: Vector2i = cell + d
			if reached.has(next) or not world.is_walkable(next):
				continue
			reached[next] = true
			queue.append(next)
	print("walkable flood from %s covers %d cells" % [start, reached.size()])
	for destination in world.destinations:
		var goal := _nudge_walkable(Vector2i(int(destination.x), int(destination.y)))
		if goal == Vector2i(-1, -1) or not reached.has(goal):
			fail("destination %d (%s) unreachable" % [int(destination.id), destination.kind])
		else:
			print("destination %d (%s) reachable" % [int(destination.id), destination.kind])


func _nudge_walkable(anchor: Vector2i) -> Vector2i:
	for radius in 8:
		for dy in range(-radius, radius + 1):
			for dx in range(-radius, radius + 1):
				var c := anchor + Vector2i(dx, dy)
				if world.is_walkable(c):
					return c
	return Vector2i(-1, -1)


func _check_walkability_rules() -> void:
	var map_data: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string("res://world/tileforge-map-data.json")
	)
	var w := int(map_data.mapW)
	var checked_wall := false
	var checked_water := false
	var checked_ford := false
	for i in range(w * int(map_data.mapH)):
		var cell := Vector2i(i % w, i / w)
		if not checked_wall and int(map_data.wall[i]) != 0:
			checked_wall = true
			if world.is_walkable(cell):
				fail("wall cell %s walks" % cell)
		if not checked_water and int(map_data.mat[i]) == 23:
			checked_water = true
			if world.is_walkable(cell):
				fail("deep water cell %s walks" % cell)
		if not checked_ford and int(map_data.decal[i]) == 15:
			checked_ford = true
			if not world.is_walkable(cell):
				fail("ford cell %s blocks" % cell)
	if not (checked_wall and checked_water and checked_ford):
		fail("walkability probes missing a case (wall %s, water %s, ford %s)" % [
			checked_wall, checked_water, checked_ford,
		])
	else:
		print("walkability ladder: wall blocks, deep water blocks, ford walks")


func _check_deltas() -> void:
	var probe: Vector2i = world.player + Vector2i(1, 0)
	world.marks.clear()
	world._toggle_mark(probe)
	world.marks.clear()
	world._load_deltas()
	var key := "%d,%d" % [probe.x, probe.y]
	if not world.marks.has(key):
		fail("delta did not survive save/load")
	else:
		print("explicit delta round-trips through user:// persistence")
	world._toggle_mark(probe)  # leave the file clean


func _finish() -> void:
	print("verify_world: %d errors" % errors)
	quit(0 if errors == 0 else 1)

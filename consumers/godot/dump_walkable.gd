extends SceneTree
# Dev tool: dumps the in-engine §3 walkability grid (one 0/1 row per line)
# to user://walkable.txt for cross-consumer diffing against the TS loader.


func _init() -> void:
	var world = (load("res://world.tscn") as PackedScene).instantiate()
	root.add_child(world)
	process_frame.connect(_dump.bind(world), CONNECT_ONE_SHOT)


func _dump(world) -> void:
	if world.map_w == 0:
		push_error("world did not load")
		quit(1)
		return
	for cy in ceili(world.map_h / 32.0):
		for cx in ceili(world.map_w / 32.0):
			world._load_chunk(Vector2i(cx, cy))
	var file := FileAccess.open("user://walkable.txt", FileAccess.WRITE)
	for y in world.map_h:
		var row := ""
		for x in world.map_w:
			row += "1" if world.is_walkable(Vector2i(x, y)) else "0"
		file.store_line(row)
	file.close()
	print("dumped %dx%d walkability to %s" % [world.map_w, world.map_h, ProjectSettings.globalize_path("user://walkable.txt")])
	quit(0)

extends SceneTree
# Headless driver for the PACKAGED tileforge_importer.gd (W7 entry gate 1:
# the acceptance path runs through the package's own importer, not a
# reimplementation). Godot 4.6 removed the `-e -s` EditorScript entry point
# (a script passed to -s must inherit SceneTree/MainLoop) and EditorScript
# cannot be instantiated outside the editor, so this executes the packaged
# importer's own source with ONLY its base class swapped to RefCounted —
# every line of importer logic is the package's, and its _run() touches no
# EditorScript API (JSON, FileAccess, TileSet, ResourceSaver only).
# Assets must be imported first: godot --headless --path . --import


func _init() -> void:
	var path := "res://tileforge/tileforge_importer.gd"
	if not FileAccess.file_exists(path):
		push_error("package missing: run node dist/tools/godot-consumer.js first")
		quit(1)
		return
	var source := FileAccess.get_file_as_string(path)
	var swapped := source.replace("extends EditorScript", "extends RefCounted")
	if swapped == source:
		push_error("packaged importer no longer extends EditorScript; revisit this driver")
		quit(1)
		return
	var script := GDScript.new()
	script.source_code = swapped
	var err := script.reload()
	if err != OK:
		push_error("packaged importer failed to compile after the base swap: %d" % err)
		quit(1)
		return
	var runner = script.new()
	runner._run()
	if not FileAccess.file_exists("res://tileforge/tileforge.tres"):
		push_error("packaged importer did not produce tileforge.tres")
		quit(1)
		return
	print("import_tileforge: tileforge.tres built from the packaged importer source")
	quit(0)

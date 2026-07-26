extends Node2D
# TileForge worldgen EXAMPLE - generated with the package (seed 103991 / theme forest)
# A minimal but CORRECT procedural island: materials, blob47 masks with the
# priority ladder (GAME-GUIDE 2.4/2.5), the author-side underlay bake (2.6),
# the corner16 sand dual grid (2.7), one road with port masks (2.8) and
# hash-scattered props (2.10). Requires tileforge.tres (run
# tileforge_importer.gd first), Godot 4.3+. Attach to a Node2D and run.
# Every rule cites its guide section - adapt the generator, keep the rules.

const ROOT := "res://tileforge/"
const W := 48
const H := 32
const WSEED := 20260720
const TSEED := WSEED + 101   # the tone field keeps its OWN seed stream (2.4)

var mats := {}      # material id -> family key
var pri := {}       # material id -> ladder priority
var flush := {}     # "a|b" mutual-flush pairs
var gutter := {}    # "lo|hi" gutter overrides
var fam_source := {}# family key -> atlas source id in tileforge.tres
var fam_tiles := {} # family key -> { "mask|variant" : Vector2i atlas }
var fam_vars := {}  # family key -> variant count
var fam_sel := {}   # family key -> selector entry (mappings.selector, v2: baseVariants/extrasPct/tones)
var world := []     # material ids, row-major
var road := []      # road layer bytes

# portable hash: pure modular arithmetic so any reimplementation (any
# language) reproduces the world exactly - no bit-width traps
func h2(x: int, y: int, s: int) -> int:
	var n: int = (x * 374761 + y * 668265 + s * 144269) % 2147483647
	n = (n * 1274126 + 12345) % 2147483647
	n = (n * 69069 + 1) % 2147483647
	return n

func mat_at(x: int, y: int) -> int:
	# radial island + hash jitter: water ring, sand beach, grass with
	# dry-grass meadows and rock knots. Replace freely - the RENDERING
	# below works for any material field.
	var dx := (float(x) - W / 2.0) / (W * 0.42)
	var dy := (float(y) - H / 2.0) / (H * 0.42)
	var d := dx * dx + dy * dy + float(h2(x >> 2, y >> 2, WSEED) % 1000) / 1000.0 * 0.35
	if d > 1.15: return 2                    # water
	if d > 0.92: return 3                    # sand beach ring
	if h2(x >> 3, y >> 3, WSEED + 9) % 6 == 0: return 4   # rock knots
	if h2(x >> 2, y >> 2, WSEED + 7) % 4 == 0: return 8   # dry-grass meadows
	return 1                                 # grass

func wet(m: int) -> bool:
	return m == 2 or m == 6 or m == 22 or m == 23 or m == 25

func connected(m: int, x: int, y: int) -> bool:
	# GAME-GUIDE 2.5, complete: same / wet clause / flush pairs /
	# out-of-world / the priority ladder (rule 6). Data from mappings.
	if x < 0 or y < 0 or x >= W or y >= H: return true   # rule 5 (blob47)
	var mb: int = world[y * W + x]
	if mb == m: return true                              # rule 1
	if not wet(m) and wet(mb): return true               # rule 2 (land runs
	if wet(m) and wet(mb) and m != 25 and mb != 25:      # flush to water)
		if (m == 2 or m == 22 or m == 23) and (mb == 2 or mb == 22 or mb == 23):
			return true                                      # rule 3 water group
	if flush.has(str(m) + "|" + str(mb)): return true    # rule 4
	if pri[str(m)] < pri[str(mb)] and pri[str(mb)] < 30 and not gutter.has(str(m) + "|" + str(mb)):
		return true                                        # rule 6 the ladder
	return false

func blob_mask(x: int, y: int, m: int) -> int:
	# GAME-GUIDE 2.4: 8-neighbor bits + diagonal normalization
	var bits := [[1, 0, -1], [2, 1, -1], [4, 1, 0], [8, 1, 1], [16, 0, 1], [32, -1, 1], [64, -1, 0], [128, -1, -1]]
	var mk := 0
	for b in bits:
		if connected(m, x + b[1], y + b[2]): mk |= b[0]
	if mk & 2 and not (mk & 1 and mk & 4): mk &= ~2
	if mk & 8 and not (mk & 16 and mk & 4): mk &= ~8
	if mk & 32 and not (mk & 16 and mk & 64): mk &= ~32
	if mk & 128 and not (mk & 1 and mk & 64): mk &= ~128
	return mk

func sandish(x: int, y: int) -> bool:
	# GAME-GUIDE 2.7: the sand FIELD - sand itself, shoreline water with a
	# cardinal sand neighbor, and any higher-priority land cell with a
	# cardinal sand neighbor. Out-of-world is NOT sand.
	if x < 0 or y < 0 or x >= W or y >= H: return false
	var m: int = world[y * W + x]
	if m == 3: return true
	var near := false
	for d in [[0, -1], [1, 0], [0, 1], [-1, 0]]:
		var nx: int = x + d[0]
		var ny: int = y + d[1]
		if nx >= 0 and ny >= 0 and nx < W and ny < H and world[ny * W + nx] == 3: near = true
	if not near: return false
	if wet(m): return true
	return pri[str(m)] > pri["3"] and pri[str(m)] < 30

# the wet-bank candidate list, ties broken in EXACTLY this order (2.6)
const WET_BANKS := [1, 8, 9, 24, 11, 13, 15, 16, 17, 18, 19, 3, 5, 20, 21, 4]

func underlay_for(x: int, y: int) -> int:
	# GAME-GUIDE 2.6, author-side, verbatim: wet cells count the 4 in-world
	# cardinal neighbors that are in WET_BANKS (ties by that order); land
	# cells count all 8 strictly-lower neighbors (cardinals DOUBLE, ties to
	# lower priority then lower id; sand qualifies, gutter partners do not).
	# Returns the material id to render (sand -> corner 15), or -1 for soil.
	var m: int = world[y * W + x]
	var cnt := {}
	if wet(m):
		for d in [[0, -1], [1, 0], [0, 1], [-1, 0]]:
			var nx: int = x + d[0]
			var ny: int = y + d[1]
			if nx < 0 or ny < 0 or nx >= W or ny >= H: continue
			var mm: int = world[ny * W + nx]
			if WET_BANKS.has(mm): cnt[mm] = cnt.get(mm, 0) + 1
		var best := -1
		var bn := 0
		for mm in WET_BANKS:             # order IS the tie-break
			if cnt.get(mm, 0) > bn:
				bn = cnt[mm]
				best = mm
		return best
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0: continue
			var nx: int = x + dx
			var ny: int = y + dy
			if nx < 0 or ny < 0 or nx >= W or ny >= H: continue
			var mm: int = world[ny * W + nx]
			if mm == m or wet(mm): continue
			if pri[str(mm)] >= pri[str(m)]: continue
			if gutter.has(str(mm) + "|" + str(m)): continue
			cnt[mm] = cnt.get(mm, 0) + (2 if dx == 0 or dy == 0 else 1)
	# open-side rule (2.6): the fringe only shows through open cardinal
	# sides - the winner must be a mat one of them faces. Among several,
	# the HIGHEST priority wins (higher-on-lower reads as a natural lap;
	# lower-inside-higher reads as a hole). Ties: bigger count, lower id.
	# Diagonal-only contact keeps the unrestricted count (corner notch).
	var openc := {}
	for d in [[0, -1], [1, 0], [0, 1], [-1, 0]]:
		var cx: int = x + d[0]
		var cy: int = y + d[1]
		if cx < 0 or cy < 0 or cx >= W or cy >= H: continue
		var mm: int = world[cy * W + cx]
		if mm == m or wet(mm): continue
		if pri[str(mm)] >= pri[str(m)]: continue
		if gutter.has(str(mm) + "|" + str(m)): continue
		if connected(m, cx, cy): continue
		openc[mm] = true
	if openc.size() > 0:
		var obest := -1
		var obn := 0
		for mm in openc:
			var c: int = cnt.get(mm, 0)
			if obest < 0 or pri[str(mm)] > pri[str(obest)] or (pri[str(mm)] == pri[str(obest)] and (c > obn or (c == obn and mm < obest))):
				obest = mm
				obn = c
		return obest
	var best := -1
	var bn := 0
	for mm in cnt:
		var c: int = cnt[mm]
		if c > bn or (c == bn and best >= 0 and (pri[str(mm)] < pri[str(best)] or (pri[str(mm)] == pri[str(best)] and mm < best))):
			bn = c
			best = mm
	return best

func tone_at(fam: String, x: int, y: int) -> int:
	# Q7 macro tone (GAME-GUIDE 2.4): smoothstep-bilinear value noise
	# over a period-cell lattice, thresholded at the midpoint - broad
	# irregular tone patches, never per-cell confetti and never
	# block-hashing. Integer end to end; TSEED keeps its own stream.
	var tn: Dictionary = fam_sel[fam].tones
	var P: int = int(tn.period)
	var ix: int = floori(float(x) / P)
	var iy: int = floori(float(y) / P)
	var sx: int = int(tn.smooth[x - ix * P])
	var sy: int = int(tn.smooth[y - iy * P])
	var n00: int = h2(ix, iy, TSEED) % 1000
	var n10: int = h2(ix + 1, iy, TSEED) % 1000
	var n01: int = h2(ix, iy + 1, TSEED) % 1000
	var n11: int = h2(ix + 1, iy + 1, TSEED) % 1000
	var v: int = (n00 * (1000 - sx) + n10 * sx) * (1000 - sy) + (n01 * (1000 - sx) + n11 * sx) * sy
	return 1 if v >= 500000000 else 0

func pick_variant(fam: String, hv: int, x: int, y: int) -> int:
	# selector v2 (mappings.selector): accents claim bands off the TOP
	# of roll = hash % 100; the base pool splits the rest with exact
	# integer buckets (the forge's varPick). A tones block (Q7) then
	# lifts the pattern into its tone copy: vi = tone * baseVariants +
	# pattern, accents PAST every tone copy, never toned.
	if not fam_sel.has(fam): return hv % fam_vars[fam]
	var sel: Dictionary = fam_sel[fam]
	var nb: int = int(sel.baseVariants)
	var tn: int = int(sel.tones.n) if sel.has("tones") else 1
	var ex: Array = sel.extrasPct
	var roll: int = hv % 100
	var acc: int = 0
	for i in ex.size():
		acc += int(ex[i])
		if roll >= 100 - acc: return nb * tn + i
	var pat: int = roll * nb / (100 - acc) if acc > 0 else hv % nb
	return (tone_at(fam, x, y) * nb + pat) if tn > 1 else pat

func place(layer: TileMapLayer, x: int, y: int, fam: String, mask: int, vpick: int) -> void:
	var key := str(mask) + "|" + str(pick_variant(fam, vpick, x, y))
	if not fam_tiles[fam].has(key): return
	layer.set_cell(Vector2i(x, y), fam_source[fam], fam_tiles[fam][key])

func _ready() -> void:
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ROOT + "tileforge-manifest.json"))
	var ts: TileSet = load(ROOT + "tileforge.tres")
	if ts == null:
		push_error("run tileforge_importer.gd first"); return
	mats = manifest.mappings.materials
	pri = manifest.mappings.transitions.matPriority
	for pair in manifest.mappings.transitions.flushPairs:
		flush[str(pair[0]) + "|" + str(pair[1])] = true
		flush[str(pair[1]) + "|" + str(pair[0])] = true
	for pair in manifest.mappings.transitions.gutterPairs:
		gutter[str(pair[0]) + "|" + str(pair[1])] = true
	if manifest.mappings.has("selector") and int(manifest.mappings.selector.version) >= 2:
		for f in manifest.mappings.selector.families:
			fam_sel[f] = manifest.mappings.selector.families[f]
	var si := 0
	for fam_id in manifest.families:      # sources were added in this order
		var fam: Dictionary = manifest.families[fam_id]
		fam_source[fam_id] = si
		fam_vars[fam_id] = int(fam.variants)
		var lut := {}
		for t in fam.tiles:
			if int(t.frame) == 0: lut[str(int(t.mask)) + "|" + str(int(t.variant))] = Vector2i(int(t.atlas[0]), int(t.atlas[1]))
		fam_tiles[fam_id] = lut
		si += 1
	# ---- generate the world ----
	world.resize(W * H)
	road.resize(W * H)
	for y in H:
		for x in W:
			world[y * W + x] = mat_at(x, y)
			road[y * W + x] = 0
	for x in range(4, W - 4):             # one road across the island
		if not wet(world[(H / 2) * W + x]) and world[(H / 2) * W + x] != 3:
			road[(H / 2) * W + x] = 1
	# ---- layers, in GAME-GUIDE 2.2 order ----
	var names := ["underlay", "sand", "terrain", "road", "props", "props_over"]
	var layers := {}
	for n in names:
		var tl := TileMapLayer.new()
		tl.name = n
		tl.tile_set = ts
		add_child(tl)
		layers[n] = tl
	layers["sand"].position = Vector2(16, 16)  # the half-cell dual offset
	for y in H:
		for x in W:
			var m: int = world[y * W + x]
			var vp: int = h2(x, y, WSEED + 50)
			# underlay (2.6): soil fill everywhere, bank/lower mat where dominant
			var u: int = underlay_for(x, y)
			if u == 3:
				place(layers["underlay"], x, y, "sand", 15, vp)   # corner 15
			elif u == 0 or u == 5 or u == 7 or u == 20 or u == 21:
				place(layers["underlay"], x, y, mats[str(u)], 0, vp) # fill tile
			elif u >= 0:
				place(layers["underlay"], x, y, mats[str(u)], 255, vp)
			else:
				place(layers["underlay"], x, y, "soil", 0, vp)
			# terrain (2.4): blob47 mask tile; sand + fills skip (dual/underlay)
			if m != 3 and not (m == 0 or m == 5 or m == 7 or m == 20 or m == 21):
				place(layers["terrain"], x, y, mats[str(m)], blob_mask(x, y, m), vp)
			# road (2.8): 4-bit ports, out-of-world does NOT connect
			if road[y * W + x] == 1:
				var pm := 0
				if y > 0 and road[(y - 1) * W + x] == 1: pm |= 1
				if x < W - 1 and road[y * W + x + 1] == 1: pm |= 2
				if y < H - 1 and road[(y + 1) * W + x] == 1: pm |= 4
				if x > 0 and road[y * W + x - 1] == 1: pm |= 8
				place(layers["road"], x, y, "road", pm, vp)
			# props (2.10): hash-scattered, blocking data rides the tileset
			if road[y * W + x] == 0 and m == 1 and h2(x, y, WSEED + 3) % 23 == 0:
				place(layers["props"], x, y, "prop", 10, vp)        # oak ground
				place(layers["props_over"], x, y - 1, "prop", 11, vp) # + overhang,
				# same variant, at (x, y-1) - GAME-GUIDE 2.10
	# sand dual grid (2.7): one dual tile per grid point, corners TL/TR/BR/BL
	for y in range(-1, H):
		for x in range(-1, W):
			var c := 0
			if sandish(x, y): c |= 1        # TL
			if sandish(x + 1, y): c |= 2    # TR
			if sandish(x + 1, y + 1): c |= 4 # BR
			if sandish(x, y + 1): c |= 8    # BL
			if c > 0:
				place(layers["sand"], x, y, "sand", c, h2(x + 9, y + 9, WSEED + 51))

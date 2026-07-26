// TileForge importer — generated from seed 103991 · theme forest
// Requires the Tilemap Extras package (RuleTile). Put this file in an Editor/ folder,
// copy the exported package into Assets/TileForge/, then run Tools > TileForge > Import.
using System.IO;
using UnityEngine;
using UnityEditor;
using UnityEngine.Tilemaps;

public static class TileForgeImporter {
    const int TILE = 32;
    const string Root = "Assets/TileForge/";

    [MenuItem("Tools/TileForge/Import Tilesets")]
    public static void Import() {
        var manifest = JsonUtility.FromJson<Manifest>(File.ReadAllText(Root + "tileforge-manifest.json"));
        foreach (var fam in manifest.families) {
            if (fam.kind != "blob47") continue; // corner16/net16 ship as plain sprites
            var rule = ScriptableObject.CreateInstance<RuleTile>();
            foreach (var t in fam.tiles) {
                var r = new RuleTile.TilingRule {
                    sprites = new[] { LoadSprite(fam.image, t.atlas[0], t.atlas[1]) },
                    neighbors = MaskToNeighbors(t.mask)
                };
                rule.m_TilingRules.Add(r);
            }
            AssetDatabase.CreateAsset(rule, Root + fam.id + ".asset");
        }
        AssetDatabase.SaveAssets();
        Debug.Log("TileForge: RuleTiles imported");
    }

    // mask bits: N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128 — order matches the RuleTile 3x3 scan
    static System.Collections.Generic.List<int> MaskToNeighbors(int mask) {
        int[] bits = { 128, 1, 2, 64, 4, 32, 16, 8 };
        var outList = new System.Collections.Generic.List<int>();
        foreach (var b in bits)
            outList.Add((mask & b) != 0 ? RuleTile.TilingRule.Neighbor.This : RuleTile.TilingRule.Neighbor.NotThis);
        return outList;
    }

    static Sprite LoadSprite(string image, int px, int py) {
        var sprites = AssetDatabase.LoadAllAssetsAtPath(Root + image);
        foreach (var o in sprites) {
            var s = o as Sprite;
            if (s != null && (int)s.rect.x == px && (int)s.rect.y == py) return s;
        }
        return null;
    }

    [System.Serializable] public class Manifest { public Family[] families; }
    [System.Serializable] public class Family { public string id, kind, image; public bool walkable; public Tile[] tiles; }
    [System.Serializable] public class Tile { public string id; public int mask, variant; public int[] atlas; }
}
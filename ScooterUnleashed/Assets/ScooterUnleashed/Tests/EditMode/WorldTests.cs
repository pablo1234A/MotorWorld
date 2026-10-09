using NUnit.Framework;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Tests
{
    public sealed class WorldTests
    {
        [Test]
        public void MeshBuilder_ProfileExtrusion_FacesItsNormals()
        {
            var mb = new MeshBuilder();
            var prof = MeshBuilder.QuarterProfile(2f, 2f, 0f, 8, false);
            mb.ExtrudeProfile(new[] { new Vector3(-1, 0, 0), new Vector3(1, 0, 0) }, new[] { Vector3.forward, Vector3.forward }, prof, false);
            for (int i = 0; i < mb.Triangles.Count; i += 3)
            {
                int a = mb.Triangles[i], b = mb.Triangles[i + 1], c = mb.Triangles[i + 2];
                Vector3 geo = Vector3.Cross(mb.Vertices[b] - mb.Vertices[a], mb.Vertices[c] - mb.Vertices[a]);
                Assert.Greater(Vector3.Dot(geo, mb.Normals[a]), 0f, "triangle winding must match its normal");
            }
        }

        [Test]
        public void GrindRail_SamplesAndFindsClosestPoint()
        {
            var go = new GameObject("rail");
            var r = go.AddComponent<GrindRail>();
            r.SetPoints(new[] { Vector3.zero, new Vector3(0, 0, 10), new Vector3(10, 0, 10) });
            Assert.AreEqual(20f, r.Length, 1e-3f);
            Assert.IsTrue(r.Sample(15f, out var p, out var t));
            Assert.AreEqual(5f, p.x, 1e-3f);
            Assert.AreEqual(Vector3.right, t);
            Assert.IsFalse(r.Sample(21f, out _, out _));
            Assert.IsTrue(r.Closest(new Vector3(1f, 2f, 4f), out var h));
            Assert.AreEqual(4f, h.Distance, 1e-3f);
            Object.DestroyImmediate(go);
        }

        [Test]
        public void World_Builds_AndEverySpawnHasGroundUnderIt()
        {
            var world = WorldBuilder.Build();
            try
            {
                Physics.SyncTransforms();
                Assert.Greater(GrindRail.All.Count, 60, "the city should be full of grindable edges");
                Assert.GreaterOrEqual(WorldAtlas.Zones.Count, 7);
                foreach (var p in WorldAtlas.Pois)
                {
                    if (p.Type != PoiType.Spawn && p.Type != PoiType.Skatepark && p.Type != PoiType.Event) continue;
                    Assert.IsTrue(Physics.Raycast(p.Position + Vector3.up * 0.5f, Vector3.down, out var hit, 3f), $"{p.Id} has no ground");
                    Assert.Greater(hit.normal.y, 0.95f, $"{p.Id} spawns on a slope");
                    Assert.IsFalse(Physics.CheckSphere(p.Position + Vector3.up * 0.9f, 0.3f, ~0, QueryTriggerInteraction.Ignore), $"{p.Id} spawns inside geometry");
                }
            }
            finally
            {
                Object.DestroyImmediate(world);
                GrindRail.All.Clear();
            }
        }
    }
}

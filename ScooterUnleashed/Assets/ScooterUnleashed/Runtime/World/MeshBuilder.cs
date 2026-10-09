using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScooterUnleashed.World
{
    /// <summary>
    /// Procedural mesh construction with world-scale UVs (1 UV unit = 1 metre) so tiled PBR textures keep a consistent
    /// texel density across every obstacle. Used for ramps, bowls, stairs, rails and buildings.
    /// </summary>
    public sealed class MeshBuilder
    {
        public readonly List<Vector3> Vertices = new List<Vector3>(1024);
        public readonly List<Vector3> Normals = new List<Vector3>(1024);
        public readonly List<Vector2> Uvs = new List<Vector2>(1024);
        public readonly List<int> Triangles = new List<int>(2048);

        public int VertexCount => Vertices.Count;

        public void Clear() { Vertices.Clear(); Normals.Clear(); Uvs.Clear(); Triangles.Clear(); }

        public int AddVertex(Vector3 p, Vector3 n, Vector2 uv)
        {
            Vertices.Add(p); Normals.Add(n); Uvs.Add(uv);
            return Vertices.Count - 1;
        }

        public void AddTriangle(int a, int b, int c) { Triangles.Add(a); Triangles.Add(b); Triangles.Add(c); }

        /// <summary>Quad with corners in counter-clockwise order seen from the front (normal side).</summary>
        public void AddQuad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal, Vector2 uvA, Vector2 uvB, Vector2 uvC, Vector2 uvD)
        {
            int i = AddVertex(a, normal, uvA);
            AddVertex(b, normal, uvB);
            AddVertex(c, normal, uvC);
            AddVertex(d, normal, uvD);
            AddTriangle(i, i + 2, i + 1);
            AddTriangle(i, i + 3, i + 2);
        }

        /// <summary>Quad with automatic planar UVs projected on its own plane (metres).</summary>
        public void AddQuadAuto(Vector3 a, Vector3 b, Vector3 c, Vector3 d)
        {
            Vector3 n = Vector3.Cross(d - a, b - a).normalized;
            Vector3 u = (b - a).normalized;
            Vector3 v = Vector3.Cross(n, u);
            Vector2 P(Vector3 p) => new Vector2(Vector3.Dot(p - a, u), Vector3.Dot(p - a, v));
            AddQuad(a, b, c, d, n, P(a), P(b), P(c), P(d));
        }

        /// <summary>Axis-aligned (in local rotation) box.</summary>
        public void AddBox(Vector3 center, Vector3 size, Quaternion rotation, bool bottom = false)
        {
            Vector3 h = size * 0.5f;
            Vector3 C(float x, float y, float z) => center + rotation * new Vector3(x * h.x, y * h.y, z * h.z);
            // Top
            AddQuadAuto(C(-1, 1, -1), C(1, 1, -1), C(1, 1, 1), C(-1, 1, 1));
            // Sides
            AddQuadAuto(C(-1, -1, -1), C(1, -1, -1), C(1, 1, -1), C(-1, 1, -1));   // -Z
            AddQuadAuto(C(1, -1, 1), C(-1, -1, 1), C(-1, 1, 1), C(1, 1, 1));       // +Z
            AddQuadAuto(C(-1, -1, 1), C(-1, -1, -1), C(-1, 1, -1), C(-1, 1, 1));   // -X
            AddQuadAuto(C(1, -1, -1), C(1, -1, 1), C(1, 1, 1), C(1, 1, -1));       // +X
            if (bottom) AddQuadAuto(C(-1, -1, 1), C(1, -1, 1), C(1, -1, -1), C(-1, -1, -1));
        }

        /// <summary>Cylinder between two points (rails, posts, poles).</summary>
        public void AddCylinder(Vector3 from, Vector3 to, float radius, int segments = 10, bool caps = true)
        {
            Vector3 axis = to - from;
            float len = axis.magnitude;
            if (len < 1e-4f) return;
            Vector3 dir = axis / len;
            Vector3 side = Vector3.Cross(dir, Mathf.Abs(dir.y) < 0.95f ? Vector3.up : Vector3.right).normalized;
            Vector3 up = Vector3.Cross(side, dir);
            int start = Vertices.Count;
            float circ = 2f * Mathf.PI * radius;
            for (int i = 0; i <= segments; i++)
            {
                float a = i / (float)segments * Mathf.PI * 2f;
                Vector3 n = side * Mathf.Cos(a) + up * Mathf.Sin(a);
                AddVertex(from + n * radius, n, new Vector2(i / (float)segments * circ, 0));
                AddVertex(to + n * radius, n, new Vector2(i / (float)segments * circ, len));
            }
            for (int i = 0; i < segments; i++)
            {
                int a = start + i * 2;
                AddTriangle(a, a + 1, a + 3);
                AddTriangle(a, a + 3, a + 2);
            }
            if (!caps) return;
            for (int e = 0; e < 2; e++)
            {
                Vector3 c = e == 0 ? from : to;
                Vector3 n = e == 0 ? -dir : dir;
                int ci = AddVertex(c, n, Vector2.zero);
                int ring = Vertices.Count;
                for (int i = 0; i <= segments; i++)
                {
                    float a = i / (float)segments * Mathf.PI * 2f;
                    Vector3 o = side * Mathf.Cos(a) + up * Mathf.Sin(a);
                    AddVertex(c + o * radius, n, new Vector2(o.x, o.z) * radius);
                }
                for (int i = 0; i < segments; i++)
                {
                    if (e == 0) AddTriangle(ci, ring + i, ring + i + 1);
                    else AddTriangle(ci, ring + i + 1, ring + i);
                }
            }
        }

        /// <summary>
        /// Extrudes a 2D profile (x = distance along "outward", y = height) along a path. Each path point has an outward
        /// direction. Normals are derived from the profile tangent, giving perfectly smooth transitions on quarter pipes.
        /// The riding surface faces back towards -outward / up.
        /// </summary>
        public void ExtrudeProfile(IList<Vector3> path, IList<Vector3> outward, IList<Vector2> profile, bool closedPath, bool flip = false)
        {
            int pc = path.Count, rc = profile.Count;
            if (pc < 2 || rc < 2) return;
            int start = Vertices.Count;
            // Profile arc length for V coordinate
            var vlen = new float[rc];
            for (int j = 1; j < rc; j++) vlen[j] = vlen[j - 1] + Vector2.Distance(profile[j], profile[j - 1]);
            float ulen = 0f;
            for (int i = 0; i < pc; i++)
            {
                if (i > 0) ulen += Vector3.Distance(path[i], path[i - 1]);
                Vector3 o = outward[i];
                for (int j = 0; j < rc; j++)
                {
                    Vector2 t2 = j == 0 ? profile[1] - profile[0] : (j == rc - 1 ? profile[rc - 1] - profile[rc - 2] : profile[j + 1] - profile[j - 1]);
                    t2.Normalize();
                    var n2 = new Vector2(-t2.y, t2.x);
                    Vector3 n = (o * n2.x + Vector3.up * n2.y).normalized;
                    if (flip) n = -n;
                    AddVertex(path[i] + o * profile[j].x + Vector3.up * profile[j].y, n, new Vector2(ulen, vlen[j]));
                }
            }
            int segs = closedPath ? pc : pc - 1;
            // Pick the winding whose geometric normal agrees with the analytic profile normal (Unity front face = Cross(B-A, C-A)).
            bool reverse = false;
            {
                int a = start, b = start + rc, c = start + 1;
                Vector3 geo = Vector3.Cross(Vertices[b] - Vertices[a], Vertices[c] - Vertices[a]);
                reverse = Vector3.Dot(geo, Normals[a] + Normals[c]) < 0f;
            }
            for (int i = 0; i < segs; i++)
            {
                int i0 = start + i * rc;
                int i1 = start + ((i + 1) % pc) * rc;
                for (int j = 0; j < rc - 1; j++)
                {
                    if (!reverse)
                    {
                        AddTriangle(i0 + j, i1 + j, i0 + j + 1);
                        AddTriangle(i0 + j + 1, i1 + j, i1 + j + 1);
                    }
                    else
                    {
                        AddTriangle(i0 + j, i0 + j + 1, i1 + j);
                        AddTriangle(i0 + j + 1, i1 + j + 1, i1 + j);
                    }
                }
            }
        }

        /// <summary>Fills a profile side as a triangle fan from a pivot (works for star-shaped ramp profiles).</summary>
        public void AddProfileCap(Vector3 origin, Vector3 outward, IList<Vector2> profile, Vector2 pivot, bool facePositiveSide)
        {
            Vector3 side = Vector3.Cross(Vector3.up, outward).normalized;
            Vector3 n = facePositiveSide ? side : -side;
            Vector3 P(Vector2 p) => origin + outward * p.x + Vector3.up * p.y;
            int c = AddVertex(P(pivot), n, pivot);
            int first = Vertices.Count;
            for (int j = 0; j < profile.Count; j++) AddVertex(P(profile[j]), n, profile[j]);
            for (int j = 0; j < profile.Count - 1; j++)
            {
                Vector3 geo = Vector3.Cross(Vertices[first + j] - Vertices[c], Vertices[first + j + 1] - Vertices[c]);
                if (geo.sqrMagnitude < 1e-10f) continue;
                if (Vector3.Dot(geo, n) > 0f) AddTriangle(c, first + j, first + j + 1);
                else AddTriangle(c, first + j + 1, first + j);
            }
        }

        public Mesh Build(string name, bool tangents = true)
        {
            var mesh = new Mesh { name = name };
            if (Vertices.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(Vertices);
            mesh.SetNormals(Normals);
            mesh.SetUVs(0, Uvs);
            mesh.SetTriangles(Triangles, 0);
            mesh.RecalculateBounds();
            if (tangents) mesh.RecalculateTangents();
            return mesh;
        }

        /// <summary>Quarter-circle transition profile (from flat up to vertical) plus optional vertical extension and deck.</summary>
        public static List<Vector2> QuarterProfile(float radius, float height, float deck, int segments = 14, bool withBack = true)
        {
            var p = new List<Vector2>();
            float curveH = Mathf.Min(radius, height);
            // Angle where the curve reaches curveH
            float maxAngle = Mathf.Acos(1f - curveH / radius);
            for (int i = 0; i <= segments; i++)
            {
                float a = i / (float)segments * maxAngle;
                p.Add(new Vector2(Mathf.Sin(a) * radius, radius - Mathf.Cos(a) * radius));
            }
            Vector2 top = p[p.Count - 1];
            if (height > curveH + 0.01f) { top = new Vector2(top.x, height); p.Add(top); }
            if (deck > 0f) p.Add(new Vector2(top.x + deck, height));
            if (withBack) p.Add(new Vector2(top.x + deck, 0f));
            return p;
        }
    }
}

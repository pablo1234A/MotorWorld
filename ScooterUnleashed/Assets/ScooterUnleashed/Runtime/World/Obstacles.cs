using System.Collections.Generic;
using ScooterUnleashed.Rendering;
using UnityEngine;

namespace ScooterUnleashed.World
{
    /// <summary>
    /// Builds rideable, physically consistent obstacles. Every ramp has an exact mesh collider matching its visual
    /// curvature, every rail/ledge/coping registers a GrindRail, and every piece reports a footprint for the map.
    /// Local frame convention: origin at the ground, +Z = the direction you ride towards the obstacle face.
    /// </summary>
    public sealed class Obstacles
    {
        public readonly Transform Root;
        private readonly MeshBuilder _mb = new MeshBuilder();
        public Color MapColor = new Color(0.55f, 0.55f, 0.58f);

        public Obstacles(Transform root) { Root = root; }

        // ------------------------------------------------------------------------------------------
        // Low level helpers
        // ------------------------------------------------------------------------------------------
        public GameObject MeshObject(string name, Mesh mesh, Material mat, Vector3 pos, Quaternion rot, bool collider, SurfaceType surface, bool castShadows = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(Root, false);
            go.transform.SetPositionAndRotation(pos, rot);
            go.isStatic = true;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = castShadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            if (collider)
            {
                var mc = go.AddComponent<MeshCollider>();
                mc.sharedMesh = mesh;
            }
            if (surface != SurfaceType.Concrete) go.AddComponent<Surface>().Type = surface;
            return go;
        }

        public GameObject Box(string name, Vector3 center, Vector3 size, float yaw, Mat mat, SurfaceType surface = SurfaceType.Concrete, bool collider = true, bool onMap = true, Material overrideMat = null)
        {
            _mb.Clear();
            _mb.AddBox(Vector3.zero, size, Quaternion.identity, false);
            var mesh = _mb.Build(name);
            var go = MeshObject(name, mesh, overrideMat != null ? overrideMat : MaterialLibrary.Get(mat), center, Quaternion.Euler(0, yaw, 0), false, surface);
            if (collider)
            {
                var bc = go.AddComponent<BoxCollider>();
                bc.size = size;
            }
            if (onMap) WorldAtlas.AddShape(center, RotatedFootprint(size, yaw), MapColor);
            return go;
        }

        private static Vector2 RotatedFootprint(Vector3 size, float yaw)
        {
            float a = Mathf.Abs(Mathf.Repeat(yaw, 180f) - 90f) < 45f ? 1f : 0f;
            return a > 0.5f ? new Vector2(size.z, size.x) : new Vector2(size.x, size.z);
        }

        public GrindRail AddRail(string name, IList<Vector3> worldPoints, RailKind kind, bool closed = false)
        {
            var go = new GameObject(name + "_Grind");
            go.transform.SetParent(Root, false);
            var r = go.AddComponent<GrindRail>();
            r.Kind = kind;
            r.SetPoints(worldPoints, closed);
            return r;
        }

        // ------------------------------------------------------------------------------------------
        // Ground & structures
        // ------------------------------------------------------------------------------------------
        public GameObject Ground(string name, Rect area, float topY, float thickness, Mat mat, SurfaceType surface, bool onMap = true, Color? mapColor = null)
        {
            var c = new Vector3(area.center.x, topY - thickness * 0.5f, area.center.y);
            var prev = MapColor;
            if (mapColor.HasValue) MapColor = mapColor.Value;
            var go = Box(name, c, new Vector3(area.width, thickness, area.height), 0, mat, surface, true, onMap);
            MapColor = prev;
            go.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        public void Building(Vector3 groundCenter, Vector3 size, float yaw, Mat facade)
        {
            var prev = MapColor;
            MapColor = new Color(0.32f, 0.33f, 0.36f);
            var go = Box("Building", groundCenter + Vector3.up * size.y * 0.5f, size, yaw, facade);
            MapColor = prev;
            // Roof slab + parapet for silhouette
            var roofC = groundCenter + Vector3.up * (size.y + 0.15f);
            Box("Roof", roofC, new Vector3(size.x + 0.4f, 0.3f, size.z + 0.4f), yaw, Mat.Roof, SurfaceType.Concrete, true, false);
            if (size.x > 12f && size.z > 12f)
            {
                // Rooftop machinery adds depth to the skyline.
                var rot = Quaternion.Euler(0, yaw, 0);
                Box("RoofUnit", roofC + rot * new Vector3(size.x * 0.2f, 1.1f, -size.z * 0.15f), new Vector3(4f, 1.8f, 3f), yaw, Mat.MetalStructure, SurfaceType.Metal, true, false);
            }
            go.name = "Building_" + Mathf.RoundToInt(groundCenter.x) + "_" + Mathf.RoundToInt(groundCenter.z);
        }

        // ------------------------------------------------------------------------------------------
        // Ramps
        // ------------------------------------------------------------------------------------------
        /// <summary>Quarter pipe. origin = centre of the bottom edge of the transition; faces -forward (you ride along +forward into it).</summary>
        public void QuarterPipe(Vector3 origin, float yaw, float width, float radius, float height, float deck = 1.8f, Mat mat = Mat.ConcretePark, SurfaceType surface = SurfaceType.SmoothConcrete, bool coping = true)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            var curve = MeshBuilder.QuarterProfile(radius, height, 0f, 16, false);
            Vector2 top = curve[curve.Count - 1];
            var path = new List<Vector3> { -right * width * 0.5f, right * width * 0.5f };
            var outward = new List<Vector3> { fwd, fwd };

            _mb.Clear();
            _mb.ExtrudeProfile(path, outward, curve, false);
            var deckProfile = new List<Vector2> { top, new Vector2(top.x + deck, height) };
            _mb.ExtrudeProfile(path, outward, deckProfile, false);
            var back = new List<Vector2> { new Vector2(top.x + deck, height), new Vector2(top.x + deck, 0f) };
            _mb.ExtrudeProfile(path, outward, back, false);
            var full = new List<Vector2>(curve) { new Vector2(top.x + deck, height), new Vector2(top.x + deck, 0f) };
            _mb.AddProfileCap(-right * width * 0.5f, fwd, full, new Vector2(top.x + deck, 0f), false);
            _mb.AddProfileCap(right * width * 0.5f, fwd, full, new Vector2(top.x + deck, 0f), true);
            var mesh = _mb.Build("QuarterPipe");
            MeshObject("QuarterPipe", mesh, MaterialLibrary.Get(mat), origin, Quaternion.identity, true, surface);
            WorldAtlas.AddShape(origin + fwd * (top.x + deck) * 0.5f, RotatedFootprint(new Vector3(width, 0, top.x + deck), yaw), new Color(0.75f, 0.72f, 0.66f));

            if (coping)
            {
                Vector3 a = origin - right * width * 0.5f + fwd * top.x + Vector3.up * height;
                Vector3 b = origin + right * width * 0.5f + fwd * top.x + Vector3.up * height;
                CopingTube(a, b);
                AddRail("Coping", new[] { a + Vector3.up * 0.03f, b + Vector3.up * 0.03f }, RailKind.Coping);
            }
        }

        private void CopingTube(Vector3 a, Vector3 b)
        {
            _mb.Clear();
            _mb.AddCylinder(a, b, 0.032f, 10);
            MeshObject("CopingTube", _mb.Build("Coping"), MaterialLibrary.Get(Mat.Coping), Vector3.zero, Quaternion.identity, false, SurfaceType.Metal);
        }

        /// <summary>Kicker / launch ramp with a slightly curved face. origin = front bottom edge centre.</summary>
        public void Kicker(Vector3 origin, float yaw, float width, float length, float height, Mat mat = Mat.ConcretePark, SurfaceType surface = SurfaceType.SmoothConcrete, float curve = 0.35f)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            var prof = new List<Vector2>();
            const int seg = 10;
            for (int i = 0; i <= seg; i++)
            {
                float t = i / (float)seg;
                // Blend linear and quadratic for a mellow lip.
                float h = height * Mathf.Lerp(t, t * t, curve);
                prof.Add(new Vector2(t * length, h));
            }
            var path = new List<Vector3> { -right * width * 0.5f, right * width * 0.5f };
            var outward = new List<Vector3> { fwd, fwd };
            _mb.Clear();
            _mb.ExtrudeProfile(path, outward, prof, false);
            var back = new List<Vector2> { new Vector2(length, height), new Vector2(length, 0f) };
            _mb.ExtrudeProfile(path, outward, back, false);
            var full = new List<Vector2>(prof) { new Vector2(length, 0f) };
            _mb.AddProfileCap(-right * width * 0.5f, fwd, full, new Vector2(length, 0f), false);
            _mb.AddProfileCap(right * width * 0.5f, fwd, full, new Vector2(length, 0f), true);
            MeshObject("Kicker", _mb.Build("Kicker"), MaterialLibrary.Get(mat), origin, Quaternion.identity, true, surface);
            WorldAtlas.AddShape(origin + fwd * length * 0.5f, RotatedFootprint(new Vector3(width, 0, length), yaw), new Color(0.75f, 0.72f, 0.66f));
        }

        /// <summary>Flat bank (wedge) with a flat top platform of length "top".</summary>
        public void Bank(Vector3 origin, float yaw, float width, float length, float height, float top = 0f, Mat mat = Mat.ConcretePark, SurfaceType surface = SurfaceType.SmoothConcrete, bool backFace = true)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            var prof = new List<Vector2> { new Vector2(0, 0), new Vector2(length, height) };
            if (top > 0f) prof.Add(new Vector2(length + top, height));
            float end = length + top;
            var path = new List<Vector3> { -right * width * 0.5f, right * width * 0.5f };
            var outward = new List<Vector3> { fwd, fwd };
            _mb.Clear();
            _mb.ExtrudeProfile(path, outward, new List<Vector2> { prof[0], prof[1] }, false);
            if (top > 0f) _mb.ExtrudeProfile(path, outward, new List<Vector2> { prof[1], prof[2] }, false);
            if (backFace) _mb.ExtrudeProfile(path, outward, new List<Vector2> { new Vector2(end, height), new Vector2(end, 0) }, false);
            var full = new List<Vector2>(prof) { new Vector2(end, 0f) };
            _mb.AddProfileCap(-right * width * 0.5f, fwd, full, new Vector2(end, 0f), false);
            _mb.AddProfileCap(right * width * 0.5f, fwd, full, new Vector2(end, 0f), true);
            MeshObject("Bank", _mb.Build("Bank"), MaterialLibrary.Get(mat), origin, Quaternion.identity, true, surface);
            WorldAtlas.AddShape(origin + fwd * end * 0.5f, RotatedFootprint(new Vector3(width, 0, end), yaw), new Color(0.72f, 0.7f, 0.65f));
        }

        /// <summary>Funbox: flat-top platform with banks on two opposite sides and a ledge + rail on top.</summary>
        public void Funbox(Vector3 center, float yaw, float width, float topLength, float height, float bankLength)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            Box("FunboxTop", center + Vector3.up * height * 0.5f, new Vector3(width, height, topLength), yaw, Mat.ConcretePark, SurfaceType.SmoothConcrete);
            Bank(center - fwd * (topLength * 0.5f + bankLength), yaw, width, bankLength, height, 0f, Mat.ConcretePark, SurfaceType.SmoothConcrete, false);
            Bank(center + fwd * (topLength * 0.5f + bankLength), yaw + 180f, width, bankLength, height, 0f, Mat.ConcretePark, SurfaceType.SmoothConcrete, false);
            // Grindable edges on both sides of the top
            for (int s = -1; s <= 1; s += 2)
            {
                Vector3 a = center + right * s * (width * 0.5f - 0.02f) - fwd * topLength * 0.5f + Vector3.up * height;
                Vector3 b = a + fwd * topLength;
                AddRail("FunboxEdge", new[] { a, b }, RailKind.Ledge);
                CopingTube(a - Vector3.up * 0.02f, b - Vector3.up * 0.02f);
            }
            // Down rail along one bank
            Vector3 r0 = center + right * (width * 0.5f + 0.9f) - fwd * (topLength * 0.5f + bankLength);
            FlatRailSloped(r0 + Vector3.up * 0.35f, r0 + fwd * bankLength + Vector3.up * (height + 0.35f));
            Vector3 r1 = r0 + fwd * bankLength;
            FlatRail(r1, r1 + fwd * topLength, center.y + height + 0.35f, true);
        }

        // ------------------------------------------------------------------------------------------
        // Rails, ledges, stairs
        // ------------------------------------------------------------------------------------------
        /// <summary>Horizontal rail. With absolute = false the height is above a/b, otherwise it is a world Y.</summary>
        public void FlatRail(Vector3 a, Vector3 b, float height, bool absolute = false, Mat mat = Mat.RailPainted)
        {
            Vector3 ta = absolute ? new Vector3(a.x, height, a.z) : a + Vector3.up * height;
            Vector3 tb = absolute ? new Vector3(b.x, height, b.z) : b + Vector3.up * height;
            RailBetween(ta, tb, mat, 0.035f);
        }

        public void FlatRailSloped(Vector3 topA, Vector3 topB, Mat mat = Mat.RailChrome) => RailBetween(topA, topB, mat, 0.03f);

        /// <summary>Rail tube whose top surface runs from ta to tb, with posts down to the ground and a matching collider.</summary>
        private void RailBetween(Vector3 ta, Vector3 tb, Mat mat, float radius)
        {
            Physics.SyncTransforms();
            _mb.Clear();
            Vector3 tubeA = ta - Vector3.up * radius, tubeB = tb - Vector3.up * radius;
            _mb.AddCylinder(tubeA, tubeB, radius, 12);
            float len = Vector3.Distance(ta, tb);
            int posts = Mathf.Max(2, Mathf.CeilToInt(len / 3.5f) + 1);
            for (int i = 0; i < posts; i++)
            {
                float t = Mathf.Lerp(0.06f, 0.94f, i / (float)(posts - 1));
                Vector3 top = Vector3.Lerp(tubeA, tubeB, t);
                Vector3 bottom = top;
                if (Physics.Raycast(top + Vector3.down * 0.1f, Vector3.down, out var hit, 10f, Layers.WheelMask)) bottom = hit.point;
                else bottom.y = 0f;
                _mb.AddCylinder(bottom, top, 0.025f, 8);
            }
            MeshObject("Rail", _mb.Build("Rail"), MaterialLibrary.Get(mat), Vector3.zero, Quaternion.identity, false, SurfaceType.Metal);

            // Collider on the Rail layer: blocks the rider's body but is ignored by the wheel probes.
            var cgo = new GameObject("RailCollider");
            cgo.transform.SetParent(Root, false);
            cgo.layer = Layers.Rail;
            cgo.transform.position = (tubeA + tubeB) * 0.5f;
            cgo.transform.rotation = Quaternion.LookRotation((tubeB - tubeA).normalized, Vector3.up);
            var cap = cgo.AddComponent<CapsuleCollider>();
            cap.direction = 2;
            cap.radius = radius;
            cap.height = len + radius * 2f;
            cgo.AddComponent<Surface>().Type = SurfaceType.Metal;

            AddRail("Rail", new[] { ta, tb }, RailKind.Rail);
            WorldAtlas.MapShapes.Add((new Rect(Mathf.Min(ta.x, tb.x) - 0.4f, Mathf.Min(ta.z, tb.z) - 0.4f, Mathf.Abs(ta.x - tb.x) + 0.8f, Mathf.Abs(ta.z - tb.z) + 0.8f), new Color(0.9f, 0.4f, 0.2f)));
        }

        /// <summary>Ledge: solid block with grindable steel-capped edges on both long sides.</summary>
        public void Ledge(Vector3 groundCenter, float yaw, float length, float height, float depth, Mat mat = Mat.ConcreteDark, bool bothSides = true)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            Box("Ledge", groundCenter + Vector3.up * height * 0.5f, new Vector3(depth, height, length), yaw, mat);
            for (int s = -1; s <= 1; s += 2)
            {
                if (!bothSides && s < 0) continue;
                Vector3 a = groundCenter + right * s * (depth * 0.5f - 0.03f) - fwd * (length * 0.5f - 0.05f) + Vector3.up * height;
                Vector3 b = a + fwd * (length - 0.1f);
                CopingTube(a - Vector3.up * 0.015f + right * s * 0.015f, b - Vector3.up * 0.015f + right * s * 0.015f);
                AddRail("LedgeEdge", new[] { a, b }, RailKind.Ledge);
            }
        }

        public void Bench(Vector3 groundCenter, float yaw, float length = 2.6f)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            const float h = 0.45f;
            Box("BenchSeat", groundCenter + Vector3.up * (h - 0.04f), new Vector3(0.5f, 0.08f, length), yaw, Mat.Wood, SurfaceType.Wood, true, true);
            for (int i = -1; i <= 1; i += 2)
                Box("BenchLeg", groundCenter + fwd * i * (length * 0.5f - 0.2f) + Vector3.up * (h * 0.5f - 0.04f), new Vector3(0.45f, h - 0.08f, 0.08f), yaw, Mat.MetalStructure, SurfaceType.Metal, true, false);
            for (int s = -1; s <= 1; s += 2)
            {
                Vector3 a = groundCenter + right * s * 0.22f - fwd * (length * 0.5f - 0.05f) + Vector3.up * h;
                AddRail("BenchEdge", new[] { a, a + fwd * (length - 0.1f) }, RailKind.Ledge);
            }
        }

        public void ManualPad(Vector3 groundCenter, float yaw, float width, float length, float height = 0.22f)
        {
            Box("ManualPad", groundCenter + Vector3.up * height * 0.5f, new Vector3(width, height, length), yaw, Mat.ConcretePark, SurfaceType.SmoothConcrete);
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            for (int s = -1; s <= 1; s += 2)
            {
                Vector3 a = groundCenter + right * s * (width * 0.5f - 0.03f) - fwd * (length * 0.5f - 0.05f) + Vector3.up * height;
                AddRail("PadEdge", new[] { a, a + fwd * (length - 0.1f) }, RailKind.Ledge);
            }
        }

        /// <summary>
        /// Stair set going DOWN along +forward from topOrigin. Optional handrail (grindable, sloped) and hubba ledges.
        /// Returns the bottom landing centre.
        /// </summary>
        public Vector3 Stairs(Vector3 topOrigin, float yaw, int steps, float stepHeight, float stepDepth, float width, bool handrail, bool hubbas, Mat mat = Mat.Concrete)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 fwd = rot * Vector3.forward, right = rot * Vector3.right;
            float totalH = steps * stepHeight;
            for (int i = 0; i < steps; i++)
            {
                float topY = topOrigin.y - (i + 1) * stepHeight;
                // Each step is a block from the ground (y = topOrigin.y - totalH) to its tread height.
                float baseY = topOrigin.y - totalH;
                float h = topY - baseY + 0.001f;
                if (h <= 0.002f) continue;
                Vector3 c = topOrigin + fwd * (i * stepDepth + stepDepth * 0.5f);
                c.y = baseY + h * 0.5f;
                Box("Step", c, new Vector3(width, h, stepDepth), yaw, mat, SurfaceType.Concrete, true, i == 0);
            }
            Vector3 bottom = topOrigin + fwd * (steps * stepDepth) + Vector3.down * totalH;
            Vector3 startEdge = topOrigin;
            Vector3 endEdge = topOrigin + fwd * (steps * stepDepth) + Vector3.down * totalH;
            if (handrail)
            {
                Vector3 off = right * (width * 0.5f - 0.25f);
                Vector3 a = startEdge + off + Vector3.up * 0.85f - fwd * 0.4f;
                Vector3 b = endEdge + off + Vector3.up * 0.85f + fwd * 0.4f;
                // Flat lead-in on top, sloped section, flat run-out — like a real handrail.
                FlatRailSloped(a - fwd * 1.2f, a);
                FlatRailSloped(a, b);
            }
            if (hubbas)
            {
                // Sloped ledge (hubba) on the other side.
                Vector3 side = -right * (width * 0.5f + 0.3f);
                Vector3 a = startEdge + side + Vector3.up * 0.45f;
                Vector3 b = endEdge + side + Vector3.up * 0.45f;
                _mb.Clear();
                Vector3 pa = a, pb = b;
                Vector3 r = right * 0.3f;
                // Hubba as a sloped prism down to the ground level of each end
                Vector3 g0 = new Vector3(pa.x, topOrigin.y, pa.z), g1 = new Vector3(pb.x, bottom.y, pb.z);
                _mb.AddQuadAuto(pa - r, pb - r, pb + r, pa + r); // top
                _mb.AddQuadAuto(g0 - r, g1 - r, pb - r, pa - r);
                _mb.AddQuadAuto(g1 + r, g0 + r, pa + r, pb + r);
                _mb.AddQuadAuto(g1 - r, g1 + r, pb + r, pb - r);
                var mesh = _mb.Build("Hubba");
                MeshObject("Hubba", mesh, MaterialLibrary.Get(Mat.ConcreteDark), Vector3.zero, Quaternion.identity, true, SurfaceType.Concrete);
                AddRail("HubbaEdge", new[] { pa + r - Vector3.up * 0.0f, pb + r }, RailKind.Ledge);
                AddRail("HubbaEdge", new[] { pa - r, pb - r }, RailKind.Ledge);
            }
            return bottom;
        }

        /// <summary>Concrete bowl sunk into a platform. center = bowl floor centre at ground level of the surrounding deck.</summary>
        /// <summary>
        /// Above-ground concrete bowl: the floor is the existing ground at deckCenter.y - depth, the walls rise to the deck
        /// and a solid platform (with filled corners) surrounds it. Returns the outer half-extents of the coping outline.
        /// </summary>
        public Vector2 Bowl(Vector3 deckCenter, float sizeX, float sizeZ, float depth, float transitionRadius, float cornerRadius, Mat mat = Mat.ConcretePark, string name = "Bowl", float platformMargin = 3f)
        {
            float floorY = deckCenter.y - depth;
            float innerX = sizeX - 2f * transitionRadius, innerZ = sizeZ - 2f * transitionRadius;

            // Rounded-rectangle path at the bottom of the transition, outward normals pointing away from centre.
            var path = new List<Vector3>();
            var outward = new List<Vector3>();
            float hx = innerX * 0.5f - cornerRadius, hz = innerZ * 0.5f - cornerRadius;
            hx = Mathf.Max(0f, hx); hz = Mathf.Max(0f, hz);
            int cornerSeg = 8;
            Vector3[] centers = { new Vector3(hx, 0, hz), new Vector3(-hx, 0, hz), new Vector3(-hx, 0, -hz), new Vector3(hx, 0, -hz) };
            float[] startAngles = { 0f, 90f, 180f, 270f };
            for (int c = 0; c < 4; c++)
            {
                for (int i = 0; i <= cornerSeg; i++)
                {
                    float a = (startAngles[c] + 90f * i / cornerSeg) * Mathf.Deg2Rad;
                    var o = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                    path.Add(new Vector3(deckCenter.x, floorY, deckCenter.z) + centers[c] + o * cornerRadius);
                    outward.Add(o);
                }
            }
            var curve = MeshBuilder.QuarterProfile(transitionRadius, depth, 0f, 14, false);
            _mb.Clear();
            _mb.ExtrudeProfile(path, outward, curve, true);
            MeshObject(name, _mb.Build(name), MaterialLibrary.Get(mat), Vector3.zero, Quaternion.identity, true, SurfaceType.SmoothConcrete);

            // Coping ring
            var copingPts = new List<Vector3>();
            float topX = curve[curve.Count - 1].x;
            for (int i = 0; i < path.Count; i++) copingPts.Add(new Vector3(path[i].x, deckCenter.y + 0.03f, path[i].z) + outward[i] * topX);
            AddRail(name + "Coping", copingPts, RailKind.Coping, true);
            _mb.Clear();
            for (int i = 0; i < copingPts.Count; i++)
                _mb.AddCylinder(copingPts[i] - Vector3.up * 0.03f, copingPts[(i + 1) % copingPts.Count] - Vector3.up * 0.03f, 0.032f, 8, false);
            MeshObject(name + "CopingTube", _mb.Build("BowlCoping"), MaterialLibrary.Get(Mat.Coping), Vector3.zero, Quaternion.identity, false, SurfaceType.Metal);

            // Surrounding platform: a flat deck ring following the rounded outline (no gaps at the corners) and an outer wall.
            float ox = innerX * 0.5f + topX, oz = innerZ * 0.5f + topX;
            float m = platformMargin;
            _mb.Clear();
            _mb.ExtrudeProfile(path, outward, new List<Vector2> { new Vector2(topX, depth), new Vector2(topX + m, depth) }, true);
            _mb.ExtrudeProfile(path, outward, new List<Vector2> { new Vector2(topX + m, depth), new Vector2(topX + m, 0f) }, true);
            MeshObject(name + "Deck", _mb.Build(name + "Deck"), MaterialLibrary.Get(Mat.ConcretePark), Vector3.zero, Quaternion.identity, true, SurfaceType.SmoothConcrete);
            WorldAtlas.AddShape(new Vector3(deckCenter.x, 0, deckCenter.z), new Vector2(ox * 2f + m * 2f, oz * 2f + m * 2f), new Color(0.6f, 0.62f, 0.6f));
            WorldAtlas.AddShape(new Vector3(deckCenter.x, 0, deckCenter.z), new Vector2(ox * 2f, oz * 2f), new Color(0.45f, 0.6f, 0.75f));
            return new Vector2(ox + m, oz + m);
        }

        // ------------------------------------------------------------------------------------------
        // Props
        // ------------------------------------------------------------------------------------------
        public void Lamp(Vector3 groundPos, float yaw)
        {
            _mb.Clear();
            _mb.AddCylinder(groundPos, groundPos + Vector3.up * 5.2f, 0.07f, 8);
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 arm = rot * Vector3.forward;
            _mb.AddCylinder(groundPos + Vector3.up * 5.1f, groundPos + Vector3.up * 5.1f + arm * 1.2f, 0.05f, 6);
            MeshObject("LampPost", _mb.Build("LampPost"), MaterialLibrary.Get(Mat.MetalStructure), Vector3.zero, Quaternion.identity, false, SurfaceType.Metal);
            var head = Box("LampHead", groundPos + Vector3.up * 5.0f + arm * 1.2f, new Vector3(0.35f, 0.12f, 0.6f), yaw, Mat.Emissive, SurfaceType.Metal, false, false);
            head.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var col = new GameObject("LampCollider");
            col.transform.SetParent(Root, false);
            col.transform.position = groundPos + Vector3.up * 1.5f;
            var cc = col.AddComponent<CapsuleCollider>();
            cc.radius = 0.09f; cc.height = 3f;
        }

        public void Tree(Vector3 groundPos, float scale)
        {
            _mb.Clear();
            _mb.AddCylinder(groundPos, groundPos + Vector3.up * 2.4f * scale, 0.14f * scale, 7);
            MeshObject("Trunk", _mb.Build("Trunk"), MaterialLibrary.Get(Mat.Bark), Vector3.zero, Quaternion.identity, false, SurfaceType.Concrete);
            for (int i = 0; i < 3; i++)
            {
                var s = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                Object.Destroy(s.GetComponent<Collider>());
                s.name = "Canopy";
                s.transform.SetParent(Root, false);
                float a = i * 2.1f;
                s.transform.position = groundPos + new Vector3(Mathf.Cos(a) * 0.6f, 3.1f + i * 0.35f, Mathf.Sin(a) * 0.6f) * scale;
                s.transform.localScale = Vector3.one * (2.2f - i * 0.35f) * scale;
                s.GetComponent<MeshRenderer>().sharedMaterial = MaterialLibrary.Get(Mat.Foliage);
                s.isStatic = true;
            }
            var col = new GameObject("TreeCollider");
            col.transform.SetParent(Root, false);
            col.transform.position = groundPos + Vector3.up * 1.2f * scale;
            var cc = col.AddComponent<CapsuleCollider>();
            cc.radius = 0.18f * scale; cc.height = 2.4f * scale;
        }

        public void Planter(Vector3 groundCenter, float yaw, float length, float width, float height = 0.55f)
        {
            Ledge(groundCenter, yaw, length, height, width, Mat.ConcreteDark);
            Box("PlanterSoil", groundCenter + Vector3.up * (height + 0.01f), new Vector3(width - 0.3f, 0.04f, length - 0.3f), yaw, Mat.Grass, SurfaceType.Grass, false, false);
            Tree(groundCenter + Vector3.up * height, 0.8f);
        }

        public void RoadLine(Vector3 a, Vector3 b, float width = 0.18f, float dash = 3f, float gap = 3f)
        {
            Vector3 d = b - a;
            float len = d.magnitude;
            if (len < 0.01f) return;
            Vector3 dir = d / len;
            Vector3 side = Vector3.Cross(Vector3.up, dir) * width * 0.5f;
            _mb.Clear();
            for (float s = 0; s < len; s += dash + gap)
            {
                Vector3 p0 = a + dir * s + Vector3.up * 0.012f;
                Vector3 p1 = a + dir * Mathf.Min(len, s + dash) + Vector3.up * 0.012f;
                _mb.AddQuadAuto(p0 - side, p0 + side, p1 + side, p1 - side);
            }
            MeshObject("RoadLine", _mb.Build("RoadLine", false), MaterialLibrary.Get(Mat.RoadLine), Vector3.zero, Quaternion.identity, false, SurfaceType.Asphalt, false);
        }

        public void SpotTrigger(string poiId, Vector3 center, Vector3 size)
        {
            var go = new GameObject("Spot_" + poiId);
            go.transform.SetParent(Root, false);
            go.transform.position = center;
            var bc = go.AddComponent<BoxCollider>();
            bc.size = size;
            bc.isTrigger = true;
            go.AddComponent<SpotTrigger>().PoiId = poiId;
        }
    }
}

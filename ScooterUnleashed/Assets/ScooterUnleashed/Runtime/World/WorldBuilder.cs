using ScooterUnleashed.Rendering;
using UnityEngine;

namespace ScooterUnleashed.World
{
    /// <summary>
    /// Builds the open city "Puerto Rueda" procedurally (provisional geometry with final-scale proportions).
    /// Each zone is a separate root so it can later be replaced by authored scenes and streamed additively.
    ///
    ///                 N (+Z)
    ///   [City]   [ SKATEPARK ]   [COMPETITION]
    ///   [COAST]  [   PLAZA   ]   [ INDUSTRIAL ]
    ///   [COAST]  [   PARK    ]   [ RESIDENTIAL]
    /// </summary>
    public sealed class WorldBuilder
    {
        public const float PadTop = 0.1f;
        public const float SeaEdgeX = -235f;
        public const float KillY = -6f;

        private Obstacles _o;
        private Transform _root;
        private System.Random _rng = new System.Random(4242);

        private float R(float min, float max) => (float)(min + _rng.NextDouble() * (max - min));

        public static GameObject Build()
        {
            var b = new WorldBuilder();
            return b.BuildInternal();
        }

        private GameObject BuildInternal()
        {
            WorldAtlas.Clear();
            var world = new GameObject("World");
            _root = world.transform;

            Zone("Base", () => Base());
            Zone("Roads", () => Roads());
            Zone("Plaza", () => Plaza());
            Zone("Skatepark", () => Skatepark());
            Zone("Park", () => Park());
            Zone("Industrial", () => Industrial());
            Zone("Coast", () => Coast());
            Zone("Residential", () => Residential());
            Zone("Competition", () => Competition());
            Zone("CityBlocks", () => CityBlocks());
            return world;
        }

        private void Zone(string name, System.Action build)
        {
            var z = new GameObject(name);
            z.transform.SetParent(_root, false);
            _o = new Obstacles(z.transform);
            build();
            // Static batching per zone keeps draw calls low while allowing zone-level culling/streaming later.
            StaticBatchingUtility.Combine(z);
        }

        private void Poi(string id, string name, PoiType type, Vector3 pos, float yaw, string zone, bool fastTravel = false, bool hidden = false, float radius = 14f)
        {
            WorldAtlas.Pois.Add(new PointOfInterest { Id = id, Name = name, Type = type, Position = pos, Yaw = yaw, ZoneId = zone, FastTravel = fastTravel, HiddenUntilDiscovered = hidden, Radius = radius });
        }

        private void ZoneInfo(string id, string name, Rect area, Color c) => WorldAtlas.Zones.Add(new ZoneInfo { Id = id, Name = name, Area = area, MapColor = c });

        // ==========================================================================================
        private void Base()
        {
            _o.Ground("Asphalt", new Rect(SeaEdgeX, -310, 310 - SeaEdgeX, 620), 0f, 1f, Mat.Asphalt, SurfaceType.Asphalt, false);
            // Sea
            var sea = GameObject.CreatePrimitive(PrimitiveType.Plane);
            Object.Destroy(sea.GetComponent<Collider>());
            sea.name = "Sea";
            sea.transform.SetParent(_o.Root, false);
            sea.transform.position = new Vector3(SeaEdgeX - 200f, -1.4f, 0f);
            sea.transform.localScale = new Vector3(40f, 1f, 70f);
            sea.GetComponent<MeshRenderer>().sharedMaterial = MaterialLibrary.Get(Mat.Water);
            sea.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            // Seawall face
            _o.Box("SeaWall", new Vector3(SeaEdgeX - 0.5f, -0.7f, 0), new Vector3(1f, 1.6f, 620f), 0, Mat.ConcreteDark, SurfaceType.Concrete, true, false);
            // Invisible world bounds
            void Wall(Vector3 c, Vector3 s)
            {
                var w = new GameObject("Bound");
                w.transform.SetParent(_o.Root, false);
                w.transform.position = c;
                w.AddComponent<BoxCollider>().size = s;
            }
            Wall(new Vector3(0, 15, 312), new Vector3(700, 40, 4));
            Wall(new Vector3(0, 15, -312), new Vector3(700, 40, 4));
            Wall(new Vector3(312, 15, 0), new Vector3(4, 40, 700));
            Wall(new Vector3(-320, 15, 0), new Vector3(4, 40, 700));
        }

        private void Roads()
        {
            // Ring avenues around the central blocks.
            _o.RoadLine(new Vector3(-300, 0, 62), new Vector3(300, 0, 62));
            _o.RoadLine(new Vector3(-300, 0, -62), new Vector3(300, 0, -62));
            _o.RoadLine(new Vector3(70, 0, -300), new Vector3(70, 0, 300));
            _o.RoadLine(new Vector3(-70, 0, -300), new Vector3(-70, 0, 300));
            _o.RoadLine(new Vector3(-300, 0, 202), new Vector3(300, 0, 202));
            _o.RoadLine(new Vector3(-300, 0, -202), new Vector3(300, 0, -202));
            // Street lamps along the avenues
            for (float t = -280; t <= 280; t += 32f)
            {
                _o.Lamp(new Vector3(t, 0f, 57f), 180f);
                _o.Lamp(new Vector3(t, 0f, -57f), 0f);
                _o.Lamp(new Vector3(77f, 0f, t), 270f);
                _o.Lamp(new Vector3(-77f, 0f, t), 90f);
            }
        }

        // ==========================================================================================
        private void Plaza()
        {
            ZoneInfo("plaza", "Plaza Mayor", new Rect(-55, -55, 110, 110), new Color(0.82f, 0.75f, 0.6f));
            _o.MapColor = new Color(0.78f, 0.74f, 0.66f);
            _o.Ground("PlazaFloor", new Rect(-55, -55, 110, 110), PadTop, 0.4f, Mat.PlazaTiles, SurfaceType.Tiles, true, new Color(0.83f, 0.79f, 0.7f));

            // Upper terrace (north half) 1.6 m above the plaza
            const float terraceH = 1.6f;
            float tTop = PadTop + terraceH;
            _o.MapColor = new Color(0.72f, 0.68f, 0.6f);
            _o.Box("Terrace", new Vector3(0, PadTop + terraceH * 0.5f, 33f), new Vector3(90f, terraceH, 36f), 0, Mat.Concrete, SurfaceType.Concrete);
            _o.Box("TerraceTop", new Vector3(0, tTop + 0.012f, 33f), new Vector3(89.6f, 0.01f, 35.6f), 0, Mat.PlazaTiles, SurfaceType.Tiles, false, false);

            // Main stair set with handrail and hubba (the signature gap of the plaza)
            _o.Stairs(new Vector3(0, tTop, 15f), 180f, 8, terraceH / 8f, 0.38f, 9f, true, true);
            // Second, narrower set with a handrail
            _o.Stairs(new Vector3(-30f, tTop, 15f), 180f, 8, terraceH / 8f, 0.38f, 5f, true, false);
            // Bank up to the terrace
            _o.Bank(new Vector3(30f, PadTop, 15f - 7f), 0f, 7f, 7f, terraceH, 0f, Mat.Concrete, SurfaceType.Concrete, false);
            // Rail along the terrace edge (grind the drop)
            _o.FlatRail(new Vector3(12f, 0, 15.6f), new Vector3(24f, 0, 15.6f), tTop + 0.45f, true, Mat.RailChrome);
            _o.Ledge(new Vector3(-14f, tTop, 16.2f), 90f, 10f, 0.45f, 0.7f);

            // Terrace furniture
            _o.Bench(new Vector3(-20f, tTop, 28f), 90f);
            _o.Bench(new Vector3(20f, tTop, 28f), 90f);
            _o.Planter(new Vector3(0f, tTop, 32f), 90f, 12f, 2.4f);
            _o.Ledge(new Vector3(-30f, tTop, 38f), 0f, 9f, 0.5f, 0.8f);
            _o.Ledge(new Vector3(30f, tTop, 38f), 0f, 9f, 0.35f, 0.8f);
            _o.ManualPad(new Vector3(-8f, tTop, 44f), 90f, 2.5f, 7f);

            // Lower plaza: fountain with grindable rim
            Fountain(new Vector3(0, PadTop, -12f), 6.5f);
            _o.Bench(new Vector3(-16f, PadTop, -12f), 0f, 3.2f);
            _o.Bench(new Vector3(16f, PadTop, -12f), 0f, 3.2f);
            _o.Planter(new Vector3(-30f, PadTop, -30f), 0f, 10f, 2.4f);
            _o.Planter(new Vector3(30f, PadTop, -30f), 0f, 10f, 2.4f);
            _o.ManualPad(new Vector3(0, PadTop, -36f), 90f, 3f, 9f);
            _o.Ledge(new Vector3(-20f, PadTop, 2f), 90f, 8f, 0.45f, 0.6f);
            _o.Ledge(new Vector3(20f, PadTop, 2f), 90f, 8f, 0.45f, 0.6f);
            _o.FlatRail(new Vector3(-40f, PadTop, -12f), new Vector3(-40f, PadTop, 6f), 0.4f);
            _o.FlatRail(new Vector3(40f, PadTop, -12f), new Vector3(40f, PadTop, 6f), 0.4f);
            _o.Kicker(new Vector3(-12f, PadTop, -48f), 0f, 3f, 2.2f, 0.7f);
            for (int i = 0; i < 6; i++) _o.Lamp(new Vector3(-45f + i * 18f, PadTop, -50f), 0f);

            // Kiosks: workshop + clothing shop (enter the trigger to open them)
            _o.MapColor = new Color(0.95f, 0.65f, 0.2f);
            _o.Box("WorkshopKiosk", new Vector3(-46f, PadTop + 1.6f, -44f), new Vector3(6f, 3.2f, 5f), 0, Mat.FacadeB);
            _o.SpotTrigger("workshop", new Vector3(-46f, PadTop + 1f, -39.5f), new Vector3(6f, 2f, 3f));
            _o.Box("ShopKiosk", new Vector3(46f, PadTop + 1.6f, -44f), new Vector3(6f, 3.2f, 5f), 0, Mat.FacadeC);
            _o.SpotTrigger("shop", new Vector3(46f, PadTop + 1f, -39.5f), new Vector3(6f, 2f, 3f));

            Poi("plaza", "Plaza Mayor", PoiType.Spawn, new Vector3(0, PadTop + 0.3f, -28f), 0f, "plaza", true);
            Poi("workshop", "Taller Rueda Libre", PoiType.Workshop, new Vector3(-46f, PadTop, -38f), 0f, "plaza", false, false, 4f);
            Poi("shop", "Tienda Urban Kit", PoiType.Shop, new Vector3(46f, PadTop, -38f), 0f, "plaza", false, false, 4f);
            Poi("plaza_stairs", "Las 8 de la Plaza", PoiType.Spot, new Vector3(0, PadTop, 12f), 0f, "plaza");
        }

        private void Fountain(Vector3 center, float radius)
        {
            const int seg = 20;
            const float h = 0.5f, w = 0.6f;
            var rim = new Vector3[seg];
            for (int i = 0; i < seg; i++)
            {
                float a0 = i / (float)seg * Mathf.PI * 2f, a1 = (i + 1) / (float)seg * Mathf.PI * 2f;
                Vector3 p0 = center + new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)) * radius;
                Vector3 p1 = center + new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1)) * radius;
                Vector3 mid = (p0 + p1) * 0.5f;
                float len = Vector3.Distance(p0, p1) + 0.08f;
                float yaw = Mathf.Atan2(p1.x - p0.x, p1.z - p0.z) * Mathf.Rad2Deg;
                _o.Box("FountainRim", mid + Vector3.up * h * 0.5f, new Vector3(w, h, len), yaw, Mat.ConcreteDark, SurfaceType.Concrete, true, false);
                rim[i] = center + new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)) * (radius + w * 0.5f - 0.04f) + Vector3.up * h;
            }
            _o.AddRail("FountainRim", rim, RailKind.Ledge, true);
            var water = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Object.Destroy(water.GetComponent<Collider>());
            water.transform.SetParent(_o.Root, false);
            water.transform.position = center + Vector3.up * (h - 0.12f);
            water.transform.localScale = new Vector3(radius * 2f, 0.01f, radius * 2f);
            water.GetComponent<MeshRenderer>().sharedMaterial = MaterialLibrary.Get(Mat.Water);
            var basin = new GameObject("FountainBasin");
            basin.transform.SetParent(_o.Root, false);
            basin.transform.position = center + Vector3.up * (h * 0.5f - 0.15f);
            basin.AddComponent<BoxCollider>().size = new Vector3(radius * 1.4f, h - 0.3f, radius * 1.4f);
            WorldAtlas.AddShape(center, new Vector2(radius * 2f, radius * 2f), new Color(0.4f, 0.6f, 0.75f));
        }

        // ==========================================================================================
        private void Skatepark()
        {
            ZoneInfo("skatepark", "Skatepark Las Dunas", new Rect(-62, 72, 124, 128), new Color(0.65f, 0.7f, 0.75f));
            _o.Ground("ParkSlab", new Rect(-62, 72, 124, 128), PadTop, 0.4f, Mat.ConcretePark, SurfaceType.SmoothConcrete, true, new Color(0.74f, 0.75f, 0.76f));
            float y = PadTop;

            // North wall: three quarter pipes of increasing size (ride +Z into them)
            _o.QuarterPipe(new Vector3(-42f, y, 190f), 0f, 18f, 2.2f, 1.5f, 2.2f);
            _o.QuarterPipe(new Vector3(-13f, y, 189f), 0f, 26f, 2.7f, 2.6f, 2.4f);
            _o.QuarterPipe(new Vector3(18f, y, 188f), 0f, 22f, 3.0f, 3.6f, 2.4f);
            // Extension wall to make the vert ramp feel enclosed
            _o.Box("VertPlatform", new Vector3(18f, y + 1.8f, 197.2f), new Vector3(22f, 3.6f, 2.8f), 0, Mat.ConcretePark, SurfaceType.SmoothConcrete, true, false);

            // Mini ramp (two quarters facing each other along X)
            _o.QuarterPipe(new Vector3(-50f, y, 112f), 270f, 12f, 2.3f, 1.8f, 2.4f);
            _o.QuarterPipe(new Vector3(-46f, y, 112f), 90f, 12f, 2.3f, 1.8f, 2.4f);

            // South-facing quarters on the south edge (ride -Z into them)
            _o.QuarterPipe(new Vector3(20f, y, 84f), 180f, 20f, 2.4f, 2.0f, 2f);

            // Raised bowl in the north east
            var bowlExt = _o.Bowl(new Vector3(42f, y + 2.4f, 150f), 26f, 22f, 2.4f, 2.4f, 4f, Mat.ConcretePark, "Bowl", 2.6f);
            _o.Bank(new Vector3(42f, y, 150f - bowlExt.y - 7.5f), 0f, 6f, 7.5f, 2.4f, 0f, Mat.ConcretePark, SurfaceType.SmoothConcrete, false); // ramp up to the bowl deck

            // Street course in the middle
            _o.Funbox(new Vector3(0f, y, 135f), 0f, 6f, 5f, 0.9f, 3.2f);
            _o.Kicker(new Vector3(-24f, y, 118f), 0f, 3.2f, 2.4f, 1.05f);
            _o.Bank(new Vector3(-24f, y, 128f), 180f, 3.2f, 3f, 1.05f, 0f, Mat.ConcretePark, SurfaceType.SmoothConcrete, true); // landing for the kicker gap
            _o.Kicker(new Vector3(24f, y, 96f), 0f, 3.5f, 3f, 1.5f);   // big kicker towards the bowl ramp
            _o.FlatRail(new Vector3(-34f, y, 100f), new Vector3(-14f, y, 100f), 0.35f);
            _o.FlatRail(new Vector3(-36f, y, 128f), new Vector3(-36f, y, 152f), 0.42f, false, Mat.RailChrome);
            _o.Ledge(new Vector3(-14f, y, 160f), 90f, 10f, 0.45f, 0.7f);
            _o.Ledge(new Vector3(14f, y, 120f), 0f, 8f, 0.35f, 0.7f);
            _o.ManualPad(new Vector3(10f, y, 160f), 90f, 3f, 8f, 0.25f);
            _o.Bench(new Vector3(-56f, y, 140f), 0f, 4f);

            // Street platform with stairs and handrail
            const float ph = 1.2f;
            _o.Box("StreetPlatform", new Vector3(-45f, y + ph * 0.5f, 172.5f), new Vector3(22f, ph, 15f), 0, Mat.Concrete);
            _o.Stairs(new Vector3(-45f, y + ph, 165f), 180f, 6, ph / 6f, 0.4f, 9f, true, true);
            _o.Bank(new Vector3(-60.5f + 0f, y, 172.5f), 90f, 6f, 4.5f, ph, 0f, Mat.Concrete, SurfaceType.Concrete, false);
            _o.Ledge(new Vector3(-45f, y + ph, 176f), 90f, 12f, 0.4f, 0.7f);

            Poi("skatepark", "Skatepark Las Dunas", PoiType.Skatepark, new Vector3(0, y + 0.3f, 80f), 0f, "skatepark", true, false, 40f);
            Poi("bowl", "Bowl del Faro", PoiType.Spot, new Vector3(42f, y + 2.4f, 150f), 0f, "skatepark");
            Poi("vert", "Rampa Vert", PoiType.Challenge, new Vector3(18f, y, 182f), 0f, "skatepark");
        }

        // ==========================================================================================
        private void Park()
        {
            ZoneInfo("park", "Parque del Río", new Rect(-62, -200, 124, 128), new Color(0.45f, 0.62f, 0.4f));
            _o.Ground("ParkGrass", new Rect(-62, -200, 124, 128), PadTop, 0.4f, Mat.Grass, SurfaceType.Grass, true, new Color(0.42f, 0.58f, 0.36f));
            // Concrete paths (cross + loop)
            float py = PadTop + 0.04f;
            _o.MapColor = new Color(0.78f, 0.76f, 0.72f);
            _o.Box("PathNS", new Vector3(0, py - 0.05f, -136f), new Vector3(6f, 0.1f, 128f), 0, Mat.Concrete, SurfaceType.Concrete);
            _o.Box("PathEW", new Vector3(0, py - 0.05f, -136f), new Vector3(124f, 0.1f, 6f), 0, Mat.Concrete, SurfaceType.Concrete);
            _o.Box("PathLoopN", new Vector3(0, py - 0.05f, -106f), new Vector3(90f, 0.1f, 5f), 0, Mat.Concrete, SurfaceType.Concrete);
            _o.Box("PathLoopS", new Vector3(0, py - 0.05f, -168f), new Vector3(90f, 0.1f, 5f), 0, Mat.Concrete, SurfaceType.Concrete);
            _o.Box("PathLoopW", new Vector3(-45f, py - 0.05f, -137f), new Vector3(5f, 0.1f, 67f), 0, Mat.Concrete, SurfaceType.Concrete);
            _o.Box("PathLoopE", new Vector3(45f, py - 0.05f, -137f), new Vector3(5f, 0.1f, 67f), 0, Mat.Concrete, SurfaceType.Concrete);

            // Amphitheatre platform with stairs and side banks
            float top = PadTop + 0.04f + 1.4f;
            _o.Box("Amphitheatre", new Vector3(0, py + 0.7f - 0.05f, -152f), new Vector3(24f, 1.4f, 14f), 0, Mat.Concrete);
            _o.Stairs(new Vector3(0, top - 0.05f, -145f), 0f, 7, 0.2f, 0.4f, 12f, true, true);
            _o.Bank(new Vector3(-12f - 5f, py - 0.05f, -152f), 90f, 8f, 5f, 1.4f, 0f, Mat.Concrete, SurfaceType.Concrete, false);
            _o.Bank(new Vector3(12f + 5f, py - 0.05f, -152f), 270f, 8f, 5f, 1.4f, 0f, Mat.Concrete, SurfaceType.Concrete, false);
            _o.Ledge(new Vector3(0, top - 0.05f, -156f), 90f, 16f, 0.45f, 0.8f);

            // Pond with a grindable rim
            Fountain(new Vector3(-30f, PadTop, -125f), 7f);
            // Long rails along the paths
            _o.FlatRail(new Vector3(6f, py, -120f), new Vector3(6f, py, -85f), 0.38f, false, Mat.RailChrome);
            _o.FlatRail(new Vector3(-20f, py, -133f), new Vector3(20f, py, -133f), 0.38f);
            for (int i = 0; i < 8; i++) _o.Bench(new Vector3(-36f + i * 10f, PadTop, -100.5f), 90f);
            for (int i = 0; i < 40; i++)
            {
                var p = new Vector3(R(-58f, 58f), PadTop, R(-196f, -78f));
                if (Mathf.Abs(p.x) < 6f || Mathf.Abs(p.z + 136f) < 6f || (Mathf.Abs(p.x) < 15f && p.z < -140f)) continue;
                _o.Tree(p, R(0.9f, 1.4f));
            }
            Poi("park", "Parque del Río", PoiType.Spawn, new Vector3(0, PadTop + 0.4f, -82f), 180f, "park", true, false, 30f);
            Poi("park_rest", "Merendero", PoiType.Rest, new Vector3(30f, PadTop, -100f), 0f, "park");
        }

        // ==========================================================================================
        private void Industrial()
        {
            ZoneInfo("industrial", "Muelles de Hierro", new Rect(80, -140, 225, 280), new Color(0.55f, 0.5f, 0.45f));
            _o.Ground("IndustrialYard", new Rect(80, -140, 225, 280), PadTop, 0.4f, Mat.ConcreteDark, SurfaceType.Concrete, true, new Color(0.5f, 0.5f, 0.5f));
            float y = PadTop;
            // Warehouses
            _o.Building(new Vector3(270f, y, -100f), new Vector3(36f, 9f, 28f), 0f, Mat.FacadeD);
            _o.Building(new Vector3(270f, y, -40f), new Vector3(30f, 7f, 24f), 0f, Mat.FacadeB);

            // Container yard with stacks
            Color[] cols = { new Color(0.7f, 0.22f, 0.14f), new Color(0.15f, 0.35f, 0.6f), new Color(0.2f, 0.5f, 0.3f), new Color(0.85f, 0.6f, 0.15f) };
            for (int i = 0; i < 6; i++)
                for (int k = 0; k < 2; k++)
                {
                    var c = new Vector3(120f + i * 8f, y + 1.3f + k * 2.6f, -110f + (i % 2) * 3f);
                    if (k == 1 && i % 3 == 0) continue;
                    _o.Box("Container", c, new Vector3(2.44f, 2.6f, 6.06f), 0, Mat.Container, SurfaceType.Metal, true, true, MaterialLibrary.Tinted(Mat.Container, cols[(i + k) % 4]));
                }

            // Loading dock: long ledge platform with banks
            _o.Box("Dock", new Vector3(170f, y + 0.6f, -60f), new Vector3(50f, 1.2f, 8f), 0, Mat.Concrete);
            _o.Bank(new Vector3(140f, y, -60f), 90f, 8f, 5f, 1.2f, 0f, Mat.Concrete, SurfaceType.Concrete, false);
            _o.Ledge(new Vector3(170f, y, -55.6f), 90f, 48f, 1.2f, 0.4f, Mat.ConcreteDark, true);

            // Metal platforms with a gap and a connecting rail
            _o.MapColor = new Color(0.4f, 0.45f, 0.5f);
            _o.Box("PlatformA", new Vector3(140f, y + 1.25f, 10f), new Vector3(16f, 2.5f, 12f), 0, Mat.MetalStructure, SurfaceType.Metal);
            _o.Box("PlatformB", new Vector3(160f, y + 1.25f, 10f), new Vector3(16f, 2.5f, 12f), 0, Mat.MetalStructure, SurfaceType.Metal);
            _o.Bank(new Vector3(140f - 8f - 9f, y, 10f), 90f, 8f, 9f, 2.5f, 0f, Mat.MetalStructure, SurfaceType.Metal, false);
            _o.Kicker(new Vector3(146f, y + 2.5f, 10f), 90f, 4f, 2f, 0.6f, Mat.MetalStructure, SurfaceType.Metal);
            _o.Bank(new Vector3(160f + 8f + 9f, y, 10f), 270f, 8f, 9f, 2.5f, 0f, Mat.MetalStructure, SurfaceType.Metal, false);
            _o.FlatRail(new Vector3(146f, 0, 15.2f), new Vector3(154f, 0, 15.2f), y + 2.5f + 0.12f, true, Mat.RailPainted); // grind the gap

            // Scaffolding rails
            _o.FlatRail(new Vector3(110f, y, 60f), new Vector3(150f, y, 60f), 0.5f, false, Mat.RailPainted);
            _o.FlatRail(new Vector3(110f, y, 70f), new Vector3(110f, y, 110f), 0.5f, false, Mat.RailPainted);
            _o.Kicker(new Vector3(130f, y, 40f), 0f, 4f, 3f, 1.2f, Mat.MetalStructure, SurfaceType.Metal);

            // Secret: container staircase to the roof of a warehouse (5.3 m)
            const float roofH = 5.2f;
            _o.Bank(new Vector3(200f, y, 80f), 0f, 6.5f, 10f, 2.6f, 0f, Mat.MetalStructure, SurfaceType.Metal, false);
            for (int i = 0; i < 2; i++)
                _o.Box("ContainerRow", new Vector3(200f, y + 1.3f, 93.03f + i * 6.06f), new Vector3(6.5f, 2.6f, 6.06f), 0, Mat.Container, SurfaceType.Metal, true, true, MaterialLibrary.Tinted(Mat.Container, cols[1]));
            _o.Bank(new Vector3(200f, y + 2.6f, 96.1f), 0f, 6.5f, 5.9f, 2.6f, 0f, Mat.MetalStructure, SurfaceType.Metal, false);
            // 1 m gap from the top of the second bank (z = 102) to the roof edge (z = 103).
            _o.Building(new Vector3(200f, y, 112f), new Vector3(28f, roofH, 18f), 0f, Mat.FacadeD);
            float roof = y + roofH + 0.3f;
            _o.QuarterPipe(new Vector3(200f, roof, 116.5f), 0f, 14f, 2f, 1.6f, 1f, Mat.ConcretePark, SurfaceType.SmoothConcrete);
            _o.FlatRail(new Vector3(190f, roof, 108f), new Vector3(210f, roof, 108f), 0.35f, false, Mat.RailChrome);
            _o.SpotTrigger("secret_roof", new Vector3(200f, roof + 1f, 111f), new Vector3(24f, 2f, 12f));
            Poi("secret_roof", "Azotea del Muelle", PoiType.Secret, new Vector3(200f, roof + 0.3f, 105f), 0f, "industrial", true, true, 8f);

            for (int i = 0; i < 6; i++) _o.Lamp(new Vector3(100f + i * 30f, y, 30f), 0f);
            Poi("industrial", "Muelles de Hierro", PoiType.Spawn, new Vector3(100f, y + 0.3f, 0f), 90f, "industrial", true, false, 40f);
        }

        // ==========================================================================================
        private void Coast()
        {
            ZoneInfo("coast", "Paseo Marítimo", new Rect(SeaEdgeX, -200, 155, 400), new Color(0.75f, 0.68f, 0.55f));
            float y = PadTop;
            _o.Ground("Promenade", new Rect(-205f, -200, 125, 400), y, 0.4f, Mat.Sidewalk, SurfaceType.Tiles, true, new Color(0.8f, 0.76f, 0.68f));
            _o.Ground("Boardwalk", new Rect(SeaEdgeX, -200, 30, 400), y, 0.4f, Mat.Wood, SurfaceType.Wood, true, new Color(0.62f, 0.5f, 0.38f));
            // Seawall railing: long grindable rail split in sections with gaps (posts)
            for (int i = 0; i < 10; i++)
            {
                float z0 = -195f + i * 40f;
                _o.FlatRail(new Vector3(SeaEdgeX + 0.6f, y, z0), new Vector3(SeaEdgeX + 0.6f, y, z0 + 36f), 0.9f, false, Mat.RailChrome);
            }
            // Pier
            _o.Box("Pier", new Vector3(SeaEdgeX - 30f, y - 0.2f, 120f), new Vector3(60f, 0.4f, 8f), 0, Mat.Wood, SurfaceType.Wood);
            _o.FlatRail(new Vector3(SeaEdgeX - 58f, y, 116.3f), new Vector3(SeaEdgeX - 2f, y, 116.3f), 0.8f, false, Mat.RailChrome);
            _o.FlatRail(new Vector3(SeaEdgeX - 58f, y, 123.7f), new Vector3(SeaEdgeX - 2f, y, 123.7f), 0.8f, false, Mat.RailChrome);
            // Long benches and ledges along the promenade
            for (int i = 0; i < 12; i++)
            {
                float z = -180f + i * 32f;
                _o.Ledge(new Vector3(-200f, y, z), 0f, 12f, 0.45f, 0.6f, Mat.ConcreteDark);
                _o.Tree(new Vector3(-188f, y, z + 10f), 1.1f);
            }
            // Coastal skate plaza
            _o.MapColor = new Color(0.72f, 0.72f, 0.72f);
            _o.Ground("CoastPlaza", new Rect(-170, -30, 60, 60), y + 0.02f, 0.1f, Mat.ConcretePark, SurfaceType.SmoothConcrete, true, new Color(0.74f, 0.75f, 0.76f));
            float py = y + 0.02f;
            _o.Bank(new Vector3(-140f, py, -30f + 1f), 0f, 14f, 3.5f, 1f, 1.5f);
            _o.Bank(new Vector3(-140f, py, 30f - 1f), 180f, 14f, 3.5f, 1f, 1.5f);
            _o.Ledge(new Vector3(-150f, py, 0f), 0f, 10f, 0.45f, 0.7f);
            _o.Ledge(new Vector3(-130f, py, 0f), 0f, 10f, 0.3f, 0.7f);
            _o.FlatRail(new Vector3(-140f, py, -10f), new Vector3(-140f, py, 10f), 0.35f);
            _o.QuarterPipe(new Vector3(-118f, py, 0f), 90f, 12f, 2f, 1.4f, 1.5f);
            _o.ManualPad(new Vector3(-160f, py, 12f), 0f, 3f, 7f);
            Poi("coast", "Paseo Marítimo", PoiType.Spawn, new Vector3(-150f, py + 0.3f, -18f), 0f, "coast", true, false, 40f);
            Poi("pier", "El Muelle", PoiType.Spot, new Vector3(SeaEdgeX - 30f, y, 120f), 270f, "coast");
            Poi("coast_rest", "Chiringuito", PoiType.Rest, new Vector3(-185f, y, 60f), 0f, "coast");
        }

        // ==========================================================================================
        private void Residential()
        {
            ZoneInfo("residential", "Barrio Alto", new Rect(80, -300, 225, 145), new Color(0.7f, 0.62f, 0.55f));
            float y = PadTop;
            // Blocks of houses separated by streets with grindable curbs
            for (int bx = 0; bx < 3; bx++)
            {
                for (int bz = 0; bz < 2; bz++)
                {
                    float cx = 120f + bx * 65f, cz = -265f + bz * 70f;
                    var block = new Rect(cx - 25f, cz - 22f, 50f, 44f);
                    _o.Ground("Block", block, y + 0.05f, 0.4f, Mat.Sidewalk, SurfaceType.Tiles, true, new Color(0.7f, 0.68f, 0.64f));
                    // Curb edges are grindable
                    float top = y + 0.05f;
                    _o.AddRail("Curb", new[] { new Vector3(block.xMin, top, block.yMin), new Vector3(block.xMax, top, block.yMin) }, RailKind.Curb);
                    _o.AddRail("Curb", new[] { new Vector3(block.xMin, top, block.yMax), new Vector3(block.xMax, top, block.yMax) }, RailKind.Curb);
                    _o.AddRail("Curb", new[] { new Vector3(block.xMin, top, block.yMin), new Vector3(block.xMin, top, block.yMax) }, RailKind.Curb);
                    _o.AddRail("Curb", new[] { new Vector3(block.xMax, top, block.yMin), new Vector3(block.xMax, top, block.yMax) }, RailKind.Curb);
                    for (int h = 0; h < 3; h++)
                    {
                        var hc = new Vector3(cx - 15f + h * 15f, top, cz + 8f);
                        Mat m = (h + bx + bz) % 3 == 0 ? Mat.FacadeA : ((h + bx) % 2 == 0 ? Mat.FacadeC : Mat.FacadeB);
                        _o.Building(hc, new Vector3(11f, R(6f, 9f), 10f), 0f, m);
                    }
                    _o.Bench(new Vector3(cx, top, cz - 12f), 90f, 4f);
                    _o.Ledge(new Vector3(cx - 14f, top, cz - 14f), 90f, 7f, 0.4f, 0.6f);
                    _o.FlatRail(new Vector3(cx + 8f, top, cz - 16f), new Vector3(cx + 20f, top, cz - 16f), 0.38f);
                    _o.Tree(new Vector3(cx - 20f, top, cz - 16f), 1f);
                    _o.Tree(new Vector3(cx + 20f, top, cz - 16f), 1f);
                }
            }
            // Secret: the empty pool behind the last house (raised patio)
            // The pool floor sits on the street asphalt (y = 0), its patio deck is 1.8 m up.
            const float patio = 1.8f;
            var poolExt = _o.Bowl(new Vector3(285f, patio, -280f), 14f, 10f, patio, 1.8f, 3f, Mat.Concrete, "Pool", 2f);
            _o.Bank(new Vector3(285f - poolExt.x - 4f, 0f, -280f), 90f, 5f, 4f, patio, 0f, Mat.Concrete, SurfaceType.Concrete, false);
            _o.SpotTrigger("secret_pool", new Vector3(285f, 1f, -280f), new Vector3(10f, 2f, 7f));
            Poi("secret_pool", "La Piscina Vacía", PoiType.Secret, new Vector3(285f, y, -280f), 270f, "residential", true, true, 8f);
            Poi("residential", "Barrio Alto", PoiType.Spawn, new Vector3(152f, y + 0.4f, -230f), 90f, "residential", true, false, 40f);
        }

        // ==========================================================================================
        private void Competition()
        {
            ZoneInfo("competition", "Arena Rueda Pro", new Rect(80, 150, 225, 150), new Color(0.75f, 0.55f, 0.35f));
            float y = PadTop;
            _o.Ground("ArenaFloor", new Rect(110, 165, 160, 110), y, 0.4f, Mat.Wood, SurfaceType.Wood, true, new Color(0.65f, 0.5f, 0.36f));
            // Spectator stands
            for (int i = 0; i < 4; i++)
            {
                _o.Box("StandN", new Vector3(190f, y + 0.6f + i * 0.6f, 280f + i * 1.6f), new Vector3(150f, 1.2f + i * 1.2f, 1.6f), 0, Mat.Concrete, SurfaceType.Concrete, true, false);
                _o.Box("StandS", new Vector3(190f, y + 0.6f + i * 0.6f, 160f - i * 1.6f), new Vector3(150f, 1.2f + i * 1.2f, 1.6f), 0, Mat.Concrete, SurfaceType.Concrete, true, false);
            }
            // Start tower with roll-in
            _o.Box("StartTower", new Vector3(118f, y + 2.5f, 220f), new Vector3(10f, 5f, 12f), 0, Mat.Wood, SurfaceType.Wood);
            _o.Bank(new Vector3(123f + 10f, y, 220f), 270f, 8f, 10f, 5f, 0f, Mat.Wood, SurfaceType.Wood, false);
            // Course: kicker-to-landing gap, quarters at the far end, rail and hubba
            _o.Kicker(new Vector3(150f, y, 220f), 90f, 5f, 3.2f, 1.6f, Mat.Wood, SurfaceType.Wood);
            _o.Bank(new Vector3(169f, y, 220f), 270f, 6f, 6f, 1.6f, 3f, Mat.Wood, SurfaceType.Wood, false); // ~7 m gap
            _o.QuarterPipe(new Vector3(250f, y, 200f), 90f, 20f, 2.8f, 3.2f, 2.4f, Mat.Wood, SurfaceType.Wood);
            _o.QuarterPipe(new Vector3(250f, y, 245f), 90f, 18f, 2.4f, 2.2f, 2.4f, Mat.Wood, SurfaceType.Wood);
            _o.FlatRail(new Vector3(190f, y, 190f), new Vector3(225f, y, 190f), 0.4f, false, Mat.RailChrome);
            const float ph = 1.4f;
            _o.Box("ArenaStep", new Vector3(205f, y + ph * 0.5f, 255f), new Vector3(20f, ph, 10f), 0, Mat.Wood, SurfaceType.Wood);
            _o.Stairs(new Vector3(205f, y + ph, 250f), 180f, 7, ph / 7f, 0.4f, 9f, true, true, Mat.Wood);
            _o.Funbox(new Vector3(205f, y, 220f), 90f, 5f, 4f, 0.8f, 3f);
            Poi("competition", "Arena Rueda Pro", PoiType.Event, new Vector3(140f, y + 0.3f, 205f), 90f, "competition", true, false, 50f);
        }

        // ==========================================================================================
        private void CityBlocks()
        {
            Mat[] facades = { Mat.FacadeA, Mat.FacadeB, Mat.FacadeC, Mat.FacadeD };
            void Block(Rect r, float minH, float maxH)
            {
                _o.Ground("CityBlock", r, PadTop, 0.4f, Mat.Sidewalk, SurfaceType.Tiles, true, new Color(0.6f, 0.6f, 0.6f));
                float x = r.xMin + 3f;
                while (x < r.xMax - 10f)
                {
                    float w = R(14f, 26f);
                    if (x + w > r.xMax - 3f) w = r.xMax - 3f - x;
                    float d = Mathf.Min(r.height - 6f, R(16f, 30f));
                    var c = new Vector3(x + w * 0.5f, PadTop, r.center.y);
                    _o.Building(c, new Vector3(w - 1.5f, R(minH, maxH), d), 0f, facades[_rng.Next(facades.Length)]);
                    x += w;
                }
            }
            Block(new Rect(-60f, 208f, 120f, 92f), 18f, 46f);
            Block(new Rect(-60f, -300f, 120f, 92f), 14f, 30f);
            Block(new Rect(-300f + 85f, 208f, 130f, 92f), 20f, 55f);
            Block(new Rect(-300f + 85f, -300f, 130f, 92f), 12f, 28f);
        }
    }
}

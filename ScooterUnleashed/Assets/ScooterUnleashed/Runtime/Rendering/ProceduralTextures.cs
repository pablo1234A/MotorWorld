using UnityEngine;

namespace ScooterUnleashed.Rendering
{
    /// <summary>
    /// Generates tileable albedo + normal textures at startup so the world has real material detail without
    /// shipping texture assets. Replaceable later by authored PBR texture sets with the same material keys.
    /// </summary>
    public static class ProceduralTextures
    {
        public static int Size = 256;

        private static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 2147483647);
                h = (h ^ (h >> 13)) * 1274126177u;
                h ^= h >> 16;
                return (h & 0xFFFFFF) / (float)0xFFFFFF;
            }
        }

        /// <summary>Tileable value noise with period = size / cell.</summary>
        private static float ValueNoise(float x, float y, int period, int seed)
        {
            int x0 = Mathf.FloorToInt(x), y0 = Mathf.FloorToInt(y);
            float fx = x - x0, fy = y - y0;
            fx = fx * fx * (3 - 2 * fx);
            fy = fy * fy * (3 - 2 * fy);
            int xa = ((x0 % period) + period) % period, xb = (xa + 1) % period;
            int ya = ((y0 % period) + period) % period, yb = (ya + 1) % period;
            float a = Hash(xa, ya, seed), b = Hash(xb, ya, seed), c = Hash(xa, yb, seed), d = Hash(xb, yb, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, fx), Mathf.Lerp(c, d, fx), fy);
        }

        public static float Fbm(float u, float v, int baseFreq, int octaves, int seed)
        {
            float sum = 0, amp = 0.5f, norm = 0;
            int f = baseFreq;
            for (int o = 0; o < octaves; o++)
            {
                sum += ValueNoise(u * f, v * f, f, seed + o * 17) * amp;
                norm += amp;
                amp *= 0.5f;
                f *= 2;
            }
            return sum / norm;
        }

        public delegate float HeightFn(float u, float v, int px, int py);

        public struct TextureSet
        {
            public Texture2D Albedo;
            public Texture2D Normal;
        }

        public static TextureSet Build(string name, Color baseColor, float colorVariation, float normalStrength, HeightFn height, System.Func<float, float, float, Color> tint = null)
        {
            int n = Size;
            var hmap = new float[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                    hmap[y * n + x] = height(x / (float)n, y / (float)n, x, y);

            var albedo = new Texture2D(n, n, TextureFormat.RGBA32, true) { name = name + "_Albedo", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, anisoLevel = 4 };
            var normal = new Texture2D(n, n, TextureFormat.RGBA32, true, true) { name = name + "_Normal", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, anisoLevel = 2 };
            var ca = new Color32[n * n];
            var cn = new Color32[n * n];
            for (int y = 0; y < n; y++)
            {
                for (int x = 0; x < n; x++)
                {
                    float h = hmap[y * n + x];
                    float u = x / (float)n, v = y / (float)n;
                    Color c = tint != null ? tint(u, v, h) : baseColor * Mathf.Lerp(1f - colorVariation, 1f + colorVariation * 0.5f, h);
                    c.a = 1f;
                    ca[y * n + x] = c;
                    float hl = hmap[y * n + (x + n - 1) % n], hr = hmap[y * n + (x + 1) % n];
                    float hd = hmap[((y + n - 1) % n) * n + x], hu = hmap[((y + 1) % n) * n + x];
                    var nv = new Vector3((hl - hr) * normalStrength, (hd - hu) * normalStrength, 1f).normalized;
                    // RGB + A=R layout works with both RGB and AG (DXT5nm style) normal unpacking.
                    byte r = (byte)Mathf.Clamp((nv.x * 0.5f + 0.5f) * 255f, 0, 255);
                    cn[y * n + x] = new Color32(r, (byte)Mathf.Clamp((nv.y * 0.5f + 0.5f) * 255f, 0, 255), (byte)Mathf.Clamp((nv.z * 0.5f + 0.5f) * 255f, 0, 255), r);
                }
            }
            albedo.SetPixels32(ca);
            albedo.Apply(true, true);
            normal.SetPixels32(cn);
            normal.Apply(true, true);
            return new TextureSet { Albedo = albedo, Normal = normal };
        }

        // ---- Presets -------------------------------------------------------------------------------
        public static TextureSet Concrete(Color c, int seed) => Build("Concrete", c, 0.16f, 2.2f, (u, v, x, y) =>
        {
            float h = Fbm(u, v, 4, 5, seed) * 0.7f + Hash(x, y, seed + 9) * 0.3f;
            // sparse darker pores
            if (Hash(x, y, seed + 33) > 0.993f) h -= 0.35f;
            return h;
        });

        public static TextureSet Asphalt(Color c, int seed) => Build("Asphalt", c, 0.35f, 3.5f, (u, v, x, y) =>
        {
            float aggregate = Hash(x, y, seed);
            float h = Fbm(u, v, 8, 4, seed) * 0.4f + aggregate * 0.6f;
            return aggregate > 0.97f ? h + 0.3f : h;
        });

        public static TextureSet Griptape(int seed) => Build("Grip", new Color(0.09f, 0.09f, 0.1f), 0.5f, 5f, (u, v, x, y) => Hash(x, y, seed) * 0.8f + Fbm(u, v, 16, 2, seed) * 0.2f);

        public static TextureSet Tiles(Color a, Color b, int tilesPerTexture, int seed) => Build("Tiles", a, 0.1f, 2.5f, (u, v, x, y) =>
        {
            float tu = u * tilesPerTexture, tv = v * tilesPerTexture;
            float gx = Mathf.Abs(tu - Mathf.Round(tu)), gy = Mathf.Abs(tv - Mathf.Round(tv));
            float joint = Mathf.Min(gx, gy) < 0.025f ? 0f : 1f;
            return joint * (0.7f + Fbm(u, v, 8, 3, seed) * 0.3f);
        }, (u, v, h) =>
        {
            int ix = Mathf.FloorToInt(u * tilesPerTexture), iy = Mathf.FloorToInt(v * tilesPerTexture);
            float pick = Hash(ix, iy, seed);
            Color baseC = pick > 0.75f ? b : a;
            return h < 0.05f ? baseC * 0.55f : baseC * (0.88f + h * 0.18f);
        });

        public static TextureSet Wood(Color c, int seed) => Build("Wood", c, 0.25f, 1.5f, (u, v, x, y) =>
        {
            float plank = Mathf.Repeat(v * 8f, 1f);
            float seam = plank < 0.03f ? 0f : 1f;
            float grain = Mathf.Sin((u * 40f + Fbm(u, v, 4, 3, seed) * 6f) * Mathf.PI) * 0.5f + 0.5f;
            return seam * (0.6f + grain * 0.25f + Hash(Mathf.FloorToInt(v * 8f), 0, seed) * 0.15f);
        });

        public static TextureSet BrushedMetal(Color c, int seed) => Build("Metal", c, 0.08f, 0.6f, (u, v, x, y) =>
            ValueNoise(u * 2f, v * 256f, 256, seed) * 0.6f + Hash(x, y, seed) * 0.4f);

        public static TextureSet Grass(int seed) => Build("Grass", new Color(0.24f, 0.36f, 0.16f), 0.3f, 2f, (u, v, x, y) =>
            Fbm(u, v, 6, 4, seed) * 0.6f + Hash(x, y, seed) * 0.4f,
            (u, v, h) => Color.Lerp(new Color(0.17f, 0.27f, 0.11f), new Color(0.36f, 0.45f, 0.2f), h));

        public static TextureSet Sand(int seed) => Build("Sand", new Color(0.78f, 0.7f, 0.55f), 0.12f, 1.8f, (u, v, x, y) =>
            Fbm(u, v, 5, 4, seed) * 0.5f + Hash(x, y, seed) * 0.5f);

        public static TextureSet Water(int seed) => Build("Water", new Color(0.07f, 0.22f, 0.3f), 0.25f, 1.2f, (u, v, x, y) =>
            Fbm(u, v, 3, 4, seed));

        /// <summary>Facade with window grid; one texture covers 4 x 4 windows (one per 3.5 m floor).</summary>
        public static TextureSet Facade(Color wall, Color glass, int seed) => Build("Facade", wall, 0.1f, 2.5f, (u, v, x, y) =>
        {
            float wu = Mathf.Repeat(u * 4f, 1f), wv = Mathf.Repeat(v * 4f, 1f);
            bool window = wu > 0.18f && wu < 0.82f && wv > 0.25f && wv < 0.85f;
            bool frame = wu > 0.15f && wu < 0.85f && wv > 0.22f && wv < 0.88f;
            if (window) return 0.2f;
            if (frame) return 0.55f;
            return 0.75f + Fbm(u, v, 8, 3, seed) * 0.25f;
        }, (u, v, h) =>
        {
            if (h < 0.3f)
            {
                int ix = Mathf.FloorToInt(u * 4f), iy = Mathf.FloorToInt(v * 4f);
                float lit = Hash(ix, iy, seed);
                return Color.Lerp(glass, glass * 1.8f, lit * 0.6f);
            }
            if (h < 0.6f) return wall * 0.6f;
            return wall * (0.85f + h * 0.2f);
        });

        public static Texture2D SoftCircle(int size = 64)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "SoftCircle", wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2f - 1f, dy = (y + 0.5f) / size * 2f - 1f;
                    float a = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy));
                    a = a * a;
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            t.SetPixels32(px);
            t.Apply();
            return t;
        }
    }
}

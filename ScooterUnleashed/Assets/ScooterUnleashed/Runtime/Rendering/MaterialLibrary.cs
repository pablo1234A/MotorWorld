using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScooterUnleashed.Rendering
{
    public enum Mat
    {
        Concrete, ConcreteDark, ConcretePark, Asphalt, Sidewalk, PlazaTiles, Curb,
        Wood, Coping, RailChrome, RailPainted, MetalStructure, Container,
        FacadeA, FacadeB, FacadeC, FacadeD, Glass, Roof,
        Grass, Sand, Water, Foliage, Bark,
        Rubber, Aluminium, Titanium, Griptape, Plastic, Chrome,
        Cloth, Denim, Skin, Hair, Helmet, Emissive, RoadLine, Shadow,
    }

    /// <summary>
    /// Central PBR material factory. Uses URP/Lit when the Universal pipeline is active (templates created by the
    /// editor setup guarantee the shaders ship in builds) and falls back to the built-in Standard shader otherwise.
    /// Materials are shared and GPU-instancing enabled to keep draw calls and memory low on mobile.
    /// </summary>
    public static class MaterialLibrary
    {
        private static readonly Dictionary<Mat, Material> _mats = new Dictionary<Mat, Material>();
        private static readonly Dictionary<long, Material> _tinted = new Dictionary<long, Material>();
        private static Shader _lit;
        private static Shader _unlitParticles;
        private static bool _isUrp;
        private static Material _litTemplate;
        private static Material _particleTemplate;

        public static bool IsURP => _isUrp;

        public static void Init()
        {
            if (_lit != null) return;
            var rp = GraphicsSettings.currentRenderPipeline;
            _isUrp = rp != null && rp.GetType().Name.Contains("Universal");
            _litTemplate = Resources.Load<Material>("ScooterUnleashed/SU_LitTemplate");
            _particleTemplate = Resources.Load<Material>("ScooterUnleashed/SU_ParticleTemplate");
            if (_isUrp)
            {
                _lit = _litTemplate != null ? _litTemplate.shader : Shader.Find("Universal Render Pipeline/Lit");
                _unlitParticles = _particleTemplate != null ? _particleTemplate.shader : Shader.Find("Universal Render Pipeline/Particles/Unlit");
            }
            if (_lit == null) _lit = Shader.Find("Standard");
            if (_unlitParticles == null) _unlitParticles = Shader.Find("Particles/Standard Unlit") ?? Shader.Find("Sprites/Default");
            if (_lit == null) Debug.LogError("[ScooterUnleashed] No lit shader found. Run 'Scooter Unleashed > Setup Project' in the editor.");
        }

        public static Material Get(Mat key)
        {
            Init();
            if (_mats.TryGetValue(key, out var m) && m != null) return m;
            m = Create(key);
            _mats[key] = m;
            return m;
        }

        /// <summary>Shared tinted copy of a base material (used for customization colours and building variety).</summary>
        public static Material Tinted(Mat key, Color color)
        {
            Color32 c = color;
            long id = ((long)key << 32) | ((long)c.r << 24) | ((long)c.g << 16) | ((long)c.b << 8) | c.a;
            if (_tinted.TryGetValue(id, out var m) && m != null) return m;
            m = new Material(Get(key)) { name = key + "_" + ColorUtility.ToHtmlStringRGB(color) };
            SetColor(m, color);
            _tinted[id] = m;
            return m;
        }

        public static Material NewLit(string name, Color color, float metallic, float smoothness)
        {
            Init();
            var m = _litTemplate != null && _isUrp ? new Material(_litTemplate) : new Material(_lit);
            m.name = name;
            m.enableInstancing = true;
            SetColor(m, color);
            m.SetFloat("_Metallic", metallic);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Glossiness", smoothness);
            return m;
        }

        public static void SetColor(Material m, Color c)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        }

        public static void SetTextures(Material m, ProceduralTextures.TextureSet set, float tiling, float normalScale = 1f)
        {
            var scale = new Vector2(tiling, tiling);
            if (m.HasProperty("_BaseMap")) { m.SetTexture("_BaseMap", set.Albedo); m.SetTextureScale("_BaseMap", scale); }
            if (m.HasProperty("_MainTex")) { m.SetTexture("_MainTex", set.Albedo); m.SetTextureScale("_MainTex", scale); }
            if (set.Normal != null && m.HasProperty("_BumpMap"))
            {
                m.SetTexture("_BumpMap", set.Normal);
                m.SetTextureScale("_BumpMap", scale);
                m.SetFloat("_BumpScale", normalScale);
                m.EnableKeyword("_NORMALMAP");
            }
        }

        public static void SetEmission(Material m, Color c)
        {
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", c);
        }

        public static Material Particle(string name, Texture2D tex, Color tint, bool additive)
        {
            Init();
            var m = _particleTemplate != null && _isUrp ? new Material(_particleTemplate) : new Material(_unlitParticles);
            m.name = name;
            if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", tex);
            if (m.HasProperty("_MainTex")) m.SetTexture("_MainTex", tex);
            SetColor(m, tint);
            if (_isUrp)
            {
                // URP particle shader: transparent surface with alpha or additive blending.
                m.SetFloat("_Surface", 1f);
                m.SetFloat("_Blend", additive ? 2f : 0f);
                m.SetOverrideTag("RenderType", "Transparent");
                m.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                m.SetInt("_DstBlend", additive ? (int)BlendMode.One : (int)BlendMode.OneMinusSrcAlpha);
                m.SetInt("_ZWrite", 0);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                m.renderQueue = (int)RenderQueue.Transparent;
            }
            return m;
        }

        private static Material Create(Mat key)
        {
            const int seed = 1337;
            Material m;
            switch (key)
            {
                case Mat.Concrete:
                    m = NewLit("Concrete", new Color(0.68f, 0.67f, 0.64f), 0f, 0.28f);
                    SetTextures(m, ProceduralTextures.Concrete(Color.white, seed), 0.25f, 0.6f);
                    return m;
                case Mat.ConcretePark:
                    m = NewLit("ConcretePark", new Color(0.78f, 0.77f, 0.74f), 0f, 0.42f);
                    SetTextures(m, ProceduralTextures.Concrete(Color.white, seed + 1), 0.2f, 0.35f);
                    return m;
                case Mat.ConcreteDark:
                    m = NewLit("ConcreteDark", new Color(0.42f, 0.42f, 0.41f), 0f, 0.22f);
                    SetTextures(m, ProceduralTextures.Concrete(Color.white, seed + 2), 0.25f, 0.8f);
                    return m;
                case Mat.Asphalt:
                    m = NewLit("Asphalt", new Color(0.24f, 0.24f, 0.25f), 0f, 0.18f);
                    SetTextures(m, ProceduralTextures.Asphalt(Color.white, seed), 0.2f, 0.9f);
                    return m;
                case Mat.Sidewalk:
                    m = NewLit("Sidewalk", new Color(0.62f, 0.6f, 0.57f), 0f, 0.25f);
                    SetTextures(m, ProceduralTextures.Tiles(Color.white, new Color(0.92f, 0.9f, 0.86f), 4, seed), 0.5f, 0.7f);
                    return m;
                case Mat.PlazaTiles:
                    m = NewLit("PlazaTiles", new Color(0.75f, 0.71f, 0.64f), 0f, 0.35f);
                    SetTextures(m, ProceduralTextures.Tiles(Color.white, new Color(0.8f, 0.78f, 0.82f), 8, seed + 5), 0.125f, 0.5f);
                    return m;
                case Mat.Curb:
                    m = NewLit("Curb", new Color(0.58f, 0.57f, 0.55f), 0f, 0.3f);
                    SetTextures(m, ProceduralTextures.Concrete(Color.white, seed + 3), 0.5f, 0.6f);
                    return m;
                case Mat.Wood:
                    m = NewLit("Wood", new Color(0.62f, 0.46f, 0.3f), 0f, 0.35f);
                    SetTextures(m, ProceduralTextures.Wood(Color.white, seed), 0.25f, 0.5f);
                    return m;
                case Mat.Coping:
                    m = NewLit("Coping", new Color(0.75f, 0.77f, 0.8f), 1f, 0.72f);
                    SetTextures(m, ProceduralTextures.BrushedMetal(Color.white, seed), 1f, 0.2f);
                    return m;
                case Mat.RailChrome: return NewLit("RailChrome", new Color(0.82f, 0.83f, 0.86f), 1f, 0.82f);
                case Mat.RailPainted: return NewLit("RailPainted", new Color(0.86f, 0.24f, 0.12f), 0.3f, 0.55f);
                case Mat.MetalStructure:
                    m = NewLit("MetalStructure", new Color(0.33f, 0.37f, 0.4f), 0.85f, 0.45f);
                    SetTextures(m, ProceduralTextures.BrushedMetal(Color.white, seed + 1), 0.5f, 0.3f);
                    return m;
                case Mat.Container:
                    m = NewLit("Container", new Color(0.7f, 0.25f, 0.15f), 0.6f, 0.35f);
                    SetTextures(m, ProceduralTextures.BrushedMetal(Color.white, seed + 2), 0.4f, 0.6f);
                    return m;
                case Mat.FacadeA: return Facade("FacadeA", new Color(0.78f, 0.72f, 0.62f), seed + 10);
                case Mat.FacadeB: return Facade("FacadeB", new Color(0.55f, 0.36f, 0.3f), seed + 11);
                case Mat.FacadeC: return Facade("FacadeC", new Color(0.86f, 0.86f, 0.84f), seed + 12);
                case Mat.FacadeD: return Facade("FacadeD", new Color(0.36f, 0.42f, 0.48f), seed + 13);
                case Mat.Glass: return NewLit("Glass", new Color(0.12f, 0.17f, 0.22f), 0.9f, 0.92f);
                case Mat.Roof: return NewLit("Roof", new Color(0.3f, 0.3f, 0.31f), 0f, 0.2f);
                case Mat.Grass:
                    m = NewLit("Grass", Color.white, 0f, 0.12f);
                    SetTextures(m, ProceduralTextures.Grass(seed), 0.15f, 0.6f);
                    return m;
                case Mat.Sand:
                    m = NewLit("Sand", Color.white, 0f, 0.15f);
                    SetTextures(m, ProceduralTextures.Sand(seed), 0.2f, 0.6f);
                    return m;
                case Mat.Water:
                    m = NewLit("Water", Color.white, 0.2f, 0.93f);
                    SetTextures(m, ProceduralTextures.Water(seed), 0.03f, 0.4f);
                    return m;
                case Mat.Foliage: return NewLit("Foliage", new Color(0.2f, 0.36f, 0.16f), 0f, 0.2f);
                case Mat.Bark: return NewLit("Bark", new Color(0.32f, 0.24f, 0.17f), 0f, 0.15f);
                case Mat.Rubber: return NewLit("Rubber", new Color(0.06f, 0.06f, 0.065f), 0f, 0.35f);
                case Mat.Aluminium:
                    m = NewLit("Aluminium", new Color(0.8f, 0.81f, 0.83f), 1f, 0.62f);
                    SetTextures(m, ProceduralTextures.BrushedMetal(Color.white, seed + 7), 2f, 0.2f);
                    return m;
                case Mat.Titanium: return NewLit("Titanium", new Color(0.62f, 0.6f, 0.57f), 1f, 0.55f);
                case Mat.Griptape:
                    m = NewLit("Griptape", Color.white, 0f, 0.05f);
                    SetTextures(m, ProceduralTextures.Griptape(seed), 4f, 1f);
                    return m;
                case Mat.Plastic: return NewLit("Plastic", new Color(0.1f, 0.1f, 0.1f), 0f, 0.5f);
                case Mat.Chrome: return NewLit("Chrome", new Color(0.9f, 0.9f, 0.92f), 1f, 0.9f);
                case Mat.Cloth: return NewLit("Cloth", new Color(0.85f, 0.85f, 0.85f), 0f, 0.12f);
                case Mat.Denim: return NewLit("Denim", new Color(0.22f, 0.3f, 0.45f), 0f, 0.15f);
                case Mat.Skin: return NewLit("Skin", new Color(0.8f, 0.6f, 0.48f), 0f, 0.38f);
                case Mat.Hair: return NewLit("Hair", new Color(0.12f, 0.08f, 0.05f), 0f, 0.3f);
                case Mat.Helmet: return NewLit("Helmet", new Color(0.12f, 0.12f, 0.13f), 0.1f, 0.75f);
                case Mat.Emissive:
                    m = NewLit("Emissive", new Color(1f, 0.92f, 0.75f), 0f, 0.5f);
                    SetEmission(m, new Color(1f, 0.85f, 0.6f) * 2f);
                    return m;
                case Mat.RoadLine: return NewLit("RoadLine", new Color(0.92f, 0.9f, 0.82f), 0f, 0.3f);
                default: return NewLit(key.ToString(), Color.magenta, 0f, 0.5f);
            }
        }

        private static Material Facade(string name, Color wall, int seed)
        {
            var m = NewLit(name, Color.white, 0f, 0.3f);
            SetTextures(m, ProceduralTextures.Facade(wall, new Color(0.1f, 0.13f, 0.17f), seed), 1f / 14f, 0.6f);
            return m;
        }
    }
}

using UnityEngine;
using UnityEngine.Rendering;

namespace ScooterUnleashed.Rendering
{
    /// <summary>
    /// Sun, sky, ambient and fog. Optional day/night cycle drives sun angle, colour temperature, ambient gradient and
    /// street lamp emission. Uses realtime lighting only (mobile friendly, no baking required for the procedural city).
    /// </summary>
    public sealed class LightingRig : MonoBehaviour
    {
        public Light Sun { get; private set; }
        public bool Cycle;
        public float TimeOfDay = 17.5f;     // hours
        public float CycleMinutesPerDay = 24f;
        private Material _sky;

        public void Build()
        {
            var go = new GameObject("Sun");
            go.transform.SetParent(transform, false);
            Sun = go.AddComponent<Light>();
            Sun.type = LightType.Directional;
            Sun.shadows = LightShadows.Soft;
            Sun.shadowBias = 0.04f;
            Sun.shadowNormalBias = 0.3f;
            RenderSettings.sun = Sun;

            var tmpl = Resources.Load<Material>("ScooterUnleashed/SU_SkyTemplate");
            var skyShader = tmpl != null ? tmpl.shader : Shader.Find("Skybox/Procedural");
            if (skyShader != null)
            {
                _sky = new Material(skyShader);
                _sky.SetFloat("_SunSize", 0.035f);
                _sky.SetFloat("_AtmosphereThickness", 1.05f);
                _sky.SetFloat("_Exposure", 1.15f);
                RenderSettings.skybox = _sky;
            }
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 120f;
            RenderSettings.fogEndDistance = 650f;
            Apply();
        }

        private void Update()
        {
            if (!Cycle) return;
            TimeOfDay = Mathf.Repeat(TimeOfDay + Time.deltaTime * 24f / (CycleMinutesPerDay * 60f), 24f);
            Apply();
        }

        public void Apply()
        {
            if (Sun == null) return;
            // Sun elevation: -90 at midnight, +peak at noon.
            float dayT = (TimeOfDay - 6f) / 12f;           // 0 at 6h, 1 at 18h
            float elev = Mathf.Sin(dayT * Mathf.PI) * 62f;  // degrees above horizon
            float azim = Mathf.Lerp(-100f, 100f, dayT) + 20f;
            Sun.transform.rotation = Quaternion.Euler(Mathf.Max(elev, -25f), azim, 0f);

            float day = Mathf.Clamp01(elev / 18f);          // 0 at horizon, 1 above 18 degrees
            float golden = Mathf.Clamp01(1f - Mathf.Abs(elev - 10f) / 14f);
            Color noon = new Color(1f, 0.96f, 0.9f);
            Color gold = new Color(1f, 0.7f, 0.45f);
            Sun.color = Color.Lerp(noon, gold, golden);
            Sun.intensity = Mathf.Lerp(0.05f, 1.25f, day);
            Sun.shadowStrength = Mathf.Lerp(0f, 0.85f, day);

            Color skyDay = new Color(0.55f, 0.66f, 0.82f), skyNight = new Color(0.06f, 0.08f, 0.14f);
            Color eqDay = new Color(0.62f, 0.58f, 0.52f), eqNight = new Color(0.08f, 0.08f, 0.1f);
            Color grDay = new Color(0.32f, 0.3f, 0.28f), grNight = new Color(0.04f, 0.04f, 0.05f);
            float a = Mathf.Clamp01((elev + 8f) / 26f);
            RenderSettings.ambientSkyColor = Color.Lerp(skyNight, skyDay, a);
            RenderSettings.ambientEquatorColor = Color.Lerp(eqNight, Color.Lerp(eqDay, new Color(0.7f, 0.55f, 0.45f), golden * 0.5f), a);
            RenderSettings.ambientGroundColor = Color.Lerp(grNight, grDay, a);
            RenderSettings.fogColor = Color.Lerp(new Color(0.05f, 0.06f, 0.09f), Color.Lerp(new Color(0.72f, 0.78f, 0.86f), new Color(0.9f, 0.72f, 0.58f), golden * 0.7f), a);
            if (_sky != null) _sky.SetFloat("_Exposure", Mathf.Lerp(0.15f, 1.15f, a));

            // Street lamps glow at dusk/night.
            var lamp = MaterialLibrary.Get(Mat.Emissive);
            float night = 1f - Mathf.Clamp01((elev + 2f) / 10f);
            if (lamp.HasProperty("_EmissionColor")) lamp.SetColor("_EmissionColor", new Color(1f, 0.82f, 0.55f) * Mathf.Lerp(0.2f, 3f, night));
        }
    }
}

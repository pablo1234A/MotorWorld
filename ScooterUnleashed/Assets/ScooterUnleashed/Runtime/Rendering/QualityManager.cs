using System.Reflection;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScooterUnleashed.Rendering
{
    public enum QualityTier { Low = 0, Medium = 1, High = 2 }

    /// <summary>
    /// Graphics profiles for mobile. Talks to the active URP asset through reflection so the runtime assembly has no
    /// hard dependency on the URP package (and still works with the built-in pipeline).
    /// </summary>
    public static class QualityManager
    {
        public static QualityTier Current { get; private set; } = QualityTier.Medium;
        public static float MaxRenderScale { get; private set; } = 1f;
        public static float MinRenderScale { get; private set; } = 0.7f;
        public static int TargetFps { get; private set; } = 60;

        public static QualityTier AutoDetect()
        {
            int mem = SystemInfo.systemMemorySize;
            int cores = SystemInfo.processorCount;
            int gpuMem = SystemInfo.graphicsMemorySize;
            if (Application.isMobilePlatform)
            {
                if (mem >= 7000 && cores >= 8 && gpuMem >= 2000) return QualityTier.High;
                if (mem >= 3800 && cores >= 6) return QualityTier.Medium;
                return QualityTier.Low;
            }
            return gpuMem >= 3000 ? QualityTier.High : QualityTier.Medium;
        }

        public static void Apply(QualityTier tier, int targetFps, Light sun)
        {
            Current = tier;
            TargetFps = targetFps;
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = targetFps;
            switch (tier)
            {
                case QualityTier.Low:
                    SetUrp("shadowDistance", 35f);
                    SetUrp("shadowCascadeCount", 1);
                    SetUrp("msaaSampleCount", 1);
                    SetUrp("supportsHDR", false);
                    QualitySettings.shadowDistance = 35f;
                    QualitySettings.lodBias = 0.6f;
                    MaxRenderScale = 0.8f; MinRenderScale = 0.6f;
                    if (sun != null) { sun.shadows = LightShadows.Hard; sun.shadowStrength = 0.7f; }
                    SetTextureLimit(1);
                    break;
                case QualityTier.Medium:
                    SetUrp("shadowDistance", 60f);
                    SetUrp("shadowCascadeCount", 2);
                    SetUrp("msaaSampleCount", 2);
                    SetUrp("supportsHDR", true);
                    QualitySettings.shadowDistance = 60f;
                    QualitySettings.lodBias = 1f;
                    MaxRenderScale = 0.9f; MinRenderScale = 0.7f;
                    if (sun != null) { sun.shadows = LightShadows.Soft; sun.shadowStrength = 0.8f; }
                    SetTextureLimit(0);
                    break;
                default:
                    SetUrp("shadowDistance", 110f);
                    SetUrp("shadowCascadeCount", 4);
                    SetUrp("msaaSampleCount", 4);
                    SetUrp("supportsHDR", true);
                    QualitySettings.shadowDistance = 110f;
                    QualitySettings.lodBias = 1.6f;
                    MaxRenderScale = 1f; MinRenderScale = 0.8f;
                    if (sun != null) { sun.shadows = LightShadows.Soft; sun.shadowStrength = 0.85f; }
                    SetTextureLimit(0);
                    break;
            }
            SetRenderScale(MaxRenderScale);
        }

        private static void SetTextureLimit(int limit)
        {
#if UNITY_2022_2_OR_NEWER
            QualitySettings.globalTextureMipmapLimit = limit;
#else
            QualitySettings.masterTextureLimit = limit;
#endif
        }

        public static float RenderScale
        {
            get
            {
                var rp = GraphicsSettings.currentRenderPipeline;
                if (rp == null) return 1f;
                var p = rp.GetType().GetProperty("renderScale", BindingFlags.Public | BindingFlags.Instance);
                return p != null ? (float)p.GetValue(rp) : 1f;
            }
        }

        public static void SetRenderScale(float s) => SetUrp("renderScale", Mathf.Clamp(s, 0.5f, 1f));

        private static void SetUrp(string property, object value)
        {
            var rp = GraphicsSettings.currentRenderPipeline;
            if (rp == null) return;
            var p = rp.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.Instance);
            if (p == null || !p.CanWrite) return;
            try { p.SetValue(rp, value); }
            catch (System.Exception e) { Debug.LogWarning($"[Quality] {property}: {e.Message}"); }
        }
    }

    /// <summary>Adapts the URP render scale to hold the target frame rate (measured, not assumed).</summary>
    public sealed class DynamicResolution : MonoBehaviour
    {
        public bool Enabled = true;
        private float _avg;
        private float _overTimer, _underTimer;
        public float AverageFrameMs => _avg * 1000f;
        public float Fps => _avg > 0f ? 1f / _avg : 0f;

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (dt <= 0f || dt > 0.5f) return;
            _avg = _avg <= 0f ? dt : Mathf.Lerp(_avg, dt, 0.05f);
            if (!Enabled) return;
            float target = 1f / Mathf.Max(20, QualityManager.TargetFps);
            if (_avg > target * 1.15f) { _overTimer += dt; _underTimer = 0f; }
            else if (_avg < target * 0.85f) { _underTimer += dt; _overTimer = 0f; }
            else { _overTimer = 0f; _underTimer = 0f; }
            float scale = QualityManager.RenderScale;
            if (_overTimer > 1f && scale > QualityManager.MinRenderScale) { QualityManager.SetRenderScale(scale - 0.05f); _overTimer = 0f; }
            if (_underTimer > 4f && scale < QualityManager.MaxRenderScale) { QualityManager.SetRenderScale(scale + 0.05f); _underTimer = 0f; }
        }
    }
}

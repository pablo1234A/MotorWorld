using UnityEngine;

namespace ScooterUnleashed.World
{
    public enum SurfaceType
    {
        Concrete,
        SmoothConcrete, // skatepark concrete, fastest
        Asphalt,
        Tiles,
        Wood,
        Metal,
        Grass,
        Sand,
    }

    [System.Serializable]
    public struct SurfaceProperties
    {
        public float RollingResistance; // m/s^2 at rest
        public float Grip;              // lateral grip multiplier
        public float MaxSpeedFactor;
        public float AudioPitch;
        public float AudioRoughness;    // 0 smooth .. 1 rough
        public bool Dust;
    }

    /// <summary>Tag a collider with the surface it represents. Untagged colliders count as concrete.</summary>
    public sealed class Surface : MonoBehaviour
    {
        public SurfaceType Type = SurfaceType.Concrete;

        public static SurfaceProperties Properties(SurfaceType t)
        {
            switch (t)
            {
                case SurfaceType.SmoothConcrete: return new SurfaceProperties { RollingResistance = 0.10f, Grip = 1.05f, MaxSpeedFactor = 1.05f, AudioPitch = 1.15f, AudioRoughness = 0.15f };
                case SurfaceType.Asphalt: return new SurfaceProperties { RollingResistance = 0.24f, Grip = 1f, MaxSpeedFactor = 0.95f, AudioPitch = 0.85f, AudioRoughness = 0.8f };
                case SurfaceType.Tiles: return new SurfaceProperties { RollingResistance = 0.16f, Grip = 0.95f, MaxSpeedFactor = 1f, AudioPitch = 1f, AudioRoughness = 0.45f };
                case SurfaceType.Wood: return new SurfaceProperties { RollingResistance = 0.12f, Grip = 1f, MaxSpeedFactor = 1.03f, AudioPitch = 0.7f, AudioRoughness = 0.25f };
                case SurfaceType.Metal: return new SurfaceProperties { RollingResistance = 0.1f, Grip = 0.85f, MaxSpeedFactor = 1.05f, AudioPitch = 1.4f, AudioRoughness = 0.2f };
                case SurfaceType.Grass: return new SurfaceProperties { RollingResistance = 2.2f, Grip = 0.7f, MaxSpeedFactor = 0.45f, AudioPitch = 0.5f, AudioRoughness = 1f, Dust = true };
                case SurfaceType.Sand: return new SurfaceProperties { RollingResistance = 3f, Grip = 0.6f, MaxSpeedFactor = 0.35f, AudioPitch = 0.45f, AudioRoughness = 1f, Dust = true };
                default: return new SurfaceProperties { RollingResistance = 0.15f, Grip = 1f, MaxSpeedFactor = 1f, AudioPitch = 1f, AudioRoughness = 0.4f };
            }
        }

        public static SurfaceType Of(Collider c)
        {
            if (c == null) return SurfaceType.Concrete;
            var s = c.GetComponent<Surface>();
            if (s == null && c.attachedRigidbody == null && c.transform.parent != null) s = c.transform.parent.GetComponent<Surface>();
            return s != null ? s.Type : SurfaceType.Concrete;
        }
    }
}

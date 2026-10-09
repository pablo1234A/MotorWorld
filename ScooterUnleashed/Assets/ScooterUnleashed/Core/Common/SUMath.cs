using System;

namespace ScooterUnleashed.Core
{
    /// <summary>Engine-agnostic math helpers so Core never depends on UnityEngine.</summary>
    public static class SUMath
    {
        public const float Deg2Rad = (float)(Math.PI / 180.0);
        public const float Rad2Deg = (float)(180.0 / Math.PI);

        public static float Clamp(float v, float min, float max) => v < min ? min : (v > max ? max : v);
        public static float Clamp01(float v) => Clamp(v, 0f, 1f);
        public static int Clamp(int v, int min, int max) => v < min ? min : (v > max ? max : v);
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static float InverseLerp(float a, float b, float v) => Math.Abs(b - a) < 1e-6f ? 0f : Clamp01((v - a) / (b - a));
        public static float Abs(float v) => v < 0 ? -v : v;
        public static float Sign(float v) => v < 0 ? -1f : 1f;

        public static float MoveTowards(float current, float target, float maxDelta)
        {
            if (Abs(target - current) <= maxDelta) return target;
            return current + Sign(target - current) * maxDelta;
        }

        /// <summary>Shortest signed difference between two angles in degrees, in (-180, 180].</summary>
        public static float DeltaAngle(float from, float to)
        {
            float d = (to - from) % 360f;
            if (d > 180f) d -= 360f;
            if (d <= -180f) d += 360f;
            return d;
        }

        /// <summary>Framerate-independent exponential smoothing factor.</summary>
        public static float Damp(float sharpness, float dt) => 1f - (float)Math.Exp(-sharpness * dt);
    }

    /// <summary>Minimal 2D vector used by gesture recognition.</summary>
    [Serializable]
    public struct Vec2
    {
        public float x;
        public float y;

        public Vec2(float x, float y) { this.x = x; this.y = y; }

        public static readonly Vec2 Zero = new Vec2(0, 0);
        public float Magnitude => (float)Math.Sqrt(x * x + y * y);
        public Vec2 Normalized { get { float m = Magnitude; return m > 1e-6f ? new Vec2(x / m, y / m) : Zero; } }
        public static Vec2 operator +(Vec2 a, Vec2 b) => new Vec2(a.x + b.x, a.y + b.y);
        public static Vec2 operator -(Vec2 a, Vec2 b) => new Vec2(a.x - b.x, a.y - b.y);
        public static Vec2 operator *(Vec2 a, float s) => new Vec2(a.x * s, a.y * s);
        public static float Dot(Vec2 a, Vec2 b) => a.x * b.x + a.y * b.y;
        public static float Cross(Vec2 a, Vec2 b) => a.x * b.y - a.y * b.x;
        /// <summary>Angle in degrees, 0 = right, 90 = up (counter-clockwise).</summary>
        public float AngleDeg => (float)Math.Atan2(y, x) * SUMath.Rad2Deg;
        public override string ToString() => $"({x:0.00},{y:0.00})";
    }

    /// <summary>Small deterministic PRNG (xorshift) so balance/noise is reproducible in tests and replays.</summary>
    public sealed class SURandom
    {
        private uint _state;
        public SURandom(uint seed) { _state = seed == 0 ? 0x9E3779B9u : seed; }
        public uint NextUInt()
        {
            uint x = _state;
            x ^= x << 13; x ^= x >> 17; x ^= x << 5;
            _state = x;
            return x;
        }
        /// <summary>Uniform float in [0,1).</summary>
        public float NextFloat() => (NextUInt() & 0xFFFFFF) / (float)0x1000000;
        /// <summary>Uniform float in [-1,1).</summary>
        public float NextSigned() => NextFloat() * 2f - 1f;
    }
}

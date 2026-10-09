using System;

namespace ScooterUnleashed.Core.Physics
{
    [Serializable]
    public class BalanceSettings
    {
        /// <summary>How fast an offset grows by itself (inverted pendulum stiffness).</summary>
        public float Instability = 2.2f;
        /// <summary>Instability growth per second spent balancing (long grinds get harder).</summary>
        public float InstabilityGrowth = 0.12f;
        /// <summary>Random disturbance strength.</summary>
        public float Noise = 1.4f;
        /// <summary>Acceleration produced by full player input.</summary>
        public float InputStrength = 7.5f;
        public float Damping = 1.6f;
        /// <summary>Random initial lean on entry.</summary>
        public float EntryKick = 0.35f;
    }

    /// <summary>
    /// One-axis balance mini-game used by grinds and manuals: an inverted pendulum the player keeps centred.
    /// Value in [-1, 1]; reaching either end means the rider loses balance.
    /// </summary>
    public sealed class BalanceMeter
    {
        private readonly SURandom _rng;
        private float _noiseTarget;
        private float _noise;
        private float _noiseTimer;

        public BalanceSettings Settings;
        /// <summary>0..10 stat from the scooter build (grind/manual control). 5 = neutral.</summary>
        public float Skill = 5f;
        /// <summary>Accessibility multiplier: below 1 makes balance easier.</summary>
        public float Assist = 1f;

        public float Value { get; private set; }
        public float Velocity { get; private set; }
        public float Elapsed { get; private set; }
        public bool Failed => Math.Abs(Value) >= 1f;
        public bool Active { get; private set; }

        public BalanceMeter(BalanceSettings settings, uint seed = 1234)
        {
            Settings = settings ?? new BalanceSettings();
            _rng = new SURandom(seed);
        }

        public void Begin(float difficulty = 1f, float initialBias = 0f)
        {
            Active = true;
            Elapsed = 0f;
            _difficulty = Math.Max(0.1f, difficulty);
            Value = SUMath.Clamp(initialBias + _rng.NextSigned() * Settings.EntryKick * 0.5f, -0.6f, 0.6f);
            Velocity = _rng.NextSigned() * Settings.EntryKick;
            _noise = 0f;
            _noiseTarget = 0f;
            _noiseTimer = 0f;
        }

        private float _difficulty = 1f;

        public void End() { Active = false; }

        /// <param name="input">Player correction in [-1, 1]: push opposite to the lean, like shifting weight back to centre.</param>
        public void Step(float dt, float input)
        {
            if (!Active || dt <= 0f) return;
            Elapsed += dt;

            // Smooth random disturbance changing every ~0.4s.
            _noiseTimer -= dt;
            if (_noiseTimer <= 0f)
            {
                _noiseTimer = 0.25f + _rng.NextFloat() * 0.35f;
                _noiseTarget = _rng.NextSigned();
            }
            _noise += (_noiseTarget - _noise) * SUMath.Damp(4f, dt);

            float skillFactor = SUMath.Lerp(1.35f, 0.7f, Skill / 10f);
            float inst = Settings.Instability * (1f + Elapsed * Settings.InstabilityGrowth) * _difficulty * skillFactor * Assist;
            float accel = Value * inst + _noise * Settings.Noise * _difficulty * Assist
                          + SUMath.Clamp(input, -1f, 1f) * Settings.InputStrength
                          - Velocity * Settings.Damping;
            Velocity += accel * dt;
            Value += Velocity * dt;
            if (Value > 1f) Value = 1f;
            if (Value < -1f) Value = -1f;
        }
    }
}

using System;

namespace ScooterUnleashed.Core.Stats
{
    public enum StatId
    {
        Acceleration,
        TopSpeed,
        AirControl,
        Stability,
        Steering,
        GrindBalance,
        TrickSpeed,
    }

    /// <summary>Gameplay stats on a 0..10 scale. Weight is tracked separately in grams.</summary>
    [Serializable]
    public struct ScooterStats
    {
        public float Acceleration;
        public float TopSpeed;
        public float AirControl;
        public float Stability;
        public float Steering;
        public float GrindBalance;
        public float TrickSpeed;

        public const int Count = 7;
        public const float Min = 0f;
        public const float Max = 10f;

        public static ScooterStats Uniform(float v) => new ScooterStats
        {
            Acceleration = v, TopSpeed = v, AirControl = v, Stability = v, Steering = v, GrindBalance = v, TrickSpeed = v
        };

        public float this[StatId id]
        {
            get
            {
                switch (id)
                {
                    case StatId.Acceleration: return Acceleration;
                    case StatId.TopSpeed: return TopSpeed;
                    case StatId.AirControl: return AirControl;
                    case StatId.Stability: return Stability;
                    case StatId.Steering: return Steering;
                    case StatId.GrindBalance: return GrindBalance;
                    default: return TrickSpeed;
                }
            }
            set
            {
                switch (id)
                {
                    case StatId.Acceleration: Acceleration = value; break;
                    case StatId.TopSpeed: TopSpeed = value; break;
                    case StatId.AirControl: AirControl = value; break;
                    case StatId.Stability: Stability = value; break;
                    case StatId.Steering: Steering = value; break;
                    case StatId.GrindBalance: GrindBalance = value; break;
                    default: TrickSpeed = value; break;
                }
            }
        }

        public static ScooterStats operator +(ScooterStats a, ScooterStats b)
        {
            var r = a;
            for (int i = 0; i < Count; i++) r[(StatId)i] = a[(StatId)i] + b[(StatId)i];
            return r;
        }

        public ScooterStats Clamped()
        {
            var r = this;
            for (int i = 0; i < Count; i++) r[(StatId)i] = SUMath.Clamp(r[(StatId)i], Min, Max);
            return r;
        }

        public float SumPositive()
        {
            float s = 0;
            for (int i = 0; i < Count; i++) s += Math.Max(0f, this[(StatId)i]);
            return s;
        }

        public float SumNegative()
        {
            float s = 0;
            for (int i = 0; i < Count; i++) s += Math.Min(0f, this[(StatId)i]);
            return s;
        }

        public static string Label(StatId id)
        {
            switch (id)
            {
                case StatId.Acceleration: return "Aceleración";
                case StatId.TopSpeed: return "Velocidad máx.";
                case StatId.AirControl: return "Control aéreo";
                case StatId.Stability: return "Estabilidad";
                case StatId.Steering: return "Dirección";
                case StatId.GrindBalance: return "Grind";
                default: return "Velocidad de trucos";
            }
        }
    }
}

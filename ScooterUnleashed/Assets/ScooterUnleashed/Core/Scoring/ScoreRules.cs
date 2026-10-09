using System;

namespace ScooterUnleashed.Core.Scoring
{
    /// <summary>All scoring constants in one tunable place.</summary>
    [Serializable]
    public class ScoreRules
    {
        /// <summary>Each repetition of the same trick in a combo multiplies its value by this.</summary>
        public float RepeatFactor = 0.5f;
        public float MinRepeatFactor = 0.1f;

        public float AirtimePointsPerSecond = 120f;
        public float AirtimeMinimum = 0.45f;
        public float HeightPointsPerMeter = 30f;

        public float PerfectLandingMultiplier = 1.25f;
        public float CleanLandingMultiplier = 1f;
        public float SketchyLandingMultiplier = 0.7f;

        /// <summary>Score scaling by trick difficulty: points * (1 + (difficulty-1) * DifficultyWeight).</summary>
        public float DifficultyWeight = 0.08f;

        /// <summary>Extra multiplier for each distinct trick family used in the combo after the first.</summary>
        public float VarietyBonusPerFamily = 0.25f;

        /// <summary>Seconds of plain riding after landing before the combo is banked.</summary>
        public float LinkWindow = 0.75f;

        public int MaxMultiplier = 30;

        public float LandingMultiplier(LandingQuality q)
        {
            switch (q)
            {
                case LandingQuality.Perfect: return PerfectLandingMultiplier;
                case LandingQuality.Clean: return CleanLandingMultiplier;
                case LandingQuality.Sketchy: return SketchyLandingMultiplier;
                default: return 0f;
            }
        }
    }
}

using System;

namespace ScooterUnleashed.Core.Scoring
{
    public enum LandingQuality
    {
        Bail,
        Sketchy,
        Clean,
        Perfect,
    }

    public enum BailReason
    {
        None,
        OverRotated,     // body not aligned with the ground (flip/roll unfinished)
        Sideways,        // heading perpendicular to travel direction
        TrickUnfinished, // a scooter trick was still running far from completion
        HeldTrick,       // landed while holding a body trick
        HardImpact,      // too much speed into the ground
        LostBalance,     // grind/manual balance failure
        Collision,       // hit a wall/obstacle too hard
    }

    [Serializable]
    public class LandingTolerances
    {
        /// <summary>Angle between scooter up and ground normal (deg).</summary>
        public float PerfectUpAngle = 12f;
        public float CleanUpAngle = 28f;
        public float SketchyUpAngle = 52f;

        /// <summary>Angle between scooter forward and travel direction on the ground plane (deg).</summary>
        public float PerfectHeading = 10f;
        public float CleanHeading = 25f;
        public float SketchyHeading = 48f;

        /// <summary>Velocity into the ground (m/s) along the surface normal.</summary>
        public float SketchyImpact = 9f;
        public float BailImpact = 14f;

        /// <summary>Multiplier applied to all angle tolerances (accessibility / beginner assist).</summary>
        public float AssistScale = 1f;

        public LandingTolerances Scaled(float scale)
        {
            var t = (LandingTolerances)MemberwiseClone();
            t.PerfectUpAngle *= scale; t.CleanUpAngle *= scale; t.SketchyUpAngle *= scale;
            t.PerfectHeading *= scale; t.CleanHeading *= scale; t.SketchyHeading *= scale;
            t.SketchyImpact *= scale; t.BailImpact *= scale;
            return t;
        }
    }

    public struct LandingInput
    {
        public float UpAngleDeg;
        /// <summary>Signed or unsigned heading error in degrees (0..180). Values near 180 mean fakie.</summary>
        public float HeadingErrorDeg;
        public float ImpactSpeed;
        /// <summary>Lowest completion (0..1) of any one-shot trick still running, 1 if none.</summary>
        public float PendingTrickCompletion;
        /// <summary>Required completion for the pending trick to be saved.</summary>
        public float PendingTrickLandable;
        public bool HoldingBodyTrick;
        /// <summary>Speed along the ground at touchdown. Heading is meaningless when almost stopped.</summary>
        public float GroundSpeed;
    }

    public struct LandingResult
    {
        public LandingQuality Quality;
        public BailReason Reason;
        /// <summary>True if the rider landed backwards (needs a revert).</summary>
        public bool Fakie;

        public bool IsBail => Quality == LandingQuality.Bail;
        public override string ToString() => Quality == LandingQuality.Bail ? $"Bail({Reason})" : (Fakie ? "Fakie " : "") + Quality;
    }

    /// <summary>Decides how a landing went from the measured physical state at touchdown.</summary>
    public static class LandingEvaluator
    {
        public static LandingResult Evaluate(in LandingInput input, LandingTolerances tol)
        {
            var result = new LandingResult { Quality = LandingQuality.Perfect, Reason = BailReason.None };

            if (input.HoldingBodyTrick) return Bail(BailReason.HeldTrick);
            if (input.PendingTrickCompletion < input.PendingTrickLandable) return Bail(BailReason.TrickUnfinished);
            if (input.UpAngleDeg > tol.SketchyUpAngle) return Bail(BailReason.OverRotated);
            if (input.ImpactSpeed > tol.BailImpact) return Bail(BailReason.HardImpact);

            float heading = Math.Abs(input.HeadingErrorDeg) % 360f;
            if (heading > 180f) heading = 360f - heading;
            // Landing backwards is legal (fakie) if it's close to 180.
            if (heading > 90f)
            {
                result.Fakie = true;
                heading = 180f - heading;
            }
            bool headingMatters = input.GroundSpeed > 1.5f;
            if (headingMatters && heading > tol.SketchyHeading) return Bail(BailReason.Sideways);

            result.Quality = Worst(result.Quality, GradeAngle(input.UpAngleDeg, tol.PerfectUpAngle, tol.CleanUpAngle));
            if (headingMatters) result.Quality = Worst(result.Quality, GradeAngle(heading, tol.PerfectHeading, tol.CleanHeading));
            if (input.ImpactSpeed > tol.SketchyImpact) result.Quality = Worst(result.Quality, LandingQuality.Sketchy);
            if (input.PendingTrickCompletion < 1f) result.Quality = Worst(result.Quality, LandingQuality.Sketchy);
            if (result.Fakie) result.Quality = Worst(result.Quality, LandingQuality.Clean);
            return result;
        }

        private static LandingQuality GradeAngle(float angle, float perfect, float clean)
        {
            if (angle <= perfect) return LandingQuality.Perfect;
            if (angle <= clean) return LandingQuality.Clean;
            return LandingQuality.Sketchy;
        }

        private static LandingQuality Worst(LandingQuality a, LandingQuality b) => a < b ? a : b;

        private static LandingResult Bail(BailReason reason) => new LandingResult { Quality = LandingQuality.Bail, Reason = reason };
    }
}

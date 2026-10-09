using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Tricks
{
    /// <summary>Result of turning the physical rotation of an air segment into named tricks.</summary>
    public struct RotationResult
    {
        /// <summary>Completed half turns of yaw (1 = 180, 2 = 360...).</summary>
        public int HalfSpins;
        /// <summary>Completed flips (positive = backflip, negative = frontflip).</summary>
        public int Flips;
        public string SpinTrickId;
        public string FlipTrickId;
        /// <summary>Human readable name, e.g. "Double Backflip 360" or "Flair".</summary>
        public string DisplayName;
    }

    /// <summary>
    /// Names rotations from the accumulated yaw/pitch measured by the physics layer. Rotation tricks are
    /// therefore always the consequence of what the scooter really did in the air, never a menu pick.
    /// </summary>
    public static class RotationResolver
    {
        /// <summary>How many degrees short of a full half turn still counts (landing slightly under-rotated).</summary>
        public const float SpinTolerance = 50f;
        public const float FlipTolerance = 60f;

        public static int CountHalfSpins(float totalYawDeg)
        {
            float a = Math.Abs(totalYawDeg);
            return (int)Math.Floor((a + SpinTolerance) / 180f);
        }

        public static int CountFlips(float totalPitchDeg)
        {
            float a = Math.Abs(totalPitchDeg);
            int n = (int)Math.Floor((a + FlipTolerance) / 360f);
            return totalPitchDeg >= 0 ? n : -n;
        }

        public static string SpinId(int halfSpins)
        {
            switch (halfSpins)
            {
                case 0: return null;
                case 1: return TrickIds.Spin180;
                case 2: return TrickIds.Spin360;
                case 3: return TrickIds.Spin540;
                case 4: return TrickIds.Spin720;
                default: return TrickIds.Spin900;
            }
        }

        /// <param name="totalYawDeg">Signed yaw accumulated in the air around the rider's up axis.</param>
        /// <param name="totalPitchDeg">Signed pitch accumulated, positive = backwards.</param>
        public static RotationResult Resolve(float totalYawDeg, float totalPitchDeg)
        {
            var r = new RotationResult
            {
                HalfSpins = CountHalfSpins(totalYawDeg),
                Flips = CountFlips(totalPitchDeg)
            };
            r.SpinTrickId = SpinId(r.HalfSpins);

            var parts = new List<string>(3);
            int flipCount = Math.Abs(r.Flips);
            if (flipCount > 0)
            {
                bool back = r.Flips > 0;
                if (back && r.HalfSpins == 1)
                {
                    // A backflip with a half turn is a flair: the yaw is part of the trick.
                    r.FlipTrickId = TrickIds.Flair;
                    r.SpinTrickId = null;
                    parts.Add(Prefix(flipCount) + "Flair");
                }
                else
                {
                    r.FlipTrickId = back ? TrickIds.Backflip : TrickIds.Frontflip;
                    parts.Add(Prefix(flipCount) + (back ? "Backflip" : "Frontflip"));
                }
            }
            if (r.SpinTrickId != null) parts.Add((r.HalfSpins * 180).ToString());
            r.DisplayName = string.Join(" ", parts);
            return r;
        }

        private static string Prefix(int count)
        {
            switch (count)
            {
                case 1: return "";
                case 2: return "Double ";
                case 3: return "Triple ";
                default: return count + "x ";
            }
        }
    }
}

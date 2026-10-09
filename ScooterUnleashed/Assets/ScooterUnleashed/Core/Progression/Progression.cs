using System;

namespace ScooterUnleashed.Core.Progression
{
    public struct XpGain
    {
        public int XpAdded;
        public int LevelsGained;
        public int NewLevel;
    }

    /// <summary>Level curve and XP/reputation rules. Cosmetics and parts unlock by level; nothing is sold for real money.</summary>
    public static class ProgressionRules
    {
        public const int MaxLevel = 50;
        public const int ScorePerXp = 50;

        /// <summary>XP needed to go from level n to n+1.</summary>
        public static int XpForNextLevel(int level)
        {
            level = Math.Max(1, level);
            return (int)Math.Round(400 * Math.Pow(level, 1.35));
        }

        public static int XpFromScore(int score) => Math.Max(0, score / ScorePerXp);

        /// <summary>Applies XP to the profile, handling multiple level-ups.</summary>
        public static XpGain AddXp(Save.ProfileData profile, int xp)
        {
            var g = new XpGain { XpAdded = Math.Max(0, xp) };
            profile.Xp += g.XpAdded;
            profile.TotalXp += g.XpAdded;
            while (profile.Level < MaxLevel && profile.Xp >= XpForNextLevel(profile.Level))
            {
                profile.Xp -= XpForNextLevel(profile.Level);
                profile.Level++;
                g.LevelsGained++;
            }
            if (profile.Level >= MaxLevel) profile.Xp = Math.Min(profile.Xp, XpForNextLevel(MaxLevel));
            g.NewLevel = profile.Level;
            return g;
        }

        /// <summary>Soft currency earned by playing (never bought).</summary>
        public static int CreditsFromScore(int score) => Math.Max(0, score / 200);

        /// <summary>A trick counts as "mastered" in the trick book after this many clean landings.</summary>
        public const int MasteryLandings = 10;
    }
}

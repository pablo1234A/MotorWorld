using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Scoring
{
    /// <summary>Statistics for a play session (free ride, freestyle round, duel turn...).</summary>
    public sealed class SessionStats
    {
        private readonly Dictionary<string, int> _landedCounts = new Dictionary<string, int>(StringComparer.Ordinal);

        public int TotalScore { get; private set; }
        public int BestCombo { get; private set; }
        public string BestComboSummary { get; private set; } = string.Empty;
        public int CombosBanked { get; private set; }
        public int TricksLanded { get; private set; }
        public int Bails { get; private set; }
        public int PointsLostToBails { get; private set; }
        public float MaxAirTime { get; private set; }
        public float MaxHeight { get; private set; }
        public float LongestGrind { get; private set; }
        public float LongestManual { get; private set; }
        public float TopSpeed { get; private set; }
        public float DistanceRidden { get; private set; }
        public IReadOnlyDictionary<string, int> LandedCounts => _landedCounts;
        public int DistinctTricks => _landedCounts.Count;

        public void RegisterCombo(in ComboResult combo)
        {
            if (!combo.Banked) return;
            TotalScore += combo.Total;
            CombosBanked++;
            if (combo.Total > BestCombo) { BestCombo = combo.Total; BestComboSummary = combo.Summary; }
        }

        public void RegisterTrick(string trickId)
        {
            if (string.IsNullOrEmpty(trickId)) return;
            TricksLanded++;
            _landedCounts.TryGetValue(trickId, out int n);
            _landedCounts[trickId] = n + 1;
        }

        public void RegisterBail(int pointsLost) { Bails++; PointsLostToBails += Math.Max(0, pointsLost); }
        public void RegisterAir(float airTime, float height) { MaxAirTime = Math.Max(MaxAirTime, airTime); MaxHeight = Math.Max(MaxHeight, height); }
        public void RegisterGrind(float seconds) { LongestGrind = Math.Max(LongestGrind, seconds); }
        public void RegisterManual(float seconds) { LongestManual = Math.Max(LongestManual, seconds); }
        public void RegisterSpeed(float speed) { TopSpeed = Math.Max(TopSpeed, speed); }
        public void AddDistance(float meters) { if (meters > 0) DistanceRidden += meters; }

        public void Reset()
        {
            _landedCounts.Clear();
            TotalScore = BestCombo = CombosBanked = TricksLanded = Bails = PointsLostToBails = 0;
            BestComboSummary = string.Empty;
            MaxAirTime = MaxHeight = LongestGrind = LongestManual = TopSpeed = DistanceRidden = 0f;
        }
    }
}

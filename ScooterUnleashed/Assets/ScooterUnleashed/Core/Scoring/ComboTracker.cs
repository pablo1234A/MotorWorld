using System;
using System.Collections.Generic;
using ScooterUnleashed.Core.Tricks;

namespace ScooterUnleashed.Core.Scoring
{
    public struct ComboEntry
    {
        public string TrickId;
        public string DisplayName;
        public float Points;
        public int RepeatIndex;
    }

    public struct ComboResult
    {
        public bool Banked;
        public float BasePoints;
        public float Multiplier;
        public int Total;
        public int TrickCount;
        public string Summary;
        /// <summary>Ids of every trick in the banked combo (for mastery / challenges).</summary>
        public List<string> TrickIds;
    }

    /// <summary>
    /// Tracks one combo (a line of linked tricks). Tricks add base points and increase the multiplier;
    /// repeating the same trick is worth less; landings scale the points earned in the last air segment;
    /// bailing loses everything; the combo is banked after a short window of plain riding.
    /// </summary>
    public sealed class ComboTracker
    {
        private readonly ScoreRules _rules;
        private readonly List<ComboEntry> _entries = new List<ComboEntry>();
        private readonly Dictionary<string, int> _repeats = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly HashSet<TrickFamily> _families = new HashSet<TrickFamily>();
        private float _segmentPoints;
        private float _idleTimer;

        public ComboTracker(ScoreRules rules) { _rules = rules ?? new ScoreRules(); }

        public bool IsActive => _entries.Count > 0 || BasePoints > 0f;
        public float BasePoints { get; private set; }
        public int TrickCount { get; private set; }
        public IReadOnlyList<ComboEntry> Entries => _entries;
        public ScoreRules Rules => _rules;
        public float IdleTime => _idleTimer;

        public float Multiplier
        {
            get
            {
                if (TrickCount == 0) return 1f;
                float m = Math.Min(TrickCount, _rules.MaxMultiplier);
                m *= 1f + _rules.VarietyBonusPerFamily * Math.Max(0, _families.Count - 1);
                return m;
            }
        }

        public int CurrentTotal => (int)Math.Round(BasePoints * Multiplier);

        /// <summary>Adds a discrete trick and returns the points it was worth after repetition and difficulty.</summary>
        public float AddTrick(TrickDefinition def, string displayName = null, float bonusPoints = 0f)
        {
            if (def == null) throw new ArgumentNullException(nameof(def));
            _repeats.TryGetValue(def.Id, out int rep);
            _repeats[def.Id] = rep + 1;
            float repeatFactor = Math.Max(_rules.MinRepeatFactor, (float)Math.Pow(_rules.RepeatFactor, rep));
            float difficulty = 1f + Math.Max(0f, def.Difficulty - 1f) * _rules.DifficultyWeight;
            float points = (def.BaseScore + bonusPoints) * repeatFactor * difficulty;

            BasePoints += points;
            _segmentPoints += points;
            TrickCount++;
            _families.Add(def.Family);
            _idleTimer = 0f;
            _entries.Add(new ComboEntry { TrickId = def.Id, DisplayName = displayName ?? def.DisplayName, Points = points, RepeatIndex = rep });
            return points;
        }

        /// <summary>Continuous points (grind/manual/held pose seconds). Does not raise the multiplier.</summary>
        public void AddContinuous(TrickDefinition def, float dt)
        {
            if (def == null || dt <= 0f) return;
            _repeats.TryGetValue(def.Id, out int rep);
            // rep was already incremented when the trick started; the first instance is rep 1.
            float repeatFactor = Math.Max(_rules.MinRepeatFactor, (float)Math.Pow(_rules.RepeatFactor, Math.Max(0, rep - 1)));
            float pts = def.ScorePerSecond * dt * repeatFactor;
            BasePoints += pts;
            _segmentPoints += pts;
            _idleTimer = 0f;
        }

        /// <summary>Airtime and height bonus for an air segment.</summary>
        public float AddAirBonus(float airTime, float height)
        {
            if (airTime < _rules.AirtimeMinimum) return 0f;
            float pts = airTime * _rules.AirtimePointsPerSecond + Math.Max(0f, height) * _rules.HeightPointsPerMeter;
            BasePoints += pts;
            _segmentPoints += pts;
            return pts;
        }

        /// <summary>Applies landing quality to the points earned since the last landing.</summary>
        public void Land(LandingQuality quality)
        {
            if (quality == LandingQuality.Bail) { Bail(); return; }
            float mult = _rules.LandingMultiplier(quality);
            BasePoints += _segmentPoints * (mult - 1f);
            if (BasePoints < 0f) BasePoints = 0f;
            _segmentPoints = 0f;
            _idleTimer = 0f;
        }

        /// <summary>Marks the start of a new segment (e.g. when a grind starts) without applying a landing grade.</summary>
        public void CloseSegment() { _segmentPoints = 0f; }

        /// <summary>Loses the whole combo. Returns the points that were lost.</summary>
        public int Bail()
        {
            int lost = CurrentTotal;
            Reset();
            return lost;
        }

        /// <summary>
        /// Advances the link window. <paramref name="linking"/> is true while the rider is in the air,
        /// grinding or manualling (anything that keeps a line alive).
        /// </summary>
        public ComboResult Update(float dt, bool linking)
        {
            if (!IsActive || linking) { if (linking) _idleTimer = 0f; return default; }
            _idleTimer += dt;
            if (_idleTimer >= _rules.LinkWindow) return Bank();
            return default;
        }

        /// <summary>Ends the combo and returns its final value.</summary>
        public ComboResult Bank()
        {
            if (!IsActive) return default;
            var r = new ComboResult
            {
                Banked = true,
                BasePoints = BasePoints,
                Multiplier = Multiplier,
                Total = CurrentTotal,
                TrickCount = TrickCount,
                Summary = Describe(),
                TrickIds = new List<string>(_entries.Count),
            };
            foreach (var e in _entries) r.TrickIds.Add(e.TrickId);
            Reset();
            return r;
        }

        public string Describe(int maxEntries = 8)
        {
            if (_entries.Count == 0) return string.Empty;
            int start = Math.Max(0, _entries.Count - maxEntries);
            var names = new List<string>(maxEntries + 1);
            if (start > 0) names.Add("…");
            for (int i = start; i < _entries.Count; i++) names.Add(_entries[i].DisplayName);
            return string.Join(" + ", names);
        }

        public void Reset()
        {
            _entries.Clear();
            _repeats.Clear();
            _families.Clear();
            BasePoints = 0f;
            TrickCount = 0;
            _segmentPoints = 0f;
            _idleTimer = 0f;
        }
    }
}

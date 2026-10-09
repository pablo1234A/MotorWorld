using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Modes
{
    public enum ChallengeType
    {
        ReachComboScore,   // land a single combo worth >= Target
        ReachSessionScore, // total session score >= Target
        LandTrick,         // land TrickId Target times
        ComboLength,       // combo with >= Target tricks
        GrindTime,         // single grind >= Target seconds
        ManualTime,        // single manual >= Target seconds
        AirTime,           // single air >= Target seconds
        TopSpeed,          // reach Target m/s
        DiscoverSpot,      // enter spot ZoneId
    }

    [Serializable]
    public class ChallengeDefinition
    {
        public string Id;
        public string Title;
        public string Description;
        public ChallengeType Type;
        public float Target;
        public string TrickId;
        public string ZoneId;
        public int RewardXp = 150;
        public int RewardReputation = 10;
        public int RewardCredits = 100;
        public int RequiredLevel = 1;
    }

    /// <summary>Gameplay facts reported by the runtime. The tracker turns them into challenge progress.</summary>
    public enum ChallengeSignal
    {
        ComboBanked,  // value = total, count = trick count
        SessionScore, // value = session total
        TrickLanded,  // id = trick id
        GrindEnded,   // value = seconds
        ManualEnded,  // value = seconds
        AirEnded,     // value = seconds
        Speed,        // value = m/s
        SpotEntered,  // id = zone id
    }

    public sealed class ChallengeTracker
    {
        private readonly List<ChallengeDefinition> _defs;
        private readonly HashSet<string> _completed;
        private readonly Dictionary<string, float> _progress = new Dictionary<string, float>(StringComparer.Ordinal);

        public event Action<ChallengeDefinition> Completed;

        public ChallengeTracker(IEnumerable<ChallengeDefinition> defs, IEnumerable<string> alreadyCompleted)
        {
            _defs = new List<ChallengeDefinition>(defs);
            _completed = new HashSet<string>(alreadyCompleted ?? Array.Empty<string>(), StringComparer.Ordinal);
        }

        public IReadOnlyList<ChallengeDefinition> All => _defs;
        public bool IsCompleted(string id) => _completed.Contains(id);

        public float Progress01(ChallengeDefinition d)
        {
            if (IsCompleted(d.Id)) return 1f;
            _progress.TryGetValue(d.Id, out float p);
            return d.Target <= 0 ? 0f : SUMath.Clamp01(p / d.Target);
        }

        public void Report(ChallengeSignal signal, float value = 0f, string id = null, int count = 0)
        {
            foreach (var d in _defs)
            {
                if (_completed.Contains(d.Id)) continue;
                _progress.TryGetValue(d.Id, out float p);
                float np = p;
                switch (d.Type)
                {
                    case ChallengeType.ReachComboScore when signal == ChallengeSignal.ComboBanked: np = Math.Max(p, value); break;
                    case ChallengeType.ComboLength when signal == ChallengeSignal.ComboBanked: np = Math.Max(p, count); break;
                    case ChallengeType.ReachSessionScore when signal == ChallengeSignal.SessionScore: np = Math.Max(p, value); break;
                    case ChallengeType.LandTrick when signal == ChallengeSignal.TrickLanded && id == d.TrickId: np = p + 1; break;
                    case ChallengeType.GrindTime when signal == ChallengeSignal.GrindEnded: np = Math.Max(p, value); break;
                    case ChallengeType.ManualTime when signal == ChallengeSignal.ManualEnded: np = Math.Max(p, value); break;
                    case ChallengeType.AirTime when signal == ChallengeSignal.AirEnded: np = Math.Max(p, value); break;
                    case ChallengeType.TopSpeed when signal == ChallengeSignal.Speed: np = Math.Max(p, value); break;
                    case ChallengeType.DiscoverSpot when signal == ChallengeSignal.SpotEntered && id == d.ZoneId: np = d.Target; break;
                }
                if (np == p) continue;
                _progress[d.Id] = np;
                if (np >= d.Target)
                {
                    _completed.Add(d.Id);
                    Completed?.Invoke(d);
                }
            }
        }

        public static List<ChallengeDefinition> CreateDefault()
        {
            return new List<ChallengeDefinition>
            {
                new ChallengeDefinition { Id = "c_first_combo", Title = "Primera línea", Description = "Consigue un combo de 1.000 puntos.", Type = ChallengeType.ReachComboScore, Target = 1000 },
                new ChallengeDefinition { Id = "c_tailwhip5", Title = "Látigo", Description = "Aterriza 5 tailwhips.", Type = ChallengeType.LandTrick, TrickId = Tricks.TrickIds.Tailwhip, Target = 5 },
                new ChallengeDefinition { Id = "c_grind3", Title = "Metal caliente", Description = "Mantén un grind durante 3 segundos.", Type = ChallengeType.GrindTime, Target = 3 },
                new ChallengeDefinition { Id = "c_manual4", Title = "Equilibrista", Description = "Haz un manual de 4 segundos.", Type = ChallengeType.ManualTime, Target = 4 },
                new ChallengeDefinition { Id = "c_air15", Title = "Despegue", Description = "Vuela 1,5 segundos en un solo salto.", Type = ChallengeType.AirTime, Target = 1.5f },
                new ChallengeDefinition { Id = "c_combo6", Title = "Encadenado", Description = "Encadena 6 trucos en un combo.", Type = ChallengeType.ComboLength, Target = 6, RewardXp = 300 },
                new ChallengeDefinition { Id = "c_speed", Title = "Bajada", Description = "Alcanza 11 m/s.", Type = ChallengeType.TopSpeed, Target = 11 },
                new ChallengeDefinition { Id = "c_combo10k", Title = "Línea maestra", Description = "Consigue un combo de 10.000 puntos.", Type = ChallengeType.ReachComboScore, Target = 10000, RewardXp = 800, RewardReputation = 40 },
                new ChallengeDefinition { Id = "c_flip", Title = "Mortal", Description = "Aterriza un backflip.", Type = ChallengeType.LandTrick, TrickId = Tricks.TrickIds.Backflip, Target = 1, RewardXp = 400 },
                new ChallengeDefinition { Id = "c_secret_roof", Title = "Azotea secreta", Description = "Encuentra el spot escondido en la zona industrial.", Type = ChallengeType.DiscoverSpot, ZoneId = "secret_roof", Target = 1, RewardXp = 500, RewardReputation = 50 },
                new ChallengeDefinition { Id = "c_secret_pool", Title = "La piscina vacía", Description = "Encuentra la piscina abandonada en la zona residencial.", Type = ChallengeType.DiscoverSpot, ZoneId = "secret_pool", Target = 1, RewardXp = 500, RewardReputation = 50 },
            };
        }
    }
}

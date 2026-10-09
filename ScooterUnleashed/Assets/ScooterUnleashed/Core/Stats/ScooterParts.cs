using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Stats
{
    public enum PartSlot
    {
        Deck,
        Bars,
        Fork,
        Wheels,
        Bearings,
        Grips,
        Clamp,
        Brake,
        Pegs,
        Griptape,
    }

    [Serializable]
    public class PartDefinition
    {
        public string Id;
        public string DisplayName;
        public PartSlot Slot;
        /// <summary>Mass in grams.</summary>
        public float WeightGrams;
        /// <summary>Stat deltas. Each part trades something for something else.</summary>
        public ScooterStats Modifiers;
        public int UnlockLevel;
        public int Price;
        /// <summary>Geometry hints for the visual builder (e.g. deck length, bar height, wheel diameter in mm).</summary>
        public float GeometryA;
        public float GeometryB;
        public string Description;
    }

    [Serializable]
    public class ScooterBuild
    {
        public string Name = "Mi scooter";
        /// <summary>Part id for each slot, indexed by (int)PartSlot.</summary>
        public string[] Parts = new string[Enum.GetValues(typeof(PartSlot)).Length];
        /// <summary>Colour indices into the finish palette: deck, bars, wheels, grips.</summary>
        public int DeckColor;
        public int BarsColor = 1;
        public int WheelColor = 2;
        public int GripColor = 3;
        public string StickerId = "none";

        public string Get(PartSlot slot) => Parts != null && (int)slot < Parts.Length ? Parts[(int)slot] : null;

        public void Set(PartSlot slot, string id)
        {
            int n = Enum.GetValues(typeof(PartSlot)).Length;
            if (Parts == null || Parts.Length != n)
            {
                var p = new string[n];
                if (Parts != null) Array.Copy(Parts, p, Math.Min(Parts.Length, n));
                Parts = p;
            }
            Parts[(int)slot] = id;
        }

        public ScooterBuild Clone()
        {
            var b = (ScooterBuild)MemberwiseClone();
            b.Parts = (string[])Parts.Clone();
            return b;
        }
    }

    public struct BuildSummary
    {
        public ScooterStats Stats;
        public float WeightKg;
    }

    /// <summary>Catalog of parts plus the rules turning a build into stats.</summary>
    public sealed class PartCatalog
    {
        public const float BaseStat = 5f;
        /// <summary>Reference build weight; lighter builds gain air control/trick speed, heavier gain stability.</summary>
        public const float ReferenceWeightKg = 3.6f;
        /// <summary>Balance rule: a part may add at most this much in total...</summary>
        public const float MaxPositiveBudget = 2.5f;
        /// <summary>...and must give back at least this fraction of what it adds (no free upgrades).</summary>
        public const float MinTradeOffRatio = 0.6f;

        private readonly List<PartDefinition> _parts = new List<PartDefinition>();
        private readonly Dictionary<string, PartDefinition> _byId = new Dictionary<string, PartDefinition>(StringComparer.Ordinal);

        public IReadOnlyList<PartDefinition> All => _parts;

        public void Add(PartDefinition p)
        {
            _parts.Add(p);
            _byId[p.Id] = p;
        }

        public PartDefinition Get(string id) => id != null && _byId.TryGetValue(id, out var p) ? p : null;

        public IEnumerable<PartDefinition> ForSlot(PartSlot slot)
        {
            foreach (var p in _parts) if (p.Slot == slot) yield return p;
        }

        public PartDefinition DefaultFor(PartSlot slot)
        {
            foreach (var p in _parts) if (p.Slot == slot && p.UnlockLevel <= 1) return p;
            foreach (var p in _parts) if (p.Slot == slot) return p;
            return null;
        }

        public ScooterBuild CreateDefaultBuild()
        {
            var b = new ScooterBuild();
            foreach (PartSlot s in Enum.GetValues(typeof(PartSlot))) b.Set(s, DefaultFor(s)?.Id);
            return b;
        }

        /// <summary>Fills empty or unknown slots with defaults (e.g. after loading an old save).</summary>
        public void Sanitize(ScooterBuild build)
        {
            foreach (PartSlot s in Enum.GetValues(typeof(PartSlot)))
            {
                var p = Get(build.Get(s));
                if (p == null || p.Slot != s) build.Set(s, DefaultFor(s)?.Id);
            }
        }

        public BuildSummary Evaluate(ScooterBuild build)
        {
            var stats = ScooterStats.Uniform(BaseStat);
            float grams = 0f;
            foreach (PartSlot s in Enum.GetValues(typeof(PartSlot)))
            {
                var p = Get(build?.Get(s)) ?? DefaultFor(s);
                if (p == null) continue;
                stats += p.Modifiers;
                grams += p.WeightGrams;
            }
            float kg = grams / 1000f;
            // Weight effect: +-1 kg from reference ~ +-0.8 stat points.
            float dw = kg - ReferenceWeightKg;
            stats.Stability += dw * 0.8f;
            stats.AirControl -= dw * 0.6f;
            stats.TrickSpeed -= dw * 0.6f;
            stats.Acceleration -= dw * 0.4f;
            return new BuildSummary { Stats = stats.Clamped(), WeightKg = kg };
        }

        /// <summary>Returns a list of balance violations (empty when every part is a fair trade-off).</summary>
        public List<string> ValidateBalance()
        {
            var issues = new List<string>();
            foreach (var p in _parts)
            {
                float pos = p.Modifiers.SumPositive();
                float neg = -p.Modifiers.SumNegative();
                if (pos > MaxPositiveBudget) issues.Add($"{p.Id}: adds {pos:0.0} (> {MaxPositiveBudget})");
                if (pos > 0.01f && neg < pos * MinTradeOffRatio) issues.Add($"{p.Id}: gives back {neg:0.0} for {pos:0.0}");
            }
            return issues;
        }

        private static ScooterStats M(float acc = 0, float top = 0, float air = 0, float stab = 0, float steer = 0, float grind = 0, float trick = 0)
            => new ScooterStats { Acceleration = acc, TopSpeed = top, AirControl = air, Stability = stab, Steering = steer, GrindBalance = grind, TrickSpeed = trick };

        private static PartDefinition P(string id, string name, PartSlot slot, float grams, ScooterStats mods, int level, int price, string desc, float geoA = 0, float geoB = 0)
            => new PartDefinition { Id = id, DisplayName = name, Slot = slot, WeightGrams = grams, Modifiers = mods, UnlockLevel = level, Price = price, Description = desc, GeometryA = geoA, GeometryB = geoB };

        public static PartCatalog CreateDefault()
        {
            var c = new PartCatalog();
            // Decks: GeometryA = length (mm), GeometryB = width (mm)
            c.Add(P("deck_street", "Street 520", PartSlot.Deck, 1450, M(), 1, 0, "Deck equilibrado de 520 mm.", 520, 115));
            c.Add(P("deck_park", "Park 495 Light", PartSlot.Deck, 1180, M(air: 0.8f, trick: 0.7f, stab: -0.9f, grind: -0.4f), 3, 900, "Corto y ligero: gira rápido, menos estable.", 495, 110));
            c.Add(P("deck_wide", "Wide 560 Box", PartSlot.Deck, 1720, M(stab: 1f, grind: 0.8f, trick: -0.7f, air: -0.6f, acc: -0.2f), 5, 1400, "Ancho y largo: aterrizajes y grinds sólidos.", 560, 125));
            // Bars: GeometryA = height (mm), GeometryB = width (mm)
            c.Add(P("bars_std", "Classic Chromoly", PartSlot.Bars, 950, M(), 1, 0, "Manillar de cromoly estándar.", 600, 560));
            c.Add(P("bars_ti", "Titanium Light", PartSlot.Bars, 720, M(trick: 0.9f, air: 0.4f, stab: -0.6f, steer: -0.5f), 6, 2200, "Titanio: barspins más rápidos, menos inercia.", 590, 540));
            c.Add(P("bars_tall", "Tall Oversized", PartSlot.Bars, 1080, M(stab: 0.7f, steer: 0.5f, trick: -0.6f, air: -0.4f), 4, 1100, "Alto y ancho: control a gran velocidad.", 660, 600));
            // Fork
            c.Add(P("fork_std", "Threadless Fork", PartSlot.Fork, 360, M(), 1, 0, "Horquilla estándar."));
            c.Add(P("fork_light", "Hollow Fork", PartSlot.Fork, 280, M(trick: 0.4f, air: 0.2f, stab: -0.4f, grind: -0.2f), 3, 600, "Hueca y ligera."));
            // Wheels: GeometryA = diameter (mm), GeometryB = core (0 = nylon, 1 = alu)
            c.Add(P("wheels_110", "110 mm Core", PartSlot.Wheels, 380, M(), 1, 0, "Ruedas de 110 mm, buen agarre.", 110, 1));
            c.Add(P("wheels_120", "120 mm Street", PartSlot.Wheels, 460, M(top: 1f, stab: 0.4f, acc: -0.6f, trick: -0.5f), 4, 1000, "Más velocidad punta y rodadura suave.", 120, 1));
            c.Add(P("wheels_100", "100 mm Park", PartSlot.Wheels, 300, M(acc: 0.8f, trick: 0.4f, top: -0.8f, stab: -0.3f), 2, 500, "Pequeñas y rápidas de reacción.", 100, 1));
            // Bearings
            c.Add(P("bear_abec7", "ABEC-7", PartSlot.Bearings, 48, M(), 1, 0, "Rodamientos estándar."));
            c.Add(P("bear_ceramic", "Ceramic Pro", PartSlot.Bearings, 40, M(top: 0.6f, acc: 0.3f, stab: -0.3f, grind: -0.3f, steer: -0.2f), 7, 1800, "Menos fricción, más rápido pero menos control."));
            // Grips
            c.Add(P("grips_std", "Soft Grips", PartSlot.Grips, 120, M(), 1, 0, "Puños blandos de 160 mm."));
            c.Add(P("grips_hard", "Hard Compound", PartSlot.Grips, 100, M(trick: 0.3f, steer: 0.2f, stab: -0.4f), 2, 300, "Más tacto, menos amortiguación."));
            // Clamp
            c.Add(P("clamp_dbl", "Double Clamp", PartSlot.Clamp, 210, M(), 1, 0, "Abrazadera doble."));
            c.Add(P("clamp_scs", "SCS", PartSlot.Clamp, 340, M(stab: 0.6f, grind: 0.3f, trick: -0.5f, air: -0.2f), 5, 900, "Sistema SCS: rigidez máxima."));
            // Brake
            c.Add(P("brake_flex", "Flex Fender", PartSlot.Brake, 90, M(), 1, 0, "Freno flex trasero."));
            c.Add(P("brake_none", "Brakeless", PartSlot.Brake, 0, M(trick: 0.3f, acc: 0.2f, stab: -0.3f, steer: -0.2f), 3, 200, "Sin freno: menos peso, frenas peor."));
            // Pegs
            c.Add(P("pegs_none", "No Pegs", PartSlot.Pegs, 0, M(), 1, 0, "Sin pegs."));
            c.Add(P("pegs_alu", "Alu Pegs", PartSlot.Pegs, 160, M(grind: 1f, trick: -0.4f, air: -0.3f), 2, 400, "Pegs de aluminio: grinds más largos."));
            c.Add(P("pegs_nylon", "Nylon Sleeve Pegs", PartSlot.Pegs, 190, M(grind: 1.3f, stab: 0.2f, trick: -0.5f, air: -0.4f, acc: -0.1f), 6, 900, "Funda de nylon: deslizan más y más estables."));
            // Griptape
            c.Add(P("grip_std", "Standard Grit", PartSlot.Griptape, 30, M(), 1, 0, "Lija estándar."));
            c.Add(P("grip_coarse", "Coarse Grit", PartSlot.Griptape, 35, M(stab: 0.5f, trick: -0.4f), 2, 150, "Lija gruesa: pies pegados, tailwhips algo más lentos."));
            return c;
        }
    }
}

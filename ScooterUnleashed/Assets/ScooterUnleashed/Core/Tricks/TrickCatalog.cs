using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Tricks
{
    /// <summary>
    /// Registry of every trick the game knows about. The default catalog is created in code so the
    /// game works with zero authored assets; the Unity layer can override/extend it with ScriptableObjects.
    /// </summary>
    public sealed class TrickCatalog
    {
        private readonly List<TrickDefinition> _tricks = new List<TrickDefinition>();
        private readonly Dictionary<string, TrickDefinition> _byId = new Dictionary<string, TrickDefinition>(StringComparer.Ordinal);

        public IReadOnlyList<TrickDefinition> All => _tricks;

        public void Add(TrickDefinition def)
        {
            if (def == null) throw new ArgumentNullException(nameof(def));
            if (string.IsNullOrEmpty(def.Id)) throw new ArgumentException("Trick needs an Id");
            if (_byId.ContainsKey(def.Id))
            {
                // Overrides replace the existing definition in place (keeps ordering stable).
                int idx = _tricks.FindIndex(t => t.Id == def.Id);
                _tricks[idx] = def;
            }
            else
            {
                _tricks.Add(def);
            }
            _byId[def.Id] = def;
        }

        public TrickDefinition Get(string id)
        {
            if (id != null && _byId.TryGetValue(id, out var def)) return def;
            return null;
        }

        public bool Contains(string id) => id != null && _byId.ContainsKey(id);

        /// <summary>Finds the trick fired by a gesture in a given context. Returns null if none.</summary>
        public TrickDefinition FindByGesture(TrickContext context, GestureKind kind, Dir8 dir)
        {
            for (int i = 0; i < _tricks.Count; i++)
            {
                var t = _tricks[i];
                if ((t.Context & context) == 0) continue;
                if (t.Trigger.Kind == GestureKind.None) continue;
                if (t.Trigger.Matches(kind, dir)) return t;
            }
            return null;
        }

        public static TrickCatalog CreateDefault()
        {
            var c = new TrickCatalog();

            // --- Pop -----------------------------------------------------------------------------
            c.Add(new TrickDefinition
            {
                Id = TrickIds.BunnyHop, DisplayName = "Bunny Hop", Family = TrickFamily.Pop,
                Context = TrickContext.Ground, BaseScore = 50, Difficulty = 1,
                AnimationKey = "pop", Description = "Mantén pulsada la zona derecha para agacharte y suelta para saltar."
            });

            // --- Scooter tricks (quick swipe in the air) ----------------------------------------
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Barspin, DisplayName = "Barspin", Family = TrickFamily.Scooter,
                Context = TrickContext.Air, Channels = TrickChannel.Bars,
                Trigger = new TrickTrigger(GestureKind.Swipe, Dir8.Right, true),
                BaseScore = 300, Difficulty = 1.5f, ExecutionTime = 0.34f, LandableCompletion = 0.8f,
                AnimationKey = "barspin", Description = "Desliza a izquierda o derecha en el aire: el manillar gira 360°."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Tailwhip, DisplayName = "Tailwhip", Family = TrickFamily.Scooter,
                Context = TrickContext.Air, Channels = TrickChannel.Deck | TrickChannel.Legs,
                Trigger = new TrickTrigger(GestureKind.Swipe, Dir8.Down, false),
                BaseScore = 500, Difficulty = 2.5f, ExecutionTime = 0.42f, LandableCompletion = 0.85f,
                AnimationKey = "tailwhip", Description = "Desliza hacia abajo en el aire: el deck da una vuelta completa alrededor del manillar."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.BriFlip, DisplayName = "Bri Flip", Family = TrickFamily.Scooter,
                Context = TrickContext.Air, Channels = TrickChannel.Deck | TrickChannel.Bars | TrickChannel.Legs,
                Trigger = new TrickTrigger(GestureKind.Swipe, Dir8.DownRight, true),
                BaseScore = 850, Difficulty = 3.5f, ExecutionTime = 0.6f, LandableCompletion = 0.9f,
                AnimationKey = "briflip", Description = "Desliza en diagonal hacia abajo: la scooter gira hacia delante bajo las manos."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.XUp, DisplayName = "X-Up", Family = TrickFamily.Scooter,
                Context = TrickContext.Air, Channels = TrickChannel.Bars,
                Trigger = new TrickTrigger(GestureKind.Swipe, Dir8.Up, false),
                BaseScore = 200, ScorePerSecond = 250, Difficulty = 1.5f, ExecutionTime = 0.5f,
                LandableCompletion = 0.8f, AnimationKey = "xup",
                Description = "Desliza hacia arriba en el aire: cruzas el manillar 180° y vuelves."
            });

            // --- Body tricks (hold, then swipe) --------------------------------------------------
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Superman, DisplayName = "Superman", Family = TrickFamily.Body,
                Context = TrickContext.Air, Channels = TrickChannel.Legs,
                Trigger = new TrickTrigger(GestureKind.HoldSwipe, Dir8.Up, false),
                BaseScore = 400, ScorePerSecond = 400, Difficulty = 3f, IsHeld = true, MinHoldTime = 0.15f,
                LandableCompletion = 1f, AnimationKey = "superman",
                Description = "Mantén y desliza hacia arriba: estiras el cuerpo con las piernas hacia atrás. Suelta antes de aterrizar."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.NoFooted, DisplayName = "No-Footed", Family = TrickFamily.Body,
                Context = TrickContext.Air, Channels = TrickChannel.Legs,
                Trigger = new TrickTrigger(GestureKind.HoldSwipe, Dir8.Down, false),
                BaseScore = 300, ScorePerSecond = 300, Difficulty = 2f, IsHeld = true, MinHoldTime = 0.12f,
                LandableCompletion = 1f, AnimationKey = "nofooted",
                Description = "Mantén y desliza hacia abajo: separas los dos pies del deck."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.CanCan, DisplayName = "Can-Can", Family = TrickFamily.Body,
                Context = TrickContext.Air, Channels = TrickChannel.Legs,
                Trigger = new TrickTrigger(GestureKind.HoldSwipe, Dir8.Right, true),
                BaseScore = 250, ScorePerSecond = 280, Difficulty = 1.5f, IsHeld = true, MinHoldTime = 0.12f,
                LandableCompletion = 1f, AnimationKey = "cancan",
                Description = "Mantén y desliza a un lado: pasas una pierna por encima del deck."
            });

            // --- Rotations & flips (computed from the physical rotation at landing) -------------
            c.Add(Rot(TrickIds.Spin180, "180", 200, 1f));
            c.Add(Rot(TrickIds.Spin360, "360", 500, 2f));
            c.Add(Rot(TrickIds.Spin540, "540", 900, 3f));
            c.Add(Rot(TrickIds.Spin720, "720", 1400, 4f));
            c.Add(Rot(TrickIds.Spin900, "900", 2000, 5f));
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Backflip, DisplayName = "Backflip", Family = TrickFamily.Flip, Context = TrickContext.Air,
                BaseScore = 1000, Difficulty = 3.5f, AnimationKey = "flip",
                Description = "En el aire, tira del stick hacia atrás para rotar hacia atrás. Necesitas altura."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Frontflip, DisplayName = "Frontflip", Family = TrickFamily.Flip, Context = TrickContext.Air,
                BaseScore = 1150, Difficulty = 4f, AnimationKey = "flip",
                Description = "En el aire, empuja el stick hacia delante para rotar hacia delante."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Flair, DisplayName = "Flair", Family = TrickFamily.Flip, Context = TrickContext.Air,
                BaseScore = 1800, Difficulty = 4.5f, AnimationKey = "flip",
                Description = "Backflip con 180 en un quarter: aterrizas de cara bajando la rampa."
            });

            // --- Grinds -------------------------------------------------------------------------
            c.Add(Grind(TrickIds.DoublePeg, "50-50", 100, 120, 1f, "Pulsa GRIND cerca de un raíl con el stick centrado."));
            c.Add(Grind(TrickIds.Feeble, "Feeble", 180, 160, 2f, "GRIND + stick hacia atrás: peg trasero en el raíl, rueda delantera por fuera."));
            c.Add(Grind(TrickIds.Smith, "Smith", 180, 160, 2f, "GRIND + stick a un lado: peg trasero en el raíl, rueda delantera por dentro."));
            c.Add(Grind(TrickIds.Crooked, "Crooked", 220, 180, 2.5f, "GRIND + stick hacia delante: apoyo en la parte delantera del deck."));
            c.Add(Grind(TrickIds.Boardslide, "Boardslide", 200, 170, 2f, "Entra cruzado al raíl: el deck desliza perpendicular."));
            c.Add(Grind(TrickIds.Lipslide, "Lipslide", 260, 190, 2.5f, "Entra cruzado con el stick hacia atrás: la cola pasa primero sobre el raíl."));
            c.Add(Grind(TrickIds.LedgeBalance, "Ledge Balance", 120, 140, 1.5f, "Grind de equilibrio sobre un bordillo o ledge."));

            // --- Manuals ------------------------------------------------------------------------
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Manual, DisplayName = "Manual", Family = TrickFamily.Manual,
                Context = TrickContext.Ground, Trigger = new TrickTrigger(GestureKind.Swipe, Dir8.Down, false),
                BaseScore = 60, ScorePerSecond = 110, Difficulty = 1.5f, MinSpeed = 3f, IsHeld = true,
                AnimationKey = "manual", Description = "En el suelo, desliza hacia abajo: equilibrio sobre la rueda trasera. Enlaza combos."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.NoseManual, DisplayName = "Nose Manual", Family = TrickFamily.Manual,
                Context = TrickContext.Ground, Trigger = new TrickTrigger(GestureKind.Swipe, Dir8.Up, false),
                BaseScore = 80, ScorePerSecond = 130, Difficulty = 2f, MinSpeed = 3f, IsHeld = true,
                AnimationKey = "nosemanual", Description = "En el suelo, desliza hacia arriba: equilibrio sobre la rueda delantera."
            });
            c.Add(new TrickDefinition
            {
                Id = TrickIds.Wheelie, DisplayName = "Wheelie", Family = TrickFamily.Manual,
                Context = TrickContext.Ground, BaseScore = 40, ScorePerSecond = 90, Difficulty = 1.5f, IsHeld = true,
                AnimationKey = "manual", Description = "Manual a poca velocidad."
            });

            c.Add(new TrickDefinition
            {
                Id = TrickIds.Revert, DisplayName = "Revert", Family = TrickFamily.Transition,
                Context = TrickContext.Ground, BaseScore = 75, Difficulty = 1f, AnimationKey = "revert",
                Description = "Al aterrizar de espaldas giras 180° sobre el suelo y sigues la línea."
            });
            return c;
        }

        private static TrickDefinition Rot(string id, string name, int score, float difficulty) => new TrickDefinition
        {
            Id = id, DisplayName = name, Family = TrickFamily.Rotation, Context = TrickContext.Air,
            BaseScore = score, Difficulty = difficulty, AnimationKey = "spin",
            Description = "Gira en el aire con el stick izquierdo o dibujando un círculo en la zona derecha."
        };

        private static TrickDefinition Grind(string id, string name, int score, float perSecond, float difficulty, string desc) => new TrickDefinition
        {
            Id = id, DisplayName = name, Family = TrickFamily.Grind, Context = TrickContext.Air | TrickContext.Grind,
            BaseScore = score, ScorePerSecond = perSecond, Difficulty = difficulty, IsHeld = true,
            AnimationKey = "grind_" + id, Description = desc
        };
    }
}

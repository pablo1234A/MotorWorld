using System;
using System.Collections.Generic;
using ScooterUnleashed.Character;
using ScooterUnleashed.Core.Stats;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public sealed partial class UIRoot
    {
        private int _workshopSlot;
        private PartDefinition _candidate;
        private bool _workshopColors;
        private bool _orbitDrag;
        private float _orbitLastX;

        private static readonly string[] SlotNames = { "Deck", "Manillar", "Horquilla", "Ruedas", "Rodamientos", "Puños", "Abrazadera", "Freno", "Pegs", "Lija" };

        private void HandleOrbitDrag(Rect area)
        {
            var e = Event.current;
            if (e.type == EventType.MouseDown && area.Contains(e.mousePosition)) { _orbitDrag = true; _orbitLastX = e.mousePosition.x; }
            if (e.type == EventType.MouseDrag && _orbitDrag) { _gm.CameraRig.AddOrbit((e.mousePosition.x - _orbitLastX) * 0.6f); _orbitLastX = e.mousePosition.x; }
            if (e.type == EventType.MouseUp) _orbitDrag = false;
        }

        private void DrawWorkshop()
        {
            var safe = UIKit.Safe;
            var save = _gm.Save;
            var parts = _gm.Parts;
            Rect left = new Rect(safe.xMin + 20, safe.yMin + 20, 260, safe.height - 40);
            Rect right = new Rect(safe.xMax - 440, safe.yMin + 20, 420, safe.height - 40);
            HandleOrbitDrag(new Rect(left.xMax, safe.yMin, right.x - left.xMax, safe.height));

            UIKit.PanelBox(left, "Taller");
            UIKit.Label(new Rect(left.x + 24, left.y + 60, left.width - 40, 22), $"{UIKit.FormatScore(save.Profile.Credits)} créditos · Nv {save.Profile.Level}", 14, UIKit.Accent2, Anchor.Left, true);
            float y = left.y + 92;
            for (int i = 0; i < SlotNames.Length; i++)
            {
                var eq = parts.Get(save.ActiveBuild.Get((PartSlot)i));
                bool sel = !_workshopColors && _workshopSlot == i;
                if (UIKit.Button(new Rect(left.x + 14, y, left.width - 28, 44), SlotNames[i], sel ? ButtonKind.Primary : ButtonKind.Ghost, true, 15, eq?.DisplayName ?? "—"))
                {
                    _workshopSlot = i; _workshopColors = false; _candidate = null; _gm.RebuildScooter(); _gm.RebuildRider();
                }
                y += 47;
            }
            if (UIKit.Button(new Rect(left.x + 14, y + 4, left.width - 28, 44), "COLORES Y MONTAJES", _workshopColors ? ButtonKind.Primary : ButtonKind.Ghost, true, 15))
            { _workshopColors = true; _candidate = null; _gm.RebuildScooter(); _gm.RebuildRider(); }
            if (UIKit.Button(new Rect(left.x + 14, left.yMax - 60, left.width - 28, 46), "VOLVER", ButtonKind.Secondary)) { Back(); return; }

            UIKit.PanelBox(right, _workshopColors ? "Colores" : SlotNames[_workshopSlot]);
            if (_workshopColors) { DrawWorkshopColors(right); return; }

            var slot = (PartSlot)_workshopSlot;
            var current = parts.Get(save.ActiveBuild.Get(slot));
            var shown = _candidate ?? current;
            float ry = right.y + 70;
            var options = new List<PartDefinition>(parts.ForSlot(slot));
            foreach (var p in options)
            {
                bool equipped = current != null && p.Id == current.Id;
                bool owned = _gm.OwnsPart(p.Id);
                string tag = equipped ? "EQUIPADO" : owned ? "EN PROPIEDAD" : (save.Profile.Level < p.UnlockLevel ? $"NIVEL {p.UnlockLevel}" : $"{UIKit.FormatScore(p.Price)} CR");
                bool sel = shown != null && shown.Id == p.Id;
                if (UIKit.Button(new Rect(right.x + 14, ry, right.width - 28, 50), p.DisplayName, sel ? ButtonKind.Primary : ButtonKind.Ghost, true, 16, tag + " · " + (p.WeightGrams > 0 ? p.WeightGrams + " g" : "0 g")))
                {
                    _candidate = p;
                    var temp = save.ActiveBuild.Clone();
                    temp.Set(slot, p.Id);
                    _gm.PreviewBuild(temp);
                }
                ry += 54;
            }
            ry += 6;
            if (shown != null) UIKit.Label(new Rect(right.x + 22, ry, right.width - 44, 36), shown.Description, 13, UIKit.Muted, Anchor.Left, false, false, true);
            ry += 40;

            // Stats before / after
            var now = parts.Evaluate(save.ActiveBuild);
            var tempB = save.ActiveBuild.Clone();
            if (_candidate != null) tempB.Set(slot, _candidate.Id);
            var after = parts.Evaluate(tempB);
            for (int i = 0; i < ScooterStats.Count; i++)
            {
                var id = (StatId)i;
                float a = now.Stats[id], b = after.Stats[id];
                UIKit.Label(new Rect(right.x + 22, ry, 150, 20), ScooterStats.Label(id), 13, UIKit.Text);
                Rect bar = new Rect(right.x + 170, ry + 6, right.width - 250, 8);
                UIKit.Bar(bar, Mathf.Min(a, b) / 10f, new Color(1, 1, 1, 0.75f));
                if (b > a + 0.01f) UIKit.Rect(new Rect(bar.x + bar.width * a / 10f, bar.y, bar.width * (b - a) / 10f, bar.height), UIKit.Good);
                if (b < a - 0.01f) UIKit.Rect(new Rect(bar.x + bar.width * b / 10f, bar.y, bar.width * (a - b) / 10f, bar.height), UIKit.Bad);
                string d = Mathf.Abs(b - a) > 0.01f ? (b > a ? "+" : "") + (b - a).ToString("0.0") : b.ToString("0.0");
                UIKit.Label(new Rect(right.xMax - 74, ry, 52, 20), d, 13, b > a + 0.01f ? UIKit.Good : (b < a - 0.01f ? UIKit.Bad : UIKit.Muted), Anchor.Right, true);
                ry += 24;
            }
            UIKit.Label(new Rect(right.x + 22, ry, right.width - 44, 20), $"Peso total {now.WeightKg:0.00} kg" + (_candidate != null ? $" → {after.WeightKg:0.00} kg" : ""), 13, UIKit.Muted);

            // Action
            if (_candidate != null && (current == null || _candidate.Id != current.Id))
            {
                Rect ab = new Rect(right.x + 14, right.yMax - 62, right.width - 28, 50);
                if (_gm.OwnsPart(_candidate.Id))
                {
                    if (UIKit.Button(ab, "EQUIPAR", ButtonKind.Primary)) { _gm.EquipPart(_candidate); _candidate = null; }
                }
                else
                {
                    string reason = _gm.PartLockReason(_candidate);
                    bool canBuy = reason == null;
                    if (UIKit.Button(ab, canBuy ? $"COMPRAR · {UIKit.FormatScore(_candidate.Price)} CR" : "BLOQUEADO · " + reason, ButtonKind.Primary, canBuy))
                    {
                        if (_gm.BuyPart(_candidate)) { _gm.EquipPart(_candidate); _candidate = null; }
                    }
                }
            }
            else UIKit.Label(new Rect(right.x + 22, right.yMax - 56, right.width - 44, 40), "Arrastra en el centro para girar la scooter.", 13, UIKit.Muted, Anchor.Center);
        }

        private void DrawWorkshopColors(Rect right)
        {
            var b = _gm.Save.ActiveBuild;
            int deck = b.DeckColor, bars = b.BarsColor, wheels = b.WheelColor, grips = b.GripColor;
            float y = right.y + 74;
            void Row(string label, ref int value)
            {
                UIKit.Label(new Rect(right.x + 22, y, 200, 22), label, 15, UIKit.Text, Anchor.Left, true);
                y += 26;
                int cols = 6;
                float sw = (right.width - 44 - (cols - 1) * 8) / cols;
                for (int i = 0; i < ScooterVisual.Palette.Length; i++)
                {
                    Rect r = new Rect(right.x + 22 + (i % cols) * (sw + 8), y + (i / cols) * 30, sw, 24);
                    UIKit.RoundRect(r, ScooterVisual.Palette[i]);
                    if (i == value) UIKit.RoundRect(UIKit.Shrink(r, -3f), new Color(1, 1, 1, 0.35f));
                    if (GUI.Button(r, GUIContent.none, GUIStyle.none)) { value = i; Audio.AudioManager.PlayUi(Audio.AudioManager.Ui.Click); }
                }
                y += 66;
            }
            Row("Deck", ref deck);
            Row("Manillar", ref bars);
            Row("Núcleo de ruedas", ref wheels);
            Row("Puños", ref grips);
            if (deck != b.DeckColor || bars != b.BarsColor || wheels != b.WheelColor || grips != b.GripColor) _gm.SetScooterColors(deck, bars, wheels, grips);

            UIKit.Label(new Rect(right.x + 22, y, 300, 22), "MONTAJES GUARDADOS", 14, UIKit.Muted, Anchor.Left, true);
            y += 28;
            for (int i = 0; i < 3; i++)
            {
                var saved = i < _gm.Save.SavedBuilds.Count ? _gm.Save.SavedBuilds[i] : null;
                bool has = saved != null && saved.Parts != null && !string.IsNullOrEmpty(saved.Get(PartSlot.Deck));
                float bw = (right.width - 44 - 10) * 0.5f;
                UIKit.Label(new Rect(right.x + 22, y, 120, 44), $"Montaje {i + 1}", 15, has ? UIKit.Text : UIKit.Muted);
                if (UIKit.Button(new Rect(right.x + 120, y, (right.width - 142 - 10) * 0.5f, 44), "GUARDAR", ButtonKind.Secondary, true, 14)) _gm.SaveBuildSlot(i);
                if (UIKit.Button(new Rect(right.x + 130 + (right.width - 142 - 10) * 0.5f, y, (right.width - 142 - 10) * 0.5f, 44), "CARGAR", ButtonKind.Secondary, has, 14)) _gm.LoadBuildSlot(i);
                y += 50;
            }
        }
    }
}

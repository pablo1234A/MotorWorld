using System;
using ScooterUnleashed.Character;
using ScooterUnleashed.Core.Save;
using ScooterUnleashed.Game;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public sealed partial class UIRoot
    {
        private CharacterData _charEdit;

        private void DrawCharacter()
        {
            var safe = UIKit.Safe;
            if (_charEdit == null) _charEdit = new CharacterData();
            var c = _charEdit;
            int level = _gm.Save.Profile.Level;
            string before = JsonUtility.ToJson(c);
            Rect right = new Rect(safe.xMax - 460, safe.yMin + 20, 440, safe.height - 40);
            HandleOrbitDrag(new Rect(safe.xMin, safe.yMin, right.x - safe.xMin, safe.height));
            UIKit.PanelBox(right, "Rider");
            float y = right.y + 70;

            void Choice(string label, ref int value, string[] names, Func<int, int> unlock = null)
            {
                UIKit.Label(new Rect(right.x + 22, y, 150, 38), label, 15, UIKit.Text, Anchor.Left, true);
                Rect l = new Rect(right.x + 170, y, 40, 38), r = new Rect(right.xMax - 62, y, 40, 38);
                int lockLvl = unlock != null ? unlock(value) : 1;
                string name = names[Mathf.Clamp(value, 0, names.Length - 1)] + (lockLvl > level ? $"  (Nv {lockLvl})" : "");
                UIKit.Label(new Rect(l.xMax, y, r.x - l.xMax, 38), name, 15, lockLvl > level ? UIKit.Muted : UIKit.Text, Anchor.Center);
                if (UIKit.Button(l, "<", ButtonKind.Ghost, true, 22)) value = (value + names.Length - 1) % names.Length;
                if (UIKit.Button(r, ">", ButtonKind.Ghost, true, 22)) value = (value + 1) % names.Length;
                y += 42;
            }
            void Swatches(string label, ref int value, Color[] colors)
            {
                UIKit.Label(new Rect(right.x + 22, y, 150, 28), label, 15, UIKit.Text, Anchor.Left, true);
                float sw = Mathf.Min(26f, (right.width - 192) / colors.Length - 4f);
                for (int i = 0; i < colors.Length; i++)
                {
                    Rect r = new Rect(right.x + 170 + i * (sw + 4), y + 2, sw, 24);
                    UIKit.RoundRect(r, colors[i]);
                    if (i == value) UIKit.RoundRect(UIKit.Shrink(r, -3f), new Color(1, 1, 1, 0.4f));
                    if (GUI.Button(r, GUIContent.none, GUIStyle.none)) { value = i; Audio.AudioManager.PlayUi(Audio.AudioManager.Ui.Click); }
                }
                y += 34;
            }

            Choice("Modelo", ref c.Body, RiderRig.BodyNames);
            Swatches("Piel", ref c.SkinTone, RiderRig.SkinTones);
            Choice("Pelo", ref c.Hair, RiderRig.HairNames, CharacterUnlocks.Hair);
            Swatches("Color de pelo", ref c.HairColor, RiderRig.HairColors);
            Choice("Arriba", ref c.Top, RiderRig.TopNames, CharacterUnlocks.Top);
            Swatches("Color", ref c.TopColor, RiderRig.ClothColors);
            Choice("Abajo", ref c.Bottom, RiderRig.BottomNames, CharacterUnlocks.Bottom);
            Swatches("Color", ref c.BottomColor, RiderRig.ClothColors);
            Swatches("Zapatillas", ref c.ShoesColor, RiderRig.ClothColors);
            Choice("Cabeza", ref c.Helmet, RiderRig.HelmetNames, CharacterUnlocks.Helmet);
            Swatches("Color casco", ref c.HelmetColor, RiderRig.ClothColors);
            c.Pads = UIKit.Toggle(new Rect(right.x + 22, y, right.width - 44, 34), level >= CharacterUnlocks.Pads ? "Rodilleras" : $"Rodilleras (Nv {CharacterUnlocks.Pads})", c.Pads); y += 38;
            c.Gloves = UIKit.Toggle(new Rect(right.x + 22, y, right.width - 44, 34), level >= CharacterUnlocks.Gloves ? "Guantes" : $"Guantes (Nv {CharacterUnlocks.Gloves})", c.Gloves); y += 38;

            if (JsonUtility.ToJson(c) != before) _gm.PreviewCharacter(c);

            bool locked = CharacterUnlocks.Hair(c.Hair) > level || CharacterUnlocks.Top(c.Top) > level || CharacterUnlocks.Bottom(c.Bottom) > level ||
                          CharacterUnlocks.Helmet(c.Helmet) > level || (c.Pads && level < CharacterUnlocks.Pads) || (c.Gloves && level < CharacterUnlocks.Gloves);
            float bw = (right.width - 28 - 10) * 0.5f;
            if (UIKit.Button(new Rect(right.x + 14, right.yMax - 62, bw, 50), "CANCELAR", ButtonKind.Secondary)) { Back(); return; }
            if (UIKit.Button(new Rect(right.x + 24 + bw, right.yMax - 62, bw, 50), locked ? "BLOQUEADO" : "GUARDAR", ButtonKind.Primary, !locked))
            {
                _gm.ApplyCharacter(JsonUtility.FromJson<CharacterData>(JsonUtility.ToJson(c)));
                Back();
            }
            UIKit.Label(new Rect(safe.xMin + 30, safe.yMax - 50, 500, 30), "Arrastra para girar al rider · Los cosméticos no dan ventaja en juego", 14, UIKit.Muted, Anchor.Left, false, true);
        }
    }
}

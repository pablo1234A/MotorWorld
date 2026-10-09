using ScooterUnleashed.Controls;
using ScooterUnleashed.Core.Modes;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Game;
using ScooterUnleashed.Rendering;
using ScooterUnleashed.Vehicle;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public sealed partial class UIRoot
    {
        private bool _hudHooked;
        private string _popText = "";
        private int _popPoints;
        private float _popTime = -10f;
        private string _landText = "";
        private float _landTime = -10f;
        private ComboResult _banked;
        private float _bankTime = -10f;
        private int _bailLost;
        private float _bailTime = -10f;
        private string _zoneShown = "";
        private float _zoneTime = -10f;

        private void HookHud()
        {
            if (_hudHooked || _gm.Tricks == null) return;
            _hudHooked = true;
            var t = _gm.Tricks;
            t.TrickPerformed += (name, pts) => { _popText = name; _popPoints = pts; _popTime = Time.unscaledTime; };
            t.Feedback += msg => { if (!string.IsNullOrEmpty(msg)) { _landText = msg; _landTime = Time.unscaledTime; } };
            t.ComboBanked += r => { _banked = r; _bankTime = Time.unscaledTime; };
            t.BailHappened += (reason, lost) => { _bailLost = lost; _bailTime = Time.unscaledTime; _landText = BailText(reason); _landTime = Time.unscaledTime; };
        }

        private static string BailText(BailReason r)
        {
            switch (r)
            {
                case BailReason.OverRotated: return "ROTACIÓN INCOMPLETA";
                case BailReason.Sideways: return "ATERRIZAJE CRUZADO";
                case BailReason.TrickUnfinished: return "TRUCO SIN TERMINAR";
                case BailReason.HeldTrick: return "¡SUELTA ANTES DE CAER!";
                case BailReason.HardImpact: return "IMPACTO DEMASIADO FUERTE";
                case BailReason.LostBalance: return "EQUILIBRIO PERDIDO";
                default: return "¡CAÍDA!";
            }
        }

        private void DrawHud()
        {
            HookHud();
            var s = _gm.Scooter;
            var t = _gm.Tricks;
            var safe = UIKit.Safe;
            float now = Time.unscaledTime;
            var settings = _gm.Save.Settings;

            // ---- Session score (top-left)
            UIKit.Label(new Rect(safe.xMin + 24, safe.yMin + 14, 400, 44), UIKit.FormatScore(t.Session.TotalScore), 38, UIKit.Text, Anchor.Left, true, true);
            string sub = _gm.Mode == GameModeId.BestLine ? "Mejor combo " + UIKit.FormatScore(t.Session.BestCombo) : $"Nivel {_gm.Save.Profile.Level}";
            UIKit.Label(new Rect(safe.xMin + 26, safe.yMin + 54, 400, 22), sub, 14, UIKit.Muted, Anchor.Left, true, true);

            // ---- Mode banner
            if (_gm.Mode == GameModeId.Freestyle || _gm.Mode == GameModeId.BestLine)
            {
                float tl = Mathf.Max(0f, _gm.ModeTimeLeft);
                string time = $"{(int)tl / 60}:{(int)tl % 60:00}";
                Rect tr = new Rect(UIKit.W * 0.5f - 70, safe.yMin + 12, 140, 46);
                UIKit.RoundRect(tr, UIKit.Panel);
                UIKit.Label(tr, time, 28, tl < 10f ? UIKit.Bad : UIKit.Text, Anchor.Center, true);
            }
            if (_gm.Duel != null && _gm.Duel.Current == DuelController.Phase.Attempt)
            {
                Rect tr = new Rect(UIKit.W * 0.5f - 200, safe.yMin + 12, 400, 46);
                UIKit.RoundRect(tr, UIKit.Panel);
                UIKit.Label(tr, $"{_gm.Duel.Instruction}  ·  {Mathf.CeilToInt(Mathf.Max(0, _gm.Duel.AttemptTimeLeft))} s", 17, UIKit.Text, Anchor.Center, true);
            }

            // ---- Zone name
            if (_gm.CurrentZoneName != _zoneShown) { _zoneShown = _gm.CurrentZoneName; _zoneTime = now; }
            float za = Fade(now - _zoneTime, 3f);
            if (za > 0f && !string.IsNullOrEmpty(_zoneShown))
            {
                UIKit.Alpha = za;
                UIKit.Label(new Rect(0, safe.yMin + 64, UIKit.W, 30), _zoneShown.ToUpperInvariant(), 20, UIKit.Accent2, Anchor.Center, true, true);
                UIKit.Alpha = 1f;
            }

            // ---- Tutorial
            if (_gm.Tutorial != null && _gm.Tutorial.Current != null) DrawTutorial(_gm.Tutorial);

            // ---- Combo panel
            var combo = t.Combo;
            if (combo.IsActive)
            {
                float cy = UIKit.H * 0.2f;
                string list = combo.Describe(4);
                UIKit.Label(new Rect(UIKit.W * 0.5f - 400, cy, 800, 30), list, 19, UIKit.Text, Anchor.Center, true, true);
                string mult = combo.Multiplier.ToString(combo.Multiplier % 1f == 0f ? "0" : "0.0");
                UIKit.Label(new Rect(UIKit.W * 0.5f - 400, cy + 28, 800, 46), $"{UIKit.FormatScore(Mathf.RoundToInt(combo.BasePoints))}  <color=#FF5C1F>× {mult}</color>", 34, UIKit.Text, Anchor.Center, true, true);
                if (s.State == ScooterState.Riding)
                {
                    float left = 1f - combo.IdleTime / combo.Rules.LinkWindow;
                    UIKit.Bar(new Rect(UIKit.W * 0.5f - 60, cy + 78, 120, 4), left, UIKit.Accent2);
                }
            }
            float ba = Fade(now - _bankTime, 1.6f);
            if (ba > 0f && _banked.Banked)
            {
                UIKit.Alpha = ba;
                float rise = (now - _bankTime) * 24f;
                UIKit.Label(new Rect(UIKit.W * 0.5f - 300, UIKit.H * 0.2f + 20 - rise, 600, 50), "+" + UIKit.FormatScore(_banked.Total), 40, UIKit.Accent2, Anchor.Center, true, true);
                UIKit.Alpha = 1f;
            }
            float bla = Fade(now - _bailTime, 1.8f);
            if (bla > 0f && _bailLost > 0)
            {
                UIKit.Alpha = bla;
                UIKit.Label(new Rect(UIKit.W * 0.5f - 300, UIKit.H * 0.2f + 30, 600, 40), "−" + UIKit.FormatScore(_bailLost), 32, UIKit.Bad, Anchor.Center, true, true);
                UIKit.Alpha = 1f;
            }

            // ---- Trick pop + landing feedback
            float pa = Fade(now - _popTime, 1.1f);
            if (pa > 0f)
            {
                UIKit.Alpha = pa;
                float sc = 1f + Mathf.Max(0f, 0.25f - (now - _popTime)) * 1.2f;
                int size = Mathf.RoundToInt(28 * sc);
                UIKit.Label(new Rect(UIKit.W * 0.5f - 300, UIKit.H * 0.33f, 600, 40), _popText.ToUpperInvariant(), size, UIKit.Text, Anchor.Center, true, true);
                UIKit.Label(new Rect(UIKit.W * 0.5f - 300, UIKit.H * 0.33f + 34, 600, 26), "+" + _popPoints, 18, UIKit.Accent, Anchor.Center, true, true);
                UIKit.Alpha = 1f;
            }
            float la = Fade(now - _landTime, 1.3f);
            if (la > 0f && !string.IsNullOrEmpty(_landText))
            {
                UIKit.Alpha = la;
                bool bad = now - _bailTime < 1.5f;
                UIKit.Label(new Rect(UIKit.W * 0.5f - 300, UIKit.H * 0.43f, 600, 44), _landText, 30, bad ? UIKit.Bad : (_landText == "PERFECTO" ? UIKit.Good : UIKit.Accent2), Anchor.Center, true, true);
                UIKit.Alpha = 1f;
            }

            // ---- Balance meters
            if (s.State == ScooterState.Grinding && t.GrindDef != null)
            {
                Rect br = new Rect(UIKit.W * 0.5f - 160, UIKit.H * 0.62f, 320, 14);
                DrawBalance(br, t.Balance.Value, true);
                UIKit.Label(new Rect(br.x, br.y - 30, br.width, 26), t.GrindDef.DisplayName.ToUpperInvariant() + $"  {s.GrindTime:0.0}s", 18, UIKit.Text, Anchor.Center, true, true);
            }
            else if (s.State == ScooterState.Manual && t.ManualDef != null)
            {
                Rect br = new Rect(UIKit.W * 0.5f + 120, UIKit.H * 0.38f, 14, 200);
                DrawBalance(br, t.Balance.Value, false);
                UIKit.Label(new Rect(br.x - 100, br.yMax + 6, 214, 24), t.ManualDef.DisplayName.ToUpperInvariant(), 16, UIKit.Text, Anchor.Center, true, true);
            }
            if (s.State == ScooterState.Bailed)
                UIKit.Label(new Rect(0, UIKit.H * 0.52f, UIKit.W, 26), "Toca para levantarte", 16, UIKit.Muted, Anchor.Center, false, true);

            // ---- Speed
            UIKit.Label(new Rect(UIKit.W * 0.5f - 100, safe.yMax - 40, 200, 30), $"{Mathf.RoundToInt(s.SpeedKmh)} <size=13>km/h</size>", 22, new Color(1, 1, 1, 0.75f), Anchor.Center, true, true);

            // ---- Minimap
            if (settings.ShowMinimap) DrawMinimap(new Rect(safe.xMax - 196f, safe.yMin + 86f, 176f, 176f), s.transform.position, s.transform.eulerAngles.y);

            DrawTouchControls(settings);
            if (settings.ShowDebug) DrawDebug();
        }

        private static float Fade(float age, float life) => age < 0f || age > life ? 0f : Mathf.Clamp01(age / 0.08f) * Mathf.Clamp01((life - age) / 0.35f);

        private void DrawBalance(Rect r, float v, bool horizontal)
        {
            UIKit.RoundRect(UIKit.Shrink(r, -3f), UIKit.Panel);
            float danger = Mathf.Abs(v);
            Color c = Color.Lerp(UIKit.Good, UIKit.Bad, Mathf.InverseLerp(0.45f, 0.95f, danger));
            if (horizontal)
            {
                UIKit.Rect(new Rect(r.center.x - 1, r.y - 4, 2, r.height + 8), new Color(1, 1, 1, 0.5f));
                UIKit.Disc(new Vector2(r.center.x + v * r.width * 0.5f, r.center.y), 10f, c);
            }
            else
            {
                UIKit.Rect(new Rect(r.x - 4, r.center.y - 1, r.width + 8, 2), new Color(1, 1, 1, 0.5f));
                UIKit.Disc(new Vector2(r.center.x, r.center.y - v * r.height * 0.5f), 10f, c);
            }
        }

        private void DrawTutorial(TutorialDirector tut)
        {
            var st = tut.Current;
            Rect p = new Rect(UIKit.W * 0.5f - 300, UIKit.Safe.yMin + 96, 600, 110);
            UIKit.RoundRect(p, UIKit.Panel);
            UIKit.Label(new Rect(p.x + 20, p.y + 10, 400, 24), $"TUTORIAL {tut.Index + 1}/{tut.Steps.Length} · {st.Title.ToUpperInvariant()}", 15, UIKit.Accent, Anchor.Left, true);
            UIKit.Label(new Rect(p.x + 20, p.y + 36, p.width - 190, 66), st.Text, 16, UIKit.Text, Anchor.Left, false, false, true);
            Rect chip = new Rect(p.xMax - 160, p.y + 40, 140, 44);
            float pulse = 0.75f + 0.25f * Mathf.Sin(Time.unscaledTime * 4f);
            UIKit.RoundRect(chip, new Color(UIKit.Accent.r, UIKit.Accent.g, UIKit.Accent.b, pulse));
            UIKit.Label(chip, st.Gesture, 15, new Color(0.05f, 0.04f, 0.03f), Anchor.Center, true);
            UIKit.Bar(new Rect(p.x + 20, p.yMax - 8, p.width - 40, 3), tut.Index / (float)tut.Steps.Length, UIKit.Accent2);
        }

        // ---- Minimap (north up) --------------------------------------------------------------------
        private void DrawMinimap(Rect r, Vector3 pos, float yaw)
        {
            UIKit.RoundRect(UIKit.Shrink(r, -4f), UIKit.Panel);
            const float range = 110f; // metres from centre to edge
            float k = r.width * 0.5f / range;
            GUI.BeginGroup(r);
            Vector2 c = new Vector2(r.width * 0.5f, r.height * 0.5f);
            Vector2 Map(float x, float z) => c + new Vector2((x - pos.x) * k, -(z - pos.z) * k);
            foreach (var zn in WorldAtlas.Zones)
            {
                var a = Map(zn.Area.xMin, zn.Area.yMax);
                UIKit.Rect(new Rect(a.x, a.y, zn.Area.width * k, zn.Area.height * k), new Color(zn.MapColor.r, zn.MapColor.g, zn.MapColor.b, 0.22f));
            }
            foreach (var sh in WorldAtlas.MapShapes)
            {
                var a = Map(sh.rect.xMin, sh.rect.yMax);
                var rr = new Rect(a.x, a.y, Mathf.Max(1.5f, sh.rect.width * k), Mathf.Max(1.5f, sh.rect.height * k));
                if (rr.xMax < 0 || rr.yMax < 0 || rr.x > r.width || rr.y > r.height) continue;
                UIKit.Rect(rr, new Color(sh.color.r, sh.color.g, sh.color.b, 0.75f));
            }
            foreach (var p in WorldAtlas.Pois)
            {
                if (p.HiddenUntilDiscovered && !_gm.Save.DiscoveredSpots.Contains(p.Id)) continue;
                var m = Map(p.Position.x, p.Position.z);
                if (m.x < 4 || m.y < 4 || m.x > r.width - 4 || m.y > r.height - 4) continue;
                UIKit.Disc(m, 5f, PoiColor(p.Type));
            }
            // Player marker: disc + heading dot (no GUI rotation, which misbehaves with a scaled GUI matrix)
            Vector2 hd = new Vector2(Mathf.Sin(yaw * Mathf.Deg2Rad), -Mathf.Cos(yaw * Mathf.Deg2Rad));
            UIKit.Disc(c, 7.5f, UIKit.Accent);
            UIKit.Disc(c + hd * 10f, 3.5f, Color.white);
            UIKit.Disc(c + hd * 15f, 2.5f, Color.white);
            GUI.EndGroup();
            UIKit.Label(new Rect(r.x, r.y + 2, r.width, 16), "N", 12, UIKit.Muted, Anchor.Center, true);
        }

        public static Color PoiColor(PoiType t)
        {
            switch (t)
            {
                case PoiType.Skatepark: return new Color(0.3f, 0.75f, 1f);
                case PoiType.Workshop: return UIKit.Accent;
                case PoiType.Shop: return new Color(0.85f, 0.45f, 1f);
                case PoiType.Secret: return UIKit.Accent2;
                case PoiType.Event: return UIKit.Bad;
                case PoiType.Challenge: return UIKit.Good;
                case PoiType.Rest: return new Color(0.6f, 0.9f, 0.7f);
                case PoiType.Spawn: return Color.white;
                default: return new Color(0.75f, 0.8f, 0.85f);
            }
        }

        // ---- Touch controls -------------------------------------------------------------------------
        private void DrawTouchControls(Core.Save.SettingsData settings)
        {
            var input = _gm.PlayerInput;
            float op = Mathf.Clamp(settings.ControlsOpacity, 0.2f, 1f);
            Color baseC = new Color(1, 1, 1, 0.16f * op);
            Color knobC = new Color(1, 1, 1, 0.55f * op);

            // Stick
            float r = ControlsLayout.StickRadius;
            Vector2 sc = input.StickActive ? input.StickCenter : ControlsLayout.StickHome;
            Vector2 kc = input.StickActive ? input.StickKnob : ControlsLayout.StickHome;
            UIKit.Disc(sc, r, baseC);
            UIKit.Disc(sc, r, new Color(1, 1, 1, 0.25f * op), true);
            UIKit.Disc(kc, r * 0.42f, knobC);

            // Pause / map
            Btn(ControlsLayout.Pause, "II", op, false);
            Btn(ControlsLayout.Map, "MAPA", op, false, 13);
            Btn(ControlsLayout.Brake, "FRENO", op, input.Held.Contains(TouchButton.Brake), 15);

            var t = _gm.Tricks;
            if (t.GrindAvailable && !settings.AutoGrind)
            {
                float pulse = 0.7f + 0.3f * Mathf.Sin(Time.unscaledTime * 8f);
                UIKit.RoundRect(ControlsLayout.Grind, new Color(UIKit.Accent.r, UIKit.Accent.g, UIKit.Accent.b, pulse * op + 0.2f));
                UIKit.Label(ControlsLayout.Grind, "GRIND", 22, new Color(0.05f, 0.04f, 0.03f), Anchor.Center, true);
            }
            if (input.ShowEnter)
            {
                bool shop = _gm.NearbyEnter == "shop";
                // Drawn only: the touch is handled by PlayerInput (multi-touch safe).
                UIKit.RoundRect(ControlsLayout.Enter, UIKit.Accent);
                UIKit.Label(ControlsLayout.Enter, shop ? "ENTRAR EN LA TIENDA" : "ENTRAR AL TALLER", 18, new Color(0.05f, 0.04f, 0.03f), Anchor.Center, true);
            }

            if (ControlsLayout.ButtonScheme)
            {
                Btn(ControlsLayout.Jump, "SALTO", op, input.Held.Contains(TouchButton.Jump), 18);
                Btn(ControlsLayout.TrickUp, "↑", op, false, 24);
                Btn(ControlsLayout.TrickDown, "↓", op, false, 24);
                Btn(ControlsLayout.TrickLeft, "←", op, false, 24);
                Btn(ControlsLayout.TrickRight, "→", op, false, 24);
                Btn(ControlsLayout.TrickDiag, "↘", op, false, 24);
                Btn(ControlsLayout.Body, "CUERPO", op, input.Held.Contains(TouchButton.Body), 12);
                Btn(ControlsLayout.SpinLeft, "GIRO\nIZQ", op, false, 12);
                Btn(ControlsLayout.SpinRight, "GIRO\nDCHA", op, false, 12);
            }
            else
            {
                // Action zone: charge ring + gesture trail
                if (input.ActionActive)
                {
                    float charge = t.CrouchCharge01;
                    UIKit.Disc(input.ActionStart, 46f, new Color(1, 1, 1, 0.12f * op));
                    if (t.IsCrouching)
                    {
                        Color cc = Color.Lerp(UIKit.Accent2, UIKit.Accent, charge);
                        UIKit.Disc(input.ActionStart, 30f + 20f * charge, new Color(cc.r, cc.g, cc.b, 0.85f * op), true);
                    }
                    if (t.IsHoldReady) UIKit.Label(new Rect(input.ActionStart.x - 80, input.ActionStart.y - 82, 160, 22), "CUERPO: DESLIZA", 13, UIKit.Accent2, Anchor.Center, true, true);
                    for (int i = 0; i < input.Trail.Count; i++)
                    {
                        float f = i / (float)Mathf.Max(1, input.Trail.Count - 1);
                        UIKit.Disc(input.Trail[i], 3f + 5f * f, new Color(1, 1, 1, 0.45f * f * op));
                    }
                }
                else if (_gm.Save.Profile.TotalXp < 400)
                {
                    Rect hint = new Rect(ControlsLayout.ActionZone.center.x - 160, UIKit.Safe.yMax - 70, 320, 40);
                    UIKit.Label(hint, "Mantén y suelta: saltar · Desliza: trucos", 14, new Color(1, 1, 1, 0.5f * op), Anchor.Center, false, true);
                }
                float ga = Fade(Time.unscaledTime - input.LastGestureTime, 0.6f);
                if (ga > 0f)
                {
                    UIKit.Alpha = ga;
                    UIKit.Label(new Rect(ControlsLayout.ActionZone.center.x - 100, UIKit.H * 0.55f, 200, 40), input.LastGestureLabel, 26, new Color(1, 1, 1, 0.7f), Anchor.Center, true, true);
                    UIKit.Alpha = 1f;
                }
            }
        }

        private static void Btn(Rect r, string label, float op, bool held, int size = 18)
        {
            if (r.width <= 0f) return;
            UIKit.RoundRect(r, new Color(0.05f, 0.06f, 0.07f, (held ? 0.75f : 0.45f) * op + 0.1f));
            if (held) UIKit.RoundRect(UIKit.Shrink(r, 2f), new Color(UIKit.Accent.r, UIKit.Accent.g, UIKit.Accent.b, 0.35f));
            UIKit.Label(r, label, size, new Color(1, 1, 1, 0.85f * op + 0.1f), Anchor.Center, true);
        }

        // ---- Debug overlay --------------------------------------------------------------------------
        private void DrawDebug()
        {
            var s = _gm.Scooter;
            var t = _gm.Tricks;
            var dr = _gm.DynRes;
            Rect p = new Rect(UIKit.Safe.xMin + 20, UIKit.Safe.yMin + 90, 330, 300);
            UIKit.RoundRect(p, new Color(0, 0, 0, 0.6f));
            string txt =
                $"FPS {dr.Fps:0}  ({dr.AverageFrameMs:0.0} ms)  escala {QualityManager.RenderScale:0.00}  {QualityManager.Current}\n" +
                $"Estado {s.State}   Superficie {s.Surface}\n" +
                $"Vel {s.Velocity.magnitude:0.00} m/s  fwd {s.ForwardSpeed:0.00}\n" +
                $"Ruedas  F:{(s.FrontContact ? "■" : "□")}  T:{(s.RearContact ? "■" : "□")}   n.y {s.GroundNormal.y:0.00}\n" +
                $"Aire {s.AirTime:0.00}s  altura {s.AirHeight:0.00}m  vert {s.IsVertAir}\n" +
                $"Yaw {s.AccumYaw:0}°  Pitch {s.AccumPitch:0}°  pred {(s.HasPrediction ? s.PredictedTime.ToString("0.00") + "s" : "—")}\n" +
                $"Truco {t.ActiveTrickName ?? "—"}\n" +
                $"Combo {t.Combo.BasePoints:0} × {t.Combo.Multiplier:0.0}  ({t.Combo.TrickCount})\n" +
                $"Equilibrio {t.Balance.Value:0.00}  {(t.Balance.Active ? "activo" : "")}\n" +
                $"Raíl cerca {t.GrindAvailable}   Grind {s.GrindTime:0.0}s\n" +
                $"Stick {s.Stick.x:0.00},{s.Stick.y:0.00}  freno {s.Brake:0}";
            UIKit.Label(new Rect(p.x + 12, p.y + 8, p.width - 24, p.height - 16), txt, 13, Color.white, Anchor.Left, false, false, true);
            if (_gm.SaveSys.LastError != null) UIKit.Label(new Rect(p.x + 12, p.yMax - 24, p.width - 24, 20), _gm.SaveSys.LastError, 12, UIKit.Bad);
        }
    }
}

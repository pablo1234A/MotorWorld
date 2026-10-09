using System;
using System.Collections.Generic;
using ScooterUnleashed.Audio;
using ScooterUnleashed.Core.Modes;
using ScooterUnleashed.Game;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public enum UIScreen { None, Main, Pause, Settings, Map, Workshop, Character, Profile, TrickBook, Results, Confirm }

    /// <summary>
    /// Screen navigation (stack with back), transitions and drawing of every menu + the HUD.
    /// Screens are split across partial files by feature.
    /// </summary>
    public sealed partial class UIRoot : MonoBehaviour
    {
        private GameManager _gm;
        private readonly Stack<UIScreen> _stack = new Stack<UIScreen>();
        private UIScreen _screen = UIScreen.None;
        private float _screenTime;
        private string _confirmTitle, _confirmText, _confirmButton;
        private Action _confirmAction;

        private void Start()
        {
            _gm = GameManager.Instance;
            if (_gm != null) _gm.ScreenRequest += OnScreenRequest;
        }

        private void OnDestroy() { if (_gm != null) _gm.ScreenRequest -= OnScreenRequest; }

        private void OnScreenRequest(string id)
        {
            switch (id)
            {
                case "map": Open(UIScreen.Map); break;
                case "workshop": if (_gm.State == GameState.Playing) _gm.Pause(); OpenWorkshop(); break;
                case "character": if (_gm.State == GameState.Playing) _gm.Pause(); OpenCharacter(); break;
            }
        }

        public void Open(UIScreen s)
        {
            if (_screen != UIScreen.None && _screen != s) _stack.Push(_screen);
            _screen = s;
            _screenTime = 0f;
        }

        public void Back()
        {
            AudioManager.PlayUi(AudioManager.Ui.Back);
            var leaving = _screen;
            if (leaving == UIScreen.Workshop || leaving == UIScreen.Character) { _gm.RebuildScooter(); _gm.RebuildRider(); _gm.EndShowcase(); }
            if (leaving == UIScreen.Settings) _gm.SaveGame();
            _screen = _stack.Count > 0 ? _stack.Pop() : UIScreen.None;
            _screenTime = 0f;
            if (_screen == UIScreen.None && _gm.State == GameState.Paused) _gm.Resume();
        }

        private void CloseAll()
        {
            _stack.Clear();
            _screen = UIScreen.None;
            _screenTime = 0f;
        }

        private void Confirm(string title, string text, string button, Action action)
        {
            _confirmTitle = title; _confirmText = text; _confirmButton = button; _confirmAction = action;
            Open(UIScreen.Confirm);
        }

        private void Update()
        {
            _screenTime += Time.unscaledDeltaTime;
            if (_gm == null) return;
            // Pause opens the pause screen; resuming from elsewhere closes it.
            if (_gm.State == GameState.Paused && _screen == UIScreen.None) Open(UIScreen.Pause);
            if (_gm.State == GameState.Playing && _screen != UIScreen.None && _screen != UIScreen.Confirm) CloseAll();
            if (_gm.State == GameState.Results && _screen != UIScreen.Results) { _stack.Clear(); _screen = UIScreen.Results; _screenTime = 0f; }
            if (_gm.State == GameState.MainMenu && _screen == UIScreen.None) { _screen = UIScreen.Main; _screenTime = 0f; }
            // Android back button
            if (UnityEngine.Input.GetKeyDown(KeyCode.Escape) && _gm.State != GameState.Playing && _screen != UIScreen.Main && _screen != UIScreen.None && _screen != UIScreen.Results) Back();
        }

        private float Appear => Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(_screenTime / 0.22f));

        private void OnGUI()
        {
            UIKit.BeginFrame();
            if (_gm == null) _gm = GameManager.Instance;
            if (_gm == null) return;
            if (_gm.State == GameState.Loading || _gm.FatalError != null) { DrawLoading(); return; }

            if (_gm.State == GameState.Playing || (_gm.State == GameState.Paused && !_gm.Showcase)) DrawHud();

            UIKit.Alpha = Appear;
            float slide = (1f - Appear) * 18f;
            var m = GUI.matrix;
            GUI.matrix = m * Matrix4x4.Translate(new Vector3(0f, slide, 0f));
            switch (_screen)
            {
                case UIScreen.Main: DrawMain(); break;
                case UIScreen.Pause: DrawPause(); break;
                case UIScreen.Settings: DrawSettings(); break;
                case UIScreen.Map: DrawMap(); break;
                case UIScreen.Workshop: DrawWorkshop(); break;
                case UIScreen.Character: DrawCharacter(); break;
                case UIScreen.Profile: DrawProfile(); break;
                case UIScreen.TrickBook: DrawTrickBookScreen(); break;
                case UIScreen.Results: DrawResults(); break;
                case UIScreen.Confirm: DrawConfirm(); break;
            }
            GUI.matrix = m;
            UIKit.Alpha = 1f;
            if (_gm.State == GameState.Playing && _gm.Duel != null && _gm.Duel.Current == DuelController.Phase.Interstitial) DrawDuelInterstitial();
            DrawToasts();
        }

        // ==========================================================================================
        private void DrawLoading()
        {
            UIKit.Rect(new Rect(0, 0, UIKit.W, UIKit.H), new Color(0.03f, 0.035f, 0.045f, 1f));
            float cx = UIKit.W * 0.5f, cy = UIKit.H * 0.5f;
            UIKit.Label(new Rect(cx - 400, cy - 120, 800, 70), "SCOOTER", 64, UIKit.Text, Anchor.Center, true);
            UIKit.Label(new Rect(cx - 400, cy - 62, 800, 50), "U N L E A S H E D", 26, UIKit.Accent, Anchor.Center, true);
            if (_gm.FatalError != null)
            {
                UIKit.Label(new Rect(cx - 420, cy + 10, 840, 90), _gm.FatalError, 18, UIKit.Bad, Anchor.Center, false, false, true);
                UIKit.Label(new Rect(cx - 420, cy + 100, 840, 40), "Revisa la consola. Si falta un shader, ejecuta Scooter Unleashed > Setup Project en el editor.", 15, UIKit.Muted, Anchor.Center);
                return;
            }
            UIKit.Bar(new Rect(cx - 220, cy + 30, 440, 6), _gm.LoadingProgress, UIKit.Accent);
            UIKit.Label(new Rect(cx - 300, cy + 46, 600, 30), _gm.LoadingText + "…", 16, UIKit.Muted, Anchor.Center);
        }

        // ==========================================================================================
        private void DrawMain()
        {
            var s = _gm.Save;
            var safe = UIKit.Safe;
            // Left gradient for legibility over the live 3D scene
            for (int i = 0; i < 12; i++)
                UIKit.Rect(new Rect(i * 50f, 0, 50f, UIKit.H), new Color(0.02f, 0.025f, 0.03f, Mathf.Lerp(0.92f, 0f, i / 11f)));

            float x = safe.xMin + 56f, y = safe.yMin + 46f;
            UIKit.Label(new Rect(x, y, 600, 74), "SCOOTER", 72, UIKit.Text, Anchor.Left, true, true);
            UIKit.Label(new Rect(x + 4, y + 70, 600, 34), "U N L E A S H E D", 24, UIKit.Accent, Anchor.Left, true);
            UIKit.Label(new Rect(x + 4, y + 104, 600, 24), "Freestyle urbano en Puerto Rueda", 16, UIKit.Muted);
            y += 150f;

            float bw = 400f, bh = 60f, gap = 10f;
            bool newPlayer = !s.TutorialCompleted && s.Profile.TotalXp < 100;
            string spawnName = WorldAtlas.Get(s.LastSpawnId)?.Name ?? "Plaza Mayor";
            if (newPlayer)
            {
                if (UIKit.Button(new Rect(x, y, bw, bh), "EMPEZAR TUTORIAL", ButtonKind.Primary, true, 22, "Aprende a montar en 3 minutos")) { CloseAll(); _gm.StartMode(GameModeId.Tutorial); }
                y += bh + gap;
                if (UIKit.Button(new Rect(x, y, bw, bh), "MUNDO LIBRE", ButtonKind.Secondary, true, 22, spawnName)) { CloseAll(); _gm.StartMode(GameModeId.FreeRoam); }
            }
            else
            {
                if (UIKit.Button(new Rect(x, y, bw, bh), "CONTINUAR", ButtonKind.Primary, true, 22, "Mundo libre · " + spawnName)) { CloseAll(); _gm.StartMode(GameModeId.FreeRoam); }
                y += bh + gap;
                if (UIKit.Button(new Rect(x, y, bw, bh), "TUTORIAL", ButtonKind.Secondary, true, 22, s.TutorialCompleted ? "Completado ✓ · repasa lo básico" : "Recomendado")) { CloseAll(); _gm.StartMode(GameModeId.Tutorial); }
            }
            y += bh + gap + 8f;
            UIKit.Label(new Rect(x, y, bw, 22), "COMPETICIÓN", 14, UIKit.Muted, Anchor.Left, true);
            y += 26f;
            var fs = _gm.Leaderboard("freestyle");
            var bl = _gm.Leaderboard("bestline");
            if (UIKit.Button(new Rect(x, y, bw, 54), "SESIÓN FREESTYLE", ButtonKind.Secondary, true, 19, "3 min · suma de combos · récord " + (fs.Count > 0 ? UIKit.FormatScore(fs[0].Score) : "—"))) { CloseAll(); _gm.StartMode(GameModeId.Freestyle); }
            y += 54 + gap;
            if (UIKit.Button(new Rect(x, y, bw, 54), "MEJOR LÍNEA", ButtonKind.Secondary, true, 19, "2 min · solo cuenta tu mejor combo · récord " + (bl.Count > 0 ? UIKit.FormatScore(bl[0].Score) : "—"))) { CloseAll(); _gm.StartMode(GameModeId.BestLine); }
            y += 54 + gap;
            if (UIKit.Button(new Rect(x, y, bw, 54), "DUELO 1 VS 1", ButtonKind.Secondary, true, 19, "Local · dos jugadores en este dispositivo")) { CloseAll(); _gm.StartMode(GameModeId.Duel); }
            y += 54 + gap + 6f;

            float hw = (bw - gap) * 0.5f;
            if (UIKit.Button(new Rect(x, y, hw, 50), "TALLER", ButtonKind.Ghost, true, 18)) OpenWorkshop();
            if (UIKit.Button(new Rect(x + hw + gap, y, hw, 50), "RIDER", ButtonKind.Ghost, true, 18)) OpenCharacter();
            y += 50 + gap;
            if (UIKit.Button(new Rect(x, y, hw, 50), "PERFIL", ButtonKind.Ghost, true, 18)) Open(UIScreen.Profile);
            if (UIKit.Button(new Rect(x + hw + gap, y, hw, 50), "AJUSTES", ButtonKind.Ghost, true, 18)) Open(UIScreen.Settings);

            // Profile chip (bottom right)
            var pr = s.Profile;
            Rect chip = new Rect(safe.xMax - 330f, safe.yMax - 104f, 300f, 82f);
            UIKit.RoundRect(chip, UIKit.Panel);
            UIKit.Disc(new Vector2(chip.x + 40f, chip.center.y), 26f, UIKit.Accent);
            UIKit.Label(new Rect(chip.x + 14f, chip.y, 52f, chip.height), pr.Level.ToString(), 24, new Color(0.05f, 0.04f, 0.03f), Anchor.Center, true);
            UIKit.Label(new Rect(chip.x + 80f, chip.y + 10f, 200f, 24f), pr.DisplayName, 18, UIKit.Text, Anchor.Left, true);
            int need = Core.Progression.ProgressionRules.XpForNextLevel(pr.Level);
            UIKit.Bar(new Rect(chip.x + 80f, chip.y + 40f, 196f, 6f), pr.Xp / (float)need, UIKit.Accent);
            UIKit.Label(new Rect(chip.x + 80f, chip.y + 50f, 200f, 22f), $"{UIKit.FormatScore(pr.Credits)} créditos · Rep. {pr.Reputation}", 13, UIKit.Muted);
            UIKit.Label(new Rect(safe.xMax - 330f, safe.yMax - 18f, 300f, 16f), "Online: requiere configurar un servidor (no disponible)", 11, new Color(1, 1, 1, 0.35f), Anchor.Right);
        }

        private void OpenWorkshop()
        {
            _gm.BeginShowcase();
            _workshopSlot = 0;
            _candidate = null;
            Open(UIScreen.Workshop);
        }

        private void OpenCharacter()
        {
            _gm.BeginShowcase();
            _charEdit = JsonUtility.FromJson<Core.Save.CharacterData>(JsonUtility.ToJson(_gm.Save.Character));
            Open(UIScreen.Character);
        }

        // ==========================================================================================
        private void DrawPause()
        {
            UIKit.Dim(0.55f);
            float w = 420f, h = 560f;
            Rect p = new Rect(UIKit.W * 0.5f - w * 0.5f, UIKit.H * 0.5f - h * 0.5f, w, h);
            UIKit.PanelBox(p, "Pausa");
            string mode = GameModeInfo.Title(_gm.Mode);
            UIKit.Label(new Rect(p.x + 24, p.y + 60, w - 48, 22), mode + (string.IsNullOrEmpty(_gm.CurrentZoneName) ? "" : " · " + _gm.CurrentZoneName), 14, UIKit.Muted);
            float y = p.y + 96f, bx = p.x + 24f, bw = w - 48f, bh = 52f, gap = 9f;
            if (UIKit.Button(new Rect(bx, y, bw, bh), "REANUDAR", ButtonKind.Primary, true, 21)) { CloseAll(); _gm.Resume(); }
            y += bh + gap;
            if (UIKit.Button(new Rect(bx, y, bw, bh), "MAPA", ButtonKind.Secondary)) Open(UIScreen.Map);
            y += bh + gap;
            if (UIKit.Button(new Rect(bx, y, bw, bh), "LIBRO DE TRUCOS", ButtonKind.Secondary)) Open(UIScreen.TrickBook);
            y += bh + gap;
            if (UIKit.Button(new Rect(bx, y, bw, bh), "VOLVER AL ÚLTIMO PUNTO SEGURO", ButtonKind.Secondary, true, 17)) { CloseAll(); _gm.RespawnPlayer(); }
            y += bh + gap;
            float hw = (bw - gap) * 0.5f;
            if (UIKit.Button(new Rect(bx, y, hw, bh), "TALLER", ButtonKind.Secondary)) OpenWorkshop();
            if (UIKit.Button(new Rect(bx + hw + gap, y, hw, bh), "RIDER", ButtonKind.Secondary)) OpenCharacter();
            y += bh + gap;
            if (UIKit.Button(new Rect(bx, y, hw, bh), "AJUSTES", ButtonKind.Secondary)) Open(UIScreen.Settings);
            if (UIKit.Button(new Rect(bx + hw + gap, y, hw, bh), "PERFIL", ButtonKind.Secondary)) Open(UIScreen.Profile);
            y += bh + gap;
            if (UIKit.Button(new Rect(bx, y, bw, bh), "SALIR AL MENÚ", ButtonKind.Ghost))
                Confirm("¿Salir al menú?", _gm.Mode == GameModeId.FreeRoam ? "Tu progreso se guarda automáticamente." : "La sesión en curso se perderá.", "SALIR", () => { CloseAll(); _gm.EnterMainMenu(); });
        }

        private void DrawConfirm()
        {
            UIKit.Dim(0.65f);
            Rect p = new Rect(UIKit.W * 0.5f - 230f, UIKit.H * 0.5f - 120f, 460f, 240f);
            UIKit.PanelBox(p, _confirmTitle);
            UIKit.Label(new Rect(p.x + 24, p.y + 70, p.width - 48, 80), _confirmText, 17, UIKit.Muted, Anchor.Left, false, false, true);
            float bw = (p.width - 48 - 12) * 0.5f;
            if (UIKit.Button(new Rect(p.x + 24, p.yMax - 76, bw, 52), "CANCELAR", ButtonKind.Secondary)) Back();
            if (UIKit.Button(new Rect(p.x + 36 + bw, p.yMax - 76, bw, 52), _confirmButton, ButtonKind.Danger))
            {
                var a = _confirmAction;
                _screen = _stack.Count > 0 ? _stack.Pop() : UIScreen.None;
                a?.Invoke();
            }
        }

        // ==========================================================================================
        private void DrawResults()
        {
            var r = _gm.LastResults;
            UIKit.Dim(0.6f);
            if (r == null) { if (UIKit.Button(new Rect(UIKit.W * 0.5f - 150, UIKit.H * 0.5f, 300, 56), "MENÚ", ButtonKind.Primary)) { _gm.ClearResults(); CloseAll(); _gm.EnterMainMenu(); } return; }
            Rect p = new Rect(UIKit.W * 0.5f - 300f, UIKit.H * 0.5f - 270f, 600f, 540f);
            UIKit.PanelBox(p, r.Title);
            float y = p.y + 74f;
            if (!string.IsNullOrEmpty(r.Extra)) { UIKit.Label(new Rect(p.x, y, p.width, 60), r.Extra, 44, UIKit.Accent2, Anchor.Center, true); y += 70f; }
            else
            {
                UIKit.Label(new Rect(p.x, y, p.width, 70), UIKit.FormatScore(r.Score), 62, UIKit.Text, Anchor.Center, true, true);
                y += 70f;
                if (r.NewRecord) UIKit.Label(new Rect(p.x, y, p.width, 26), "¡NUEVO RÉCORD!", 20, UIKit.Accent2, Anchor.Center, true);
                else if (r.LeaderboardRank > 0) UIKit.Label(new Rect(p.x, y, p.width, 26), $"Puesto {r.LeaderboardRank} en tu clasificación local", 16, UIKit.Muted, Anchor.Center);
                y += 36f;
            }
            void Row(string a, string b)
            {
                UIKit.Label(new Rect(p.x + 40, y, 260, 28), a, 17, UIKit.Muted);
                UIKit.Label(new Rect(p.x + 300, y, p.width - 340, 28), b, 17, UIKit.Text, Anchor.Right, true);
                y += 30f;
            }
            if (r.ModeLabel != "duel")
            {
                Row("Mejor combo", UIKit.FormatScore(r.BestCombo));
                UIKit.Label(new Rect(p.x + 40, y, p.width - 80, 24), r.BestComboSummary ?? "", 13, UIKit.Muted, Anchor.Right);
                y += 26f;
                Row("Trucos aterrizados", r.Tricks.ToString());
                Row("Caídas", r.Bails.ToString());
            }
            else { UIKit.Label(new Rect(p.x + 40, y, p.width - 80, 30), r.BestComboSummary, 18, UIKit.Text, Anchor.Center); y += 40f; }
            Row("Experiencia", "+" + r.XpGained + " XP");
            Row("Créditos", "+" + r.CreditsGained);
            if (r.LevelsGained > 0) Row("¡Subes de nivel!", "Nivel " + _gm.Save.Profile.Level);

            float bw = (p.width - 48 - 20) / 3f, by = p.yMax - 78f;
            if (UIKit.Button(new Rect(p.x + 24, by, bw, 54), "REPETIR", ButtonKind.Primary))
            {
                var mode = r.ModeLabel == "bestline" ? GameModeId.BestLine : r.ModeLabel == "duel" ? GameModeId.Duel : GameModeId.Freestyle;
                _gm.ClearResults(); CloseAll(); _gm.StartMode(mode);
            }
            if (UIKit.Button(new Rect(p.x + 34 + bw, by, bw, 54), "MUNDO LIBRE", ButtonKind.Secondary, true, 17)) { _gm.ClearResults(); CloseAll(); _gm.StartMode(GameModeId.FreeRoam, "skatepark"); }
            if (UIKit.Button(new Rect(p.x + 44 + bw * 2, by, bw, 54), "MENÚ", ButtonKind.Secondary)) { _gm.ClearResults(); CloseAll(); _gm.EnterMainMenu(); }
        }

        // ==========================================================================================
        private void DrawDuelInterstitial()
        {
            var d = _gm.Duel;
            var m = d.Match;
            UIKit.Dim(0.55f);
            Rect p = new Rect(UIKit.W * 0.5f - 300f, UIKit.H * 0.5f - 210f, 600f, 420f);
            UIKit.PanelBox(p, $"Duelo · Ronda {m.Round}");
            for (int i = 0; i < 2; i++)
            {
                float x = p.x + 40f + i * 270f, y = p.y + 80f;
                bool active = m.ActivePlayer == i;
                UIKit.Label(new Rect(x, y, 250, 28), m.PlayerNames[i] + (m.Setter == i ? "  (marca)" : ""), 19, active ? UIKit.Accent : UIKit.Text, Anchor.Left, true);
                for (int k = 0; k < m.Rules.Word.Length; k++)
                {
                    bool got = k < m.Letters(i);
                    Rect lr = new Rect(x + k * 44f, y + 36f, 38f, 46f);
                    UIKit.RoundRect(lr, got ? UIKit.Bad : UIKit.PanelLight);
                    UIKit.Label(lr, m.Rules.Word[k].ToString(), 24, got ? Color.white : UIKit.Muted, Anchor.Center, true);
                }
            }
            if (!string.IsNullOrEmpty(d.LastResult)) UIKit.Label(new Rect(p.x + 30, p.y + 196, p.width - 60, 30), d.LastResult, 18, UIKit.Accent2, Anchor.Center, true);
            UIKit.Label(new Rect(p.x + 30, p.y + 232, p.width - 60, 50), d.Instruction, 20, UIKit.Text, Anchor.Center, true, false, true);
            if (m.Phase == DuelPhase.FollowerTurn && !string.IsNullOrEmpty(m.LineToBeat))
                UIKit.Label(new Rect(p.x + 30, p.y + 282, p.width - 60, 26), m.LineToBeat, 14, UIKit.Muted, Anchor.Center);
            UIKit.Label(new Rect(p.x + 30, p.y + 306, p.width - 60, 22), $"Un intento = tu primer combo aterrizado ({m.Rules.AttemptTime:0} s máx.)", 13, UIKit.Muted, Anchor.Center);
            if (UIKit.Button(new Rect(p.x + 150, p.yMax - 78, 300, 56), "EMPEZAR INTENTO", ButtonKind.Primary)) _gm.DuelBeginAttempt();
        }

        // ==========================================================================================
        private void DrawToasts()
        {
            var list = _gm.Toasts.Active;
            float y = UIKit.Safe.yMin + 96f;
            float x = UIKit.W * 0.5f - 210f;
            for (int i = 0; i < list.Count; i++)
            {
                var t = list[i];
                float a = Mathf.Clamp01(t.Time / 0.2f) * Mathf.Clamp01((t.Duration - t.Time) / 0.35f);
                UIKit.Alpha = a;
                Rect r = new Rect(x, y + (1f - a) * -10f, 420f, 58f);
                UIKit.RoundRect(r, UIKit.Panel);
                UIKit.RoundRect(new Rect(r.x, r.y, 5f, r.height), t.Color);
                UIKit.Label(new Rect(r.x + 18, r.y + 6, r.width - 30, 26), t.Title, 18, t.Color, Anchor.Left, true);
                UIKit.Label(new Rect(r.x + 18, r.y + 30, r.width - 30, 22), t.Sub, 14, UIKit.Muted);
                y += 64f;
            }
            UIKit.Alpha = 1f;
        }
    }
}

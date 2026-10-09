using ScooterUnleashed.Controls;
using ScooterUnleashed.Core.Progression;
using ScooterUnleashed.Core.Tricks;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public sealed partial class UIRoot
    {
        private int _profileTab;
        private static readonly string[] ProfileTabs = { "RESUMEN", "DESAFÍOS", "TRUCOS", "HISTORIAL" };

        private void DrawProfile()
        {
            UIKit.Dim(0.65f);
            Rect p = new Rect(UIKit.W * 0.5f - 440f, UIKit.H * 0.5f - 320f, 880f, 640f);
            UIKit.PanelBox(p, "Perfil");
            if (UIKit.Button(new Rect(p.xMax - 140, p.y + 16, 116, 44), "VOLVER", ButtonKind.Ghost, true, 16)) { Back(); return; }
            _profileTab = UIKit.Segmented(new Rect(p.x + 24, p.y + 72, p.width - 48, 44), ProfileTabs, _profileTab);
            Rect body = new Rect(p.x + 24, p.y + 132, p.width - 48, p.height - 156);
            switch (_profileTab)
            {
                case 0: DrawSummary(body); break;
                case 1: DrawChallenges(body); break;
                case 2: DrawTrickBook(body); break;
                case 3: DrawHistory(body); break;
            }
        }

        private void DrawSummary(Rect b)
        {
            var s = _gm.Save;
            var pr = s.Profile;
            var rec = s.Records;
            float y = b.y;
            UIKit.Label(new Rect(b.x, y, 400, 40), pr.DisplayName, 30, UIKit.Text, Anchor.Left, true);
            UIKit.Label(new Rect(b.xMax - 300, y, 300, 40), $"Nivel {pr.Level}", 30, UIKit.Accent, Anchor.Right, true);
            y += 46;
            int need = ProgressionRules.XpForNextLevel(pr.Level);
            UIKit.Bar(new Rect(b.x, y, b.width, 10), pr.Xp / (float)need, UIKit.Accent);
            UIKit.Label(new Rect(b.x, y + 14, b.width, 20), $"{pr.Xp} / {need} XP para el nivel {pr.Level + 1}", 13, UIKit.Muted);
            y += 48;
            float cw = b.width / 4f;
            void Stat(int col, int row, string label, string value)
            {
                Rect r = new Rect(b.x + col * cw, y + row * 74, cw - 12, 64);
                UIKit.RoundRect(r, UIKit.PanelLight);
                UIKit.Label(new Rect(r.x + 14, r.y + 6, r.width - 20, 30), value, 22, UIKit.Text, Anchor.Left, true);
                UIKit.Label(new Rect(r.x + 14, r.y + 36, r.width - 20, 22), label, 13, UIKit.Muted);
            }
            Stat(0, 0, "Reputación", pr.Reputation.ToString());
            Stat(1, 0, "Créditos", UIKit.FormatScore(pr.Credits));
            Stat(2, 0, "Tiempo de juego", $"{(int)(pr.PlayTimeSeconds / 3600)}h {(int)(pr.PlayTimeSeconds / 60) % 60}m");
            Stat(3, 0, "Trucos aterrizados", UIKit.FormatScore(rec.TotalTricks));
            Stat(0, 1, "Mejor combo", UIKit.FormatScore(rec.BestCombo));
            Stat(1, 1, "Mejor sesión", UIKit.FormatScore(rec.BestSession));
            Stat(2, 1, "Grind más largo", rec.LongestGrind.ToString("0.0") + " s");
            Stat(3, 1, "Manual más largo", rec.LongestManual.ToString("0.0") + " s");
            Stat(0, 2, "Mayor tiempo en el aire", rec.MaxAirTime.ToString("0.00") + " s");
            Stat(1, 2, "Altura máxima", rec.MaxHeight.ToString("0.0") + " m");
            Stat(2, 2, "Velocidad punta", (rec.TopSpeed * 3.6f).ToString("0") + " km/h");
            Stat(3, 2, "Caídas", rec.TotalBails.ToString());
            y += 3 * 74 + 10;
            if (!string.IsNullOrEmpty(rec.BestComboSummary)) UIKit.Label(new Rect(b.x, y, b.width, 40), "Mejor línea: " + rec.BestComboSummary, 14, UIKit.Muted, Anchor.Left, false, false, true);
        }

        private void DrawChallenges(Rect b)
        {
            var list = _gm.Challenges.All;
            float rowH = 62f;
            float off = UIKit.BeginScroll(11, b, list.Count * rowH);
            for (int i = 0; i < list.Count; i++)
            {
                var d = list[i];
                Rect r = new Rect(0, off + i * rowH, b.width - 10, rowH - 8);
                bool done = _gm.Challenges.IsCompleted(d.Id);
                UIKit.RoundRect(r, done ? new Color(0.12f, 0.22f, 0.15f, 0.9f) : UIKit.PanelLight);
                UIKit.Label(new Rect(r.x + 16, r.y + 4, r.width * 0.6f, 26), (done ? "✓ " : "") + d.Title, 17, done ? UIKit.Good : UIKit.Text, Anchor.Left, true);
                UIKit.Label(new Rect(r.x + 16, r.y + 28, r.width * 0.6f, 22), d.Description, 13, UIKit.Muted);
                UIKit.Bar(new Rect(r.x + r.width * 0.64f, r.y + 22, r.width * 0.2f, 8), _gm.Challenges.Progress01(d), done ? UIKit.Good : UIKit.Accent);
                UIKit.Label(new Rect(r.xMax - 140, r.y, 126, r.height), $"+{d.RewardXp} XP", 14, UIKit.Accent2, Anchor.Right, true);
            }
            UIKit.EndScroll();
        }

        private static string GestureHint(TrickDefinition t)
        {
            switch (t.Family)
            {
                case TrickFamily.Rotation: return "Aire: stick ← → o dibuja medio círculo";
                case TrickFamily.Flip: return t.Id == TrickIds.Frontflip ? "Aire: stick ↑ mantenido" : (t.Id == TrickIds.Flair ? "Quarter: stick ↓ + 180°" : "Aire: stick ↓ mantenido");
                case TrickFamily.Grind: return "Cae sobre un raíl / ledge";
                case TrickFamily.Pop: return "Mantén y suelta";
                case TrickFamily.Transition: return "Aterriza de espaldas";
            }
            if (t.Trigger.Kind == GestureKind.Swipe) return (t.Family == TrickFamily.Manual ? "Suelo: desliza " : "Aire: desliza ") + PlayerInput.Arrow(t.Trigger.Direction) + (t.Trigger.Mirrored ? " o " + PlayerInput.Arrow(Dir8Util.MirrorX(t.Trigger.Direction)) : "");
            if (t.Trigger.Kind == GestureKind.HoldSwipe) return "Aire: mantén + desliza " + PlayerInput.Arrow(t.Trigger.Direction);
            return "Manual a baja velocidad";
        }

        private void DrawTrickBookScreen()
        {
            UIKit.Dim(0.65f);
            Rect p = new Rect(UIKit.W * 0.5f - 440f, UIKit.H * 0.5f - 320f, 880f, 640f);
            UIKit.PanelBox(p, "Libro de trucos");
            if (UIKit.Button(new Rect(p.xMax - 140, p.y + 16, 116, 44), "VOLVER", ButtonKind.Ghost, true, 16)) { Back(); return; }
            DrawTrickBook(new Rect(p.x + 24, p.y + 76, p.width - 48, p.height - 100));
        }

        private void DrawTrickBook(Rect b)
        {
            var all = _gm.TrickCatalog.All;
            float rowH = 58f;
            float off = UIKit.BeginScroll(12, b, all.Count * rowH);
            for (int i = 0; i < all.Count; i++)
            {
                var t = all[i];
                var m = _gm.Save.GetTrick(t.Id, false);
                int landed = m?.Landed ?? 0;
                bool mastered = landed >= ProgressionRules.MasteryLandings;
                Rect r = new Rect(0, off + i * rowH, b.width - 10, rowH - 6);
                if (r.yMax < 0 || r.y > b.height) continue;
                UIKit.RoundRect(r, UIKit.PanelLight);
                UIKit.Label(new Rect(r.x + 16, r.y + 4, 220, 26), (mastered ? "★ " : "") + t.DisplayName, 17, mastered ? UIKit.Accent2 : (landed > 0 ? UIKit.Text : UIKit.Muted), Anchor.Left, true);
                UIKit.Label(new Rect(r.x + 16, r.y + 28, 220, 20), $"{t.Family} · {t.BaseScore} pts · dif. {t.Difficulty:0.0}", 12, UIKit.Muted);
                UIKit.Label(new Rect(r.x + 240, r.y + 4, r.width - 420, 46), t.Description, 12, UIKit.Muted, Anchor.Left, false, false, true);
                Rect chip = new Rect(r.xMax - 170, r.y + 10, 156, 32);
                UIKit.RoundRect(chip, new Color(1f, 1f, 1f, 0.06f));
                UIKit.Label(chip, GestureHint(t), 11, UIKit.Text, Anchor.Center, true, false, true);
                UIKit.Label(new Rect(r.xMax - 240, r.y + 4, 60, 46), landed.ToString(), 18, landed > 0 ? UIKit.Good : UIKit.Muted, Anchor.Right, true);
            }
            UIKit.EndScroll();
        }

        private void DrawHistory(Rect b)
        {
            var h = _gm.Save.CompetitionHistory;
            float y = b.y;
            float hw = (b.width - 20) * 0.5f;
            UIKit.Label(new Rect(b.x, y, hw, 26), "CLASIFICACIÓN LOCAL · FREESTYLE", 14, UIKit.Muted, Anchor.Left, true);
            UIKit.Label(new Rect(b.x + hw + 20, y, hw, 26), "CLASIFICACIÓN LOCAL · MEJOR LÍNEA", 14, UIKit.Muted, Anchor.Left, true);
            y += 30;
            void Board(float x, string id)
            {
                var list = _gm.Leaderboard(id);
                for (int i = 0; i < Mathf.Min(8, list.Count); i++)
                {
                    Rect r = new Rect(x, y + i * 34, hw, 30);
                    UIKit.RoundRect(r, UIKit.PanelLight);
                    UIKit.Label(new Rect(r.x + 12, r.y, 40, r.height), (i + 1) + ".", 15, i == 0 ? UIKit.Accent2 : UIKit.Text, Anchor.Left, true);
                    UIKit.Label(new Rect(r.x + 50, r.y, 200, r.height), list[i].PlayerName, 14, UIKit.Text);
                    UIKit.Label(new Rect(r.xMax - 140, r.y, 128, r.height), UIKit.FormatScore(list[i].Score), 15, UIKit.Text, Anchor.Right, true);
                }
                if (list.Count == 0) UIKit.Label(new Rect(x, y, hw, 30), "Aún sin sesiones", 14, UIKit.Muted);
            }
            Board(b.x, "freestyle");
            Board(b.x + hw + 20, "bestline");
            y += 8 * 34 + 20;
            UIKit.Label(new Rect(b.x, y, b.width, 26), $"HISTORIAL DE COMPETICIONES ({h.Count})", 14, UIKit.Muted, Anchor.Left, true);
            y += 28;
            for (int i = h.Count - 1, n = 0; i >= 0 && n < 4; i--, n++)
            {
                var c = h[i];
                string date = c.DateIso != null && c.DateIso.Length >= 10 ? c.DateIso.Substring(0, 10) : "";
                string what = c.ModeId == "duel" ? (c.Placement > 0 ? $"Duelo · ganó el jugador {c.Placement}" : "Duelo · empate") : $"{c.ModeId} · {UIKit.FormatScore(c.Score)} pts · puesto {c.Placement}";
                UIKit.Label(new Rect(b.x, y, b.width, 24), $"{date}   {what}", 14, UIKit.Text);
                y += 26;
            }
            UIKit.Label(new Rect(b.x, b.yMax - 24, b.width, 22), "Clasificaciones online: arquitectura preparada, requiere un proveedor de backend.", 12, UIKit.Muted);
        }
    }
}

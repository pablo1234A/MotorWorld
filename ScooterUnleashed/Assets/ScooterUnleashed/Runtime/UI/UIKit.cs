using System.Collections.Generic;
using ScooterUnleashed.Audio;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public enum ButtonKind { Primary, Secondary, Ghost, Danger }
    public enum Anchor { Left, Center, Right }

    /// <summary>
    /// Minimal immediate-mode UI kit on top of IMGUI with a consistent sport visual language:
    /// dark translucent panels, one signal-orange accent, condensed bold type, rounded shapes.
    /// Everything is laid out in a 720-unit-tall virtual canvas scaled to the device and kept inside the safe area.
    /// </summary>
    public static class UIKit
    {
        public const float RefHeight = 720f;
        public static float Scale { get; private set; } = 1f;
        public static float W { get; private set; } = 1280f;
        public static float H { get; private set; } = RefHeight;
        public static Rect Safe { get; private set; }

        public static readonly Color Bg = new Color(0.04f, 0.045f, 0.055f, 0.94f);
        public static readonly Color Panel = new Color(0.07f, 0.075f, 0.09f, 0.86f);
        public static readonly Color PanelLight = new Color(0.14f, 0.15f, 0.17f, 0.9f);
        public static readonly Color Line = new Color(1f, 1f, 1f, 0.08f);
        public static readonly Color Accent = new Color(1f, 0.36f, 0.12f, 1f);
        public static readonly Color Accent2 = new Color(1f, 0.82f, 0.25f, 1f);
        public static readonly Color Text = new Color(0.96f, 0.96f, 0.95f, 1f);
        public static readonly Color Muted = new Color(0.62f, 0.64f, 0.68f, 1f);
        public static readonly Color Good = new Color(0.36f, 0.89f, 0.54f, 1f);
        public static readonly Color Bad = new Color(1f, 0.3f, 0.37f, 1f);

        public static Texture2D White { get; private set; }
        public static Texture2D Round { get; private set; }
        public static Texture2D Circle { get; private set; }
        public static Texture2D Ring { get; private set; }
        public static Texture2D FadeDown { get; private set; }

        private static Font _font;
        private static GUIStyle _round;
        private static readonly Dictionary<int, GUIStyle> _labels = new Dictionary<int, GUIStyle>();
        private static GUIStyle _invisible;
        private static bool _init;

        public static float Alpha = 1f;

        public static void Init()
        {
            if (_init) return;
            _init = true;
            White = Texture2D.whiteTexture;
            Round = MakeRound(64, 14);
            Circle = MakeCircle(128, false);
            Ring = MakeCircle(128, true);
            FadeDown = MakeFade(64);
            _font = Font.CreateDynamicFontFromOSFont(new[] { "Roboto Condensed", "Barlow Condensed", "Arial Narrow", "Helvetica Neue", "Roboto", "Arial" }, 24);
            _round = new GUIStyle { normal = { background = Round }, border = new RectOffset(14, 14, 14, 14) };
            _invisible = new GUIStyle();
        }

        private static Texture2D MakeRound(int size, int radius)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, radius, size - radius), cy = Mathf.Clamp(y + 0.5f, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                    float a = Mathf.Clamp01(radius - d + 0.5f);
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            t.SetPixels32(px);
            t.Apply();
            return t;
        }

        private static Texture2D MakeCircle(int size, bool ring)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear };
            var px = new Color32[size * size];
            float r = size * 0.5f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(r, r));
                    float a = Mathf.Clamp01(r - d);
                    if (ring) a *= Mathf.Clamp01(d - (r - size * 0.07f));
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            t.SetPixels32(px);
            t.Apply();
            return t;
        }

        private static Texture2D MakeFade(int size)
        {
            var t = new Texture2D(1, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++) t.SetPixel(0, y, new Color(0, 0, 0, Mathf.Pow(1f - y / (float)(size - 1), 1.6f)));
            t.Apply();
            return t;
        }

        /// <summary>Call at the top of every OnGUI.</summary>
        public static void BeginFrame()
        {
            Init();
            Scale = Mathf.Max(0.5f, Screen.height / RefHeight);
            W = Screen.width / Scale;
            H = Screen.height / Scale;
            GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(Scale, Scale, 1f));
            var sa = Screen.safeArea;
            Safe = new Rect(sa.x / Scale, (Screen.height - sa.yMax) / Scale, sa.width / Scale, sa.height / Scale);
            Alpha = 1f;
        }

        /// <summary>Screen pixel (y up) → GUI units (y down).</summary>
        public static Vector2 ScreenToGui(Vector2 p) => new Vector2(p.x / Scale, (Screen.height - p.y) / Scale);

        // ---- Drawing primitives -------------------------------------------------------------------
        private static Color A(Color c) { c.a *= Alpha; return c; }

        public static void Rect(Rect r, Color c)
        {
            var prev = GUI.color; GUI.color = A(c);
            GUI.DrawTexture(r, White);
            GUI.color = prev;
        }

        public static void RoundRect(Rect r, Color c)
        {
            if (Event.current.type != EventType.Repaint) return;
            var prev = GUI.color; GUI.color = A(c);
            _round.Draw(r, false, false, false, false);
            GUI.color = prev;
        }

        public static void Disc(Vector2 center, float radius, Color c, bool ring = false)
        {
            var prev = GUI.color; GUI.color = A(c);
            GUI.DrawTexture(new Rect(center.x - radius, center.y - radius, radius * 2f, radius * 2f), ring ? Ring : Circle);
            GUI.color = prev;
        }

        public static void Texture(Rect r, Texture t, Color c)
        {
            var prev = GUI.color; GUI.color = A(c);
            GUI.DrawTexture(r, t, ScaleMode.ScaleAndCrop);
            GUI.color = prev;
        }

        public static GUIStyle Style(int size, bool bold, Anchor anchor, bool wrap = false)
        {
            int key = size * 16 + (bold ? 1 : 0) * 8 + (int)anchor * 2 + (wrap ? 1 : 0);
            if (_labels.TryGetValue(key, out var s)) return s;
            s = new GUIStyle
            {
                font = _font,
                fontSize = size,
                fontStyle = bold ? FontStyle.Bold : FontStyle.Normal,
                wordWrap = wrap,
                clipping = TextClipping.Clip,
                richText = true,
                alignment = anchor == Anchor.Left ? TextAnchor.MiddleLeft : anchor == Anchor.Center ? TextAnchor.MiddleCenter : TextAnchor.MiddleRight,
            };
            s.normal.textColor = Color.white;
            _labels[key] = s;
            return s;
        }

        public static void Label(Rect r, string text, int size, Color c, Anchor anchor = Anchor.Left, bool bold = false, bool shadow = false, bool wrap = false)
        {
            var st = Style(size, bold, anchor, wrap);
            var prev = GUI.color;
            if (shadow)
            {
                GUI.color = A(new Color(0, 0, 0, 0.55f * c.a));
                GUI.Label(new Rect(r.x + 1.5f, r.y + 2f, r.width, r.height), text, st);
            }
            GUI.color = A(c);
            GUI.Label(r, text, st);
            GUI.color = prev;
        }

        public static float TextWidth(string text, int size, bool bold)
        {
            return Style(size, bold, Anchor.Left).CalcSize(new GUIContent(text)).x;
        }

        // ---- Widgets ------------------------------------------------------------------------------
        public static bool Button(Rect r, string label, ButtonKind kind = ButtonKind.Secondary, bool enabled = true, int fontSize = 20, string sub = null)
        {
            Vector2 m = Event.current.mousePosition;
            bool hover = enabled && r.Contains(m);
            bool pressed = hover && Input.GetMouseButton(0);
            Rect dr = pressed ? Shrink(r, 2f) : r;
            Color fill, text;
            switch (kind)
            {
                case ButtonKind.Primary: fill = enabled ? Accent : new Color(0.35f, 0.25f, 0.2f, 0.8f); text = enabled ? new Color(0.05f, 0.04f, 0.03f) : Muted; break;
                case ButtonKind.Danger: fill = new Color(0.5f, 0.1f, 0.12f, 0.9f); text = Text; break;
                case ButtonKind.Ghost: fill = new Color(1f, 1f, 1f, hover ? 0.1f : 0.04f); text = enabled ? Text : Muted; break;
                default: fill = hover ? new Color(0.2f, 0.21f, 0.24f, 0.95f) : PanelLight; text = enabled ? Text : Muted; break;
            }
            RoundRect(dr, fill);
            if (kind == ButtonKind.Secondary && hover) RoundRect(new Rect(dr.x, dr.y, 4f, dr.height), Accent);
            if (sub == null) Label(dr, label, fontSize, text, Anchor.Center, true);
            else
            {
                Label(new Rect(dr.x + 18f, dr.y + 4f, dr.width - 36f, dr.height * 0.58f), label, fontSize, text, Anchor.Left, true);
                Label(new Rect(dr.x + 18f, dr.y + dr.height * 0.5f, dr.width - 36f, dr.height * 0.42f), sub, Mathf.RoundToInt(fontSize * 0.68f), kind == ButtonKind.Primary ? new Color(0.1f, 0.06f, 0.04f, 0.8f) : Muted, Anchor.Left);
            }
            if (!enabled) return false;
            bool clicked = GUI.Button(r, GUIContent.none, _invisible);
            if (clicked) AudioManager.PlayUi(kind == ButtonKind.Primary ? AudioManager.Ui.Confirm : AudioManager.Ui.Click);
            return clicked;
        }

        public static Rect Shrink(Rect r, float d) => new Rect(r.x + d, r.y + d, r.width - 2f * d, r.height - 2f * d);

        public static bool Toggle(Rect r, string label, bool value, string hint = null)
        {
            Label(new Rect(r.x, r.y, r.width - 80f, hint == null ? r.height : r.height * 0.6f), label, 18, Text);
            if (hint != null) Label(new Rect(r.x, r.y + r.height * 0.52f, r.width - 80f, r.height * 0.45f), hint, 13, Muted);
            Rect sw = new Rect(r.xMax - 64f, r.y + r.height * 0.5f - 15f, 58f, 30f);
            RoundRect(sw, value ? Accent : new Color(0.25f, 0.26f, 0.29f));
            Disc(new Vector2(value ? sw.xMax - 15f : sw.x + 15f, sw.center.y), 11.5f, Color.white);
            if (GUI.Button(r, GUIContent.none, _invisible)) { AudioManager.PlayUi(AudioManager.Ui.Click); return !value; }
            return value;
        }

        private static int _dragSlider = -1;

        public static float Slider(Rect r, string label, float value, float min, float max, string format = "0.00", int id = 0)
        {
            Label(new Rect(r.x, r.y, r.width * 0.45f, r.height), label, 18, Text);
            Rect track = new Rect(r.x + r.width * 0.47f, r.center.y - 3f, r.width * 0.4f, 6f);
            float t = Mathf.InverseLerp(min, max, value);
            RoundRect(new Rect(track.x - 2f, track.y - 2f, track.width + 4f, track.height + 4f), new Color(0.22f, 0.23f, 0.26f));
            Rect(new Rect(track.x, track.y, track.width * t, track.height), Accent);
            Disc(new Vector2(track.x + track.width * t, track.center.y), 12f, Color.white);
            Label(new Rect(r.xMax - r.width * 0.12f, r.y, r.width * 0.12f, r.height), value.ToString(format), 16, Muted, Anchor.Right);

            var e = Event.current;
            Rect hit = new Rect(track.x - 16f, r.y, track.width + 32f, r.height);
            int key = id != 0 ? id : (int)(r.y * 7919 + r.x);
            if (e.type == EventType.MouseDown && hit.Contains(e.mousePosition)) { _dragSlider = key; e.Use(); }
            if (e.type == EventType.MouseUp && _dragSlider == key) { _dragSlider = -1; e.Use(); AudioManager.PlayUi(AudioManager.Ui.Click); }
            if (_dragSlider == key && (e.type == EventType.MouseDrag || e.type == EventType.MouseDown || e.type == EventType.Repaint) && Input.GetMouseButton(0))
            {
                float nt = Mathf.Clamp01((e.mousePosition.x - track.x) / track.width);
                value = Mathf.Lerp(min, max, nt);
            }
            return value;
        }

        public static int Segmented(Rect r, string[] options, int index)
        {
            RoundRect(r, new Color(0.12f, 0.13f, 0.15f, 0.95f));
            float w = r.width / options.Length;
            for (int i = 0; i < options.Length; i++)
            {
                Rect c = new Rect(r.x + w * i + 3f, r.y + 3f, w - 6f, r.height - 6f);
                if (i == index) RoundRect(c, Accent);
                Label(c, options[i], 16, i == index ? new Color(0.05f, 0.04f, 0.03f) : Text, Anchor.Center, true);
                if (GUI.Button(c, GUIContent.none, _invisible) && i != index) { AudioManager.PlayUi(AudioManager.Ui.Click); index = i; }
            }
            return index;
        }

        public static void Bar(Rect r, float t, Color c, Color? bg = null)
        {
            RoundRect(r, bg ?? new Color(1f, 1f, 1f, 0.1f));
            if (t > 0.001f) RoundRect(new Rect(r.x, r.y, Mathf.Max(r.height, r.width * Mathf.Clamp01(t)), r.height), c);
        }

        public static void PanelBox(Rect r, string title = null)
        {
            RoundRect(r, Panel);
            if (title != null)
            {
                Label(new Rect(r.x + 24f, r.y + 14f, r.width - 48f, 34f), title.ToUpperInvariant(), 24, Text, Anchor.Left, true);
                Rect(new Rect(r.x + 24f, r.y + 52f, 36f, 3f), Accent);
            }
        }

        /// <summary>Full-screen dimmer behind modal screens.</summary>
        public static void Dim(float a = 0.6f) => Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, a));

        // ---- Touch scrolling --------------------------------------------------------------------------
        private static readonly Dictionary<int, float> _scroll = new Dictionary<int, float>();
        private static int _dragScroll = -1;
        private static float _dragStartY, _dragStartScroll;

        /// <summary>Begins a vertically scrollable area. Returns the content offset to apply (negative y).</summary>
        public static float BeginScroll(int id, Rect view, float contentHeight)
        {
            _scroll.TryGetValue(id, out float s);
            float max = Mathf.Max(0f, contentHeight - view.height);
            var e = Event.current;
            if (e.type == EventType.ScrollWheel && view.Contains(e.mousePosition)) { s += e.delta.y * 20f; e.Use(); }
            if (e.type == EventType.MouseDown && view.Contains(e.mousePosition)) { _dragScroll = id; _dragStartY = e.mousePosition.y; _dragStartScroll = s; }
            if (_dragScroll == id && e.type == EventType.MouseDrag) s = _dragStartScroll - (e.mousePosition.y - _dragStartY);
            if (e.type == EventType.MouseUp && _dragScroll == id) _dragScroll = -1;
            s = Mathf.Clamp(s, 0f, max);
            _scroll[id] = s;
            GUI.BeginGroup(view);
            if (max > 0f)
            {
                float bh = view.height * view.height / contentHeight;
                Rect(new Rect(view.width - 4f, (view.height - bh) * (s / max), 3f, bh), new Color(1f, 1f, 1f, 0.25f));
            }
            return -s;
        }

        public static void EndScroll() => GUI.EndGroup();

        /// <summary>True while a touch-scroll drag moved enough to suppress button clicks.</summary>
        public static bool IsDragging(int id) => _dragScroll == id && Mathf.Abs(Event.current.mousePosition.y - _dragStartY) > 8f;

        /// <summary>Thousands separated with dots (Spanish style) without depending on device culture data.</summary>
        public static string FormatScore(int v)
        {
            bool neg = v < 0;
            string digits = System.Math.Abs((long)v).ToString(System.Globalization.CultureInfo.InvariantCulture);
            var sb = new System.Text.StringBuilder(digits.Length + 6);
            for (int i = 0; i < digits.Length; i++)
            {
                if (i > 0 && (digits.Length - i) % 3 == 0) sb.Append('.');
                sb.Append(digits[i]);
            }
            return neg ? "-" + sb : sb.ToString();
        }
    }
}

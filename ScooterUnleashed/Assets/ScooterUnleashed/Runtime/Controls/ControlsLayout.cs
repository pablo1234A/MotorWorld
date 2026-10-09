using ScooterUnleashed.Core.Save;
using ScooterUnleashed.UI;
using UnityEngine;

namespace ScooterUnleashed.Controls
{
    public enum TouchButton
    {
        None, Pause, Map, Grind, Brake, Enter,
        // Button scheme
        Jump, TrickUp, TrickDown, TrickLeft, TrickRight, TrickDiag, Body, SpinLeft, SpinRight,
    }

    /// <summary>
    /// Single source of truth for the touch layout (GUI units, y down) shared by input hit-testing and HUD drawing.
    /// Honours safe area, left-handed mirroring, size, and per-player offsets.
    /// </summary>
    public static class ControlsLayout
    {
        public static Rect StickZone;
        public static Rect ActionZone;
        public static Vector2 StickHome;
        public static float StickRadius = 78f;
        public static Rect Pause, Map, Grind, Brake, Enter;
        public static Rect Jump, TrickUp, TrickDown, TrickLeft, TrickRight, TrickDiag, Body, SpinLeft, SpinRight;
        public static bool ButtonScheme;
        public static bool LeftHanded;

        public static void Compute(SettingsData s, bool showEnter)
        {
            var safe = UIKit.Safe;
            float W = UIKit.W, H = UIKit.H;
            LeftHanded = s != null && s.LeftHanded;
            ButtonScheme = s != null && s.ControlScheme == 1;
            float size = s != null ? Mathf.Clamp(s.StickSize, 0.6f, 1.6f) : 1f;
            float bscale = s != null ? Mathf.Clamp(s.ButtonScale, 0.7f, 1.5f) : 1f;
            StickRadius = 78f * size;

            float split = W * 0.42f;
            StickZone = new Rect(0f, H * 0.28f, split, H * 0.72f);
            ActionZone = new Rect(split, H * 0.22f, W - split, H * 0.78f);

            Vector2 stickOff = s != null ? new Vector2(s.StickOffsetX, -s.StickOffsetY) * 200f : Vector2.zero;
            Vector2 actOff = s != null ? new Vector2(s.ActionOffsetX, -s.ActionOffsetY) * 200f : Vector2.zero;
            StickHome = new Vector2(safe.xMin + 70f + StickRadius, safe.yMax - 60f - StickRadius) + stickOff;

            float b = 62f * bscale;
            Pause = new Rect(safe.xMax - 16f - b, safe.yMin + 14f, b, b);
            Map = new Rect(Pause.x - 10f - b, Pause.y, b, b);
            Grind = new Rect(safe.xMax - 40f - 150f * bscale + actOff.x, safe.yMax - 290f * bscale + actOff.y, 150f * bscale, 74f * bscale);
            Brake = new Rect(split - 120f * bscale, safe.yMax - 100f * bscale, 104f * bscale, 66f * bscale);
            Enter = showEnter ? new Rect(W * 0.5f - 130f, safe.yMax - 210f, 260f, 64f) : default;

            // Button scheme cluster (bottom-right)
            float r = 70f * bscale;
            Vector2 c = new Vector2(safe.xMax - 60f - r * 2.2f, safe.yMax - 40f - r * 2.2f) + actOff;
            Jump = new Rect(c.x + r * 0.9f, c.y + r * 0.9f, r * 1.5f, r * 1.5f);
            TrickUp = Sq(c + new Vector2(0f, -r * 1.05f), r * 0.75f);
            TrickDown = Sq(c + new Vector2(0f, r * 1.05f), r * 0.75f);
            TrickLeft = Sq(c + new Vector2(-r * 1.05f, 0f), r * 0.75f);
            TrickRight = Sq(c + new Vector2(r * 1.05f, 0f), r * 0.75f);
            TrickDiag = Sq(c + new Vector2(-r * 1.05f, r * 1.05f), r * 0.75f);
            Body = Sq(c, r * 0.75f);
            SpinLeft = Sq(c + new Vector2(-r * 2.2f, -r * 0.2f), r * 0.65f);
            SpinRight = Sq(c + new Vector2(-r * 2.2f, r * 0.85f), r * 0.65f);

            if (LeftHanded)
            {
                StickZone = new Rect(W - split, H * 0.28f, split, H * 0.72f);
                ActionZone = new Rect(0f, H * 0.22f, W - split, H * 0.78f);
                StickHome = new Vector2(W - StickHome.x, StickHome.y);
                Grind = Mirror(Grind); Brake = Mirror(Brake);
                Jump = Mirror(Jump); TrickUp = Mirror(TrickUp); TrickDown = Mirror(TrickDown); TrickLeft = Mirror(TrickLeft);
                TrickRight = Mirror(TrickRight); TrickDiag = Mirror(TrickDiag); Body = Mirror(Body); SpinLeft = Mirror(SpinLeft); SpinRight = Mirror(SpinRight);
            }
        }

        private static Rect Sq(Vector2 c, float half) => new Rect(c.x - half, c.y - half, half * 2f, half * 2f);
        private static Rect Mirror(Rect r) => new Rect(UIKit.W - r.xMax, r.y, r.width, r.height);
    }
}

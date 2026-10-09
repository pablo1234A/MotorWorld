using ScooterUnleashed.Controls;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public sealed partial class UIRoot
    {
        private int _settingsTab;
        private static readonly string[] SettingsTabs = { "CONTROLES", "CÁMARA", "GRÁFICOS", "AUDIO", "ACCESIBILIDAD" };

        private void DrawSettings()
        {
            UIKit.Dim(0.6f);
            var s = _gm.Save.Settings;
            string before = JsonUtility.ToJson(s);
            Rect p = new Rect(UIKit.W * 0.5f - 420f, UIKit.H * 0.5f - 320f, 840f, 640f);
            UIKit.PanelBox(p, "Ajustes");
            if (UIKit.Button(new Rect(p.xMax - 140, p.y + 16, 116, 44), "VOLVER", ButtonKind.Ghost, true, 16)) { Back(); return; }
            _settingsTab = UIKit.Segmented(new Rect(p.x + 24, p.y + 72, p.width - 48, 44), SettingsTabs, _settingsTab);
            float x = p.x + 40, w = p.width - 80, y = p.y + 136, rh = 52f;

            switch (_settingsTab)
            {
                case 0:
                    UIKit.Label(new Rect(x, y, 240, 40), "Esquema de control", 18, UIKit.Text);
                    s.ControlScheme = UIKit.Segmented(new Rect(x + w * 0.47f, y + 4, w * 0.53f, 38), new[] { "GESTOS", "BOTONES" }, s.ControlScheme);
                    y += rh;
                    s.TouchSensitivity = UIKit.Slider(new Rect(x, y, w, 40), "Sensibilidad de gestos", s.TouchSensitivity, 0.6f, 1.8f, "0.00", 101); y += rh;
                    s.StickSize = UIKit.Slider(new Rect(x, y, w, 40), "Tamaño del stick", s.StickSize, 0.7f, 1.5f, "0.00", 102); y += rh;
                    s.ButtonScale = UIKit.Slider(new Rect(x, y, w, 40), "Tamaño de botones", s.ButtonScale, 0.8f, 1.4f, "0.00", 103); y += rh;
                    s.ControlsOpacity = UIKit.Slider(new Rect(x, y, w, 40), "Opacidad de controles", s.ControlsOpacity, 0.2f, 1f, "0.00", 104); y += rh;
                    s.LeftHanded = UIKit.Toggle(new Rect(x, y, w, 46), "Modo zurdo", s.LeftHanded, "Intercambia stick y zona de trucos"); y += rh;
                    s.Haptics = UIKit.Toggle(new Rect(x, y, w, 46), "Vibración", s.Haptics, "Pulsos cortos al aterrizar, gestos y caídas"); y += rh;
                    UIKit.Label(new Rect(x, y, w, 26), "Disposición personalizada (la vista previa se dibuja en pantalla)", 14, UIKit.Muted); y += 30;
                    float hw = (w - 20) * 0.5f;
                    s.StickOffsetX = UIKit.Slider(new Rect(x, y, hw, 36), "Stick X", s.StickOffsetX, -0.6f, 0.8f, "0.0", 105);
                    s.ActionOffsetX = UIKit.Slider(new Rect(x + hw + 20, y, hw, 36), "Botones X", s.ActionOffsetX, -0.8f, 0.6f, "0.0", 106); y += 42;
                    s.StickOffsetY = UIKit.Slider(new Rect(x, y, hw, 36), "Stick Y", s.StickOffsetY, -0.3f, 1.2f, "0.0", 107);
                    s.ActionOffsetY = UIKit.Slider(new Rect(x + hw + 20, y, hw, 36), "Botones Y", s.ActionOffsetY, -0.3f, 1.2f, "0.0", 108);
                    ControlsLayout.Compute(s, false);
                    UIKit.Disc(ControlsLayout.StickHome, ControlsLayout.StickRadius, new Color(1, 0.36f, 0.12f, 0.25f));
                    UIKit.RoundRect(ControlsLayout.Grind, new Color(1, 0.36f, 0.12f, 0.25f));
                    break;
                case 1:
                    s.CameraDistance = UIKit.Slider(new Rect(x, y, w, 40), "Distancia de cámara", s.CameraDistance, 0.75f, 1.5f, "0.00", 201); y += rh;
                    s.CameraFovBoost = UIKit.Slider(new Rect(x, y, w, 40), "Efecto de velocidad (FOV)", s.CameraFovBoost, 0f, 1.5f, "0.00", 202); y += rh;
                    s.CameraShake = UIKit.Toggle(new Rect(x, y, w, 46), "Vibración de cámara al aterrizar", s.CameraShake, "Desactívala si te mareas"); y += rh;
                    break;
                case 2:
                    UIKit.Label(new Rect(x, y, 240, 40), "Calidad gráfica", 18, UIKit.Text);
                    int q = UIKit.Segmented(new Rect(x + w * 0.4f, y + 4, w * 0.6f, 38), new[] { "AUTO", "BAJA", "MEDIA", "ALTA" }, s.QualityLevel + 1);
                    s.QualityLevel = q - 1; y += rh;
                    UIKit.Label(new Rect(x, y, 240, 40), "Objetivo de FPS", 18, UIKit.Text);
                    int f = UIKit.Segmented(new Rect(x + w * 0.4f, y + 4, w * 0.6f, 38), new[] { "30", "60" }, s.TargetFps >= 60 ? 1 : 0);
                    s.TargetFps = f == 1 ? 60 : 30; y += rh;
                    s.DynamicResolution = UIKit.Toggle(new Rect(x, y, w, 46), "Resolución dinámica", s.DynamicResolution, "Baja la resolución interna si los FPS caen"); y += rh;
                    s.DayNightCycle = UIKit.Toggle(new Rect(x, y, w, 46), "Ciclo de día y noche", s.DayNightCycle, "Un día completo cada 24 minutos"); y += rh;
                    if (!s.DayNightCycle) { s.TimeOfDay = UIKit.Slider(new Rect(x, y, w, 40), "Hora del día", s.TimeOfDay, 6f, 22f, "0.0", 203); y += rh; }
                    UIKit.Label(new Rect(x, y + 6, w, 24), $"Perfil activo: {Rendering.QualityManager.Current} · escala de render {Rendering.QualityManager.RenderScale:0.00} · {_gm.DynRes.Fps:0} FPS medidos", 14, UIKit.Muted);
                    break;
                case 3:
                    s.MusicVolume = UIKit.Slider(new Rect(x, y, w, 40), "Música", s.MusicVolume, 0f, 1f, "0%", 301); y += rh;
                    s.SfxVolume = UIKit.Slider(new Rect(x, y, w, 40), "Efectos", s.SfxVolume, 0f, 1f, "0%", 302); y += rh;
                    UIKit.Label(new Rect(x, y, w, 40), "La música es un loop generado de forma provisional; se podrá sustituir por pistas licenciadas.", 14, UIKit.Muted, Anchor.Left, false, false, true);
                    break;
                case 4:
                    s.BeginnerAssist = UIKit.Toggle(new Rect(x, y, w, 46), "Asistencia para principiantes", s.BeginnerAssist, "Aterrizajes más permisivos y equilibrio más tranquilo"); y += rh;
                    s.AutoPush = UIKit.Toggle(new Rect(x, y, w, 46), "Impulso automático", s.AutoPush, "Mantiene velocidad de crucero sin empujar"); y += rh;
                    s.AutoGrind = UIKit.Toggle(new Rect(x, y, w, 46), "Grind automático", s.AutoGrind, "Engancha raíles al caer sobre ellos (si no, botón GRIND)"); y += rh;
                    s.ShowMinimap = UIKit.Toggle(new Rect(x, y, w, 46), "Minimapa", s.ShowMinimap); y += rh;
                    s.ShowDebug = UIKit.Toggle(new Rect(x, y, w, 46), "Panel de depuración", s.ShowDebug, "Velocidad, estado físico, contacto de ruedas, truco, combo, FPS"); y += rh;
                    if (UIKit.Button(new Rect(x, y + 10, 300, 48), "REINICIAR PROGRESO", ButtonKind.Danger, true, 16))
                        Confirm("¿Reiniciar progreso?", "Se borrarán nivel, piezas, récords y desafíos. Los ajustes se conservan.", "BORRAR", () => _gm.ResetProgress());
                    break;
            }
            if (JsonUtility.ToJson(s) != before) _gm.ApplySettings();
        }
    }
}

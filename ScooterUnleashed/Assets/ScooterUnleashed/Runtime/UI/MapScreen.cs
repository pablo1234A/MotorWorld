using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.UI
{
    public sealed partial class UIRoot
    {
        private float _mapZoom = 1f;
        private Vector2 _mapPan;
        private PointOfInterest _mapSel;
        private bool _mapDragging;
        private Vector2 _mapDragStart, _mapPanStart;

        private void DrawMap()
        {
            UIKit.Rect(new Rect(0, 0, UIKit.W, UIKit.H), new Color(0.03f, 0.035f, 0.045f, 0.97f));
            var safe = UIKit.Safe;
            Rect view = new Rect(safe.xMin + 20, safe.yMin + 70, safe.width - 340, safe.height - 90);
            UIKit.Label(new Rect(safe.xMin + 24, safe.yMin + 14, 500, 44), "MAPA · PUERTO RUEDA", 28, UIKit.Text, Anchor.Left, true);
            if (UIKit.Button(new Rect(safe.xMax - 140, safe.yMin + 14, 116, 44), "CERRAR", ButtonKind.Ghost, true, 16)) { _mapSel = null; Back(); return; }

            var wr = WorldAtlas.WorldRect;
            float baseK = Mathf.Min(view.width / wr.width, view.height / wr.height);
            float k = baseK * _mapZoom;
            Vector2 center = view.center + _mapPan;
            Vector2 Map(float x, float z) => center + new Vector2((x - wr.center.x) * k, -(z - wr.center.y) * k);

            // Input: drag to pan, wheel to zoom
            var e = Event.current;
            if (e.type == EventType.ScrollWheel && view.Contains(e.mousePosition)) { Zoom(-e.delta.y * 0.08f); e.Use(); }
            if (e.type == EventType.MouseDown && view.Contains(e.mousePosition)) { _mapDragging = true; _mapDragStart = e.mousePosition; _mapPanStart = _mapPan; }
            if (e.type == EventType.MouseDrag && _mapDragging) _mapPan = _mapPanStart + (e.mousePosition - _mapDragStart);
            bool click = false;
            Vector2 clickPos = e.mousePosition;
            if (e.type == EventType.MouseUp && _mapDragging) { _mapDragging = false; click = (e.mousePosition - _mapDragStart).magnitude < 8f; }

            GUI.BeginGroup(view);
            Vector2 off = -view.position;
            UIKit.Rect(new Rect(0, 0, view.width, view.height), new Color(0.08f, 0.12f, 0.16f, 1f));
            // Sea
            var seaA = Map(-330f, 330f) + off; var seaB = Map(WorldBuilder.SeaEdgeX, -330f) + off;
            UIKit.Rect(new Rect(seaA.x, seaA.y, seaB.x - seaA.x, seaB.y - seaA.y), new Color(0.1f, 0.25f, 0.36f, 1f));
            var landA = Map(WorldBuilder.SeaEdgeX, 310f) + off; var landB = Map(310f, -310f) + off;
            UIKit.Rect(new Rect(landA.x, landA.y, landB.x - landA.x, landB.y - landA.y), new Color(0.2f, 0.21f, 0.23f, 1f));
            foreach (var z in WorldAtlas.Zones)
            {
                var a = Map(z.Area.xMin, z.Area.yMax) + off;
                UIKit.Rect(new Rect(a.x, a.y, z.Area.width * k, z.Area.height * k), new Color(z.MapColor.r, z.MapColor.g, z.MapColor.b, 0.35f));
            }
            foreach (var sh in WorldAtlas.MapShapes)
            {
                var a = Map(sh.rect.xMin, sh.rect.yMax) + off;
                UIKit.Rect(new Rect(a.x, a.y, Mathf.Max(1f, sh.rect.width * k), Mathf.Max(1f, sh.rect.height * k)), new Color(sh.color.r, sh.color.g, sh.color.b, 0.85f));
            }
            foreach (var z in WorldAtlas.Zones)
            {
                var c = Map(z.Area.center.x, z.Area.center.y) + off;
                UIKit.Label(new Rect(c.x - 120, c.y - 12, 240, 24), z.Name.ToUpperInvariant(), Mathf.RoundToInt(Mathf.Clamp(11 * _mapZoom, 11, 20)), new Color(1, 1, 1, 0.75f), Anchor.Center, true, true);
            }
            int hidden = 0;
            PointOfInterest hit = null;
            foreach (var p in WorldAtlas.Pois)
            {
                bool secret = p.HiddenUntilDiscovered && !_gm.Save.DiscoveredSpots.Contains(p.Id);
                if (secret) { hidden++; continue; }
                var m = Map(p.Position.x, p.Position.z) + off;
                bool sel = _mapSel == p;
                UIKit.Disc(m, sel ? 11f : 8f, PoiColor(p.Type));
                if (_gm.CanFastTravel(p)) UIKit.Disc(m, sel ? 15f : 12f, new Color(1, 1, 1, 0.7f), true);
                if (click && Vector2.Distance(clickPos - view.position, m) < 18f) hit = p;
            }
            var pl = _gm.Scooter.transform.position;
            var pm = Map(pl.x, pl.z) + off;
            float yaw = _gm.Scooter.transform.eulerAngles.y * Mathf.Deg2Rad;
            Vector2 hd = new Vector2(Mathf.Sin(yaw), -Mathf.Cos(yaw));
            UIKit.Disc(pm, 9f, UIKit.Accent);
            UIKit.Disc(pm + hd * 13f, 4f, Color.white);
            GUI.EndGroup();
            if (click) _mapSel = hit;

            // Zoom buttons
            if (UIKit.Button(new Rect(view.xMax - 64, view.y + 12, 52, 52), "+", ButtonKind.Secondary, true, 26)) Zoom(0.35f);
            if (UIKit.Button(new Rect(view.xMax - 64, view.y + 72, 52, 52), "−", ButtonKind.Secondary, true, 26)) Zoom(-0.35f);
            if (UIKit.Button(new Rect(view.xMax - 64, view.y + 132, 52, 52), "YO", ButtonKind.Secondary, true, 16))
            {
                _mapZoom = 2.5f;
                _mapPan = -new Vector2((pl.x - wr.center.x) * baseK * _mapZoom, -(pl.z - wr.center.y) * baseK * _mapZoom);
            }

            // Side panel: legend + selection
            Rect side = new Rect(view.xMax + 20, view.y, safe.xMax - view.xMax - 40, view.height);
            UIKit.RoundRect(side, UIKit.Panel);
            float y = side.y + 16;
            void Legend(PoiType t, string label)
            {
                UIKit.Disc(new Vector2(side.x + 26, y + 11), 7f, PoiColor(t));
                UIKit.Label(new Rect(side.x + 42, y, side.width - 50, 22), label, 14, UIKit.Text);
                y += 26;
            }
            Legend(PoiType.Spawn, "Punto de aparición");
            Legend(PoiType.Skatepark, "Skatepark");
            Legend(PoiType.Spot, "Spot");
            Legend(PoiType.Workshop, "Taller");
            Legend(PoiType.Shop, "Tienda");
            Legend(PoiType.Event, "Eventos");
            Legend(PoiType.Challenge, "Desafío");
            Legend(PoiType.Rest, "Zona de descanso");
            Legend(PoiType.Secret, "Secreto");
            UIKit.Label(new Rect(side.x + 18, y, side.width - 30, 22), "○ = viaje rápido disponible", 13, UIKit.Muted);
            y += 24;
            UIKit.Label(new Rect(side.x + 18, y, side.width - 30, 22), hidden > 0 ? $"{hidden} spots secretos sin descubrir" : "¡Todos los secretos descubiertos!", 13, UIKit.Accent2);
            y += 36;
            if (_mapSel != null)
            {
                UIKit.Rect(new Rect(side.x + 18, y, side.width - 36, 1), UIKit.Line);
                y += 10;
                UIKit.Label(new Rect(side.x + 18, y, side.width - 36, 28), _mapSel.Name, 19, UIKit.Text, Anchor.Left, true);
                y += 30;
                UIKit.Label(new Rect(side.x + 18, y, side.width - 36, 22), WorldAtlas.Zones.Find(z => z.Id == _mapSel.ZoneId)?.Name ?? "", 13, UIKit.Muted);
                y += 30;
                if (_gm.CanFastTravel(_mapSel))
                {
                    if (UIKit.Button(new Rect(side.x + 18, y, side.width - 36, 50), "VIAJAR", ButtonKind.Primary)) { string id = _mapSel.Id; _mapSel = null; CloseAll(); _gm.FastTravel(id); }
                }
                else UIKit.Label(new Rect(side.x + 18, y, side.width - 36, 44), _mapSel.FastTravel ? "Visita este lugar para desbloquear el viaje rápido." : "Este punto no permite viaje rápido.", 13, UIKit.Muted, Anchor.Left, false, false, true);
            }
            else UIKit.Label(new Rect(side.x + 18, y, side.width - 36, 44), "Toca un punto del mapa para ver detalles. Arrastra para mover y usa + / − para hacer zoom.", 13, UIKit.Muted, Anchor.Left, false, false, true);
        }

        private void Zoom(float d) => _mapZoom = Mathf.Clamp(_mapZoom * (1f + d), 0.8f, 6f);
    }
}

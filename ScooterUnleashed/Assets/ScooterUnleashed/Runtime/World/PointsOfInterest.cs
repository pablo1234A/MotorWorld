using System.Collections.Generic;
using UnityEngine;

namespace ScooterUnleashed.World
{
    public enum PoiType
    {
        Spawn,
        Skatepark,
        Spot,
        Shop,
        Workshop,
        Challenge,
        Event,
        Secret,
        Rest,
    }

    [System.Serializable]
    public class PointOfInterest
    {
        public string Id;
        public string Name;
        public PoiType Type;
        public Vector3 Position;
        public float Yaw;
        public float Radius = 12f;
        /// <summary>Secrets are hidden on the map until discovered.</summary>
        public bool HiddenUntilDiscovered;
        /// <summary>Fast travel becomes available once the spot is visited.</summary>
        public bool FastTravel;
        public string ZoneId;
    }

    [System.Serializable]
    public class ZoneInfo
    {
        public string Id;
        public string Name;
        public Rect Area; // x/z rectangle on the map
        public Color MapColor;
    }

    /// <summary>World map registry filled by the world builder; used by map, minimap, fast travel and discovery.</summary>
    public static class WorldAtlas
    {
        public static readonly List<PointOfInterest> Pois = new List<PointOfInterest>();
        public static readonly List<ZoneInfo> Zones = new List<ZoneInfo>();
        /// <summary>Simplified footprint rectangles (x, z, w, d) drawn on the map: roads, buildings, ramps.</summary>
        public static readonly List<(Rect rect, Color color)> MapShapes = new List<(Rect, Color)>();
        public static Rect WorldRect = new Rect(-330, -330, 660, 660);

        public static void Clear() { Pois.Clear(); Zones.Clear(); MapShapes.Clear(); }

        public static PointOfInterest Get(string id)
        {
            foreach (var p in Pois) if (p.Id == id) return p;
            return null;
        }

        public static ZoneInfo ZoneAt(Vector3 pos)
        {
            var p = new Vector2(pos.x, pos.z);
            foreach (var z in Zones) if (z.Area.Contains(p)) return z;
            return null;
        }

        public static void AddShape(Vector3 center, Vector2 size, Color color)
        {
            MapShapes.Add((new Rect(center.x - size.x * 0.5f, center.z - size.y * 0.5f, size.x, size.y), color));
        }
    }

    /// <summary>Trigger volume that reports when the player enters a spot (discovery, challenges, shops).</summary>
    public sealed class SpotTrigger : MonoBehaviour
    {
        public string PoiId;
        public static event System.Action<string> Entered;

        private void OnTriggerEnter(Collider other)
        {
            if (other.attachedRigidbody != null && other.attachedRigidbody.GetComponent<Vehicle.ScooterController>() != null)
                Entered?.Invoke(PoiId);
        }
    }
}

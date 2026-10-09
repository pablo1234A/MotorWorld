using System.Collections.Generic;
using UnityEngine;

namespace ScooterUnleashed.World
{
    public enum RailKind
    {
        Rail,   // round metal tube
        Ledge,  // concrete/stone edge
        Coping, // quarter-pipe / bowl lip
        Curb,
    }

    public struct RailHit
    {
        public GrindRail Rail;
        public float Distance;   // arc length along the rail
        public Vector3 Point;
        public Vector3 Tangent;
        public float SqrDistance;
    }

    /// <summary>
    /// A grindable edge described by a polyline in world space. Rails register themselves in a static list that the
    /// grind system queries every physics step, so any geometry with a GrindRail is automatically grindable.
    /// </summary>
    public sealed class GrindRail : MonoBehaviour
    {
        public static readonly List<GrindRail> All = new List<GrindRail>();

        public RailKind Kind = RailKind.Rail;
        /// <summary>World-space points along the grindable edge (top of the rail).</summary>
        public Vector3[] Points = new Vector3[0];
        public bool Closed;
        public float Friction = 1f;

        private float[] _cumulative;
        private Bounds _bounds;

        public float Length { get; private set; }
        public Bounds Bounds => _bounds;
        public bool IsMetal => Kind == RailKind.Rail || Kind == RailKind.Coping;

        public void SetPoints(IList<Vector3> pts, bool closed = false)
        {
            Points = new Vector3[pts.Count];
            for (int i = 0; i < pts.Count; i++) Points[i] = pts[i];
            Closed = closed;
            Rebuild();
        }

        private void OnEnable() { if (!All.Contains(this)) All.Add(this); if (_cumulative == null) Rebuild(); }
        private void OnDisable() { All.Remove(this); }

        public int SegmentCount => Points.Length < 2 ? 0 : (Closed ? Points.Length : Points.Length - 1);

        private Vector3 P(int i) => Points[i % Points.Length];

        public void Rebuild()
        {
            int segs = SegmentCount;
            _cumulative = new float[segs + 1];
            if (Points.Length == 0) { Length = 0; _bounds = new Bounds(transform.position, Vector3.zero); return; }
            _bounds = new Bounds(Points[0], Vector3.zero);
            for (int i = 0; i < Points.Length; i++) _bounds.Encapsulate(Points[i]);
            _bounds.Expand(1.5f);
            for (int i = 0; i < segs; i++) _cumulative[i + 1] = _cumulative[i] + Vector3.Distance(P(i), P(i + 1));
            Length = _cumulative[segs];
        }

        public bool Closest(Vector3 p, out RailHit hit)
        {
            hit = default;
            int segs = SegmentCount;
            if (segs == 0) return false;
            float best = float.MaxValue;
            for (int i = 0; i < segs; i++)
            {
                Vector3 a = P(i), b = P(i + 1);
                Vector3 ab = b - a;
                float len2 = ab.sqrMagnitude;
                float t = len2 > 1e-6f ? Mathf.Clamp01(Vector3.Dot(p - a, ab) / len2) : 0f;
                Vector3 c = a + ab * t;
                float d = (p - c).sqrMagnitude;
                if (d < best)
                {
                    best = d;
                    hit.Rail = this;
                    hit.Point = c;
                    hit.Tangent = len2 > 1e-6f ? ab / Mathf.Sqrt(len2) : Vector3.forward;
                    hit.Distance = _cumulative[i] + Mathf.Sqrt(len2) * t;
                    hit.SqrDistance = d;
                }
            }
            return true;
        }

        /// <summary>Point and tangent at arc length s. Returns false if s is outside an open rail.</summary>
        public bool Sample(float s, out Vector3 point, out Vector3 tangent)
        {
            int segs = SegmentCount;
            point = Vector3.zero; tangent = Vector3.forward;
            if (segs == 0) return false;
            if (Closed) s = Mathf.Repeat(s, Length);
            else if (s < 0f || s > Length) return false;
            int lo = 0, hi = segs - 1;
            while (lo < hi)
            {
                int mid = (lo + hi + 1) / 2;
                if (_cumulative[mid] <= s) lo = mid; else hi = mid - 1;
            }
            Vector3 a = P(lo), b = P(lo + 1);
            float segLen = _cumulative[lo + 1] - _cumulative[lo];
            float t = segLen > 1e-6f ? (s - _cumulative[lo]) / segLen : 0f;
            point = Vector3.Lerp(a, b, t);
            tangent = (b - a).normalized;
            return true;
        }

        /// <summary>Finds the closest rail to p within a coarse radius (bounds pre-check keeps this cheap).</summary>
        public static bool FindNearest(Vector3 p, float maxDistance, out RailHit best)
        {
            best = default;
            float bestD = maxDistance * maxDistance;
            bool found = false;
            for (int i = 0; i < All.Count; i++)
            {
                var r = All[i];
                if (r == null || !r.isActiveAndEnabled) continue;
                if (r._bounds.SqrDistance(p) > bestD) continue;
                if (r.Closest(p, out var h) && h.SqrDistance < bestD)
                {
                    bestD = h.SqrDistance;
                    best = h;
                    found = true;
                }
            }
            return found;
        }

#if UNITY_EDITOR
        private void OnDrawGizmos()
        {
            if (Points == null || Points.Length < 2) return;
            Gizmos.color = Kind == RailKind.Rail ? Color.cyan : (Kind == RailKind.Coping ? Color.yellow : Color.green);
            for (int i = 0; i < SegmentCount; i++) Gizmos.DrawLine(P(i), P(i + 1));
        }
#endif
    }
}

using System;
using System.Collections.Generic;
using ScooterUnleashed.Core.Tricks;

namespace ScooterUnleashed.Core.Input
{
    [Serializable]
    public class GestureSettings
    {
        /// <summary>Distance in density-independent units (1 unit = 1/160 inch) for a swipe.</summary>
        public float SwipeDistance = 38f;
        /// <summary>A swipe must cover SwipeDistance within this time from its anchor.</summary>
        public float SwipeMaxTime = 0.28f;
        /// <summary>Straight motion beyond SwipeDistance * this commits the swipe before release.</summary>
        public float SwipeCommitFactor = 1.7f;
        /// <summary>Accumulated turning (deg) that turns a swipe candidate into a circle.</summary>
        public float CurveCancelAngle = 55f;
        public float HoldTime = 0.2f;
        public float HoldMoveTolerance = 16f;
        public float TapMaxTime = 0.22f;
        /// <summary>Each time the drawn circle accumulates this many degrees a Circle event fires.</summary>
        public float CircleStepAngle = 170f;
        public float CircleMinSegment = 4f;
        /// <summary>Angular width of the diagonal sectors (cardinals get the rest). Narrow diagonals avoid misfires.</summary>
        public float DiagonalSectorWidth = 30f;
        /// <summary>1 = default; larger values make swipes and circles shorter.</summary>
        public float Sensitivity = 1f;
    }

    public struct GestureEvent
    {
        public GestureKind Kind;
        public Dir8 Direction;
        /// <summary>Raw direction of the motion (normalized, screen space, y up).</summary>
        public Vec2 Vector;
        /// <summary>For Release: seconds the finger was down. For HoldStart: hold time.</summary>
        public float Duration;
        /// <summary>For Release: true if the touch already produced a swipe/circle/hold-swipe.</summary>
        public bool Consumed;
        /// <summary>For Release: true if the touch became a hold.</summary>
        public bool WasHold;
        /// <summary>For Circle: +1 counter-clockwise, -1 clockwise. Degrees drawn so far in Duration.</summary>
        public int CircleSign;
        public float CircleDegrees;

        public override string ToString() => $"{Kind} {Direction} d={Duration:0.00} consumed={Consumed} hold={WasHold} circle={CircleSign}:{CircleDegrees:0}";
    }

    /// <summary>
    /// Interprets one finger on the action zone. Rules designed so actions don't block each other:
    /// <list type="bullet">
    /// <item>Press/Release without motion = pop (charge = hold time).</item>
    /// <item>Quick straight flick = Swipe (scooter tricks / manuals). Committed on release, when it keeps going straight, or when the finger stops.</item>
    /// <item>Hold still, then flick = HoldSwipe (body tricks, sustained until release).</item>
    /// <item>Curving motion = Circle steps (rotations), never misread as a swipe.</item>
    /// </list>
    /// Times are in seconds, positions in density-independent units with y pointing up.
    /// </summary>
    public sealed class GestureRecognizer
    {
        private readonly Queue<GestureEvent> _events = new Queue<GestureEvent>();
        public GestureSettings Settings;

        private bool _down;
        private double _downTime;
        private Vec2 _downPos;
        private Vec2 _lastPos;
        private double _lastMoveTime;
        private float _maxDistanceFromDown;
        private bool _holding;
        private bool _consumed;

        // Swipe candidate
        private Vec2 _anchorPos;
        private double _anchorTime;
        private float _curveSinceAnchor;
        private bool _candidateValid;

        // Circle tracking
        private Vec2 _prevSegDir;
        private bool _hasPrevSeg;
        private Vec2 _segStart;
        private float _circleAccum;
        private float _circleTotal;
        private int _circleSteps;

        public GestureRecognizer(GestureSettings settings = null) { Settings = settings ?? new GestureSettings(); }

        public bool IsDown => _down;
        public bool IsHolding => _holding;
        public double DownTime => _downTime;
        public int PendingCount => _events.Count;

        public bool TryDequeue(out GestureEvent e)
        {
            if (_events.Count > 0) { e = _events.Dequeue(); return true; }
            e = default;
            return false;
        }

        private float Dist(float baseValue) => baseValue / Math.Max(0.25f, Settings.Sensitivity);

        public void Begin(Vec2 pos, double time)
        {
            if (_down) End(_lastPos, time);
            _down = true;
            _downTime = time;
            _downPos = pos;
            _lastPos = pos;
            _lastMoveTime = time;
            _maxDistanceFromDown = 0f;
            _holding = false;
            _consumed = false;
            _swipedThisTouch = false;
            ResetCandidate(pos, time);
            _hasPrevSeg = false;
            _segStart = pos;
            _circleAccum = 0f;
            _circleTotal = 0f;
            _circleSteps = 0;
            _events.Enqueue(new GestureEvent { Kind = GestureKind.Press, Direction = Dir8.None });
        }

        public void Move(Vec2 pos, double time)
        {
            if (!_down) return;
            Tick(time);
            Vec2 delta = pos - _lastPos;
            if (delta.Magnitude > 1e-4f) _lastMoveTime = time;
            _lastPos = pos;
            _maxDistanceFromDown = Math.Max(_maxDistanceFromDown, (pos - _downPos).Magnitude);

            UpdateCircle(pos);

            if (!_candidateValid)
            {
                // After a committed swipe, a new straight motion re-arms the next swipe (double barspin = two flicks).
                if (_swipedThisTouch && _curveSinceAnchor <= Settings.CurveCancelAngle && (pos - _reArmPos).Magnitude > Dist(Settings.SwipeDistance * 0.3f))
                    ResetCandidate(pos, time);
                else if (time - _anchorTime > Settings.SwipeMaxTime)
                    ResetCandidate(pos, time);
                return;
            }

            // Stale candidate: too slow to be a flick, slide the anchor forward.
            if (time - _anchorTime > Settings.SwipeMaxTime)
            {
                ResetCandidate(pos, time);
                return;
            }

            Vec2 fromAnchor = pos - _anchorPos;
            if (fromAnchor.Magnitude >= Dist(Settings.SwipeDistance * Settings.SwipeCommitFactor))
                CommitSwipe(pos, time);
        }

        /// <summary>Call every frame (also while the finger doesn't move) for hold and pause detection.</summary>
        public void Tick(double time)
        {
            if (!_down) return;
            if (!_holding && !_consumed && time - _downTime >= Settings.HoldTime && _maxDistanceFromDown <= Dist(Settings.HoldMoveTolerance))
            {
                _holding = true;
                _events.Enqueue(new GestureEvent { Kind = GestureKind.HoldStart, Direction = Dir8.None, Duration = (float)(time - _downTime) });
                ResetCandidate(_lastPos, time);
            }
            // Finger stopped after a fast straight motion: commit immediately (low latency for short flicks).
            if (_candidateValid && time - _lastMoveTime > 0.05 && (_lastPos - _anchorPos).Magnitude >= Dist(Settings.SwipeDistance)
                && time - _anchorTime <= Settings.SwipeMaxTime + 0.06)
            {
                CommitSwipe(_lastPos, time);
            }
        }

        public void End(Vec2 pos, double time)
        {
            if (!_down) return;
            if ((pos - _lastPos).Magnitude > 1e-4f) Move(pos, time);
            // Judge the flick by when the finger last moved, not by when it was lifted.
            if (_candidateValid && (_lastPos - _anchorPos).Magnitude >= Dist(Settings.SwipeDistance) && _lastMoveTime - _anchorTime <= Settings.SwipeMaxTime)
                CommitSwipe(_lastPos, _lastMoveTime);

            float duration = (float)(time - _downTime);
            _events.Enqueue(new GestureEvent
            {
                Kind = GestureKind.Release,
                Direction = Dir8.None,
                Duration = duration,
                Consumed = _consumed,
                WasHold = _holding,
            });
            _down = false;
            _holding = false;
        }

        /// <summary>Drops the current touch silently (e.g. game paused).</summary>
        public void Cancel()
        {
            _down = false;
            _holding = false;
            _events.Clear();
        }

        private void ResetCandidate(Vec2 pos, double time)
        {
            _anchorPos = pos;
            _anchorTime = time;
            _curveSinceAnchor = 0f;
            _candidateValid = true;
        }

        private void CommitSwipe(Vec2 pos, double time)
        {
            Vec2 v = pos - _anchorPos;
            var dir = DirectionOf(v);
            _events.Enqueue(new GestureEvent
            {
                Kind = _holding ? GestureKind.HoldSwipe : GestureKind.Swipe,
                Direction = dir,
                Vector = v.Normalized,
                Duration = (float)(time - _anchorTime),
            });
            _consumed = true;
            // After a swipe the next one needs a fresh anchor (allows double barspin with two flicks).
            ResetCandidate(pos, time);
            _candidateValid = false;
            _reArmPos = pos;
            _swipedThisTouch = true;
        }

        private Vec2 _reArmPos;
        private bool _swipedThisTouch;

        private void UpdateCircle(Vec2 pos)
        {
            Vec2 seg = pos - _segStart;
            if (seg.Magnitude < Dist(Settings.CircleMinSegment)) return;
            Vec2 dir = seg.Normalized;
            if (_hasPrevSeg)
            {
                float cross = Vec2.Cross(_prevSegDir, dir);
                float dot = Vec2.Dot(_prevSegDir, dir);
                float turn = (float)Math.Atan2(cross, dot) * SUMath.Rad2Deg;
                // Ignore reversals (zig-zags are not circles).
                if (Math.Abs(turn) < 100f)
                {
                    _circleAccum += turn;
                    _circleTotal += turn;
                    _curveSinceAnchor += Math.Abs(turn);
                    if (_curveSinceAnchor > Settings.CurveCancelAngle) _candidateValid = false;
                }
                else
                {
                    _circleAccum = 0f;
                }
            }
            _prevSegDir = dir;
            _hasPrevSeg = true;
            _segStart = pos;

            if (Math.Abs(_circleAccum) >= Settings.CircleStepAngle)
            {
                int sign = _circleAccum > 0 ? 1 : -1;
                _circleSteps++;
                _events.Enqueue(new GestureEvent
                {
                    Kind = GestureKind.Circle,
                    Direction = Dir8.None,
                    CircleSign = sign,
                    CircleDegrees = Math.Abs(_circleTotal),
                });
                _circleAccum = 0f;
                _consumed = true;
                _candidateValid = false;
            }
        }

        /// <summary>8-way direction with narrower diagonal sectors.</summary>
        public Dir8 DirectionOf(Vec2 v)
        {
            if (v.Magnitude < 1e-5f) return Dir8.None;
            float a = v.AngleDeg % 360f;
            if (a < 0) a += 360f;
            float halfDiag = Settings.DiagonalSectorWidth * 0.5f;
            for (int i = 0; i < 4; i++)
            {
                float center = 45f + 90f * i;
                if (Math.Abs(SUMath.DeltaAngle(a, center)) <= halfDiag) return (Dir8)(1 + 2 * i);
            }
            int card = (int)Math.Floor((a + 45f) / 90f) % 4;
            return (Dir8)(card * 2);
        }
    }
}

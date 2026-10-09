using System;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Vehicle
{
    public enum ScooterState
    {
        Riding,
        Air,
        Grinding,
        Manual,
        Bailed,
        Frozen,
    }

    /// <summary>Physical facts measured at touchdown, before trick rules are applied.</summary>
    public struct LandingPhysics
    {
        public float UpAngle;
        public float HeadingError;
        public float ImpactSpeed;
        public float GroundSpeed;
        public Vector3 Normal;
        public float AirTime;
        public float Height;
        public bool WasVert;
    }

    public interface ILandingJudge
    {
        LandingResult JudgeLanding(in LandingPhysics physics);
    }

    /// <summary>
    /// Arcade-physical scooter controller built for mobile stability:
    /// two raycast wheels with a spring-damper suspension, surface following that respects concave/convex curvature,
    /// carving that keeps momentum, pop with charge, rotation measured from the real orientation in the air,
    /// predicted landing alignment assist, grinding on spline rails, wall impacts and bails with respawn.
    /// The Rigidbody handles translation and collisions; orientation is driven by this controller.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class ScooterController : MonoBehaviour
    {
        public ScooterTuning Tuning = new ScooterTuning();

        // ---- Inputs written by the player/AI every frame -----------------------------------------
        [NonSerialized] public Vector2 Stick;
        [NonSerialized] public float Brake;
        [NonSerialized] public bool AutoPush = true;
        [NonSerialized] public float AssistScale = 1f;
        [NonSerialized] public float ChargeCrouch;
        [NonSerialized] public float ManualPitch;
        public ILandingJudge Judge;

        // ---- Public state ----------------------------------------------------------------------
        public ScooterState State { get; private set; } = ScooterState.Riding;
        public bool FrontContact { get; private set; }
        public bool RearContact { get; private set; }
        public bool Grounded => FrontContact || RearContact;
        public Vector3 GroundNormal { get; private set; } = Vector3.up;
        public SurfaceType Surface { get; private set; } = SurfaceType.Concrete;
        public float ForwardSpeed { get; private set; }
        public Vector3 Velocity => State == ScooterState.Grinding ? _grindTangent * _grindSpeed : (_rb != null ? _rb.GetVelocity() : Vector3.zero);
        public float SpeedKmh => Velocity.magnitude * 3.6f;
        public float Steer { get; private set; }
        public float LeanAngle { get; private set; }
        public float Compression { get; private set; }
        public bool Kicking { get; private set; }
        public bool Skidding { get; private set; }
        public float AirTime { get; private set; }
        public float AirHeight { get; private set; }
        public float AccumYaw { get; private set; }
        public float AccumPitch { get; private set; }
        public bool IsVertAir { get; private set; }
        public bool PoppedThisAir { get; private set; }
        public bool HasPrediction { get; private set; }
        public Vector3 PredictedPoint { get; private set; }
        public Vector3 PredictedNormal { get; private set; } = Vector3.up;
        public float PredictedTime { get; private set; }
        public float BailTimeLeft => _bailTimer;
        public Vector3 SafePosition => _safePos;
        public GrindRail CurrentRail => _grindRail;
        public float GrindTime { get; private set; }
        public float GrindSlideAngle => _grindSlideAngle;
        public Rigidbody Body => _rb;

        // ---- Events ------------------------------------------------------------------------------
        public event Action<bool> TookOff;
        public event Action<LandingPhysics, LandingResult> Landed;
        public event Action<BailReason, Vector3> Bailed;
        public event Action Respawned;
        public event Action<bool> GrindExited;
        public event Action<float> Impact;
        public event Action AutoReverted;

        // ---- Internals ---------------------------------------------------------------------------
        private Rigidbody _rb;
        private CapsuleCollider _col;
        private RaycastHit _hitF, _hitR;
        private Vector3 _prevNormal = Vector3.up;
        private bool _hadGround;
        private float _coyote;
        private float _jumpIgnore;
        private float _spinVel, _flipVel, _spinQueue;
        private bool _yArmed;
        private float _airStartY;
        private float _predictTimer;
        private float _revertRemaining;
        private float _bailTimer;
        private float _invulnerableUntil;
        private float _safeTimer;
        private Vector3 _safePos;
        private Quaternion _safeRot = Quaternion.identity;
        private float _airGroundTouch;

        private GrindRail _grindRail, _lastRail;
        private float _grindS, _grindSpeed, _grindSlideAngle, _lastRailExitTime;
        private int _grindDir;
        private Vector3 _grindTangent;
        private float _grindHeight;

        private bool _initialized;
        private float _clock; // simulation clock (advances with physics steps, also in EditMode tests)

        private void Awake() => Initialize();

        /// <summary>Sets up the body and collider. Called from Awake; EditMode tests call it directly.</summary>
        public void Initialize()
        {
            if (_initialized) return;
            _initialized = true;
            _rb = GetComponent<Rigidbody>();
            _rb.mass = Tuning.Mass;
            _rb.useGravity = false;
            _rb.freezeRotation = true;
            _rb.interpolation = RigidbodyInterpolation.Interpolate;
            _rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            _rb.SetDamping(0f, 0f);
            _rb.centerOfMass = Tuning.CenterOfMass;

            _col = gameObject.AddComponent<CapsuleCollider>();
            _col.direction = 1;
            _col.radius = 0.22f;
            _col.height = 1.6f;
            _col.center = new Vector3(0f, 0.95f, 0f);
            Compat.MakeFrictionless(_col);
            SetLayerRecursive(gameObject, Layers.Player);
            _safePos = transform.position;
            _safeRot = transform.rotation;
        }

        private static void SetLayerRecursive(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform t in go.transform) SetLayerRecursive(t.gameObject, layer);
        }

        public void ApplyTuning(ScooterTuning t)
        {
            Tuning = t;
            if (_rb != null) { _rb.mass = t.Mass; _rb.centerOfMass = t.CenterOfMass; }
        }

        // ==========================================================================================
        // Physics loop
        // ==========================================================================================
        private void FixedUpdate() => PhysicsStep(Time.fixedDeltaTime);

        /// <summary>One physics step. Runs from FixedUpdate; tests drive it manually alongside Physics.Simulate.</summary>
        public void PhysicsStep(float dt)
        {
            _clock += dt;
            switch (State)
            {
                case ScooterState.Bailed:
                case ScooterState.Frozen:
                    return;
                case ScooterState.Grinding:
                    GrindStep(dt);
                    return;
            }

            Vector3 v = _rb.GetVelocity();
            _jumpIgnore -= dt;
            Probe();
            bool grounded = Grounded && _jumpIgnore <= 0f;

            if (State == ScooterState.Riding || State == ScooterState.Manual)
            {
                if (grounded)
                {
                    _coyote = Tuning.CoyoteTime;
                    v = GroundStep(v, dt);
                }
                else
                {
                    _coyote -= dt;
                    v += Vector3.down * Tuning.Gravity * dt;
                    _hadGround = false;
                    if (_coyote <= 0f) EnterAir(ref v, false);
                }
            }
            else if (State == ScooterState.Air)
            {
                v = AirStep(v, dt);
                if (grounded && AirTime > 0.06f && Vector3.Dot(v, GroundNormal) < 0.5f) TryLand(ref v);
            }

            if (State != ScooterState.Bailed && State != ScooterState.Grinding) _rb.SetVelocity(v);
        }

        private void Probe()
        {
            Vector3 up = transform.up, fwd = transform.forward, pos = _rb.position;
            float half = Tuning.Wheelbase * 0.5f;
            float contactDist = Tuning.ProbeHeight + Tuning.RideHeight + Tuning.WheelRadius * 0.5f + Tuning.ContactSlack;
            float len = contactDist + 0.4f;
            Vector3 of = pos + up * Tuning.ProbeHeight + fwd * half;
            Vector3 or = pos + up * Tuning.ProbeHeight - fwd * half;
            bool hf = Physics.Raycast(of, -up, out _hitF, len, Layers.WheelMask, QueryTriggerInteraction.Ignore);
            bool hr = Physics.Raycast(or, -up, out _hitR, len, Layers.WheelMask, QueryTriggerInteraction.Ignore);
            FrontContact = hf && _hitF.distance <= contactDist && IsRideable(_hitF.normal);
            RearContact = hr && _hitR.distance <= contactDist && IsRideable(_hitR.normal);
            if (FrontContact && RearContact) GroundNormal = (_hitF.normal + _hitR.normal).normalized;
            else if (FrontContact) GroundNormal = _hitF.normal;
            else if (RearContact) GroundNormal = _hitR.normal;
            if (RearContact) Surface = World.Surface.Of(_hitR.collider);
            else if (FrontContact) Surface = World.Surface.Of(_hitF.collider);
        }

        private bool IsRideable(Vector3 n) => n.y > -0.2f && Vector3.Dot(n, transform.up) > 0.25f;

        private float GroundDistance()
        {
            float d = 0f; int c = 0;
            if (FrontContact) { d += _hitF.distance; c++; }
            if (RearContact) { d += _hitR.distance; c++; }
            return c > 0 ? d / c - Tuning.ProbeHeight : Tuning.RideHeight;
        }

        private Vector3 GroundStep(Vector3 v, float dt)
        {
            var t = Tuning;
            Vector3 n = GroundNormal;

            // --- Follow the surface: rotate momentum through concave transitions, leave convex edges at speed.
            if (_hadGround)
            {
                float ang = Vector3.Angle(_prevNormal, n);
                if (ang > 0.05f)
                {
                    bool concave = Vector3.Dot(n - _prevNormal, v) < 0f;
                    bool follow = concave;
                    if (!concave)
                    {
                        float spd = v.magnitude;
                        float r = spd * dt / Mathf.Max(ang * Mathf.Deg2Rad, 1e-4f);
                        float centripetal = spd * spd / Mathf.Max(r, 0.01f);
                        float gN = t.Gravity * Mathf.Max(0f, n.y);
                        follow = spd < t.GlueSpeed || centripetal <= gN * t.ConvexStick;
                    }
                    if (follow) v = Quaternion.FromToRotation(_prevNormal, n) * v;
                    else
                    {
                        // Launch off the edge (kicker lip, ledge drop).
                        _prevNormal = n;
                        _jumpIgnore = 0.05f;
                        EnterAir(ref v, false);
                        return v;
                    }
                }
            }
            _prevNormal = n;
            _hadGround = true;

            bool climbing = n.y < 0.95f && v.y > 0f;
            v += Vector3.down * t.Gravity * (climbing ? t.RampGravityScale : 1f) * dt;

            // --- Heading on the surface
            Vector3 f = FrontContact && RearContact ? (_hitF.point - _hitR.point) : transform.forward;
            f = Vector3.ProjectOnPlane(f, n);
            if (f.sqrMagnitude < 1e-6f) f = Vector3.ProjectOnPlane(transform.forward, n);
            f.Normalize();

            float vfNow = Vector3.Dot(v, f);
            Steer = Mathf.Lerp(Steer, Stick.x, SUMathDamp(t.SteerResponse, dt));
            float steerRate = Mathf.Lerp(t.SteerRateLowSpeed, t.SteerRateHighSpeed, Mathf.InverseLerp(1f, t.TopPushSpeed, Mathf.Abs(vfNow)));
            if (State == ScooterState.Manual) steerRate *= 0.55f;
            var yaw = Quaternion.AngleAxis(Steer * steerRate * dt, n);
            f = yaw * f;
            v = yaw * v;

            if (Mathf.Abs(_revertRemaining) > 0.01f)
            {
                float step = Mathf.Sign(_revertRemaining) * Mathf.Min(Mathf.Abs(_revertRemaining), 900f * dt);
                f = Quaternion.AngleAxis(step, n) * f;
                _revertRemaining -= step;
            }

            // --- Decompose velocity
            float vn = Vector3.Dot(v, n);
            Vector3 vt = v - n * vn;
            float vf = Vector3.Dot(vt, f);
            Vector3 vLat = vt - f * vf;
            var sp = World.Surface.Properties(Surface);
            bool reverting = Mathf.Abs(_revertRemaining) > 0.01f;
            if (!reverting) vLat *= Mathf.Exp(-t.LateralGrip * sp.Grip * dt);

            // Rolling backwards (e.g. stalled on a ramp) on flat ground: pivot forward like a real revert.
            if (!reverting && State == ScooterState.Riding && vf < -t.AutoRevertSpeed && n.y > 0.92f)
            {
                _revertRemaining = (Steer >= 0f ? 1f : -1f) * 180f;
                AutoReverted?.Invoke();
            }

            // --- Longitudinal forces
            float throttle = Mathf.Clamp01(Stick.y);
            float brake = Brake;
            if (State == ScooterState.Riding && Stick.y < -0.35f) brake = Mathf.Max(brake, Mathf.InverseLerp(-0.35f, -1f, Stick.y));
            float push = 0f;
            if (State == ScooterState.Riding && brake < 0.05f && vf > -0.3f && Mathf.Abs(_revertRemaining) < 1f && n.y > 0.8f)
            {
                float topPush = t.TopPushSpeed * sp.MaxSpeedFactor;
                float targetSpeed = throttle > 0.1f ? Mathf.Lerp(t.CruiseSpeed * 0.8f, topPush, throttle) : (AutoPush && vf > 0.8f ? t.CruiseSpeed * sp.MaxSpeedFactor : 0f);
                if (vf < targetSpeed) push = t.PushAcceleration * Mathf.Clamp01((targetSpeed - vf) / 1.2f) * (throttle > 0.1f ? Mathf.Max(0.6f, throttle) : 0.7f);
            }
            Kicking = push > 0.4f;
            vf += push * dt;
            if (brake > 0f) vf = Mathf.MoveTowards(vf, 0f, t.BrakeDeceleration * brake * dt);
            Skidding = brake > 0.6f && Mathf.Abs(vf) > 3f;
            vf = Mathf.MoveTowards(vf, 0f, (sp.RollingResistance + t.AirDrag * vf * vf) * dt);
            vf = Mathf.Clamp(vf, -t.MaxSpeed, t.MaxSpeed);

            // --- Suspension along the normal
            float h = GroundDistance();
            // Target includes the static sag so the wheels sit on the ground instead of sinking g/k into it.
            float err = t.RideHeight + t.Gravity * Mathf.Max(0f, n.y) / t.SpringStiffness - h;
            float accN = t.SpringStiffness * err - t.SpringDamping * vn;
            accN = Mathf.Max(accN, -t.MaxPullDown);
            vn += accN * dt;
            if (h < t.RideHeight * 0.25f && vn < 0f) vn = 0f;
            Compression = Mathf.Max(Mathf.Clamp01(err / t.RideHeight), Compression * Mathf.Exp(-6f * dt));

            v = f * vf + vLat + n * vn;
            ForwardSpeed = vf;
            LeanAngle = Mathf.Lerp(LeanAngle, -Steer * Mathf.Clamp01(Mathf.Abs(vf) / 6f) * t.MaxVisualLean, SUMathDamp(8f, dt));

            var target = Quaternion.LookRotation(f, n);
            _rb.MoveRotation(Quaternion.Slerp(_rb.rotation, target, SUMathDamp(t.AlignSharpness, dt)));

            // --- Safe respawn point
            _safeTimer -= dt;
            if (_safeTimer <= 0f && State == ScooterState.Riding && FrontContact && RearContact && n.y > 0.97f && Mathf.Abs(vf) < 12f)
            {
                _safeTimer = 0.5f;
                _safePos = _rb.position + Vector3.up * 0.15f;
                _safeRot = Quaternion.LookRotation(Vector3.ProjectOnPlane(f, Vector3.up).normalized, Vector3.up);
            }
            return v;
        }

        private static float SUMathDamp(float sharpness, float dt) => 1f - Mathf.Exp(-sharpness * dt);

        private void EnterAir(ref Vector3 v, bool popped)
        {
            Vector3 lastN = _prevNormal;
            State = ScooterState.Air;
            AirTime = 0f;
            AirHeight = 0f;
            AccumYaw = 0f;
            AccumPitch = 0f;
            _airStartY = _rb.position.y;
            _spinVel = 0f;
            _flipVel = 0f;
            _spinQueue = 0f;
            _yArmed = Mathf.Abs(Stick.y) < 0.3f;
            _hadGround = false;
            _airGroundTouch = 0f;
            HasPrediction = false;
            _predictTimer = 0f;
            Kicking = false;
            Skidding = false;
            PoppedThisAir = popped;
            IsVertAir = !popped && lastN.y < Tuning.VertNormalY && v.y > 0.5f;
            if (IsVertAir)
            {
                // Keep vert airs above the ramp: cancel motion over the coping, push slightly back to the wall.
                Vector3 nh = new Vector3(lastN.x, 0f, lastN.z).normalized;
                float over = Vector3.Dot(v, -nh);
                if (over > 0f) v += nh * over;
                v += nh * 0.35f;
            }
            TookOff?.Invoke(popped);
        }

        private Vector3 AirStep(Vector3 v, float dt)
        {
            var t = Tuning;
            AirTime += dt;
            v += Vector3.down * t.Gravity * dt;
            v -= v * (t.AirDrag * v.magnitude * dt);
            AirHeight = Mathf.Max(AirHeight, _rb.position.y - _airStartY);

            // --- Rotation input
            float spinTarget = 0f;
            if (Mathf.Abs(_spinQueue) > 1f) spinTarget = Mathf.Sign(_spinQueue) * t.SpinRate;
            else if (Mathf.Abs(Stick.x) > 0.25f) spinTarget = Mathf.Sign(Stick.x) * Mathf.InverseLerp(0.25f, 1f, Mathf.Abs(Stick.x)) * t.SpinRate;
            _spinVel = Mathf.MoveTowards(_spinVel, spinTarget, t.SpinAcceleration * dt);

            if (!_yArmed && Mathf.Abs(Stick.y) < 0.3f) _yArmed = true;
            float flipTarget = _yArmed && Mathf.Abs(Stick.y) > 0.35f ? -Mathf.Sign(Stick.y) * Mathf.InverseLerp(0.35f, 1f, Mathf.Abs(Stick.y)) * t.FlipRate : 0f;
            _flipVel = Mathf.MoveTowards(_flipVel, flipTarget, t.SpinAcceleration * dt);

            float yawDelta = _spinVel * dt;
            float pitchDelta = _flipVel * dt;
            if (Mathf.Abs(_spinQueue) > 1f)
            {
                float before = _spinQueue;
                _spinQueue -= yawDelta;
                if (Mathf.Sign(before) != Mathf.Sign(_spinQueue)) _spinQueue = 0f;
            }

            Quaternion prev = _rb.rotation;
            Quaternion rot = prev;
            rot = Quaternion.AngleAxis(yawDelta, rot * Vector3.up) * rot;
            rot = Quaternion.AngleAxis(-pitchDelta, rot * Vector3.right) * rot;

            // --- Landing assist: align with the predicted surface when the player isn't rotating.
            _predictTimer -= dt;
            if (_predictTimer <= 0f) { _predictTimer = 0.08f; Predict(v); }
            bool rotating = Mathf.Abs(spinTarget) > 1f || Mathf.Abs(flipTarget) > 1f || Mathf.Abs(_spinVel) > 60f || Mathf.Abs(_flipVel) > 60f;
            if (!rotating)
            {
                Vector3 targetUp = HasPrediction ? PredictedNormal : Vector3.up;
                Vector3 up = rot * Vector3.up;
                float ang = Vector3.Angle(up, targetUp);
                float rate = t.AirAlignRate * AssistScale * (HasPrediction && PredictedTime < 0.35f ? 2f : 1f);
                if (ang < t.AirAlignMaxAngle * AssistScale && ang > 0.1f)
                    rot = Quaternion.RotateTowards(Quaternion.identity, Quaternion.FromToRotation(up, targetUp), rate * dt) * rot;

                // Heading assist: finish small yaw errors so 180s/360s land straight.
                Vector3 velP = Vector3.ProjectOnPlane(v, targetUp);
                if (velP.sqrMagnitude > 1f)
                {
                    Vector3 fwdP = Vector3.ProjectOnPlane(rot * Vector3.forward, targetUp);
                    float signed = Vector3.SignedAngle(fwdP, velP, targetUp);
                    float err = Mathf.Abs(signed) > 90f ? Mathf.DeltaAngle(0f, signed + 180f) : signed; // fakie counts too
                    if (Mathf.Abs(err) < 35f * AssistScale)
                        rot = Quaternion.AngleAxis(Mathf.Clamp(err, -rate * 0.6f * dt, rate * 0.6f * dt), targetUp) * rot;
                }
            }

            // --- Measure the real rotation for trick accounting
            Quaternion delta = rot * Quaternion.Inverse(prev);
            delta.ToAngleAxis(out float angle, out Vector3 axis);
            if (angle > 180f) angle -= 360f;
            if (!float.IsNaN(axis.x) && Mathf.Abs(angle) > 1e-4f)
            {
                Vector3 w = axis * angle;
                AccumYaw += Vector3.Dot(w, rot * Vector3.up);
                AccumPitch -= Vector3.Dot(w, rot * Vector3.right);
            }
            _rb.MoveRotation(rot);
            LeanAngle = Mathf.Lerp(LeanAngle, 0f, SUMathDamp(4f, dt));
            Compression = Mathf.Lerp(Compression, 0f, SUMathDamp(5f, dt));
            return v;
        }

        private void Predict(Vector3 v)
        {
            Vector3 p = _rb.position + Vector3.up * 0.05f;
            const float step = 0.05f;
            HasPrediction = false;
            for (float tt = 0f; tt < 3f; tt += step)
            {
                Vector3 nv = v + Vector3.down * Tuning.Gravity * step;
                Vector3 np = p + (v + nv) * 0.5f * step;
                Vector3 d = np - p;
                float dist = d.magnitude;
                if (dist > 1e-4f && Physics.Raycast(p, d / dist, out var hit, dist, Layers.WheelMask, QueryTriggerInteraction.Ignore))
                {
                    HasPrediction = true;
                    PredictedPoint = hit.point;
                    PredictedNormal = hit.normal.y > -0.2f ? hit.normal : Vector3.up;
                    PredictedTime = tt + hit.distance / Mathf.Max(0.01f, nv.magnitude);
                    return;
                }
                p = np;
                v = nv;
            }
        }

        private void TryLand(ref Vector3 v)
        {
            Vector3 n = GroundNormal;
            Vector3 fwdP = Vector3.ProjectOnPlane(transform.forward, n);
            Vector3 velP = Vector3.ProjectOnPlane(v, n);
            var phys = new LandingPhysics
            {
                UpAngle = Vector3.Angle(transform.up, n),
                ImpactSpeed = Mathf.Max(0f, -Vector3.Dot(v, n)),
                GroundSpeed = velP.magnitude,
                HeadingError = velP.sqrMagnitude > 0.04f ? Vector3.Angle(fwdP, velP) : 0f,
                Normal = n,
                AirTime = AirTime,
                Height = AirHeight,
                WasVert = IsVertAir,
            };
            LandingResult res = Judge != null
                ? Judge.JudgeLanding(phys)
                : LandingEvaluator.Evaluate(new LandingInput { UpAngleDeg = phys.UpAngle, HeadingErrorDeg = phys.HeadingError, ImpactSpeed = phys.ImpactSpeed, GroundSpeed = phys.GroundSpeed, PendingTrickCompletion = 1f, PendingTrickLandable = 0f }, new LandingTolerances());

            if (res.IsBail)
            {
                Landed?.Invoke(phys, res);
                Bail(res.Reason);
                return;
            }
            float keep = res.Quality == LandingQuality.Perfect ? 1f : (res.Quality == LandingQuality.Clean ? 0.96f : 0.86f);
            v = velP * keep;
            Compression = Mathf.Clamp01(phys.ImpactSpeed / 7f + 0.25f);
            if (res.Fakie)
            {
                // Auto-revert: pivot 180 on the ground in the direction the rider was already rotating.
                _revertRemaining = (_spinVel >= 0f ? 1f : -1f) * 180f;
            }
            State = ScooterState.Riding;
            _prevNormal = n;
            _hadGround = true;
            _rb.MoveRotation(Quaternion.LookRotation(res.Fakie ? fwdP : (velP.sqrMagnitude > 0.04f ? velP : fwdP), n));
            Impact?.Invoke(phys.ImpactSpeed);
            Landed?.Invoke(phys, res);
        }

        // ==========================================================================================
        // Actions
        // ==========================================================================================
        public bool CanPop => State == ScooterState.Riding || State == ScooterState.Manual || (State == ScooterState.Air && !PoppedThisAir && AirTime < Tuning.CoyoteTime && !IsVertAir);

        /// <summary>Jump. charge01 = how long the rider crouched (0..1).</summary>
        public bool Pop(float charge01)
        {
            if (State == ScooterState.Grinding) { ExitGrind(true, charge01); return true; }
            if (!CanPop) return false;
            Vector3 v = _rb.GetVelocity();
            Vector3 n = State == ScooterState.Air ? Vector3.up : GroundNormal;
            float into = Vector3.Dot(v, n);
            if (into < 0f) v -= n * into;
            float pop = Mathf.Lerp(Tuning.PopSpeedMin, Tuning.PopSpeedMax, Mathf.Clamp01(charge01));
            v += Vector3.Slerp(n, Vector3.up, 0.35f).normalized * pop;
            _jumpIgnore = Tuning.JumpGroundIgnore;
            EnterAir(ref v, true);
            PoppedThisAir = true;
            _rb.SetVelocity(v);
            return true;
        }

        /// <summary>Queue a drawn rotation (circle gesture) in degrees, signed.</summary>
        public void QueueSpin(float degrees)
        {
            if (State != ScooterState.Air) return;
            _spinQueue += degrees;
        }

        public void EnterManual() { if (State == ScooterState.Riding) State = ScooterState.Manual; }
        public void ExitManual() { if (State == ScooterState.Manual) State = ScooterState.Riding; ManualPitch = 0f; }

        // ---- Grinding ------------------------------------------------------------------------------
        public bool FindGrindCandidate(out RailHit hit, out int dir)
        {
            dir = 1;
            hit = default;
            if (State != ScooterState.Air) return false;
            Vector3 p = _rb.position;
            Vector3 v = _rb.GetVelocity();
            if (!GrindRail.FindNearest(p, 1.3f, out hit)) return false;
            if (hit.Rail == _lastRail && _clock - _lastRailExitTime < 0.4f) return false;
            Vector3 toBody = p - hit.Point;
            float vertical = toBody.y;
            Vector3 lateral = toBody - hit.Tangent * Vector3.Dot(toBody, hit.Tangent);
            lateral.y = 0f;
            float capture = 0.45f + Mathf.Min(0.35f, v.magnitude * 0.03f);
            if (vertical < -0.2f || vertical > 0.8f || lateral.magnitude > capture) return false;
            if (v.y > 1.5f && vertical < 0.15f) return false;
            float along = Vector3.Dot(v, hit.Tangent);
            if (Mathf.Abs(along) < 1.2f) return false;
            // Never lock on while upside down, and only lock into copings from above (keeps vert airs clean).
            if (transform.up.y < 0.5f) return false;
            if (hit.Rail.Kind == RailKind.Coping && (v.y > 0.5f || vertical < 0f)) return false;
            dir = along >= 0f ? 1 : -1;
            return true;
        }

        public void BeginGrind(RailHit hit, int dir, float slideAngle)
        {
            _grindRail = hit.Rail;
            _grindS = hit.Distance;
            _grindDir = dir;
            Vector3 v = _rb.GetVelocity();
            _grindSpeed = Mathf.Max(2.2f, Mathf.Abs(Vector3.Dot(v, hit.Tangent)) * 1.02f);
            _grindSlideAngle = slideAngle;
            _grindTangent = hit.Tangent * dir;
            _grindHeight = Mathf.Abs(slideAngle) > 45f ? 0.05f : 0.07f;
            GrindTime = 0f;
            State = ScooterState.Grinding;
            _rb.SetVelocity(Vector3.zero);
            _rb.isKinematic = true;
            Compression = 0.5f;
            AccumYaw = 0f;
            AccumPitch = 0f;
            AirTime = 0f;
        }

        private void GrindStep(float dt)
        {
            GrindTime += dt;
            _grindSpeed -= Tuning.Gravity * _grindTangent.y * dt;
            _grindSpeed = Mathf.MoveTowards(_grindSpeed, 0f, 0.55f * _grindRail.Friction * dt);
            _grindS += _grindSpeed * _grindDir * dt;
            if (!_grindRail.Sample(_grindS, out Vector3 p, out Vector3 tangent))
            {
                ExitGrind(false, 0f);
                return;
            }
            if (_grindSpeed < 0.5f)
            {
                ExitGrind(false, 0f);
                return;
            }
            _grindTangent = tangent * _grindDir;
            Vector3 up = Vector3.ProjectOnPlane(Vector3.up, _grindTangent).normalized;
            Vector3 fwd = Quaternion.AngleAxis(_grindSlideAngle, up) * _grindTangent;
            _rb.MovePosition(p + up * _grindHeight);
            _rb.MoveRotation(Quaternion.LookRotation(fwd, up));
            ForwardSpeed = _grindSpeed;
        }

        public void ExitGrind(bool popped, float charge01)
        {
            if (State != ScooterState.Grinding) return;
            _lastRail = _grindRail;
            _lastRailExitTime = _clock;
            Vector3 up = Vector3.ProjectOnPlane(Vector3.up, _grindTangent).normalized;
            Vector3 v = _grindTangent * _grindSpeed + Vector3.up * (popped ? Mathf.Lerp(Tuning.PopSpeedMin, Tuning.PopSpeedMax, charge01) * 0.9f : 0.8f);
            _rb.isKinematic = false;
            // Leave the rail heading where we travel (undo the slide angle).
            _rb.rotation = Quaternion.LookRotation(_grindTangent, up);
            _rb.position = _rb.position + Vector3.up * 0.03f;
            _rb.SetVelocity(v);
            _grindRail = null;
            _jumpIgnore = 0.1f;
            _prevNormal = Vector3.up;
            EnterAir(ref v, popped);
            PoppedThisAir = popped;
            _rb.SetVelocity(v);
            GrindExited?.Invoke(popped);
        }

        // ---- Bail & respawn -------------------------------------------------------------------------
        public void Bail(BailReason reason)
        {
            if (State == ScooterState.Bailed || State == ScooterState.Frozen) return;
            Vector3 v = Velocity;
            if (State == ScooterState.Grinding) { _rb.isKinematic = false; _grindRail = null; }
            State = ScooterState.Bailed;
            _bailTimer = Tuning.BailDuration;
            _rb.SetVelocity(Vector3.zero);
            _rb.isKinematic = true;
            _col.enabled = false;
            Bailed?.Invoke(reason, v);
        }

        public void RespawnNow() => Respawn(_safePos, _safeRot);

        public void Respawn(Vector3 position, Quaternion rotation)
        {
            State = ScooterState.Riding;
            _rb.isKinematic = false;
            _col.enabled = true;
            _rb.position = position;
            _rb.rotation = rotation;
            transform.SetPositionAndRotation(position, rotation);
            _rb.SetVelocity(Vector3.zero);
            _prevNormal = Vector3.up;
            _hadGround = false;
            _revertRemaining = 0f;
            AirTime = 0f;
            AccumYaw = 0f;
            AccumPitch = 0f;
            Steer = 0f;
            LeanAngle = 0f;
            ManualPitch = 0f;
            _invulnerableUntil = _clock + Tuning.RespawnInvulnerability;
            _safePos = position;
            _safeRot = rotation;
            Physics.SyncTransforms();
            Respawned?.Invoke();
        }

        public void Teleport(Vector3 position, float yaw) => Respawn(position, Quaternion.Euler(0f, yaw, 0f));

        public void SetFrozen(bool frozen)
        {
            if (frozen)
            {
                if (State == ScooterState.Frozen) return;
                if (State == ScooterState.Grinding) ExitGrind(false, 0f);
                State = ScooterState.Frozen;
                _rb.isKinematic = true;
            }
            else if (State == ScooterState.Frozen)
            {
                State = ScooterState.Riding;
                _rb.isKinematic = false;
                _rb.SetVelocity(Vector3.zero);
            }
        }

        private void Update()
        {
            if (State == ScooterState.Bailed)
            {
                _bailTimer -= Time.deltaTime;
                if (_bailTimer <= 0f) RespawnNow();
                return;
            }
            if (State != ScooterState.Frozen && transform.position.y < WorldBuilder.KillY)
            {
                Bail(BailReason.Collision);
                _bailTimer = 0.8f;
            }
        }

        public void SkipBail() { if (State == ScooterState.Bailed) _bailTimer = Mathf.Min(_bailTimer, 0.05f); }

        // ---- Collisions ----------------------------------------------------------------------------
        private void OnCollisionEnter(Collision c) => HandleCollision(c, true);
        private void OnCollisionStay(Collision c) => HandleCollision(c, false);

        private void HandleCollision(Collision c, bool enter)
        {
            if (State != ScooterState.Riding && State != ScooterState.Air && State != ScooterState.Manual) return;
            if (_clock < _invulnerableUntil) return;
            int count = c.contactCount;
            for (int i = 0; i < count; i++)
            {
                var cp = c.GetContact(i);
                Vector3 n = cp.normal;
                float into = Mathf.Abs(Vector3.Dot(c.relativeVelocity, n));
                bool wallForBody = Mathf.Abs(Vector3.Dot(n, transform.up)) < 0.55f && Mathf.Abs(n.y) < 0.6f;
                if (enter && wallForBody && into > Tuning.WallBailSpeed)
                {
                    Impact?.Invoke(into);
                    Bail(BailReason.Collision);
                    return;
                }
                // Body touching the ground while airborne without wheel contact: landed on the body.
                if (State == ScooterState.Air && !Grounded && n.y > 0.5f && Vector3.Dot(transform.up, n) < 0.35f)
                {
                    _airGroundTouch += enter ? 0.1f : Time.fixedDeltaTime;
                    if (_airGroundTouch > 0.08f) { Bail(BailReason.OverRotated); return; }
                }
            }
        }
    }
}

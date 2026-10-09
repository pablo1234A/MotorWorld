using ScooterUnleashed.Character;
using ScooterUnleashed.Vehicle;
using UnityEngine;

namespace ScooterUnleashed.CameraSystem
{
    /// <summary>
    /// Third-person chase camera tuned against motion sickness: it follows the travel direction on the ground,
    /// keeps its heading during airs (the rider rotates, the world doesn't), rises with height, widens FOV with speed,
    /// avoids walls with a sphere cast and adds an optional, small landing shake.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class CameraRig : MonoBehaviour
    {
        public ScooterController Target;
        public RiderRig Rider;

        [Header("Framing")]
        public float Distance = 3.4f;
        public float Height = 1.45f;
        public float LookHeight = 0.95f;
        public float BaseFov = 60f;
        public float SpeedFov = 9f;
        [Header("Settings")]
        public float DistanceScale = 1f;
        public float FovScale = 1f;
        public bool Shake = true;

        public bool MenuOrbit;
        public Vector3 OrbitCenter;
        public float OrbitRadius = 9f;
        public float OrbitSpeed = 6f;
        public float OrbitHeight = 3.2f;
        public float OrbitLookHeight = 1.2f;

        /// <summary>Rotate the orbit by touch/mouse drag (workshop and character showcase).</summary>
        public void AddOrbit(float degrees) => _orbitAngle += degrees;

        private Camera _cam;
        private float _yaw;
        private Vector3 _pos;
        private Vector3 _vel;
        private Vector3 _look;
        private float _shake;
        private float _orbitAngle;
        private float _airYaw;
        private bool _wasAir;

        public Camera Cam => _cam;

        private void Awake()
        {
            _cam = GetComponent<Camera>();
            _cam.nearClipPlane = 0.08f;
            _cam.farClipPlane = 900f;
            _cam.fieldOfView = BaseFov;
        }

        private void OnEnable() { if (Target != null) Target.Landed += OnLanded; }
        private void OnDisable() { if (Target != null) Target.Landed -= OnLanded; }

        private void OnLanded(LandingPhysics p, Core.Scoring.LandingResult r)
        {
            if (Shake) _shake = Mathf.Max(_shake, Mathf.Clamp01((p.ImpactSpeed - 3f) / 8f) * 0.18f);
        }

        public void Snap()
        {
            if (Target == null) return;
            _yaw = Target.transform.eulerAngles.y;
            ComputeDesired(out _pos, out _look, 1f);
            _vel = Vector3.zero;
            transform.SetPositionAndRotation(_pos, Quaternion.LookRotation(_look - _pos));
        }

        private void LateUpdate()
        {
            float dt = Mathf.Max(Time.unscaledDeltaTime, 1e-4f);
            if (MenuOrbit || Target == null)
            {
                _orbitAngle += dt * OrbitSpeed;
                var p = OrbitCenter + Quaternion.Euler(0f, _orbitAngle, 0f) * new Vector3(0f, OrbitHeight, -OrbitRadius);
                transform.position = Vector3.Lerp(transform.position, p, 1f - Mathf.Exp(-4f * dt));
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(OrbitCenter + Vector3.up * OrbitLookHeight - transform.position), 1f - Mathf.Exp(-5f * dt));
                _cam.fieldOfView = Mathf.Lerp(_cam.fieldOfView, 50f, 1f - Mathf.Exp(-2f * dt));
                return;
            }
            dt = Time.deltaTime;
            if (dt <= 0f) return;

            var state = Target.State;
            Vector3 v = Target.Velocity;
            Vector3 flatV = new Vector3(v.x, 0f, v.z);

            // Heading
            bool inAir = state == ScooterState.Air;
            if (inAir && !_wasAir) _airYaw = _yaw;
            _wasAir = inAir;
            float desiredYaw = _yaw;
            if (state == ScooterState.Riding || state == ScooterState.Manual || state == ScooterState.Grinding)
            {
                bool steep = Target.GroundNormal.y < 0.6f;
                if (!steep && flatV.magnitude > 1.2f) desiredYaw = Mathf.Atan2(flatV.x, flatV.z) * Mathf.Rad2Deg;
                else if (!steep && flatV.magnitude <= 1.2f) desiredYaw = Target.transform.eulerAngles.y;
            }
            else if (inAir)
            {
                // Follow travel slowly for long flat jumps; vert airs keep the camera facing the ramp.
                if (!Target.IsVertAir && flatV.magnitude > 3f) desiredYaw = Mathf.LerpAngle(_airYaw, Mathf.Atan2(flatV.x, flatV.z) * Mathf.Rad2Deg, 0.5f);
                else desiredYaw = _airYaw;
            }
            float follow = state == ScooterState.Grinding ? 5f : (inAir ? 1.6f : Mathf.Lerp(2.5f, 5.5f, flatV.magnitude / 10f));
            _yaw = Mathf.LerpAngle(_yaw, desiredYaw, 1f - Mathf.Exp(-follow * dt));

            ComputeDesired(out Vector3 desired, out Vector3 look, dt);
            float smooth = inAir ? 0.16f : 0.09f;
            _pos = Vector3.SmoothDamp(_pos, desired, ref _vel, smooth, 60f, dt);
            _look = Vector3.Lerp(_look, look, 1f - Mathf.Exp(-14f * dt));

            // Shake
            Vector3 shakeOff = Vector3.zero;
            if (_shake > 0f)
            {
                float t = Time.time * 40f;
                shakeOff = new Vector3(Mathf.PerlinNoise(t, 0f) - 0.5f, Mathf.PerlinNoise(0f, t) - 0.5f, 0f) * _shake;
                _shake = Mathf.MoveTowards(_shake, 0f, dt * 0.8f);
            }
            transform.position = _pos + transform.rotation * shakeOff;
            transform.rotation = Quaternion.LookRotation(_look - transform.position, Vector3.up);

            float speed = v.magnitude;
            float fov = (BaseFov + SpeedFov * FovScale * Mathf.Clamp01((speed - 3f) / 11f));
            _cam.fieldOfView = Mathf.Lerp(_cam.fieldOfView, fov, 1f - Mathf.Exp(-3f * dt));
        }

        private void ComputeDesired(out Vector3 pos, out Vector3 look, float dt)
        {
            Vector3 focus = Target.transform.position;
            if (Target.State == ScooterState.Bailed && Rider != null && Rider.Model != null)
                focus = Rider.Model.TransformPoint(Rider.HipPos);
            Vector3 v = Target.Velocity;
            float speed = v.magnitude;
            float dist = (Distance + Mathf.Clamp(speed * 0.06f, 0f, 1.1f)) * DistanceScale;
            float height = Height;
            if (Target.State == ScooterState.Air) height += Mathf.Clamp(Target.AirHeight * 0.22f, 0f, 1.4f);
            if (Target.State == ScooterState.Grinding) { height -= 0.15f; dist *= 0.92f; }
            Vector3 back = Quaternion.Euler(0f, _yaw, 0f) * Vector3.back;
            Vector3 anchor = focus + Vector3.up * LookHeight;
            Vector3 desired = focus + back * dist + Vector3.up * height;

            // Keep the camera out of walls.
            Vector3 dir = desired - anchor;
            float len = dir.magnitude;
            if (len > 0.01f && Physics.SphereCast(anchor, 0.22f, dir / len, out var hit, len, Layers.WorldMask, QueryTriggerInteraction.Ignore))
                desired = anchor + dir / len * Mathf.Max(0.6f, hit.distance - 0.1f);

            pos = desired;
            Vector3 lead = Target.State == ScooterState.Air ? Vector3.zero : new Vector3(v.x, 0f, v.z) * 0.12f;
            look = anchor + lead;
        }
    }
}

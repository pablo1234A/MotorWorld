using ScooterUnleashed.Tricks;
using ScooterUnleashed.Vehicle;
using UnityEngine;

namespace ScooterUnleashed.Character
{
    /// <summary>
    /// Procedural animation layer: reads physics + trick state and poses the scooter pivots and the rider IK targets.
    /// It is the single place to swap for an Animator-driven setup when motion-captured clips exist
    /// (AnimationKey on each TrickDefinition maps to a clip/state).
    /// </summary>
    public sealed class RiderAnimator : MonoBehaviour
    {
        public ScooterController Scooter;
        public TrickSystem Tricks;
        public ScooterVisual Visual;
        public RiderRig Rider;

        private float _kickPhase;
        private float _celebrate;
        private float _grindLean;

        private void OnEnable()
        {
            if (Scooter == null) return;
            Scooter.Bailed += OnBailed;
            Scooter.Respawned += OnRespawned;
            if (Tricks != null) Tricks.ComboBanked += OnBanked;
        }

        private void OnDisable()
        {
            if (Scooter == null) return;
            Scooter.Bailed -= OnBailed;
            Scooter.Respawned -= OnRespawned;
            if (Tricks != null) Tricks.ComboBanked -= OnBanked;
        }

        private void OnBanked(Core.Scoring.ComboResult r) { if (r.Total > 2500) _celebrate = 1.2f; }

        private void OnBailed(Core.Scoring.BailReason reason, Vector3 velocity)
        {
            Rider.BeginRagdoll(velocity);
            Visual.BeginTumble(velocity);
        }

        private void OnRespawned()
        {
            Rider.EndRagdoll();
            Visual.EndTumble();
        }

        private void LateUpdate()
        {
            if (Scooter == null || Visual == null || Rider == null) return;
            float dt = Time.deltaTime;
            var state = Scooter.State;
            float speed = Scooter.State == ScooterState.Grinding ? 0f : Scooter.ForwardSpeed;

            if (Scooter.Kicking) _kickPhase = (_kickPhase + dt * 1.5f) % 1f;
            else if (_kickPhase > 0f) _kickPhase = Mathf.MoveTowards(_kickPhase, _kickPhase > 0.6f ? 1f : 0f, dt * 2f) % 1f;
            _celebrate = Mathf.Max(0f, _celebrate - dt);

            float lean = Scooter.LeanAngle;
            if (state == ScooterState.Grinding)
            {
                _grindLean = Mathf.Lerp(_grindLean, Tricks.Balance.Value * 22f, 1f - Mathf.Exp(-10f * dt));
                lean = _grindLean;
            }
            float manualPitch = state == ScooterState.Manual ? Scooter.ManualPitch : 0f;

            Visual.Pose(Scooter.Steer * 28f, speed, lean, manualPitch, Tricks.BarAngle, Tricks.DeckYaw, Tricks.DeckPitch, dt);

            var pose = new RiderPose
            {
                Crouch = Tricks.Crouch,
                TorsoLean = 14f + Mathf.Clamp01(Mathf.Abs(speed) / 9f) * 8f,
                Kicking = Scooter.Kicking || (_kickPhase > 0.02f && _kickPhase < 0.98f && state == ScooterState.Riding),
                KickPhase = _kickPhase,
                BarRelease = Tricks.BarRelease,
                FeetLift = Tricks.FeetLift,
                Superman = Tricks.SupermanW,
                NoFooted = Tricks.NoFootedW,
                CanCan = Tricks.CanCanW,
                ManualLean = state == ScooterState.Manual ? Mathf.Sign(manualPitch) * 0.8f : 0f,
                ArmsOut = state == ScooterState.Grinding && Tricks.GrindDef != null && Mathf.Abs(Tricks.Balance.Value) > 0.55f ? 0.25f : 0f,
                Celebrate = state == ScooterState.Riding && Mathf.Abs(speed) < 1.5f ? Mathf.Clamp01(_celebrate * 2f) : 0f, // only when nearly stopped (hands leave the bars)
                LookDir = Vector3.forward,
            };
            Rider.Apply(pose);
        }
    }
}

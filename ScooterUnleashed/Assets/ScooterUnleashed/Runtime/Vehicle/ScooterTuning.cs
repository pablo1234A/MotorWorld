using System;
using ScooterUnleashed.Core.Stats;
using UnityEngine;

namespace ScooterUnleashed.Vehicle
{
    /// <summary>
    /// Every physics constant of the scooter in one serializable place (no magic numbers in the controller).
    /// Values are SI units. ApplyStats() maps the 0..10 workshop stats onto these.
    /// </summary>
    [Serializable]
    public class ScooterTuning
    {
        [Header("Mass & geometry")]
        public float Mass = 78f;                 // rider + scooter
        public float Wheelbase = 0.56f;
        public float WheelRadius = 0.055f;
        public float RideHeight = 0.1f;          // deck origin above ground
        public float ProbeHeight = 0.35f;        // ray origin above the deck origin
        public float ContactSlack = 0.08f;       // extra ray length that still counts as contact
        public Vector3 CenterOfMass = new Vector3(0f, 0.45f, -0.04f);

        [Header("Suspension")]
        public float SpringStiffness = 420f;     // 1/s^2
        public float SpringDamping = 34f;        // 1/s
        public float MaxPullDown = 12f;          // m/s^2 the spring may pull towards the ground

        [Header("Speed")]
        public float PushAcceleration = 3.4f;
        public float CruiseSpeed = 5.6f;         // auto-push target speed
        public float TopPushSpeed = 8.8f;        // you can't kick faster than this on flat ground
        public float MaxSpeed = 18f;
        public float BrakeDeceleration = 6.5f;
        public float AirDrag = 0.0045f;          // per (m/s)^2
        public float Gravity = 12.3f;            // slightly heavier than real for a snappy arcade arc

        [Header("Steering")]
        public float SteerRateLowSpeed = 150f;   // deg/s at walking pace
        public float SteerRateHighSpeed = 70f;   // deg/s at top push speed
        public float SteerResponse = 9f;         // input smoothing
        public float LateralGrip = 14f;
        public float MaxVisualLean = 28f;

        [Header("Ground following")]
        public float ConvexStick = 1.1f;         // how much centripetal accel (in g) still follows a convex edge
        public float GlueSpeed = 3.2f;           // below this speed the scooter always follows the surface (drop-ins)
        public float AlignSharpness = 22f;

        [Header("Jump")]
        public float PopSpeedMin = 3.4f;
        public float PopSpeedMax = 5.2f;
        public float MaxChargeTime = 0.4f;
        public float CoyoteTime = 0.1f;
        public float JumpGroundIgnore = 0.12f;

        [Header("Air")]
        public float SpinRate = 430f;            // deg/s max yaw rotation
        public float FlipRate = 400f;            // deg/s max pitch rotation
        public float SpinAcceleration = 2200f;   // deg/s^2
        public float AirAlignRate = 160f;        // deg/s auto alignment to the predicted landing surface
        public float AirAlignMaxAngle = 75f;     // assist never finishes rotations bigger than this
        public float VertNormalY = 0.35f;        // take-off surfaces steeper than this count as vert

        [Header("Bail & impacts")]
        public float WallBailSpeed = 6.8f;
        public float BailDuration = 2.2f;
        public float RespawnInvulnerability = 0.6f;

        [Header("Trick timing")]
        public float TrickSpeedMultiplier = 1f;

        public ScooterTuning Clone() => (ScooterTuning)MemberwiseClone();

        /// <summary>Applies workshop stats (0..10, 5 = neutral) on top of a base tuning.</summary>
        public static ScooterTuning FromStats(ScooterTuning baseTuning, ScooterStats s, float weightKg)
        {
            var t = baseTuning.Clone();
            float F(float stat, float range) => 1f + (stat - 5f) / 5f * range; // +-range at 0/10
            t.PushAcceleration *= F(s.Acceleration, 0.25f);
            t.CruiseSpeed *= F(s.TopSpeed, 0.08f);
            t.TopPushSpeed *= F(s.TopSpeed, 0.12f);
            t.SpinRate *= F(s.AirControl, 0.18f);
            t.FlipRate *= F(s.AirControl, 0.15f);
            t.AirAlignRate *= F(s.AirControl, 0.25f);
            t.SteerRateLowSpeed *= F(s.Steering, 0.2f);
            t.SteerRateHighSpeed *= F(s.Steering, 0.2f);
            t.LateralGrip *= F(s.Stability, 0.15f);
            t.WallBailSpeed *= F(s.Stability, 0.1f);
            t.TrickSpeedMultiplier *= F(s.TrickSpeed, 0.2f);
            t.Mass = 70f + weightKg;
            return t;
        }
    }
}

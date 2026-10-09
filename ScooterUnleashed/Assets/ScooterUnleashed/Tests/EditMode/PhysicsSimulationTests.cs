using System.Collections.Generic;
using NUnit.Framework;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Vehicle;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Tests
{
    /// <summary>
    /// Drives the real ScooterController with PhysX (Physics.Simulate) in EditMode: acceleration, pop + landing,
    /// quarter pipe transitions and rail grinds. Run from Window > General > Test Runner > EditMode.
    /// </summary>
    public sealed class PhysicsSimulationTests
    {
        private const float Dt = 1f / 60f;
        private readonly List<GameObject> _spawned = new List<GameObject>();
#if UNITY_2022_2_OR_NEWER
        private SimulationMode _prevMode;
#else
        private bool _prevAuto;
#endif

        [SetUp]
        public void SetUp()
        {
#if UNITY_2022_2_OR_NEWER
            _prevMode = Physics.simulationMode;
            Physics.simulationMode = SimulationMode.Script;
#else
            _prevAuto = Physics.autoSimulation;
            Physics.autoSimulation = false;
#endif
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.transform.position = new Vector3(0f, -0.5f, 0f);
            ground.transform.localScale = new Vector3(400f, 1f, 400f);
            _spawned.Add(ground);
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var g in _spawned) if (g != null) Object.DestroyImmediate(g);
            _spawned.Clear();
            foreach (var r in new List<GrindRail>(GrindRail.All)) if (r != null) Object.DestroyImmediate(r.gameObject);
            GrindRail.All.Clear();
#if UNITY_2022_2_OR_NEWER
            Physics.simulationMode = _prevMode;
#else
            Physics.autoSimulation = _prevAuto;
#endif
        }

        private ScooterController SpawnScooter(Vector3 pos, float yaw = 0f)
        {
            var go = new GameObject("TestScooter");
            go.transform.SetPositionAndRotation(pos, Quaternion.Euler(0f, yaw, 0f));
            go.AddComponent<Rigidbody>();
            var s = go.AddComponent<ScooterController>();
            s.Initialize();
            s.AutoPush = false;
            _spawned.Add(go);
            Physics.SyncTransforms();
            return s;
        }

        private static void Run(ScooterController s, float seconds, System.Action<float> perStep = null)
        {
            int steps = Mathf.CeilToInt(seconds / Dt);
            for (int i = 0; i < steps; i++)
            {
                perStep?.Invoke(i * Dt);
                s.PhysicsStep(Dt);
                Physics.Simulate(Dt);
            }
        }

        [Test]
        public void SettlesOnGround_AtRideHeight()
        {
            var s = SpawnScooter(new Vector3(0f, 0.4f, 0f));
            Run(s, 1.5f);
            Assert.AreEqual(ScooterState.Riding, s.State);
            Assert.IsTrue(s.FrontContact && s.RearContact, "both wheels should touch the ground");
            Assert.That(s.transform.position.y, Is.InRange(0.06f, 0.16f));
            Assert.Less(Vector3.Angle(s.transform.up, Vector3.up), 3f);
        }

        [Test]
        public void PushingAccelerates_AndRespectsPushTopSpeed()
        {
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            s.Stick = new Vector2(0f, 1f);
            Run(s, 6f);
            float v = s.Velocity.magnitude;
            Assert.Greater(v, 6f);
            Assert.LessOrEqual(v, s.Tuning.TopPushSpeed * 1.05f);
            Assert.AreEqual(ScooterState.Riding, s.State);
        }

        [Test]
        public void BrakingStops()
        {
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            s.Stick = new Vector2(0f, 1f);
            Run(s, 4f);
            s.Stick = Vector2.zero;
            s.Brake = 1f;
            Run(s, 2.5f);
            Assert.Less(s.Velocity.magnitude, 0.3f);
        }

        [Test]
        public void SteeringTurnsWithoutLosingMuchSpeed()
        {
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            s.Stick = new Vector2(0f, 1f);
            Run(s, 4f);
            float before = s.Velocity.magnitude;
            s.Stick = new Vector2(1f, 0.6f);
            Run(s, 1f);
            float yaw = s.transform.eulerAngles.y;
            Assert.That(Mathf.DeltaAngle(0f, yaw), Is.GreaterThan(40f));
            Assert.Greater(s.Velocity.magnitude, before * 0.8f);
        }

        [Test]
        public void PopLandsCleanly_WithRealisticAirtime()
        {
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            s.Stick = new Vector2(0f, 1f);
            Run(s, 3f);
            s.Stick = Vector2.zero;
            LandingResult? landed = null;
            float air = 0f;
            s.Landed += (p, r) => { landed = r; air = p.AirTime; };
            Assert.IsTrue(s.Pop(1f));
            Assert.AreEqual(ScooterState.Air, s.State);
            Run(s, 1.5f);
            Assert.IsTrue(landed.HasValue, "should land");
            Assert.IsFalse(landed.Value.IsBail, "flat pop must land: " + landed.Value);
            Assert.That(air, Is.InRange(0.5f, 0.85f));
            Assert.AreEqual(ScooterState.Riding, s.State);
        }

        [Test]
        public void NoDoubleJumpInTheAir()
        {
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            Run(s, 0.5f);
            Assert.IsTrue(s.Pop(1f));
            Run(s, 0.2f);
            Assert.IsFalse(s.Pop(1f), "a second pop in the air must be rejected");
        }

        [Test]
        public void HalfSpinInTheAir_IsMeasured()
        {
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            s.Stick = new Vector2(0f, 1f);
            Run(s, 3f);
            s.Stick = Vector2.zero;
            s.Pop(1f);
            s.QueueSpin(180f);
            float yaw = 0f;
            s.Landed += (p, r) => yaw = s.AccumYaw;
            Run(s, 1.5f);
            Assert.That(Mathf.Abs(yaw), Is.InRange(150f, 210f));
        }

        [Test]
        public void QuarterPipe_SendsYouUpAndBack()
        {
            var root = new GameObject("Obstacles");
            _spawned.Add(root);
            var o = new Obstacles(root.transform);
            o.QuarterPipe(new Vector3(0f, 0f, 20f), 0f, 10f, 2.4f, 2.4f, 2f);
            Physics.SyncTransforms();
            var s = SpawnScooter(new Vector3(0f, 0.12f, 0f));
            s.Stick = new Vector2(0f, 1f);
            float maxY = 0f;
            bool bailed = false;
            s.Bailed += (r, v) => bailed = true;
            Run(s, 7f, t => maxY = Mathf.Max(maxY, s.transform.position.y));
            Assert.IsFalse(bailed, "riding straight into a quarter pipe must not bail");
            Assert.Greater(maxY, 1.2f, "should climb the transition");
            Assert.Less(s.transform.position.z, 22f, "should come back down the ramp");
        }

        [Test]
        public void LandingOnARail_Grinds_AndExitsAtTheEnd()
        {
            var root = new GameObject("Rail");
            _spawned.Add(root);
            var o = new Obstacles(root.transform);
            o.FlatRail(new Vector3(0f, 0f, 2f), new Vector3(0f, 0f, 10f), 0.4f);
            Physics.SyncTransforms();
            var s = SpawnScooter(new Vector3(0f, 0.9f, 1f));
            s.Initialize();
            // Throw the scooter along the rail, slightly above it.
            s.PhysicsStep(Dt);
            s.Body.SetVelocity(new Vector3(0f, -0.5f, 5f));
            Run(s, 0.15f); // coyote time elapses → airborne
            Assert.AreEqual(ScooterState.Air, s.State);
            RailHit hit = default;
            int dir = 0;
            bool found = false;
            for (int i = 0; i < 30 && !found; i++)
            {
                found = s.FindGrindCandidate(out hit, out dir);
                if (!found) Run(s, Dt);
            }
            Assert.IsTrue(found, "rail should be capturable when falling onto it");
            s.BeginGrind(hit, dir, 0f);
            Assert.AreEqual(ScooterState.Grinding, s.State);
            bool exited = false;
            s.GrindExited += popped => exited = true;
            Run(s, 3f);
            Assert.IsTrue(exited, "should leave the rail at its end");
            Assert.Greater(s.transform.position.z, 9f);
        }
    }
}

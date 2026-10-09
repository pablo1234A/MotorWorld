using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Rendering;
using ScooterUnleashed.Vehicle;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.FX
{
    /// <summary>
    /// Pooled particle effects: one world-space ParticleSystem per effect type emits wherever needed (no GameObject
    /// churn). Dust on landings/brakes, sparks on metal grinds, a skid trail on hard braking. Counts scale with quality.
    /// </summary>
    public sealed class EffectsManager : MonoBehaviour
    {
        public static EffectsManager Instance { get; private set; }
        public float Density = 1f;

        private ParticleSystem _dust, _sparks;
        private TrailRenderer _skid;
        private ScooterController _scooter;
        private float _sparkAcc;

        private void Awake()
        {
            Instance = this;
            var circle = ProceduralTextures.SoftCircle();
            _dust = MakeSystem("Dust", MaterialLibrary.Particle("DustMat", circle, new Color(0.75f, 0.72f, 0.66f, 0.55f), false), 0.9f, 0.5f, 0.15f, 0.4f, 300);
            var dm = _dust.main;
            dm.startSize = new ParticleSystem.MinMaxCurve(0.25f, 0.6f);
            dm.gravityModifier = -0.02f;
            var col = _dust.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                      new[] { new GradientAlphaKey(0.6f, 0f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            var sz = _dust.sizeOverLifetime;
            sz.enabled = true;
            sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 1.6f));

            _sparks = MakeSystem("Sparks", MaterialLibrary.Particle("SparkMat", circle, new Color(1f, 0.75f, 0.35f, 1f), true), 0.35f, 4f, 0.02f, 0.05f, 400);
            var sm = _sparks.main;
            sm.gravityModifier = 1.2f;
            var r = _sparks.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.04f;
            r.lengthScale = 1f;

            var skidGo = new GameObject("SkidTrail");
            skidGo.transform.SetParent(transform, false);
            _skid = skidGo.AddComponent<TrailRenderer>();
            _skid.time = 6f;
            _skid.minVertexDistance = 0.2f;
            _skid.widthMultiplier = 0.05f;
            _skid.emitting = false;
            _skid.alignment = LineAlignment.TransformZ;
            _skid.sharedMaterial = MaterialLibrary.Particle("SkidMat", circle, new Color(0.05f, 0.05f, 0.05f, 0.5f), false);
            _skid.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private ParticleSystem MakeSystem(string name, Material mat, float life, float speed, float sizeMin, float sizeMax, int max)
        {
            var go = new GameObject("FX_" + name);
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var m = ps.main;
            m.loop = false;
            m.playOnAwake = false;
            m.simulationSpace = ParticleSystemSimulationSpace.World;
            m.startLifetime = new ParticleSystem.MinMaxCurve(life * 0.6f, life);
            m.startSpeed = new ParticleSystem.MinMaxCurve(speed * 0.3f, speed);
            m.startSize = new ParticleSystem.MinMaxCurve(sizeMin, sizeMax);
            m.maxParticles = max;
            var em = ps.emission;
            em.enabled = false;
            var sh = ps.shape;
            sh.enabled = false;
            var rend = go.GetComponent<ParticleSystemRenderer>();
            rend.sharedMaterial = mat;
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            rend.receiveShadows = false;
            ps.Play();
            return ps;
        }

        public void Bind(ScooterController s)
        {
            if (_scooter != null) { _scooter.Landed -= OnLanded; _scooter.Bailed -= OnBailed; }
            _scooter = s;
            if (_scooter != null) { _scooter.Landed += OnLanded; _scooter.Bailed += OnBailed; }
        }

        private void OnLanded(LandingPhysics p, LandingResult r)
        {
            if (p.ImpactSpeed > 2.5f) Dust(_scooter.transform.position + Vector3.down * 0.08f, p.Normal, Mathf.RoundToInt(6 + p.ImpactSpeed * 2f));
        }

        private void OnBailed(BailReason reason, Vector3 v) => Dust(_scooter.transform.position, Vector3.up, 20);

        public void Dust(Vector3 pos, Vector3 normal, int count)
        {
            count = Mathf.RoundToInt(count * Density);
            var ep = new ParticleSystem.EmitParams();
            for (int i = 0; i < count; i++)
            {
                ep.position = pos + Random.insideUnitSphere * 0.15f;
                Vector3 dir = Vector3.ProjectOnPlane(Random.onUnitSphere, normal).normalized + normal * 0.2f;
                ep.velocity = dir * Random.Range(0.6f, 1.8f);
                _dust.Emit(ep, 1);
            }
        }

        public void Sparks(Vector3 pos, Vector3 travel, int count)
        {
            count = Mathf.RoundToInt(count * Density);
            var ep = new ParticleSystem.EmitParams();
            for (int i = 0; i < count; i++)
            {
                ep.position = pos;
                ep.velocity = (-travel.normalized * Random.Range(1.5f, 4f)) + Random.insideUnitSphere * 1.6f + Vector3.up * Random.Range(0.5f, 2f);
                ep.startLifetime = Random.Range(0.15f, 0.4f);
                _sparks.Emit(ep, 1);
            }
        }

        private void Update()
        {
            if (_scooter == null) return;
            var state = _scooter.State;
            float dt = Time.deltaTime;
            if (state == ScooterState.Grinding && _scooter.CurrentRail != null && _scooter.CurrentRail.IsMetal)
            {
                _sparkAcc += dt * Mathf.Clamp(_scooter.Velocity.magnitude * 6f, 10f, 60f);
                int n = Mathf.FloorToInt(_sparkAcc);
                _sparkAcc -= n;
                if (n > 0) Sparks(_scooter.transform.position + Vector3.down * 0.06f - _scooter.transform.forward * 0.2f, _scooter.Velocity, n);
            }
            bool skid = _scooter.Skidding && _scooter.Grounded;
            Vector3 contact = _scooter.transform.position - _scooter.transform.forward * 0.3f - _scooter.transform.up * 0.095f;
            _skid.transform.SetPositionAndRotation(contact, Quaternion.LookRotation(-_scooter.GroundNormal, _scooter.transform.forward));
            _skid.emitting = skid;
            if (skid && Random.value < dt * 12f) Dust(contact, _scooter.GroundNormal, 1);
            if ((state == ScooterState.Riding) && Surface.Properties(_scooter.Surface).Dust && _scooter.Velocity.magnitude > 2f && Random.value < dt * 10f)
                Dust(contact, Vector3.up, 1);
        }
    }
}

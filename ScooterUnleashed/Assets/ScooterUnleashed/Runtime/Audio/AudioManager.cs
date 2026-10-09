using System.Collections.Generic;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Vehicle;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Audio
{
    /// <summary>
    /// Context-aware audio: rolling loop per surface (pitch/volume from speed), metal vs concrete grind loops, wind in
    /// the air, landings scaled by impact and surface, pops, impacts, UI sounds, city ambience and music.
    /// </summary>
    public sealed class AudioManager : MonoBehaviour
    {
        public static AudioManager Instance { get; private set; }

        public float MusicVolume = 0.6f;
        public float SfxVolume = 0.9f;

        private ScooterController _scooter;
        private AudioSource _roll, _grind, _wind, _ambience, _music, _oneShot, _ui;
        private readonly Dictionary<SurfaceType, AudioClip> _rollClips = new Dictionary<SurfaceType, AudioClip>();
        private AudioClip _grindMetal, _grindConcrete, _landHard, _landSoft, _landWood, _pop, _impact, _clank, _bail;
        private AudioClip _uiClick, _uiConfirm, _uiBack, _uiCombo, _uiBail, _uiChallenge;
        private SurfaceType _rollSurface = (SurfaceType)(-1);
        private bool _grindIsMetal;

        private void Awake()
        {
            Instance = this;
            _roll = Src("Roll", true);
            _grind = Src("Grind", true);
            _wind = Src("Wind", true);
            _ambience = Src("Ambience", true);
            _music = Src("Music", true);
            _oneShot = Src("OneShot", false);
            _ui = Src("UI", false);
            _ui.ignoreListenerPause = true;
            _music.ignoreListenerPause = true;

            _rollClips[SurfaceType.Concrete] = AudioSynth.Roll("RollConcrete", 0.4f, 95f, 11);
            _rollClips[SurfaceType.SmoothConcrete] = AudioSynth.Roll("RollSmooth", 0.12f, 120f, 12);
            _rollClips[SurfaceType.Asphalt] = AudioSynth.Roll("RollAsphalt", 0.85f, 70f, 13);
            _rollClips[SurfaceType.Tiles] = AudioSynth.Roll("RollTiles", 0.55f, 105f, 14);
            _rollClips[SurfaceType.Wood] = AudioSynth.Roll("RollWood", 0.3f, 62f, 15);
            _rollClips[SurfaceType.Metal] = AudioSynth.Roll("RollMetal", 0.2f, 180f, 16);
            _rollClips[SurfaceType.Grass] = AudioSynth.Noise("RollGrass", 1.5f, 0.5f, true, 17);
            _rollClips[SurfaceType.Sand] = AudioSynth.Noise("RollSand", 1.5f, 0.6f, true, 18);
            _grindMetal = AudioSynth.Grind("GrindMetal", true, 21);
            _grindConcrete = AudioSynth.Grind("GrindConcrete", false, 22);
            _landHard = AudioSynth.Thump("LandHard", 62f, 14f, 0.9f, 0.45f, 31);
            _landSoft = AudioSynth.Thump("LandSoft", 80f, 22f, 0.5f, 0.3f, 32);
            _landWood = AudioSynth.Thump("LandWood", 120f, 16f, 0.7f, 0.4f, 33);
            _pop = AudioSynth.Thump("Pop", 160f, 40f, 1.2f, 0.18f, 34);
            _impact = AudioSynth.Thump("Impact", 48f, 8f, 1.4f, 0.7f, 35);
            _clank = AudioSynth.Clank("Clank", 36);
            _bail = AudioSynth.Noise("BailScrape", 0.8f, 0.4f, false, 37);
            _uiClick = AudioSynth.Blip("UIClick", 900f, 1300f, 0.05f, 0.2f);
            _uiConfirm = AudioSynth.Blip("UIConfirm", 700f, 1500f, 0.14f, 0.1f);
            _uiBack = AudioSynth.Blip("UIBack", 900f, 500f, 0.1f, 0.1f);
            _uiCombo = AudioSynth.Blip("UICombo", 600f, 1800f, 0.25f, 0.35f);
            _uiBail = AudioSynth.Blip("UIBail", 320f, 140f, 0.3f, 0.5f);
            _uiChallenge = AudioSynth.Blip("UIChallenge", 520f, 2100f, 0.45f, 0.15f);

            _wind.clip = AudioSynth.Noise("Wind", 3f, 0.05f, true, 41);
            _ambience.clip = AudioSynth.Noise("City", 4f, 0.02f, true, 42);
            _music.clip = AudioSynth.MusicLoop(7);
            _wind.volume = 0f; _wind.Play();
            _ambience.volume = 0.12f; _ambience.Play();
            _music.Play();
        }

        private AudioSource Src(string name, bool loop)
        {
            var go = new GameObject("Audio_" + name);
            go.transform.SetParent(transform, false);
            var s = go.AddComponent<AudioSource>();
            s.loop = loop;
            s.playOnAwake = false;
            s.spatialBlend = 0f;
            s.dopplerLevel = 0f;
            return s;
        }

        public void Bind(ScooterController scooter)
        {
            if (_scooter != null)
            {
                _scooter.Landed -= OnLanded;
                _scooter.TookOff -= OnTookOff;
                _scooter.Bailed -= OnBailed;
                _scooter.Impact -= OnImpact;
            }
            _scooter = scooter;
            if (_scooter == null) return;
            _scooter.Landed += OnLanded;
            _scooter.TookOff += OnTookOff;
            _scooter.Bailed += OnBailed;
            _scooter.Impact += OnImpact;
        }

        private void OnTookOff(bool popped) { if (popped) PlayOneShot(_pop, 0.6f, Random.Range(0.95f, 1.08f)); }

        private void OnLanded(LandingPhysics p, LandingResult r)
        {
            if (r.IsBail) return;
            var clip = _scooter.Surface == SurfaceType.Wood ? _landWood : (p.ImpactSpeed > 5f ? _landHard : _landSoft);
            PlayOneShot(clip, Mathf.Clamp01(0.3f + p.ImpactSpeed / 9f), Random.Range(0.92f, 1.06f));
        }

        private void OnImpact(float speed) { if (speed > 4f) PlayOneShot(_impact, Mathf.Clamp01(speed / 10f), 1f); }

        private void OnBailed(BailReason reason, Vector3 v)
        {
            PlayOneShot(_impact, 0.9f, 0.9f);
            PlayOneShot(_bail, 0.6f, 1f);
            PlayOneShot(_clank, 0.5f, Random.Range(0.9f, 1.1f));
        }

        public void PlayOneShot(AudioClip clip, float volume, float pitch)
        {
            if (clip == null) return;
            _oneShot.pitch = pitch;
            _oneShot.PlayOneShot(clip, volume * SfxVolume);
        }

        public enum Ui { Click, Confirm, Back, Combo, Bail, Challenge }

        public static void PlayUi(Ui kind)
        {
            var a = Instance;
            if (a == null) return;
            AudioClip c = kind switch
            {
                Ui.Click => a._uiClick,
                Ui.Confirm => a._uiConfirm,
                Ui.Back => a._uiBack,
                Ui.Combo => a._uiCombo,
                Ui.Bail => a._uiBail,
                _ => a._uiChallenge,
            };
            a._ui.PlayOneShot(c, 0.5f * a.SfxVolume);
        }

        public void GrindClank(bool metal) => PlayOneShot(metal ? _clank : _landSoft, 0.7f, Random.Range(0.95f, 1.1f));

        private void Update()
        {
            _music.volume = MusicVolume * 0.5f;
            _ambience.volume = 0.12f * SfxVolume;
            if (_scooter == null) { _roll.volume = _grind.volume = _wind.volume = 0f; return; }
            float dt = Time.deltaTime;
            var state = _scooter.State;
            float speed = _scooter.Velocity.magnitude;

            // Rolling
            bool rolling = (state == ScooterState.Riding || state == ScooterState.Manual) && _scooter.Grounded;
            if (rolling && _scooter.Surface != _rollSurface)
            {
                _rollSurface = _scooter.Surface;
                _roll.clip = _rollClips.TryGetValue(_rollSurface, out var c) ? c : _rollClips[SurfaceType.Concrete];
                _roll.Play();
            }
            var props = Surface.Properties(_scooter.Surface);
            float rollTarget = rolling ? Mathf.Clamp01(speed / 9f) * 0.55f * SfxVolume : 0f;
            if (_scooter.Skidding) rollTarget *= 1.3f;
            _roll.volume = Mathf.MoveTowards(_roll.volume, rollTarget, dt * 4f);
            _roll.pitch = props.AudioPitch * Mathf.Lerp(0.75f, 1.35f, speed / 12f) * (state == ScooterState.Manual ? 1.1f : 1f);
            if (!_roll.isPlaying && _roll.clip != null) _roll.Play();

            // Grinding
            bool grinding = state == ScooterState.Grinding && _scooter.CurrentRail != null;
            if (grinding)
            {
                bool metal = _scooter.CurrentRail.IsMetal;
                if (!_grind.isPlaying || metal != _grindIsMetal)
                {
                    _grindIsMetal = metal;
                    _grind.clip = metal ? _grindMetal : _grindConcrete;
                    _grind.Play();
                    GrindClank(metal);
                }
            }
            _grind.volume = Mathf.MoveTowards(_grind.volume, grinding ? 0.55f * SfxVolume : 0f, dt * 8f);
            _grind.pitch = Mathf.Lerp(0.85f, 1.25f, speed / 10f);
            if (!grinding && _grind.volume <= 0.001f && _grind.isPlaying) _grind.Stop();

            // Wind
            float windTarget = (state == ScooterState.Air ? 0.25f + Mathf.Clamp01(speed / 14f) * 0.5f : Mathf.Clamp01((speed - 6f) / 10f) * 0.25f) * SfxVolume;
            _wind.volume = Mathf.MoveTowards(_wind.volume, windTarget, dt * 2f);
            _wind.pitch = Mathf.Lerp(0.7f, 1.3f, speed / 15f);
        }
    }
}

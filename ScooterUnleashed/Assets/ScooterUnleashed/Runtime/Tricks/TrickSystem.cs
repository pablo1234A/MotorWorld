using System;
using System.Collections.Generic;
using ScooterUnleashed.Core.Input;
using ScooterUnleashed.Core.Physics;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Core.Tricks;
using ScooterUnleashed.Vehicle;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Tricks
{
    /// <summary>
    /// Turns gestures into tricks and keeps score. Rules:
    /// <list type="bullet">
    /// <item>Ground: hold = crouch, release = pop (charge = hold time). Swipe down/up = manual / nose manual.</item>
    /// <item>Air: swipe = scooter trick (uses bars/deck), hold + swipe = body trick held until release,
    /// circle = 180° of rotation per half circle, left stick = spin/flip.</item>
    /// <item>Grind: GRIND button (or auto-grind) near a rail; stick chooses the grind; swipes switch grinds; release pops off.</item>
    /// </list>
    /// Tricks occupy channels (bars, deck, legs) so only physically compatible tricks overlap; one-shot tricks must finish
    /// before touchdown; rotations are read from the real orientation; landings are judged by <see cref="LandingEvaluator"/>.
    /// </summary>
    public sealed class TrickSystem : MonoBehaviour, ILandingJudge
    {
        private sealed class ActiveTrick
        {
            public TrickDefinition Def;
            public float Elapsed;
            public float Duration;
            public int Count = 1;
            public int Dir = 1;
            public bool Done;
            public float Progress => Mathf.Clamp01(Elapsed / (Duration * Count));
        }

        public ScooterController Scooter;
        public TrickCatalog Catalog;
        public ScoreRules Rules = new ScoreRules();
        public LandingTolerances Tolerances = new LandingTolerances();
        public ComboTracker Combo { get; private set; }
        public SessionStats Session { get; private set; } = new SessionStats();
        public BalanceMeter Balance { get; private set; }

        [NonSerialized] public bool AutoGrind = true;
        [NonSerialized] public float LandingAssist = 1f;  // >1 widens landing windows
        [NonSerialized] public float BalanceAssist = 1f;  // <1 calms balance
        [NonSerialized] public bool InputEnabled = true;

        // ---- Visual outputs (read by the animator) ----------------------------------------------
        public float BarAngle { get; private set; }
        public float DeckYaw { get; private set; }
        public float DeckPitch { get; private set; }
        public float FeetLift { get; private set; }
        public float BarRelease { get; private set; }
        public float SupermanW { get; private set; }
        public float NoFootedW { get; private set; }
        public float CanCanW { get; private set; }
        public int CanCanSide { get; private set; } = 1;
        public float Crouch { get; private set; }
        public bool IsCrouching => _crouching;
        public float CrouchCharge01 => _crouching ? Mathf.Clamp01((Time.time - _crouchStart) / Scooter.Tuning.MaxChargeTime) : 0f;
        public bool IsHoldReady { get; private set; }
        public TrickDefinition ManualDef => _manualDef;
        public TrickDefinition GrindDef => _grindDef;
        public bool GrindAvailable { get; private set; }
        public string ActiveTrickName => _active.Count > 0 ? _active[_active.Count - 1].Def.DisplayName : (_held != null ? _held.Def.DisplayName : (_grindDef?.DisplayName ?? _manualDef?.DisplayName));

        // ---- Events -----------------------------------------------------------------------------
        public event Action<string, int> TrickPerformed;                 // name, points
        public event Action<TrickDefinition> TrickStarted;
        public event Action<LandingResult, LandingPhysics> LandingJudged;
        public event Action<ComboResult> ComboBanked;
        public event Action<BailReason, int> BailHappened;
        public event Action<TrickDefinition> GrindStarted;
        public event Action<TrickDefinition, float> GrindEnded;
        public event Action<TrickDefinition> ManualStarted;
        public event Action<TrickDefinition, float> ManualEnded;
        public event Action<string> Feedback;                            // short centre-screen messages

        private readonly List<ActiveTrick> _active = new List<ActiveTrick>();
        private ActiveTrick _held;
        private float _heldReleaseTime = -10f;
        private bool _heldAwarded;
        private bool _crouching;
        private float _crouchStart;
        private TrickDefinition _manualDef;
        private float _manualTime;
        private TrickDefinition _grindDef;
        private float _grindRequestTime = -10f;
        private int _airTricks;
        private ScooterState _lastState;

        private void Awake()
        {
            Combo = new ComboTracker(Rules);
            Balance = new BalanceMeter(new BalanceSettings(), (uint)Environment.TickCount);
            if (Catalog == null) Catalog = TrickCatalog.CreateDefault();
        }

        private void OnEnable()
        {
            if (Scooter == null) return;
            Scooter.Judge = this;
            Scooter.TookOff += OnTookOff;
            Scooter.Bailed += OnBailed;
            Scooter.GrindExited += OnGrindExited;
            Scooter.Respawned += OnRespawned;
            Scooter.AutoReverted += OnAutoReverted;
        }

        private void OnDisable()
        {
            if (Scooter == null) return;
            Scooter.TookOff -= OnTookOff;
            Scooter.Bailed -= OnBailed;
            Scooter.GrindExited -= OnGrindExited;
            Scooter.Respawned -= OnRespawned;
            Scooter.AutoReverted -= OnAutoReverted;
        }

        private void OnAutoReverted()
        {
            // A revert keeps a line alive (e.g. fakie out of a quarter pipe).
            if (Combo.IsActive) AddTrick(TrickIds.Revert);
        }

        // ==========================================================================================
        // Input
        // ==========================================================================================
        public void RequestGrind() { _grindRequestTime = Time.time; }

        public void HandleGesture(in GestureEvent e)
        {
            if (!InputEnabled || Scooter == null) return;
            var state = Scooter.State;
            if (state == ScooterState.Bailed)
            {
                if (e.Kind == GestureKind.Press) Scooter.SkipBail();
                return;
            }
            if (state == ScooterState.Frozen) return;

            switch (e.Kind)
            {
                case GestureKind.Press:
                    _crouching = true;
                    _crouchStart = Time.time;
                    IsHoldReady = false;
                    break;

                case GestureKind.HoldStart:
                    IsHoldReady = state == ScooterState.Air;
                    break;

                case GestureKind.Release:
                    IsHoldReady = false;
                    if (_held != null) EndHeld();
                    if (_crouching && !e.Consumed)
                    {
                        float charge = Mathf.Clamp01(e.Duration / Scooter.Tuning.MaxChargeTime);
                        if (state == ScooterState.Manual) EndManual(true);
                        if (Scooter.Pop(charge)) _airTricks = 0;
                    }
                    _crouching = false;
                    break;

                case GestureKind.Swipe:
                    _crouching = false;
                    if (state == ScooterState.Air) StartAirTrick(e.Direction);
                    else if (state == ScooterState.Riding) TryStartManual(e.Direction);
                    else if (state == ScooterState.Manual) SwitchOrEndManual(e.Direction);
                    else if (state == ScooterState.Grinding) SwitchGrind(e.Direction);
                    break;

                case GestureKind.HoldSwipe:
                    _crouching = false;
                    if (state == ScooterState.Air) StartHeld(e.Direction);
                    break;

                case GestureKind.Circle:
                    _crouching = false;
                    if (state == ScooterState.Air) Scooter.QueueSpin(-e.CircleSign * 180f);
                    break;
            }
        }

        // ==========================================================================================
        // Air tricks
        // ==========================================================================================
        private TrickChannel BusyChannels()
        {
            TrickChannel c = TrickChannel.None;
            foreach (var a in _active) if (!a.Done) c |= a.Def.Channels;
            if (_held != null) c |= _held.Def.Channels;
            return c;
        }

        private float ExecTime(TrickDefinition d) => d.ExecutionTime / Mathf.Max(0.5f, Scooter.Tuning.TrickSpeedMultiplier);

        private void StartAirTrick(Dir8 dir)
        {
            var def = Catalog.FindByGesture(TrickContext.Air, GestureKind.Swipe, dir);
            if (def == null) return;
            int sign = Dir8Util.HorizontalSign(dir) == 0 ? 1 : Dir8Util.HorizontalSign(dir);
            // Same trick still running in the same direction: chain it (double barspin, double whip).
            foreach (var a in _active)
            {
                if (!a.Done && a.Def == def && a.Dir == sign && a.Count < 3 && def.Id != TrickIds.XUp)
                {
                    a.Count++;
                    Feedback?.Invoke((a.Count == 2 ? "Double " : "Triple ") + def.DisplayName);
                    return;
                }
            }
            if ((BusyChannels() & def.Channels) != 0) return;
            _active.Add(new ActiveTrick { Def = def, Duration = ExecTime(def), Dir = sign });
            _airTricks++;
            TrickStarted?.Invoke(def);
        }

        private void StartHeld(Dir8 dir)
        {
            var def = Catalog.FindByGesture(TrickContext.Air, GestureKind.HoldSwipe, dir);
            if (def == null || _held != null) return;
            if ((BusyChannels() & def.Channels) != 0) return;
            _held = new ActiveTrick { Def = def, Dir = Dir8Util.HorizontalSign(dir) == 0 ? 1 : Dir8Util.HorizontalSign(dir) };
            if (def.Id == TrickIds.CanCan) CanCanSide = _held.Dir;
            _heldAwarded = false;
            _airTricks++;
            TrickStarted?.Invoke(def);
        }

        private void EndHeld()
        {
            _held = null;
            _heldReleaseTime = Time.time;
        }

        private void AwardOneShot(ActiveTrick a)
        {
            a.Done = true;
            string name = a.Count == 1 ? a.Def.DisplayName : (a.Count == 2 ? "Double " : "Triple ") + a.Def.DisplayName;
            float bonus = a.Def.BaseScore * (a.Count - 1) * 1.3f;
            float pts = Combo.AddTrick(a.Def, name, bonus);
            TrickPerformed?.Invoke(name, Mathf.RoundToInt(pts));
        }

        private float PendingCompletion(out float landable)
        {
            float min = 1f;
            landable = 0f;
            foreach (var a in _active)
            {
                if (a.Done) continue;
                if (a.Progress < min) { min = a.Progress; landable = a.Def.LandableCompletion; }
            }
            return min;
        }

        private void ClearAirTricks()
        {
            _active.Clear();
            _held = null;
            _airTricks = 0;
        }

        // ==========================================================================================
        // Landing (called by the scooter at touchdown)
        // ==========================================================================================
        public LandingResult JudgeLanding(in LandingPhysics phys)
        {
            float completion = PendingCompletion(out float landable);
            bool holding = _held != null && SupermanW + NoFootedW + CanCanW > 0.45f;
            var input = new LandingInput
            {
                UpAngleDeg = phys.UpAngle,
                HeadingErrorDeg = phys.HeadingError,
                ImpactSpeed = phys.ImpactSpeed,
                GroundSpeed = phys.GroundSpeed,
                PendingTrickCompletion = completion,
                PendingTrickLandable = landable,
                HoldingBodyTrick = holding,
            };
            var res = LandingEvaluator.Evaluate(input, Tolerances.Scaled(LandingAssist));
            if (!res.IsBail)
            {
                int before = Combo.TrickCount;
                ResolveAirSegment(phys.AirTime, phys.Height);
                bool meaningful = Combo.TrickCount > before || phys.AirTime > 0.6f;
                Combo.Land(res.Quality);
                if (res.Fakie) AddTrick(TrickIds.Revert);
                // Only grade landings that matter (no "PERFECT" spam for every bump).
                if (meaningful) Feedback?.Invoke(LandingText(res));
            }
            LandingJudged?.Invoke(res, phys);
            ClearAirTricks();
            return res;
        }

        /// <summary>Awards everything earned in the air (pending tricks, rotations, pop, airtime).</summary>
        private void ResolveAirSegment(float airTime, float height)
        {
            foreach (var a in _active) if (!a.Done) AwardOneShot(a);
            var rot = RotationResolver.Resolve(Scooter.AccumYaw, Scooter.AccumPitch);
            int flips = Mathf.Abs(rot.Flips);
            if (rot.FlipTrickId != null)
            {
                var def = Catalog.Get(rot.FlipTrickId);
                string name = rot.FlipTrickId == TrickIds.Flair ? (flips > 1 ? rot.DisplayName : "Flair") : (flips > 1 ? (flips == 2 ? "Double " : "Triple ") + def.DisplayName : def.DisplayName);
                float pts = Combo.AddTrick(def, name, def.BaseScore * (flips - 1) * 1.5f);
                TrickPerformed?.Invoke(name, Mathf.RoundToInt(pts));
            }
            if (rot.SpinTrickId != null) AddTrick(rot.SpinTrickId);
            if (Scooter.PoppedThisAir && _airTricks == 0 && rot.SpinTrickId == null && rot.FlipTrickId == null) AddTrick(TrickIds.BunnyHop);
            float bonus = Combo.AddAirBonus(airTime, height);
            if (bonus > 0f && airTime > 1.2f) TrickPerformed?.Invoke($"Air {airTime:0.0}s", Mathf.RoundToInt(bonus));
            Session.RegisterAir(airTime, height);
        }

        private void AddTrick(string id)
        {
            var def = Catalog.Get(id);
            if (def == null) return;
            float pts = Combo.AddTrick(def);
            TrickPerformed?.Invoke(def.DisplayName, Mathf.RoundToInt(pts));
        }

        private static string LandingText(LandingResult r)
        {
            switch (r.Quality)
            {
                case LandingQuality.Perfect: return r.Fakie ? "FAKIE" : "PERFECTO";
                case LandingQuality.Sketchy: return "JUSTO";
                default: return r.Fakie ? "FAKIE" : "";
            }
        }

        // ==========================================================================================
        // Manuals
        // ==========================================================================================
        private void TryStartManual(Dir8 dir)
        {
            var c = Dir8Util.ToCardinal(dir);
            if (c != Dir8.Down && c != Dir8.Up) return;
            float speed = Mathf.Abs(Scooter.ForwardSpeed);
            var def = Catalog.FindByGesture(TrickContext.Ground, GestureKind.Swipe, c);
            if (def == null) return;
            if (speed < def.MinSpeed)
            {
                if (c == Dir8.Down && speed > 0.6f) def = Catalog.Get(TrickIds.Wheelie);
                else return;
            }
            StartManual(def);
        }

        private void StartManual(TrickDefinition def)
        {
            _manualDef = def;
            _manualTime = 0f;
            Scooter.EnterManual();
            Combo.CloseSegment();
            float pts = Combo.AddTrick(def);
            TrickPerformed?.Invoke(def.DisplayName, Mathf.RoundToInt(pts));
            Balance.Assist = BalanceAssist;
            Balance.Begin(def.Id == TrickIds.NoseManual ? 1.15f : 0.95f, def.Id == TrickIds.NoseManual ? -0.15f : 0.15f);
            ManualStarted?.Invoke(def);
        }

        private void SwitchOrEndManual(Dir8 dir)
        {
            var c = Dir8Util.ToCardinal(dir);
            if (_manualDef == null) return;
            bool isNose = _manualDef.Id == TrickIds.NoseManual;
            if ((c == Dir8.Down && !isNose) || (c == Dir8.Up && isNose)) { EndManual(false); return; }
            if (c == Dir8.Up || c == Dir8.Down)
            {
                // Manual <-> nose manual switch counts as a new trick in the line.
                EndManual(true);
                var next = Catalog.Get(isNose ? TrickIds.Manual : TrickIds.NoseManual);
                StartManual(next);
            }
        }

        private void EndManual(bool keepState)
        {
            if (_manualDef == null) return;
            var def = _manualDef;
            _manualDef = null;
            Balance.End();
            Session.RegisterManual(_manualTime);
            ManualEnded?.Invoke(def, _manualTime);
            if (!keepState || Scooter.State == ScooterState.Manual) Scooter.ExitManual();
        }

        // ==========================================================================================
        // Grinds
        // ==========================================================================================
        private void TryStartGrind()
        {
            bool wants = AutoGrind || Time.time - _grindRequestTime < 0.35f;
            if (!wants) return;
            if (!Scooter.FindGrindCandidate(out RailHit hit, out int dir)) return;

            // Anything still spinning under the feet must be (nearly) finished before locking on.
            float completion = PendingCompletion(out float landable);
            if (completion < landable || _held != null && SupermanW + NoFootedW + CanCanW > 0.45f) { Scooter.Bail(BailReason.TrickUnfinished); return; }

            Vector3 tangent = hit.Tangent * dir;
            Vector3 fwd = Vector3.ProjectOnPlane(Scooter.transform.forward, Vector3.up).normalized;
            Vector3 tFlat = Vector3.ProjectOnPlane(tangent, Vector3.up).normalized;
            float angle = Vector3.Angle(fwd, tFlat);
            if (angle > 90f) angle = 180f - angle;
            float side = Mathf.Sign(Vector3.Cross(tFlat, fwd).y);
            Vector2 s = Scooter.Stick;
            string id;
            float slide;
            if (angle > 50f)
            {
                id = s.y < -0.4f ? TrickIds.Lipslide : TrickIds.Boardslide;
                slide = 90f * (side == 0 ? 1f : side);
            }
            else if (s.y > 0.5f) { id = TrickIds.Crooked; slide = 10f; }
            else if (s.y < -0.5f) { id = TrickIds.Feeble; slide = -14f; }
            else if (Mathf.Abs(s.x) > 0.5f) { id = TrickIds.Smith; slide = 14f * Mathf.Sign(s.x); }
            else
            {
                bool ledgeLike = hit.Rail.Kind == RailKind.Ledge || hit.Rail.Kind == RailKind.Curb;
                id = ledgeLike ? TrickIds.LedgeBalance : TrickIds.DoublePeg;
                slide = 0f;
            }
            ResolveAirSegment(Scooter.AirTime, Scooter.AirHeight);
            Combo.Land(LandingQuality.Clean);
            ClearAirTricks();

            Scooter.BeginGrind(hit, dir, slide);
            _grindDef = Catalog.Get(id);
            float pts = Combo.AddTrick(_grindDef);
            TrickPerformed?.Invoke(_grindDef.DisplayName, Mathf.RoundToInt(pts));
            Balance.Assist = BalanceAssist;
            Balance.Begin(Mathf.Lerp(0.85f, 1.25f, (_grindDef.Difficulty - 1f) / 2f));
            GrindStarted?.Invoke(_grindDef);
        }

        private void SwitchGrind(Dir8 dir)
        {
            if (_grindDef == null) return;
            var c = Dir8Util.ToCardinal(dir);
            string id = c == Dir8.Up ? TrickIds.Crooked : c == Dir8.Down ? TrickIds.Feeble : TrickIds.Smith;
            if (id == _grindDef.Id) return;
            _grindDef = Catalog.Get(id);
            float pts = Combo.AddTrick(_grindDef, _grindDef.DisplayName + " (cambio)");
            TrickPerformed?.Invoke(_grindDef.DisplayName, Mathf.RoundToInt(pts));
        }

        private void OnGrindExited(bool popped)
        {
            if (_grindDef == null) return;
            var def = _grindDef;
            _grindDef = null;
            Balance.End();
            Session.RegisterGrind(Scooter.GrindTime);
            GrindEnded?.Invoke(def, Scooter.GrindTime);
            Combo.CloseSegment();
        }

        // ==========================================================================================
        // Scooter events
        // ==========================================================================================
        private void OnTookOff(bool popped)
        {
            if (_manualDef != null) EndManual(true);
            _active.Clear();
            _held = null;
            if (!popped) _airTricks = 0;
            Combo.CloseSegment();
        }

        private void OnBailed(BailReason reason, Vector3 velocity)
        {
            int lost = Combo.Bail();
            Session.RegisterBail(lost);
            if (_grindDef != null) { GrindEnded?.Invoke(_grindDef, Scooter.GrindTime); _grindDef = null; }
            if (_manualDef != null) { _manualDef = null; }
            Balance.End();
            ClearAirTricks();
            _crouching = false;
            BailHappened?.Invoke(reason, lost);
        }

        private void OnRespawned()
        {
            ClearAirTricks();
            _crouching = false;
        }

        // ==========================================================================================
        // Per-frame update
        // ==========================================================================================
        private void Update()
        {
            if (Scooter == null) return;
            float dt = Time.deltaTime;
            var state = Scooter.State;

            // Manual ended by physics (rolled off an edge / bailed).
            if (_manualDef != null && state != ScooterState.Manual) EndManual(true);

            switch (state)
            {
                case ScooterState.Air:
                    for (int i = 0; i < _active.Count; i++)
                    {
                        var a = _active[i];
                        if (a.Done) continue;
                        a.Elapsed += dt;
                        if (a.Elapsed >= a.Duration * a.Count) AwardOneShot(a);
                    }
                    if (_held != null)
                    {
                        _held.Elapsed += dt;
                        if (!_heldAwarded && _held.Elapsed >= _held.Def.MinHoldTime)
                        {
                            _heldAwarded = true;
                            float pts = Combo.AddTrick(_held.Def);
                            TrickPerformed?.Invoke(_held.Def.DisplayName, Mathf.RoundToInt(pts));
                        }
                        if (_heldAwarded) Combo.AddContinuous(_held.Def, dt);
                    }
                    GrindAvailable = GrindRail.FindNearest(Scooter.transform.position, 3f, out _);
                    TryStartGrind();
                    break;

                case ScooterState.Grinding:
                    GrindAvailable = false;
                    if (_grindDef != null)
                    {
                        Balance.Skill = 5f;
                        Balance.Step(dt, Scooter.Stick.x);
                        Combo.AddContinuous(_grindDef, dt);
                        if (Balance.Failed) Scooter.Bail(BailReason.LostBalance);
                    }
                    break;

                case ScooterState.Manual:
                    GrindAvailable = false;
                    if (_manualDef != null)
                    {
                        _manualTime += dt;
                        Balance.Step(dt, -Scooter.Stick.y);
                        Combo.AddContinuous(_manualDef, dt);
                        bool nose = _manualDef.Id == TrickIds.NoseManual;
                        Scooter.ManualPitch = (nose ? -11f : 15f) + Balance.Value * 9f;
                        if (Balance.Failed) Scooter.Bail(BailReason.LostBalance);
                        else if (Mathf.Abs(Scooter.ForwardSpeed) < 0.5f) EndManual(false);
                    }
                    break;

                default:
                    GrindAvailable = false;
                    break;
            }

            // Combo link window
            bool linking = state == ScooterState.Air || state == ScooterState.Grinding || state == ScooterState.Manual;
            var banked = Combo.Update(dt, linking);
            if (banked.Banked)
            {
                Session.RegisterCombo(banked);
                if (banked.TrickIds != null) foreach (var id in banked.TrickIds) Session.RegisterTrick(id);
                ComboBanked?.Invoke(banked);
            }
            Session.RegisterSpeed(Scooter.Velocity.magnitude);
            if (state == ScooterState.Riding || state == ScooterState.Manual || state == ScooterState.Grinding)
                Session.AddDistance(Scooter.Velocity.magnitude * dt);

            UpdateVisuals(dt);
            _lastState = state;
        }

        private void UpdateVisuals(float dt)
        {
            float bar = 0f, deckYaw = 0f, deckPitch = 0f, feet = 0f, release = 0f;
            foreach (var a in _active)
            {
                float p = a.Progress;
                float ends = Mathf.Clamp01(Mathf.Min(p, 1f - p) * 7f); // ramps in/out
                switch (a.Def.Id)
                {
                    case TrickIds.Barspin: bar += 360f * a.Count * a.Dir * Smooth(p); release = Mathf.Max(release, ends); break;
                    case TrickIds.XUp: bar += 180f * Mathf.Sin(Mathf.PI * p); break;
                    case TrickIds.Tailwhip: deckYaw += 360f * a.Count * a.Dir * Smooth(p); feet = Mathf.Max(feet, ends); break;
                    case TrickIds.BriFlip: deckPitch += 360f * a.Count * Smooth(p); feet = Mathf.Max(feet, ends); break;
                }
            }
            BarAngle = bar;
            DeckYaw = deckYaw;
            DeckPitch = deckPitch;
            FeetLift = Mathf.Lerp(FeetLift, feet, 1f - Mathf.Exp(-30f * dt));
            BarRelease = Mathf.Lerp(BarRelease, release, 1f - Mathf.Exp(-30f * dt));

            string held = _held?.Def.Id;
            SupermanW = Approach(SupermanW, held == TrickIds.Superman ? 1f : 0f, dt);
            NoFootedW = Approach(NoFootedW, held == TrickIds.NoFooted ? 1f : 0f, dt);
            CanCanW = Approach(CanCanW, held == TrickIds.CanCan ? 1f : 0f, dt);

            float targetCrouch = _crouching ? Mathf.Lerp(0.35f, 0.9f, CrouchCharge01) : 0f;
            if (Scooter.State == ScooterState.Air) targetCrouch = Mathf.Max(targetCrouch, 0.35f);
            if (Scooter.State == ScooterState.Grinding) targetCrouch = Mathf.Max(targetCrouch, 0.45f);
            targetCrouch = Mathf.Max(targetCrouch, Scooter.Compression);
            Crouch = Mathf.Lerp(Crouch, targetCrouch, 1f - Mathf.Exp(-14f * dt));
            Scooter.ChargeCrouch = Crouch;
        }

        private static float Smooth(float t) => t * t * (3f - 2f * t);
        private static float Approach(float v, float target, float dt) => Mathf.MoveTowards(v, target, dt / 0.14f);

        public void ResetSession()
        {
            Combo.Reset();
            Session.Reset();
            ClearAirTricks();
        }
    }
}

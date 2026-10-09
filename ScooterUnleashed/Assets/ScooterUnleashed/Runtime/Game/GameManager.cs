using System;
using System.Collections;
using System.Collections.Generic;
using ScooterUnleashed.Audio;
using ScooterUnleashed.CameraSystem;
using ScooterUnleashed.Character;
using ScooterUnleashed.Controls;
using ScooterUnleashed.Core.Modes;
using ScooterUnleashed.Core.Network;
using ScooterUnleashed.Core.Progression;
using ScooterUnleashed.Core.Save;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Core.Stats;
using ScooterUnleashed.Core.Tricks;
using ScooterUnleashed.FX;
using ScooterUnleashed.Rendering;
using ScooterUnleashed.Tricks;
using ScooterUnleashed.UI;
using ScooterUnleashed.Vehicle;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Game
{
    public enum GameState { Loading, MainMenu, Playing, Paused, Results }

    /// <summary>
    /// Composition root and game flow: boots the world, player and services; owns modes, progression, economy,
    /// challenges, discovery, fast travel and persistence. UI reads state from here and calls its public actions.
    /// </summary>
    public sealed class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        public const float FreestyleDuration = 180f;
        public const float BestLineDuration = 120f;

        // Data
        public TrickCatalog TrickCatalog { get; private set; }
        public PartCatalog Parts { get; private set; }
        public ChallengeTracker Challenges { get; private set; }
        public SaveSystem SaveSys { get; private set; }
        public SaveData Save => SaveSys?.Data;
        public INetworkService Network { get; private set; }

        // Scene
        public ScooterController Scooter { get; private set; }
        public TrickSystem Tricks { get; private set; }
        public ScooterVisual Visual { get; private set; }
        public RiderRig Rider { get; private set; }
        public PlayerInput PlayerInput { get; private set; }
        public CameraRig CameraRig { get; private set; }
        public LightingRig Lighting { get; private set; }
        public DynamicResolution DynRes { get; private set; }
        private Transform _riderHost;

        // Flow
        public GameState State { get; private set; } = GameState.Loading;
        public GameModeId Mode { get; private set; } = GameModeId.FreeRoam;
        public string LoadingText { get; private set; } = "Cargando";
        public float LoadingProgress { get; private set; }
        public float ModeTimeLeft { get; private set; }
        public DuelController Duel { get; private set; }
        public TutorialDirector Tutorial { get; private set; }
        public ResultsData LastResults { get; private set; }
        public readonly ToastQueue Toasts = new ToastQueue();
        public string NearbyEnter { get; private set; }
        public string CurrentZoneName { get; private set; } = "";
        public bool Showcase { get; private set; }
        public string FatalError { get; private set; }

        public event Action<string> ScreenRequest; // UI listens (e.g. "workshop", "map")

        private float _autosave = 60f;
        private float _discoveryTimer;
        private string _zoneId;
        private int _sessionXp, _sessionCredits, _sessionLevels;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            Application.targetFrameRate = 60;
            Time.fixedDeltaTime = 1f / 60f; // physics at 60 Hz: stable suspension and grinds on mobile
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Input.multiTouchEnabled = true;
        }

        private void Start() => StartCoroutine(Boot());

        private IEnumerator Boot()
        {
            gameObject.AddComponent<UIRoot>();
            LoadingText = "Preparando materiales"; LoadingProgress = 0.05f;
            yield return null;
            try
            {
                MaterialLibrary.Init();
                var lightGo = new GameObject("Lighting");
                Lighting = lightGo.AddComponent<LightingRig>();
                Lighting.Build();
            }
            catch (Exception e) { Fail("Materiales", e); yield break; }

            LoadingText = "Construyendo Puerto Rueda"; LoadingProgress = 0.2f;
            yield return null;
            try { WorldBuilder.Build(); }
            catch (Exception e) { Fail("Mundo", e); yield break; }

            LoadingText = "Cargando perfil"; LoadingProgress = 0.7f;
            yield return null;
            try
            {
                TrickCatalog = TrickCatalog.CreateDefault();
                Data.GameDatabase.ApplyOverrides(TrickCatalog);
                Parts = PartCatalog.CreateDefault();
                Data.GameDatabase.ApplyOverrides(Parts);
                SaveSys = new SaveSystem(new FileSaveStorage(), new UnityJsonSerializer(), Parts);
                SaveSys.Load();
                if (SaveSys.LastError != null) Toasts.Push("Aviso de guardado", SaveSys.LastError, UIKit.Bad, 6f);
                Challenges = new ChallengeTracker(ChallengeTracker.CreateDefault(), Save.CompletedChallenges);
                Challenges.Completed += OnChallengeCompleted;
                Network = new OfflineNetworkService(new PlayerIdentity { PlayerId = Save.Profile.PlayerId, DisplayName = Save.Profile.DisplayName, Level = Save.Profile.Level });
            }
            catch (Exception e) { Fail("Perfil", e); yield break; }

            LoadingText = "Montando la scooter"; LoadingProgress = 0.85f;
            yield return null;
            try
            {
                CreatePlayer();
                CreateServices();
                ApplySettings();
            }
            catch (Exception e) { Fail("Jugador", e); yield break; }

            LoadingProgress = 1f;
            yield return null;
            EnterMainMenu();
        }

        private void Fail(string stage, Exception e)
        {
            FatalError = $"Error al cargar ({stage}): {e.Message}";
            Debug.LogException(e);
        }

        // ==========================================================================================
        // Creation
        // ==========================================================================================
        private void CreatePlayer()
        {
            var spawn = WorldAtlas.Get(Save.LastSpawnId) ?? WorldAtlas.Get("plaza");
            var go = new GameObject("Player");
            go.transform.SetPositionAndRotation(spawn.Position, Quaternion.Euler(0, spawn.Yaw, 0));
            go.AddComponent<Rigidbody>();
            Scooter = go.AddComponent<ScooterController>();
            Tricks = go.AddComponent<TrickSystem>();
            Tricks.enabled = false;
            Tricks.Scooter = Scooter;
            Tricks.Catalog = TrickCatalog;
            Tricks.enabled = true;

            var visGo = new GameObject("Visual");
            visGo.transform.SetParent(go.transform, false);
            Visual = visGo.AddComponent<ScooterVisual>();
            _riderHost = new GameObject("RiderHost").transform;
            _riderHost.SetParent(visGo.transform, false);
            Rider = _riderHost.gameObject.AddComponent<RiderRig>();
            RebuildScooter();
            RebuildRider();

            var anim = go.AddComponent<RiderAnimator>();
            anim.enabled = false;
            anim.Scooter = Scooter; anim.Tricks = Tricks; anim.Visual = Visual; anim.Rider = Rider;
            anim.enabled = true;

            PlayerInput = go.AddComponent<PlayerInput>();
            PlayerInput.Scooter = Scooter;
            PlayerInput.Tricks = Tricks;
            PlayerInput.Settings = Save.Settings;
            PlayerInput.PauseRequested += () => { if (State == GameState.Playing) Pause(); else if (State == GameState.Paused) Resume(); };
            PlayerInput.MapRequested += () => { if (State == GameState.Playing) { Pause(); ScreenRequest?.Invoke("map"); } };
            PlayerInput.EnterRequested += OpenNearby;
            PlayerInput.RespawnRequested += () => { if (State == GameState.Playing) Scooter.RespawnNow(); };

            Tricks.ComboBanked += OnComboBanked;
            Tricks.BailHappened += OnBail;
            Tricks.GrindEnded += (d, t) => Challenges.Report(ChallengeSignal.GrindEnded, t);
            Tricks.ManualEnded += (d, t) => Challenges.Report(ChallengeSignal.ManualEnded, t);
            Tricks.LandingJudged += (r, p) =>
            {
                if (!r.IsBail) Challenges.Report(ChallengeSignal.AirEnded, p.AirTime);
                if (!r.IsBail && p.ImpactSpeed > 4f) Haptics.Pulse(15);
            };
            SpotTrigger.Entered += OnSpotEntered;
            Scooter.SetFrozen(true);
        }

        private void CreateServices()
        {
            var camGo = new GameObject("MainCamera");
            camGo.tag = "MainCamera";
            camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();
            CameraRig = camGo.AddComponent<CameraRig>();
            CameraRig.enabled = false;
            CameraRig.Target = Scooter;
            CameraRig.Rider = Rider;
            CameraRig.enabled = true;

            var audioGo = new GameObject("Audio");
            audioGo.AddComponent<AudioManager>().Bind(Scooter);
            var fxGo = new GameObject("Effects");
            fxGo.AddComponent<EffectsManager>().Bind(Scooter);
            DynRes = gameObject.AddComponent<DynamicResolution>();
        }

        public void RebuildScooter()
        {
            Parts.Sanitize(Save.ActiveBuild);
            Visual.Build(Save.ActiveBuild, Parts);
            _riderHost.SetParent(Visual.Model, false);
            _riderHost.localPosition = Vector3.zero;
            _riderHost.localRotation = Quaternion.identity;
            var summary = Parts.Evaluate(Save.ActiveBuild);
            Scooter.ApplyTuning(ScooterTuning.FromStats(Data.GameDatabase.BaseTuning(), summary.Stats, summary.WeightKg));
            Tricks.Balance.Skill = summary.Stats.GrindBalance;
        }

        public void RebuildRider() => Rider.Build(Save.Character, Visual);

        // ==========================================================================================
        // Settings
        // ==========================================================================================
        public void ApplySettings()
        {
            var s = Save.Settings;
            var tier = s.QualityLevel < 0 ? QualityManager.AutoDetect() : (QualityTier)Mathf.Clamp(s.QualityLevel, 0, 2);
            QualityManager.Apply(tier, s.TargetFps, Lighting.Sun);
            DynRes.Enabled = s.DynamicResolution;
            if (EffectsManager.Instance != null) EffectsManager.Instance.Density = tier == QualityTier.Low ? 0.5f : tier == QualityTier.Medium ? 0.8f : 1f;
            if (AudioManager.Instance != null) { AudioManager.Instance.MusicVolume = s.MusicVolume; AudioManager.Instance.SfxVolume = s.SfxVolume; }
            Haptics.Enabled = s.Haptics;
            Scooter.AutoPush = s.AutoPush;
            Scooter.AssistScale = s.BeginnerAssist ? 1.3f : 1f;
            Tricks.AutoGrind = s.AutoGrind;
            Tricks.LandingAssist = s.BeginnerAssist ? 1.3f : 1f;
            Tricks.BalanceAssist = s.BeginnerAssist ? 0.7f : 1f;
            CameraRig.DistanceScale = s.CameraDistance;
            CameraRig.FovScale = s.CameraFovBoost;
            CameraRig.Shake = s.CameraShake;
            Lighting.Cycle = s.DayNightCycle;
            if (!s.DayNightCycle) Lighting.TimeOfDay = s.TimeOfDay;
            Lighting.Apply();
            PlayerInput.Settings = s;
        }

        // ==========================================================================================
        // Flow
        // ==========================================================================================
        public void EnterMainMenu()
        {
            EndMode();
            Time.timeScale = 1f;
            State = GameState.MainMenu;
            PlayerInput.GameplayEnabled = false;
            var poi = WorldAtlas.Get("skatepark");
            Scooter.SetFrozen(true);
            Scooter.Teleport(poi.Position, poi.Yaw);
            Scooter.SetFrozen(true);
            Showcase = false;
            CameraRig.MenuOrbit = true;
            CameraRig.OrbitCenter = new Vector3(0f, 0f, 130f);
            CameraRig.OrbitRadius = 22f;
            SaveGame();
        }

        public void StartMode(GameModeId mode, string spawnId = null)
        {
            EndMode();
            LastResults = null;
            Mode = mode;
            Time.timeScale = 1f;
            Tricks.ResetSession();
            _sessionXp = _sessionCredits = _sessionLevels = 0;
            string spawn = spawnId ?? (mode == GameModeId.FreeRoam ? Save.LastSpawnId : (mode == GameModeId.Tutorial ? "plaza" : "skatepark"));
            var poi = WorldAtlas.Get(spawn) ?? WorldAtlas.Get("plaza");
            Scooter.SetFrozen(false);
            Scooter.Teleport(poi.Position, poi.Yaw);
            Showcase = false;
            CameraRig.MenuOrbit = false;
            CameraRig.Snap();
            State = GameState.Playing;
            PlayerInput.GameplayEnabled = true;

            switch (mode)
            {
                case GameModeId.Freestyle: ModeTimeLeft = FreestyleDuration; Toasts.Push("Sesión freestyle", "3 minutos. Suma todos tus combos.", UIKit.Accent); break;
                case GameModeId.BestLine: ModeTimeLeft = BestLineDuration; Toasts.Push("Mejor línea", "2 minutos. Solo cuenta tu mejor combo.", UIKit.Accent); break;
                case GameModeId.Duel:
                    Duel = new DuelController(Tricks, new DuelRules(), "Jugador 1", "Jugador 2");
                    SetPlayerActive(false);
                    break;
                case GameModeId.Tutorial:
                    Tutorial = new TutorialDirector(Scooter, Tricks);
                    break;
                default:
                    Toasts.Push(WorldAtlas.Get(spawn)?.Name ?? "Mundo libre", "Explora, descubre spots y encadena líneas.", UIKit.Accent2);
                    break;
            }
        }

        private void EndMode()
        {
            if (Tutorial != null) { Tutorial.Dispose(); Tutorial = null; }
            if (Duel != null) { Duel.Abort(); Duel = null; }
            ModeTimeLeft = 0f;
        }

        private void SetPlayerActive(bool active)
        {
            PlayerInput.GameplayEnabled = active;
            Scooter.SetFrozen(!active);
        }

        public void DuelBeginAttempt()
        {
            if (Duel == null) return;
            var poi = WorldAtlas.Get("skatepark");
            SetPlayerActive(true);
            Scooter.Teleport(poi.Position, poi.Yaw);
            CameraRig.Snap();
            Duel.BeginAttempt();
        }

        public void Pause()
        {
            if (State != GameState.Playing) return;
            State = GameState.Paused;
            Time.timeScale = 0f;
            PlayerInput.GameplayEnabled = false;
            SaveGame();
        }

        public void Resume()
        {
            if (State != GameState.Paused) return;
            State = GameState.Playing;
            Time.timeScale = 1f;
            Showcase = false;
            bool duelWaiting = Duel != null && Duel.Current != DuelController.Phase.Attempt;
            PlayerInput.GameplayEnabled = !duelWaiting;
            if (!duelWaiting) Scooter.SetFrozen(false);
        }

        public void RespawnPlayer()
        {
            Scooter.RespawnNow();
            Resume();
        }

        public bool CanFastTravel(PointOfInterest p) => p != null && p.FastTravel && Save.UnlockedFastTravel.Contains(p.Id);

        public void FastTravel(string poiId)
        {
            var p = WorldAtlas.Get(poiId);
            if (!CanFastTravel(p)) return;
            Save.LastSpawnId = p.Id;
            Scooter.SetFrozen(false);
            Scooter.Teleport(p.Position, p.Yaw);
            CameraRig.Snap();
            if (State == GameState.Paused) Resume();
            Toasts.Push(p.Name, "Viaje rápido", UIKit.Accent2, 2f);
        }

        /// <summary>Workshop / character editor showcase camera around the parked player.</summary>
        public void BeginShowcase()
        {
            Showcase = true;
            if (State == GameState.Playing) Pause();
            Scooter.SetFrozen(true);
            CameraRig.MenuOrbit = true;
            CameraRig.OrbitCenter = Scooter.transform.position;
            CameraRig.OrbitRadius = 2.4f;
            CameraRig.OrbitHeight = 0.9f;
            CameraRig.OrbitLookHeight = 0.75f;
            CameraRig.OrbitSpeed = 8f;
        }

        /// <summary>Shows a not-yet-equipped build on the 3D model (before/after comparison) without saving it.</summary>
        public void PreviewBuild(ScooterBuild temp)
        {
            Visual.Build(temp, Parts);
            _riderHost.SetParent(Visual.Model, false);
            _riderHost.localPosition = Vector3.zero;
            _riderHost.localRotation = Quaternion.identity;
            RebuildRider();
        }

        /// <summary>Shows a character variation on the model without saving it.</summary>
        public void PreviewCharacter(CharacterData c) => Rider.Build(c, Visual);

        public void EndShowcase()
        {
            Showcase = false;
            CameraRig.OrbitHeight = 3.2f;
            CameraRig.OrbitLookHeight = 1.2f;
            CameraRig.OrbitSpeed = 6f;
            if (State == GameState.MainMenu)
            {
                CameraRig.OrbitCenter = new Vector3(0f, 0f, 130f);
                CameraRig.OrbitRadius = 22f;
            }
            else CameraRig.MenuOrbit = false;
        }

        private void OpenNearby()
        {
            if (string.IsNullOrEmpty(NearbyEnter) || State != GameState.Playing) return;
            ScreenRequest?.Invoke(NearbyEnter == "workshop" ? "workshop" : "character");
        }

        // ==========================================================================================
        // Update
        // ==========================================================================================
        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            Toasts.Update(dt);
            if (State == GameState.Loading || Save == null) return;
            if (State != GameState.Playing) return;

            float gdt = Time.deltaTime;
            Save.Profile.PlayTimeSeconds += gdt;
            _autosave -= gdt;
            if (_autosave <= 0f) { _autosave = 60f; SaveGame(); }

            if (Mode == GameModeId.Freestyle || Mode == GameModeId.BestLine)
            {
                ModeTimeLeft -= gdt;
                if (ModeTimeLeft <= 0f && !Tricks.Combo.IsActive) EndTimedSession();
            }
            if (Duel != null)
            {
                Duel.Update(gdt);
                if (Duel.Current != DuelController.Phase.Attempt && PlayerInput.GameplayEnabled) SetPlayerActive(false);
                if (Duel.Current == DuelController.Phase.Finished && LastResults == null) FinishDuel();
            }
            if (Tutorial != null && Tutorial.Update(gdt))
            {
                AudioManager.PlayUi(AudioManager.Ui.Challenge);
                if (Tutorial.Finished) FinishTutorial();
            }

            _discoveryTimer -= gdt;
            if (_discoveryTimer <= 0f)
            {
                _discoveryTimer = 0.3f;
                CheckDiscovery();
            }
            Challenges.Report(ChallengeSignal.Speed, Scooter.Velocity.magnitude);
        }

        private void CheckDiscovery()
        {
            Vector3 p = Scooter.transform.position;
            foreach (var poi in WorldAtlas.Pois)
            {
                float d = Vector3.Distance(new Vector3(p.x, 0, p.z), new Vector3(poi.Position.x, 0, poi.Position.z));
                if (poi.FastTravel && !poi.HiddenUntilDiscovered && d < poi.Radius && Save.AddUnique(Save.UnlockedFastTravel, poi.Id))
                {
                    Toasts.Push("Viaje rápido desbloqueado", poi.Name, UIKit.Accent2);
                    Save.LastSpawnId = poi.Id;
                }
                if ((poi.Type == PoiType.Workshop || poi.Type == PoiType.Shop) && d < 6f) { NearbyEnter = poi.Id; }
                else if (NearbyEnter == poi.Id && d > 7f) NearbyEnter = null;
            }
            PlayerInput.ShowEnter = NearbyEnter != null && Scooter.State == ScooterState.Riding;
            var zone = WorldAtlas.ZoneAt(p);
            if (zone != null && zone.Id != _zoneId)
            {
                _zoneId = zone.Id;
                CurrentZoneName = zone.Name;
            }
        }

        private void OnSpotEntered(string poiId)
        {
            var poi = WorldAtlas.Get(poiId);
            if (poi == null || Save == null) return;
            Challenges.Report(ChallengeSignal.SpotEntered, 0f, poiId);
            if (poi.HiddenUntilDiscovered && Save.AddUnique(Save.DiscoveredSpots, poiId))
            {
                Save.AddUnique(Save.UnlockedFastTravel, poiId);
                Toasts.Push("¡Spot secreto descubierto!", poi.Name, UIKit.Accent, 4f);
                AudioManager.PlayUi(AudioManager.Ui.Challenge);
                GrantXp(300, 30, 0);
                SaveGame();
            }
        }

        // ==========================================================================================
        // Progression
        // ==========================================================================================
        private void OnComboBanked(ComboResult r)
        {
            AudioManager.PlayUi(AudioManager.Ui.Combo);
            Haptics.Pulse(25);
            var rec = Save.Records;
            if (r.Total > rec.BestCombo) { rec.BestCombo = r.Total; rec.BestComboSummary = r.Summary; if (r.Total > 1000) Toasts.Push("¡Récord de combo!", UIKit.FormatScore(r.Total) + " pts", UIKit.Accent2); }
            if (r.TrickIds != null)
                foreach (var id in r.TrickIds)
                {
                    var m = Save.GetTrick(id, true);
                    m.Landed++;
                    rec.TotalTricks++;
                    if (m.Landed == ProgressionRules.MasteryLandings)
                        Toasts.Push("Truco dominado", TrickCatalog.Get(id)?.DisplayName ?? id, UIKit.Good);
                }
            Challenges.Report(ChallengeSignal.ComboBanked, r.Total, null, r.TrickCount);
            Challenges.Report(ChallengeSignal.SessionScore, Tricks.Session.TotalScore);
            if (r.TrickIds != null) foreach (var id in r.TrickIds) Challenges.Report(ChallengeSignal.TrickLanded, 0, id);
            if (Mode == GameModeId.FreeRoam || Mode == GameModeId.Tutorial)
                GrantXp(ProgressionRules.XpFromScore(r.Total), 0, ProgressionRules.CreditsFromScore(r.Total));
            var s = Tricks.Session;
            rec.LongestGrind = Mathf.Max(rec.LongestGrind, s.LongestGrind);
            rec.LongestManual = Mathf.Max(rec.LongestManual, s.LongestManual);
            rec.MaxAirTime = Mathf.Max(rec.MaxAirTime, s.MaxAirTime);
            rec.MaxHeight = Mathf.Max(rec.MaxHeight, s.MaxHeight);
            rec.TopSpeed = Mathf.Max(rec.TopSpeed, s.TopSpeed);
        }

        private void OnBail(BailReason reason, int lost)
        {
            Save.Records.TotalBails++;
            Haptics.Pulse(60, true);
            AudioManager.PlayUi(AudioManager.Ui.Bail);
        }

        public void GrantXp(int xp, int rep, int credits)
        {
            var g = ProgressionRules.AddXp(Save.Profile, xp);
            Save.Profile.Reputation += rep;
            Save.Profile.Credits += credits;
            _sessionXp += g.XpAdded;
            _sessionCredits += credits;
            _sessionLevels += g.LevelsGained;
            if (g.LevelsGained > 0)
            {
                Toasts.Push($"¡Nivel {g.NewLevel}!", "Nuevas piezas y estilos disponibles", UIKit.Accent2, 4f);
                AudioManager.PlayUi(AudioManager.Ui.Challenge);
            }
        }

        private void OnChallengeCompleted(ChallengeDefinition d)
        {
            Save.AddUnique(Save.CompletedChallenges, d.Id);
            GrantXp(d.RewardXp, d.RewardReputation, d.RewardCredits);
            Toasts.Push("Desafío completado", $"{d.Title}  +{d.RewardXp} XP  +{d.RewardCredits} créditos", UIKit.Good, 4f);
            AudioManager.PlayUi(AudioManager.Ui.Challenge);
            SaveGame();
        }

        private void EndTimedSession()
        {
            var s = Tricks.Session;
            bool bestLine = Mode == GameModeId.BestLine;
            int score = bestLine ? s.BestCombo : s.TotalScore;
            string board = bestLine ? "bestline" : "freestyle";
            GrantXp(ProgressionRules.XpFromScore(score) + 50, score > 5000 ? 10 : 2, ProgressionRules.CreditsFromScore(score) + 50);
            int rank = InsertLeaderboard(board, score);
            Save.Records.BestSession = Mathf.Max(Save.Records.BestSession, score);
            Save.CompetitionHistory.Add(new CompetitionRecord { ModeId = board, EventId = board, Score = score, Placement = rank, DateIso = DateTime.UtcNow.ToString("o") });
            LastResults = new ResultsData
            {
                Title = bestLine ? "Mejor línea" : "Sesión freestyle",
                ModeLabel = board,
                Score = score,
                BestCombo = s.BestCombo,
                BestComboSummary = s.BestComboSummary,
                Tricks = s.TricksLanded,
                Bails = s.Bails,
                XpGained = _sessionXp,
                CreditsGained = _sessionCredits,
                LevelsGained = _sessionLevels,
                NewRecord = rank == 1,
                LeaderboardRank = rank,
            };
            ShowResults();
        }

        private void FinishDuel()
        {
            var m = Duel.Match;
            string winner = m.Winner >= 0 ? m.PlayerNames[m.Winner] : "Empate";
            Save.CompetitionHistory.Add(new CompetitionRecord { ModeId = "duel", EventId = "local", Score = m.Letters(0) * 10 + m.Letters(1), Placement = m.Winner + 1, DateIso = DateTime.UtcNow.ToString("o") });
            GrantXp(150, 5, 75);
            LastResults = new ResultsData
            {
                Title = "Duelo 1 vs 1",
                ModeLabel = "duel",
                Extra = m.Winner >= 0 ? $"Gana {winner}" : "Empate",
                Score = 0,
                XpGained = _sessionXp,
                CreditsGained = _sessionCredits,
                LevelsGained = _sessionLevels,
                BestComboSummary = $"{m.PlayerNames[0]}: {m.LettersText(0)}   ·   {m.PlayerNames[1]}: {m.LettersText(1)}",
            };
            ShowResults();
        }

        private void FinishTutorial()
        {
            bool first = !Save.TutorialCompleted;
            Save.TutorialCompleted = true;
            if (first) GrantXp(500, 20, 300);
            Toasts.Push("¡Tutorial completado!", first ? "+500 XP  +300 créditos" : "Ya dominas lo básico", UIKit.Good, 5f);
            Tutorial.Dispose();
            Tutorial = null;
            Mode = GameModeId.FreeRoam;
            SaveGame();
        }

        private void ShowResults()
        {
            Scooter.SetFrozen(true);
            PlayerInput.GameplayEnabled = false;
            State = GameState.Results;
            EndMode();
            SaveGame();
        }

        public void ClearResults() => LastResults = null;

        private int InsertLeaderboard(string board, int score)
        {
            var list = Save.LocalLeaderboards;
            list.Add(new LeaderboardEntry { BoardId = board, PlayerName = Save.Profile.DisplayName, Score = score, DateIso = DateTime.UtcNow.ToString("o") });
            var mine = list.FindAll(e => e.BoardId == board);
            mine.Sort((a, b) => b.Score.CompareTo(a.Score));
            int rank = mine.FindIndex(e => e.Score == score) + 1;
            for (int i = 10; i < mine.Count; i++) list.Remove(mine[i]);
            return rank;
        }

        public List<LeaderboardEntry> Leaderboard(string board)
        {
            var mine = Save.LocalLeaderboards.FindAll(e => e.BoardId == board);
            mine.Sort((a, b) => b.Score.CompareTo(a.Score));
            return mine;
        }

        // ==========================================================================================
        // Workshop & character
        // ==========================================================================================
        public bool OwnsPart(string id) => Save.OwnedParts.Contains(id);

        public string PartLockReason(PartDefinition p)
        {
            if (OwnsPart(p.Id)) return null;
            if (Save.Profile.Level < p.UnlockLevel) return $"Nivel {p.UnlockLevel}";
            if (Save.Profile.Credits < p.Price) return $"{UIKit.FormatScore(p.Price)} créditos";
            return null;
        }

        public bool BuyPart(PartDefinition p)
        {
            if (OwnsPart(p.Id)) return true;
            if (Save.Profile.Level < p.UnlockLevel || Save.Profile.Credits < p.Price) return false;
            Save.Profile.Credits -= p.Price;
            Save.AddUnique(Save.OwnedParts, p.Id);
            SaveGame();
            return true;
        }

        public void EquipPart(PartDefinition p)
        {
            if (!OwnsPart(p.Id)) return;
            Save.ActiveBuild.Set(p.Slot, p.Id);
            RebuildScooter();
            RebuildRider();
            SaveGame();
        }

        public void SetScooterColors(int deck, int bars, int wheels, int grips)
        {
            var b = Save.ActiveBuild;
            b.DeckColor = deck; b.BarsColor = bars; b.WheelColor = wheels; b.GripColor = grips;
            RebuildScooter();
            RebuildRider();
            SaveGame();
        }

        public void SaveBuildSlot(int slot)
        {
            while (Save.SavedBuilds.Count <= slot) Save.SavedBuilds.Add(null);
            var c = Save.ActiveBuild.Clone();
            c.Name = "Montaje " + (slot + 1);
            Save.SavedBuilds[slot] = c;
            SaveGame();
        }

        public bool LoadBuildSlot(int slot)
        {
            if (slot >= Save.SavedBuilds.Count || Save.SavedBuilds[slot] == null || Save.SavedBuilds[slot].Parts == null) return false;
            var b = Save.SavedBuilds[slot].Clone();
            foreach (PartSlot s in Enum.GetValues(typeof(PartSlot)))
                if (!OwnsPart(b.Get(s))) b.Set(s, Parts.DefaultFor(s).Id);
            Save.ActiveBuild = b;
            RebuildScooter();
            RebuildRider();
            SaveGame();
            return true;
        }

        public void ApplyCharacter(CharacterData c)
        {
            Save.Character = c;
            RebuildRider();
            SaveGame();
        }

        public void SaveGame() { if (SaveSys != null && Save != null) SaveSys.Save(); }

        public void ResetProgress()
        {
            SaveSys.ResetProgress();
            Challenges = new ChallengeTracker(ChallengeTracker.CreateDefault(), Save.CompletedChallenges);
            Challenges.Completed += OnChallengeCompleted;
            PlayerInput.Settings = Save.Settings;
            RebuildScooter();
            RebuildRider();
            ApplySettings();
            Toasts.Push("Progreso reiniciado", "Partida nueva creada", UIKit.Bad);
        }

        private void OnApplicationPause(bool paused) { if (paused) SaveGame(); }
        private void OnApplicationQuit() => SaveGame();

        private void OnDestroy()
        {
            SpotTrigger.Entered -= OnSpotEntered;
            if (Instance == this) Instance = null;
        }
    }

    /// <summary>Which character options unlock with level (cosmetic only, no gameplay advantage).</summary>
    public static class CharacterUnlocks
    {
        public static int Hair(int i) => i >= 3 ? 3 : 1;
        public static int Top(int i) => i == 2 ? 4 : 1;
        public static int Bottom(int i) => i == 2 ? 3 : 1;
        public static int Helmet(int i) => i == 2 ? 2 : 1;
        public static int Pads => 2;
        public static int Gloves => 5;
    }
}

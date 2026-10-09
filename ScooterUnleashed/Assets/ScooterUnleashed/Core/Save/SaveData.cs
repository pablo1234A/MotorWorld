using System;
using System.Collections.Generic;
using ScooterUnleashed.Core.Stats;

namespace ScooterUnleashed.Core.Save
{
    // All classes use public fields and lists only so that UnityEngine.JsonUtility can serialize them.

    [Serializable]
    public class ProfileData
    {
        public string PlayerId = Guid.NewGuid().ToString("N");
        public string DisplayName = "Rider";
        public int Level = 1;
        public int Xp;
        public int TotalXp;
        public int Reputation;
        public int Credits = 500;
        public float PlayTimeSeconds;
    }

    [Serializable]
    public class SettingsData
    {
        public int QualityLevel = -1;      // -1 = auto detect
        public int TargetFps = 60;
        public bool DynamicResolution = true;
        public float MusicVolume = 0.6f;
        public float SfxVolume = 0.9f;
        public float TouchSensitivity = 1f;
        public float StickSize = 1f;
        public float ControlsOpacity = 0.75f;
        public bool LeftHanded;
        public bool Haptics = true;
        public bool AutoPush = true;       // beginner: holds cruise speed without pushing
        public bool AutoGrind = true;      // snap to rails when landing on them
        public bool BeginnerAssist = true; // wider landing windows, calmer balance
        public float CameraDistance = 1f;
        public bool CameraShake = true;
        public float CameraFovBoost = 1f;
        public bool ShowMinimap = true;
        public bool ShowDebug;
        public bool DayNightCycle;
        public float TimeOfDay = 17.5f;
        public int ControlScheme;          // 0 = gestures, 1 = buttons (accessibility)
        public float ButtonScale = 1f;
        // Custom layout offsets (normalized screen units)
        public float StickOffsetX;
        public float StickOffsetY;
        public float ActionOffsetX;
        public float ActionOffsetY;
    }

    [Serializable]
    public class TrickMastery
    {
        public string TrickId;
        public int Landed;
        public int Best;
    }

    [Serializable]
    public class RecordsData
    {
        public int BestCombo;
        public string BestComboSummary = "";
        public int BestSession;
        public float LongestGrind;
        public float LongestManual;
        public float MaxAirTime;
        public float MaxHeight;
        public float TopSpeed;
        public float DistanceRidden;
        public int TotalBails;
        public int TotalTricks;
    }

    [Serializable]
    public class CharacterData
    {
        public int Body;        // index into available body models
        public int SkinTone = 2;
        public int Hair;
        public int HairColor;
        public int Top;
        public int TopColor;
        public int Bottom;
        public int BottomColor = 1;
        public int Shoes;
        public int ShoesColor;
        public int Helmet;
        public int HelmetColor;
        public bool Pads;
        public bool Gloves;
        public int Celebration;
    }

    [Serializable]
    public class CompetitionRecord
    {
        public string ModeId;
        public string EventId;
        public int Score;
        public int Placement;
        public string DateIso;
    }

    [Serializable]
    public class LeaderboardEntry
    {
        public string BoardId;
        public string PlayerName;
        public int Score;
        public string DateIso;
    }

    [Serializable]
    public class SaveData
    {
        public const int CurrentVersion = 1;
        public int Version = CurrentVersion;
        public string LastSavedIso = "";
        public ProfileData Profile = new ProfileData();
        public SettingsData Settings = new SettingsData();
        public RecordsData Records = new RecordsData();
        public CharacterData Character = new CharacterData();
        public ScooterBuild ActiveBuild;
        public List<ScooterBuild> SavedBuilds = new List<ScooterBuild>();
        public List<string> OwnedParts = new List<string>();
        public List<TrickMastery> Tricks = new List<TrickMastery>();
        public List<string> DiscoveredSpots = new List<string>();
        public List<string> UnlockedFastTravel = new List<string>();
        public List<string> CompletedChallenges = new List<string>();
        public List<CompetitionRecord> CompetitionHistory = new List<CompetitionRecord>();
        public List<LeaderboardEntry> LocalLeaderboards = new List<LeaderboardEntry>();
        public bool TutorialCompleted;
        public string LastSpawnId = "plaza";

        public TrickMastery GetTrick(string id, bool create)
        {
            foreach (var t in Tricks) if (t.TrickId == id) return t;
            if (!create) return null;
            var m = new TrickMastery { TrickId = id };
            Tricks.Add(m);
            return m;
        }

        public bool AddUnique(List<string> list, string value)
        {
            if (string.IsNullOrEmpty(value) || list.Contains(value)) return false;
            list.Add(value);
            return true;
        }

        /// <summary>Repairs nulls from older or hand-edited saves and migrates versions.</summary>
        public void Normalize(PartCatalog parts)
        {
            if (Profile == null) Profile = new ProfileData();
            if (Settings == null) Settings = new SettingsData();
            if (Records == null) Records = new RecordsData();
            if (Character == null) Character = new CharacterData();
            if (SavedBuilds == null) SavedBuilds = new List<ScooterBuild>();
            if (OwnedParts == null) OwnedParts = new List<string>();
            if (Tricks == null) Tricks = new List<TrickMastery>();
            if (DiscoveredSpots == null) DiscoveredSpots = new List<string>();
            if (UnlockedFastTravel == null) UnlockedFastTravel = new List<string>();
            if (CompletedChallenges == null) CompletedChallenges = new List<string>();
            if (CompetitionHistory == null) CompetitionHistory = new List<CompetitionRecord>();
            if (LocalLeaderboards == null) LocalLeaderboards = new List<LeaderboardEntry>();
            if (Profile.Level < 1) Profile.Level = 1;
            if (parts != null)
            {
                if (ActiveBuild == null) ActiveBuild = parts.CreateDefaultBuild();
                parts.Sanitize(ActiveBuild);
                foreach (var p in parts.All)
                    if (p.UnlockLevel <= 1 && p.Price == 0) AddUnique(OwnedParts, p.Id);
            }
            AddUnique(UnlockedFastTravel, "plaza");
            Version = CurrentVersion;
        }
    }

    /// <summary>Platform-agnostic persistence boundary (file, cloud...).</summary>
    public interface ISaveStorage
    {
        bool TryRead(out string json);
        void Write(string json);
        void Delete();
    }

    public interface IJsonSerializer
    {
        string ToJson(object obj);
        T FromJson<T>(string json);
    }
}

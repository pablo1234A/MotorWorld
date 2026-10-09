using ScooterUnleashed.Core.Modes;
using ScooterUnleashed.Core.Stats;
using ScooterUnleashed.Core.Tricks;
using ScooterUnleashed.Vehicle;
using UnityEngine;

namespace ScooterUnleashed.Data
{
    /// <summary>Designer-editable trick data. Assets in Resources/ScooterUnleashed/Tricks override/add to the default catalog by Id.</summary>
    [CreateAssetMenu(menuName = "Scooter Unleashed/Trick Definition", fileName = "Trick_")]
    public sealed class TrickDefinitionAsset : ScriptableObject
    {
        public TrickDefinition Definition = new TrickDefinition();
    }

    /// <summary>Designer-editable workshop part. Assets in Resources/ScooterUnleashed/Parts are added to the catalog.</summary>
    [CreateAssetMenu(menuName = "Scooter Unleashed/Part Definition", fileName = "Part_")]
    public sealed class PartDefinitionAsset : ScriptableObject
    {
        public PartDefinition Definition = new PartDefinition();
    }

    [CreateAssetMenu(menuName = "Scooter Unleashed/Challenge", fileName = "Challenge_")]
    public sealed class ChallengeAsset : ScriptableObject
    {
        public ChallengeDefinition Definition = new ChallengeDefinition();
    }

    /// <summary>Base physics tuning. Place one at Resources/ScooterUnleashed/ScooterTuning to override the code defaults.</summary>
    [CreateAssetMenu(menuName = "Scooter Unleashed/Scooter Tuning", fileName = "ScooterTuning")]
    public sealed class ScooterTuningAsset : ScriptableObject
    {
        public ScooterTuning Tuning = new ScooterTuning();
    }

    public static class GameDatabase
    {
        public const string Root = "ScooterUnleashed/";

        public static void ApplyOverrides(TrickCatalog tricks)
        {
            foreach (var a in Resources.LoadAll<TrickDefinitionAsset>(Root + "Tricks"))
                if (a != null && a.Definition != null && !string.IsNullOrEmpty(a.Definition.Id)) tricks.Add(a.Definition.Clone());
        }

        public static void ApplyOverrides(PartCatalog parts)
        {
            foreach (var a in Resources.LoadAll<PartDefinitionAsset>(Root + "Parts"))
                if (a != null && a.Definition != null && !string.IsNullOrEmpty(a.Definition.Id) && parts.Get(a.Definition.Id) == null) parts.Add(a.Definition);
        }

        public static ScooterTuning BaseTuning()
        {
            var a = Resources.Load<ScooterTuningAsset>(Root + "ScooterTuning");
            return a != null ? a.Tuning.Clone() : new ScooterTuning();
        }
    }
}

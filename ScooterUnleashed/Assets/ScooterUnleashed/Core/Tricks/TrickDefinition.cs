using System;

namespace ScooterUnleashed.Core.Tricks
{
    /// <summary>
    /// Data describing a trick. Pure data: the runtime (Unity) side drives animation and physics,
    /// the Core side uses this for triggering, scoring and validation.
    /// </summary>
    [Serializable]
    public class TrickDefinition
    {
        public string Id;
        public string DisplayName;
        public TrickFamily Family;
        public TrickContext Context;
        public TrickChannel Channels;
        public TrickTrigger Trigger;

        /// <summary>Points awarded once the trick is completed/landed.</summary>
        public int BaseScore;
        /// <summary>For held tricks/grinds/manuals: extra points per second while sustained.</summary>
        public float ScorePerSecond;
        /// <summary>1 (easy) .. 5 (very hard). Used for score scaling and tutorial ordering.</summary>
        public float Difficulty = 1f;

        /// <summary>Seconds a one-shot trick needs to complete (barspin, tailwhip...). 0 for held tricks.</summary>
        public float ExecutionTime;
        /// <summary>True for poses held while the input is held (x-up, superman, can-can...).</summary>
        public bool IsHeld;
        /// <summary>Held tricks must be held at least this long to count.</summary>
        public float MinHoldTime;

        /// <summary>Completion fraction (0..1) under which landing with the trick still running is a bail.
        /// Between this and 1 the landing is sketchy but saved.</summary>
        public float LandableCompletion = 0.85f;

        /// <summary>Minimum speed (m/s) required to start the trick, 0 = none.</summary>
        public float MinSpeed;

        /// <summary>Key used by the animation layer to select the pose / clip.</summary>
        public string AnimationKey;

        /// <summary>Short description for the trick book / tutorial.</summary>
        public string Description;

        public TrickDefinition Clone() => (TrickDefinition)MemberwiseClone();

        public override string ToString() => $"{DisplayName} ({Id})";
    }
}

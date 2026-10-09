using System.Collections.Generic;
using UnityEngine;

namespace ScooterUnleashed.Game
{
    public sealed class Toast
    {
        public string Title;
        public string Sub;
        public Color Color;
        public float Time;
        public float Duration = 3.2f;
    }

    public sealed class ToastQueue
    {
        public readonly List<Toast> Active = new List<Toast>();
        private readonly Queue<Toast> _pending = new Queue<Toast>();

        public void Push(string title, string sub, Color color, float duration = 3.2f)
        {
            _pending.Enqueue(new Toast { Title = title, Sub = sub, Color = color, Duration = duration });
        }

        public void Update(float dt)
        {
            for (int i = Active.Count - 1; i >= 0; i--)
            {
                Active[i].Time += dt;
                if (Active[i].Time > Active[i].Duration) Active.RemoveAt(i);
            }
            while (_pending.Count > 0 && Active.Count < 3) Active.Add(_pending.Dequeue());
        }
    }

    public sealed class ResultsData
    {
        public string Title;
        public string ModeLabel;
        public int Score;
        public int BestCombo;
        public string BestComboSummary;
        public int Tricks;
        public int Bails;
        public int XpGained;
        public int CreditsGained;
        public int LevelsGained;
        public bool NewRecord;
        public int LeaderboardRank;
        public string Extra;
    }
}

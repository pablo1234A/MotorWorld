using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Modes
{
    public enum DuelPhase
    {
        SetterTurn,    // the setter attempts to land a line/trick
        FollowerTurn,  // the follower must match or beat it
        Finished,
    }

    [Serializable]
    public class DuelRules
    {
        /// <summary>Letters spell the penalty word. Getting all of them loses the match.</summary>
        public string Word = "SCOOT";
        /// <summary>Hard cap on rounds (one round = one set attempt + optional reply).</summary>
        public int MaxRounds = 12;
        /// <summary>The reply must reach at least this fraction of the set score.</summary>
        public float MatchRatio = 1f;
        /// <summary>Minimum combo value for a set to count (avoids setting trivial lines).</summary>
        public int MinSetScore = 300;
        /// <summary>Seconds each attempt may last.</summary>
        public float AttemptTime = 25f;
    }

    public struct DuelAttempt
    {
        public int Player;
        public bool Landed;
        public int Score;
        public string Summary;
    }

    /// <summary>
    /// Trick battle inspired by "game of S.K.A.T.E.": the setter lands a line, the follower must match or beat its score.
    /// A failed reply earns a letter; a failed set passes the setter role. Pure rules so it works for local
    /// hot-seat play now and authoritative server validation later.
    /// </summary>
    public sealed class DuelMatch
    {
        public readonly DuelRules Rules;
        public readonly string[] PlayerNames;
        private readonly int[] _letters = new int[2];
        private readonly List<DuelAttempt> _history = new List<DuelAttempt>();

        public DuelPhase Phase { get; private set; } = DuelPhase.SetterTurn;
        public int Setter { get; private set; }
        public int Follower => 1 - Setter;
        public int ActivePlayer => Phase == DuelPhase.FollowerTurn ? Follower : Setter;
        public int Round { get; private set; } = 1;
        public int ScoreToBeat { get; private set; }
        public string LineToBeat { get; private set; } = "";
        public int Winner { get; private set; } = -1;
        public IReadOnlyList<DuelAttempt> History => _history;

        public DuelMatch(DuelRules rules, string playerA, string playerB)
        {
            Rules = rules ?? new DuelRules();
            PlayerNames = new[] { playerA ?? "Jugador 1", playerB ?? "Jugador 2" };
        }

        public int Letters(int player) => _letters[player];
        public string LettersText(int player) => Rules.Word.Substring(0, Math.Min(_letters[player], Rules.Word.Length));

        /// <summary>Reports the outcome of the active player's attempt.</summary>
        public void SubmitAttempt(bool landed, int score, string summary = "")
        {
            if (Phase == DuelPhase.Finished) throw new InvalidOperationException("Match already finished");
            _history.Add(new DuelAttempt { Player = ActivePlayer, Landed = landed, Score = score, Summary = summary ?? "" });

            if (Phase == DuelPhase.SetterTurn)
            {
                if (landed && score >= Rules.MinSetScore)
                {
                    ScoreToBeat = score;
                    LineToBeat = summary ?? "";
                    Phase = DuelPhase.FollowerTurn;
                    return;
                }
                // Missed set: the other player becomes setter.
                Setter = Follower;
                NextRound();
                return;
            }

            // Follower turn
            bool matched = landed && score >= (int)Math.Ceiling(ScoreToBeat * Rules.MatchRatio);
            if (!matched)
            {
                _letters[Follower]++;
                if (_letters[Follower] >= Rules.Word.Length)
                {
                    Winner = Setter;
                    Phase = DuelPhase.Finished;
                    return;
                }
            }
            // Setter keeps setting after a successful set (standard S.K.A.T.E. rule).
            NextRound();
        }

        private void NextRound()
        {
            ScoreToBeat = 0;
            LineToBeat = "";
            Round++;
            if (Round > Rules.MaxRounds)
            {
                Phase = DuelPhase.Finished;
                Winner = _letters[0] == _letters[1] ? -1 : (_letters[0] < _letters[1] ? 0 : 1);
                return;
            }
            Phase = DuelPhase.SetterTurn;
        }
    }
}

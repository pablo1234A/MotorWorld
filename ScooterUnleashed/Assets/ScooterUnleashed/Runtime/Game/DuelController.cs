using ScooterUnleashed.Core.Modes;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Tricks;

namespace ScooterUnleashed.Game
{
    /// <summary>
    /// Local hot-seat duel (two players, one device) on top of the pure <see cref="DuelMatch"/> rules.
    /// An attempt ends with the first banked combo (landed), a bail (missed) or the time limit.
    /// This is explicitly local play; online duels use the same rules through INetworkService when a backend exists.
    /// </summary>
    public sealed class DuelController
    {
        public enum Phase { Interstitial, Attempt, Finished }

        public readonly DuelMatch Match;
        public Phase Current { get; private set; } = Phase.Interstitial;
        public float AttemptTimeLeft { get; private set; }
        public string LastResult { get; private set; } = "";
        private readonly TrickSystem _tricks;
        private float _grace;

        public DuelController(TrickSystem tricks, DuelRules rules, string p1, string p2)
        {
            _tricks = tricks;
            Match = new DuelMatch(rules, p1, p2);
        }

        public string Instruction
        {
            get
            {
                if (Match.Phase == DuelPhase.Finished) return "";
                string who = Match.PlayerNames[Match.ActivePlayer];
                return Match.Phase == DuelPhase.SetterTurn
                    ? $"{who}: marca una línea (mínimo {UI.UIKit.FormatScore(Match.Rules.MinSetScore)} pts)"
                    : $"{who}: iguala {UI.UIKit.FormatScore(Match.ScoreToBeat)} pts";
            }
        }

        public void BeginAttempt()
        {
            Current = Phase.Attempt;
            AttemptTimeLeft = Match.Rules.AttemptTime;
            _grace = 4f;
            _tricks.ResetSession();
            _tricks.ComboBanked += OnBanked;
            _tricks.BailHappened += OnBail;
        }

        private void Unhook()
        {
            _tricks.ComboBanked -= OnBanked;
            _tricks.BailHappened -= OnBail;
        }

        private void OnBanked(ComboResult r) => Submit(true, r.Total, r.Summary);
        private void OnBail(BailReason reason, int lost) => Submit(false, 0, "Caída");

        public void Update(float dt)
        {
            if (Current != Phase.Attempt) return;
            AttemptTimeLeft -= dt;
            if (AttemptTimeLeft > 0f) return;
            // Let a line in progress finish before calling time.
            if (_tricks.Combo.IsActive && _grace > 0f) { _grace -= dt; return; }
            Submit(false, 0, "Tiempo agotado");
        }

        private void Submit(bool landed, int score, string summary)
        {
            if (Current != Phase.Attempt) return;
            Unhook();
            int player = Match.ActivePlayer;
            bool wasFollower = Match.Phase == DuelPhase.FollowerTurn;
            int toBeat = Match.ScoreToBeat;
            Match.SubmitAttempt(landed, score, summary);
            string who = Match.PlayerNames[player];
            if (!wasFollower)
                LastResult = landed && score >= Match.Rules.MinSetScore ? $"{who} marca {UI.UIKit.FormatScore(score)} pts" : $"{who} falla: cambia el turno";
            else
                LastResult = landed && score >= toBeat ? $"{who} lo iguala ({UI.UIKit.FormatScore(score)})" : $"{who} no lo consigue: letra";
            Current = Match.Phase == DuelPhase.Finished ? Phase.Finished : Phase.Interstitial;
        }

        public void Abort() { Unhook(); Current = Phase.Finished; }
    }
}

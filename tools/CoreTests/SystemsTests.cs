using System;
using ScooterUnleashed.Core.Modes;
using ScooterUnleashed.Core.Network;
using ScooterUnleashed.Core.Physics;
using ScooterUnleashed.Core.Progression;
using ScooterUnleashed.Core.Save;
using ScooterUnleashed.Core.Stats;
using ScooterUnleashed.Core.Tricks;
using Xunit;

public class BalanceTests
{
    [Fact]
    public void NoInput_EventuallyFalls()
    {
        var b = new BalanceMeter(new BalanceSettings(), 7);
        b.Begin();
        float t = 0;
        while (!b.Failed && t < 20f) { b.Step(1f / 60f, 0f); t += 1f / 60f; }
        Assert.True(b.Failed);
        Assert.True(t < 8f, $"fell after {t}s");
    }

    [Fact]
    public void ReasonablePlayer_CanBalanceTenSeconds()
    {
        for (uint seed = 1; seed < 20; seed++)
        {
            var b = new BalanceMeter(new BalanceSettings(), seed);
            b.Begin();
            for (int i = 0; i < 600; i++)
            {
                // Human-like correction with ~0.1s reaction lag approximated by using velocity damping.
                float input = -(b.Value * 1.6f + b.Velocity * 0.45f);
                b.Step(1f / 60f, input);
                Assert.False(b.Failed, $"seed {seed} failed at {i / 60f:0.00}s");
            }
        }
    }

    [Fact]
    public void Assist_MakesItEasier()
    {
        float Survive(float assist)
        {
            float total = 0;
            for (uint seed = 1; seed < 10; seed++)
            {
                var b = new BalanceMeter(new BalanceSettings(), seed) { Assist = assist };
                b.Begin();
                float t = 0;
                while (!b.Failed && t < 30f) { b.Step(1f / 60f, 0f); t += 1f / 60f; }
                total += t;
            }
            return total;
        }
        Assert.True(Survive(0.6f) > Survive(1f));
    }
}

public class StatsTests
{
    [Fact]
    public void EveryPartIsAFairTradeOff()
    {
        var c = PartCatalog.CreateDefault();
        Assert.Empty(c.ValidateBalance());
    }

    [Fact]
    public void EverySlotHasADefaultFreePart()
    {
        var c = PartCatalog.CreateDefault();
        foreach (PartSlot s in Enum.GetValues(typeof(PartSlot)))
        {
            var d = c.DefaultFor(s);
            Assert.NotNull(d);
            Assert.Equal(1, d.UnlockLevel);
        }
    }

    [Fact]
    public void DefaultBuild_IsNeutral()
    {
        var c = PartCatalog.CreateDefault();
        var s = c.Evaluate(c.CreateDefaultBuild());
        Assert.InRange(s.WeightKg, 3.4f, 3.9f);
        for (int i = 0; i < ScooterStats.Count; i++) Assert.InRange(s.Stats[(StatId)i], 4.8f, 5.2f);
    }

    [Fact]
    public void NoBuildMaxesEverything()
    {
        var c = PartCatalog.CreateDefault();
        // Greedy "best" build: pick per slot the part with the highest sum of modifiers.
        var b = c.CreateDefaultBuild();
        foreach (PartSlot slot in Enum.GetValues(typeof(PartSlot)))
        {
            PartDefinition best = null; float bestSum = float.MinValue;
            foreach (var p in c.ForSlot(slot))
            {
                float sum = p.Modifiers.SumPositive() + p.Modifiers.SumNegative();
                if (sum > bestSum) { bestSum = sum; best = p; }
            }
            b.Set(slot, best.Id);
        }
        var s = c.Evaluate(b).Stats;
        float total = 0; int above7 = 0;
        for (int i = 0; i < ScooterStats.Count; i++) { total += s[(StatId)i]; if (s[(StatId)i] > 7f) above7++; }
        Assert.True(total < ScooterStats.Count * 5f + 3.5f, $"total {total}");
        Assert.True(above7 <= 2);
    }

    [Fact]
    public void Sanitize_FillsMissingSlots()
    {
        var c = PartCatalog.CreateDefault();
        var b = new ScooterBuild();
        b.Set(PartSlot.Deck, "does_not_exist");
        c.Sanitize(b);
        Assert.Equal("deck_street", b.Get(PartSlot.Deck));
        Assert.NotNull(b.Get(PartSlot.Pegs));
    }
}

public class ProgressionAndSaveTests
{
    [Fact]
    public void Xp_LevelsUpMultipleTimes()
    {
        var p = new ProfileData();
        var g = ProgressionRules.AddXp(p, ProgressionRules.XpForNextLevel(1) + ProgressionRules.XpForNextLevel(2) + 10);
        Assert.Equal(2, g.LevelsGained);
        Assert.Equal(3, p.Level);
        Assert.Equal(10, p.Xp);
    }

    [Fact]
    public void LevelCurve_IsIncreasing()
    {
        for (int l = 1; l < ProgressionRules.MaxLevel; l++)
            Assert.True(ProgressionRules.XpForNextLevel(l + 1) > ProgressionRules.XpForNextLevel(l));
    }

    [Fact]
    public void Normalize_RepairsNullsAndGrantsDefaults()
    {
        var parts = PartCatalog.CreateDefault();
        var s = new SaveData { Profile = null, Tricks = null, ActiveBuild = null };
        s.Normalize(parts);
        Assert.NotNull(s.Profile);
        Assert.NotNull(s.ActiveBuild);
        Assert.Contains("deck_street", s.OwnedParts);
        Assert.Contains("plaza", s.UnlockedFastTravel);
        Assert.Equal(1, s.GetTrick("x", true).Landed + 1);
    }
}

public class ChallengeTests
{
    [Fact]
    public void Challenges_CompleteFromSignals()
    {
        var t = new ChallengeTracker(ChallengeTracker.CreateDefault(), null);
        string done = null;
        t.Completed += d => done = d.Id;
        t.Report(ChallengeSignal.ComboBanked, 1200, null, 3);
        Assert.Equal("c_first_combo", done);
        for (int i = 0; i < 4; i++) t.Report(ChallengeSignal.TrickLanded, 0, TrickIds.Tailwhip);
        Assert.False(t.IsCompleted("c_tailwhip5"));
        t.Report(ChallengeSignal.TrickLanded, 0, TrickIds.Tailwhip);
        Assert.True(t.IsCompleted("c_tailwhip5"));
        t.Report(ChallengeSignal.SpotEntered, 0, "secret_roof");
        Assert.True(t.IsCompleted("c_secret_roof"));
    }

    [Fact]
    public void AlreadyCompleted_DoesNotFireAgain()
    {
        var t = new ChallengeTracker(ChallengeTracker.CreateDefault(), new[] { "c_first_combo" });
        int fired = 0;
        t.Completed += _ => fired++;
        t.Report(ChallengeSignal.ComboBanked, 5000, null, 1);
        Assert.Equal(0, fired);
    }
}

public class DuelTests
{
    [Fact]
    public void FailedReply_GivesLetter_AndFullWordLoses()
    {
        var m = new DuelMatch(new DuelRules { Word = "SCO" }, "A", "B");
        for (int i = 0; i < 3; i++)
        {
            Assert.Equal(0, m.ActivePlayer);
            m.SubmitAttempt(true, 1000, "line");
            Assert.Equal(DuelPhase.FollowerTurn, m.Phase);
            Assert.Equal(1, m.ActivePlayer);
            m.SubmitAttempt(true, 900, "worse");
        }
        Assert.Equal(DuelPhase.Finished, m.Phase);
        Assert.Equal(0, m.Winner);
        Assert.Equal("SCO", m.LettersText(1));
    }

    [Fact]
    public void MissedSet_PassesSetterRole()
    {
        var m = new DuelMatch(new DuelRules(), "A", "B");
        m.SubmitAttempt(false, 0);
        Assert.Equal(1, m.Setter);
        Assert.Equal(DuelPhase.SetterTurn, m.Phase);
        m.SubmitAttempt(true, 100); // below MinSetScore -> doesn't count
        Assert.Equal(0, m.Setter);
    }

    [Fact]
    public void MatchedReply_NoLetter()
    {
        var m = new DuelMatch(new DuelRules(), "A", "B");
        m.SubmitAttempt(true, 1000);
        m.SubmitAttempt(true, 1000);
        Assert.Equal(0, m.Letters(1));
        Assert.Equal(DuelPhase.SetterTurn, m.Phase);
    }

    [Fact]
    public void RoundCap_EndsMatchWithLeader()
    {
        var m = new DuelMatch(new DuelRules { MaxRounds = 2 }, "A", "B");
        m.SubmitAttempt(true, 1000);
        m.SubmitAttempt(false, 0);  // B gets S
        m.SubmitAttempt(false, 0);  // A misses set -> round 3 > cap
        Assert.Equal(DuelPhase.Finished, m.Phase);
        Assert.Equal(0, m.Winner);
    }
}

public class NetworkTests
{
    [Fact]
    public void Offline_ReportsUnavailable_NoFakePlayers()
    {
        var n = new OfflineNetworkService(new PlayerIdentity { PlayerId = "p" });
        Assert.False(n.IsAvailable);
        string err = null; RoomInfo room = new RoomInfo();
        n.CreatePrivateRoom("duel", (r, e) => { room = r; err = e; });
        Assert.Null(room);
        Assert.False(string.IsNullOrEmpty(err));
    }

    [Fact]
    public void SnapshotBuffer_InterpolatesInThePast()
    {
        var b = new SnapshotBuffer { InterpolationDelay = 0.1f };
        b.Add(new RiderSnapshot { Time = 1.0, PosX = 0, RotW = 1 });
        b.Add(new RiderSnapshot { Time = 1.1, PosX = 1, RotW = 1 });
        b.Add(new RiderSnapshot { Time = 1.05, PosX = 99, RotW = 1 }); // out of order: ignored
        Assert.True(b.Sample(1.15, out var s));
        Assert.Equal(0.5f, s.PosX, 3);
        Assert.Equal(2, b.Count);
    }

    [Fact]
    public void ScoreValidator_RejectsImpossibleScores()
    {
        Assert.True(ScoreValidator.IsPlausible(50000, 120, 40, out _));
        Assert.False(ScoreValidator.IsPlausible(50000000, 10, 20, out _));
        Assert.False(ScoreValidator.IsPlausible(1000, 60, 0, out _));
    }
}

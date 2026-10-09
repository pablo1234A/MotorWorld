using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Core.Tricks;
using Xunit;

public class ScoringTests
{
    private static readonly TrickCatalog Cat = TrickCatalog.CreateDefault();

    [Fact]
    public void Combo_MultiplierCountsTricks_AndBanksAfterLinkWindow()
    {
        var combo = new ComboTracker(new ScoreRules { VarietyBonusPerFamily = 0f, DifficultyWeight = 0f });
        combo.AddTrick(Cat.Get(TrickIds.Barspin));
        combo.AddTrick(Cat.Get(TrickIds.Tailwhip));
        combo.Land(LandingQuality.Clean);
        Assert.Equal(800f, combo.BasePoints, 3);
        Assert.Equal(2f, combo.Multiplier);
        Assert.Equal(1600, combo.CurrentTotal);

        Assert.False(combo.Update(0.5f, linking: false).Banked);
        var result = combo.Update(0.3f, linking: false);
        Assert.True(result.Banked);
        Assert.Equal(1600, result.Total);
        Assert.False(combo.IsActive);
    }

    [Fact]
    public void Combo_LinkingKeepsComboAlive()
    {
        var combo = new ComboTracker(new ScoreRules());
        combo.AddTrick(Cat.Get(TrickIds.Barspin));
        combo.Land(LandingQuality.Clean);
        for (int i = 0; i < 100; i++) Assert.False(combo.Update(0.1f, linking: true).Banked);
        Assert.True(combo.IsActive);
    }

    [Fact]
    public void Combo_RepeatsAreWorthLess()
    {
        var combo = new ComboTracker(new ScoreRules { DifficultyWeight = 0f });
        float a = combo.AddTrick(Cat.Get(TrickIds.Barspin));
        float b = combo.AddTrick(Cat.Get(TrickIds.Barspin));
        float c = combo.AddTrick(Cat.Get(TrickIds.Barspin));
        Assert.Equal(300f, a, 3);
        Assert.Equal(150f, b, 3);
        Assert.Equal(75f, c, 3);
    }

    [Fact]
    public void Combo_VarietyBeatsSpam()
    {
        var rules = new ScoreRules();
        var spam = new ComboTracker(rules);
        for (int i = 0; i < 4; i++) spam.AddTrick(Cat.Get(TrickIds.Tailwhip));
        var varied = new ComboTracker(rules);
        varied.AddTrick(Cat.Get(TrickIds.Tailwhip));
        varied.AddTrick(Cat.Get(TrickIds.Manual));
        varied.AddTrick(Cat.Get(TrickIds.Feeble));
        varied.AddTrick(Cat.Get(TrickIds.Spin360));
        Assert.True(varied.CurrentTotal > spam.CurrentTotal);
    }

    [Fact]
    public void Combo_LandingQualityScalesLastSegmentOnly()
    {
        var rules = new ScoreRules { DifficultyWeight = 0f };
        var combo = new ComboTracker(rules);
        combo.AddTrick(Cat.Get(TrickIds.Barspin)); // 300
        combo.Land(LandingQuality.Perfect);           // 375
        combo.AddTrick(Cat.Get(TrickIds.XUp));     // +200
        combo.Land(LandingQuality.Sketchy);           // +140
        Assert.Equal(375f + 140f, combo.BasePoints, 3);
    }

    [Fact]
    public void Bail_LosesTheCombo()
    {
        var combo = new ComboTracker(new ScoreRules());
        combo.AddTrick(Cat.Get(TrickIds.Barspin));
        combo.AddTrick(Cat.Get(TrickIds.Tailwhip));
        int lost = combo.Bail();
        Assert.True(lost > 0);
        Assert.False(combo.IsActive);
        Assert.Equal(0, combo.CurrentTotal);
    }

    [Fact]
    public void AirBonus_RequiresMinimumAirtime()
    {
        var combo = new ComboTracker(new ScoreRules());
        Assert.Equal(0f, combo.AddAirBonus(0.2f, 0.3f));
        Assert.True(combo.AddAirBonus(1.2f, 2f) > 0f);
    }

    [Fact]
    public void SessionStats_TracksBestCombo()
    {
        var s = new SessionStats();
        s.RegisterCombo(new ComboResult { Banked = true, Total = 500, Summary = "a" });
        s.RegisterCombo(new ComboResult { Banked = true, Total = 1200, Summary = "b" });
        s.RegisterCombo(new ComboResult { Banked = false, Total = 99999 });
        Assert.Equal(1700, s.TotalScore);
        Assert.Equal(1200, s.BestCombo);
        Assert.Equal("b", s.BestComboSummary);
    }
}

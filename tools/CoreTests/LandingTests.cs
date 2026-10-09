using ScooterUnleashed.Core.Scoring;
using Xunit;

public class LandingTests
{
    private static LandingInput Clean() => new LandingInput
    {
        UpAngleDeg = 3, HeadingErrorDeg = 2, ImpactSpeed = 3, PendingTrickCompletion = 1, PendingTrickLandable = 0.85f, GroundSpeed = 6
    };

    [Fact]
    public void PerfectLanding()
    {
        var r = LandingEvaluator.Evaluate(Clean(), new LandingTolerances());
        Assert.Equal(LandingQuality.Perfect, r.Quality);
    }

    [Fact]
    public void UnfinishedFlip_Bails()
    {
        var i = Clean(); i.UpAngleDeg = 90;
        Assert.Equal(BailReason.OverRotated, LandingEvaluator.Evaluate(i, new LandingTolerances()).Reason);
    }

    [Fact]
    public void Sideways_Bails_ButFakieIsLegal()
    {
        var i = Clean(); i.HeadingErrorDeg = 85;
        Assert.Equal(BailReason.Sideways, LandingEvaluator.Evaluate(i, new LandingTolerances()).Reason);
        i.HeadingErrorDeg = 175;
        var r = LandingEvaluator.Evaluate(i, new LandingTolerances());
        Assert.False(r.IsBail);
        Assert.True(r.Fakie);
    }

    [Fact]
    public void UnfinishedTailwhip_BailsOrIsSketchy()
    {
        var i = Clean(); i.PendingTrickCompletion = 0.5f;
        Assert.Equal(BailReason.TrickUnfinished, LandingEvaluator.Evaluate(i, new LandingTolerances()).Reason);
        i.PendingTrickCompletion = 0.9f;
        Assert.Equal(LandingQuality.Sketchy, LandingEvaluator.Evaluate(i, new LandingTolerances()).Quality);
    }

    [Fact]
    public void HoldingBodyTrick_Bails()
    {
        var i = Clean(); i.HoldingBodyTrick = true;
        Assert.True(LandingEvaluator.Evaluate(i, new LandingTolerances()).IsBail);
    }

    [Fact]
    public void HardImpact_Bails_AssistWidensWindow()
    {
        var i = Clean(); i.ImpactSpeed = 15f;
        Assert.True(LandingEvaluator.Evaluate(i, new LandingTolerances()).IsBail);
        Assert.False(LandingEvaluator.Evaluate(i, new LandingTolerances().Scaled(1.3f)).IsBail);
    }

    [Fact]
    public void HeadingIgnoredWhenAlmostStopped()
    {
        var i = Clean(); i.HeadingErrorDeg = 90; i.GroundSpeed = 0.5f;
        Assert.False(LandingEvaluator.Evaluate(i, new LandingTolerances()).IsBail);
    }
}

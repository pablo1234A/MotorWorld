using ScooterUnleashed.Core.Tricks;
using Xunit;

public class TrickTests
{
    [Fact]
    public void DefaultCatalog_HasUniqueIdsAndScores()
    {
        var c = TrickCatalog.CreateDefault();
        Assert.True(c.All.Count >= 25);
        foreach (var t in c.All)
        {
            Assert.False(string.IsNullOrEmpty(t.DisplayName));
            Assert.True(t.BaseScore > 0, t.Id);
            Assert.False(string.IsNullOrEmpty(t.Description), t.Id);
            if (!t.IsHeld && t.Family == TrickFamily.Scooter) Assert.True(t.ExecutionTime > 0f, t.Id);
        }
    }

    [Theory]
    [InlineData(GestureKind.Swipe, Dir8.Left, TrickIds.Barspin)]
    [InlineData(GestureKind.Swipe, Dir8.Right, TrickIds.Barspin)]
    [InlineData(GestureKind.Swipe, Dir8.Down, TrickIds.Tailwhip)]
    [InlineData(GestureKind.Swipe, Dir8.Up, TrickIds.XUp)]
    [InlineData(GestureKind.Swipe, Dir8.DownLeft, TrickIds.BriFlip)]
    [InlineData(GestureKind.Swipe, Dir8.DownRight, TrickIds.BriFlip)]
    [InlineData(GestureKind.HoldSwipe, Dir8.Up, TrickIds.Superman)]
    [InlineData(GestureKind.HoldSwipe, Dir8.Down, TrickIds.NoFooted)]
    [InlineData(GestureKind.HoldSwipe, Dir8.Left, TrickIds.CanCan)]
    public void AirGestures_MapToCoherentTricks(GestureKind kind, Dir8 dir, string expected)
    {
        var c = TrickCatalog.CreateDefault();
        Assert.Equal(expected, c.FindByGesture(TrickContext.Air, kind, dir)?.Id);
    }

    [Fact]
    public void GroundSwipes_AreManualsNotAirTricks()
    {
        var c = TrickCatalog.CreateDefault();
        Assert.Equal(TrickIds.Manual, c.FindByGesture(TrickContext.Ground, GestureKind.Swipe, Dir8.Down)?.Id);
        Assert.Equal(TrickIds.NoseManual, c.FindByGesture(TrickContext.Ground, GestureKind.Swipe, Dir8.Up)?.Id);
        Assert.Null(c.FindByGesture(TrickContext.Ground, GestureKind.Swipe, Dir8.Left));
    }

    [Fact]
    public void NoTwoAirTricksShareTheSameGesture()
    {
        var c = TrickCatalog.CreateDefault();
        foreach (GestureKind k in new[] { GestureKind.Swipe, GestureKind.HoldSwipe })
            for (int d = 0; d < 8; d++)
            {
                int matches = 0;
                foreach (var t in c.All)
                    if ((t.Context & TrickContext.Air) != 0 && t.Trigger.Matches(k, (Dir8)d)) matches++;
                Assert.True(matches <= 1, $"{k} {(Dir8)d} triggers {matches} tricks");
            }
    }

    [Theory]
    [InlineData(0f, 0f, "")]
    [InlineData(140f, 0f, "180")]
    [InlineData(-175f, 0f, "180")]
    [InlineData(330f, 0f, "360")]
    [InlineData(500f, 0f, "540")]
    [InlineData(0f, 340f, "Backflip")]
    [InlineData(0f, -360f, "Frontflip")]
    [InlineData(180f, 360f, "Flair")]
    [InlineData(360f, 720f, "Double Backflip 360")]
    [InlineData(0f, 250f, "")]
    public void RotationResolver_NamesPhysicalRotation(float yaw, float pitch, string expected)
    {
        Assert.Equal(expected, RotationResolver.Resolve(yaw, pitch).DisplayName);
    }

    [Fact]
    public void Dir8_FromAngle()
    {
        Assert.Equal(Dir8.Right, Dir8Util.FromAngle(5));
        Assert.Equal(Dir8.Up, Dir8Util.FromAngle(92));
        Assert.Equal(Dir8.DownLeft, Dir8Util.FromAngle(225));
        Assert.Equal(Dir8.Right, Dir8Util.FromAngle(-10));
        Assert.Equal(Dir8.Left, Dir8Util.MirrorX(Dir8.Right));
    }
}

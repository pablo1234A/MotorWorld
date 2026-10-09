using System;
using System.Collections.Generic;
using ScooterUnleashed.Core;
using ScooterUnleashed.Core.Input;
using ScooterUnleashed.Core.Tricks;
using Xunit;

public class GestureTests
{
    private static List<GestureEvent> Drain(GestureRecognizer g)
    {
        var list = new List<GestureEvent>();
        while (g.TryDequeue(out var e)) list.Add(e);
        return list;
    }

    private static void Line(GestureRecognizer g, Vec2 from, Vec2 to, double t0, double t1, int steps)
    {
        for (int i = 1; i <= steps; i++)
        {
            float k = i / (float)steps;
            g.Move(from + (to - from) * k, t0 + (t1 - t0) * k);
        }
    }

    [Fact]
    public void Tap_IsPressAndUnconsumedRelease()
    {
        var g = new GestureRecognizer();
        g.Begin(new Vec2(0, 0), 0);
        g.End(new Vec2(1, 0), 0.1);
        var ev = Drain(g);
        Assert.Equal(2, ev.Count);
        Assert.Equal(GestureKind.Press, ev[0].Kind);
        Assert.Equal(GestureKind.Release, ev[1].Kind);
        Assert.False(ev[1].Consumed);
        Assert.False(ev[1].WasHold);
    }

    [Theory]
    [InlineData(50, 0, Dir8.Right)]
    [InlineData(-50, 0, Dir8.Left)]
    [InlineData(0, -50, Dir8.Down)]
    [InlineData(0, 50, Dir8.Up)]
    [InlineData(40, -40, Dir8.DownRight)]
    [InlineData(-40, -40, Dir8.DownLeft)]
    [InlineData(50, -18, Dir8.Right)] // slightly off-axis stays cardinal (narrow diagonals)
    public void QuickFlick_IsSwipeInThatDirection(float dx, float dy, Dir8 expected)
    {
        var g = new GestureRecognizer();
        g.Begin(new Vec2(0, 0), 0);
        Line(g, new Vec2(0, 0), new Vec2(dx, dy), 0, 0.1, 6);
        g.End(new Vec2(dx, dy), 0.11);
        var ev = Drain(g);
        var swipes = ev.FindAll(e => e.Kind == GestureKind.Swipe);
        Assert.Single(swipes);
        Assert.Equal(expected, swipes[0].Direction);
        Assert.True(ev[ev.Count - 1].Consumed);
    }

    [Fact]
    public void SlowDrag_IsNotASwipe()
    {
        var g = new GestureRecognizer();
        g.Begin(new Vec2(0, 0), 0);
        Line(g, new Vec2(0, 0), new Vec2(50, 0), 0, 1.2, 60);
        g.End(new Vec2(50, 0), 1.25);
        Assert.DoesNotContain(Drain(g), e => e.Kind == GestureKind.Swipe);
    }

    [Fact]
    public void Swipe_CommitsWhenFingerStops_BeforeRelease()
    {
        var g = new GestureRecognizer();
        g.Begin(new Vec2(0, 0), 0);
        Line(g, new Vec2(0, 0), new Vec2(45, 0), 0, 0.08, 5);
        g.Tick(0.15);
        var ev = Drain(g);
        Assert.Contains(ev, e => e.Kind == GestureKind.Swipe && e.Direction == Dir8.Right);
    }

    [Fact]
    public void Hold_ThenFlick_IsHoldSwipe()
    {
        var g = new GestureRecognizer();
        g.Begin(new Vec2(0, 0), 0);
        g.Tick(0.1);
        g.Tick(0.25);
        Line(g, new Vec2(0, 0), new Vec2(0, 60), 0.3, 0.38, 5);
        g.End(new Vec2(0, 60), 0.9);
        var ev = Drain(g);
        Assert.Contains(ev, e => e.Kind == GestureKind.HoldStart);
        Assert.Contains(ev, e => e.Kind == GestureKind.HoldSwipe && e.Direction == Dir8.Up);
        Assert.DoesNotContain(ev, e => e.Kind == GestureKind.Swipe);
        var rel = ev[ev.Count - 1];
        Assert.True(rel.WasHold);
    }

    [Fact]
    public void Circle_ProducesCircleStepsAndNoSwipes()
    {
        var g = new GestureRecognizer();
        const float r = 45f;
        g.Begin(new Vec2(r, 0), 0);
        int n = 48;
        for (int i = 1; i <= n; i++)
        {
            double a = i / (double)n * Math.PI * 2; // counter-clockwise full turn
            g.Move(new Vec2((float)(Math.Cos(a) * r), (float)(Math.Sin(a) * r)), i * 0.012);
        }
        g.End(new Vec2(r, 0), n * 0.012 + 0.01);
        var ev = Drain(g);
        var circles = ev.FindAll(e => e.Kind == GestureKind.Circle);
        Assert.Equal(2, circles.Count);
        Assert.All(circles, c => Assert.Equal(1, c.CircleSign));
        Assert.DoesNotContain(ev, e => e.Kind == GestureKind.Swipe);
    }

    [Fact]
    public void ClockwiseCircle_HasNegativeSign()
    {
        var g = new GestureRecognizer();
        const float r = 45f;
        g.Begin(new Vec2(r, 0), 0);
        for (int i = 1; i <= 30; i++)
        {
            double a = -i / 30.0 * Math.PI * 1.2;
            g.Move(new Vec2((float)(Math.Cos(a) * r), (float)(Math.Sin(a) * r)), i * 0.012);
        }
        var ev = Drain(g);
        var c = ev.Find(e => e.Kind == GestureKind.Circle);
        Assert.Equal(-1, c.CircleSign);
    }

    [Fact]
    public void LongFastStraightSwipe_GivesTwoSwipes_ForDoubleTricks()
    {
        var g = new GestureRecognizer();
        g.Begin(new Vec2(0, 0), 0);
        Line(g, new Vec2(0, 0), new Vec2(170, 0), 0, 0.16, 20);
        g.End(new Vec2(170, 0), 0.17);
        Assert.Equal(2, Drain(g).FindAll(e => e.Kind == GestureKind.Swipe).Count);
    }

    [Fact]
    public void HigherSensitivity_ShorterSwipes()
    {
        var g = new GestureRecognizer(new GestureSettings { Sensitivity = 2f });
        g.Begin(new Vec2(0, 0), 0);
        Line(g, new Vec2(0, 0), new Vec2(25, 0), 0, 0.06, 4);
        g.End(new Vec2(25, 0), 0.07);
        Assert.Contains(Drain(g), e => e.Kind == GestureKind.Swipe);
    }
}

using System;

namespace ScooterUnleashed.Core.Tricks
{
    public enum TrickFamily
    {
        Pop,        // bunny hop / ollie style launch
        Scooter,    // the scooter moves relative to the rider: barspin, tailwhip, bri flip, x-up
        Body,       // the rider's legs/body move: no-footed, can-can, superman
        Rotation,   // yaw rotations: 180, 360...
        Flip,       // pitch rotations: backflip, frontflip, flair
        Grind,      // rails, ledges, coping
        Manual,     // balance on one wheel
        Transition  // reverts, fakie landings
    }

    /// <summary>Where a trick may be started.</summary>
    [Flags]
    public enum TrickContext
    {
        None = 0,
        Ground = 1,
        Air = 2,
        Grind = 4,
        Manual = 8,
    }

    /// <summary>Body parts / scooter parts a trick occupies. Two tricks can overlap only if channels don't collide.</summary>
    [Flags]
    public enum TrickChannel
    {
        None = 0,
        Bars = 1,
        Deck = 2,
        Legs = 4,
    }

    /// <summary>8-way direction in screen space (Up = towards top of the screen).</summary>
    public enum Dir8
    {
        None = -1,
        Right = 0,
        UpRight = 1,
        Up = 2,
        UpLeft = 3,
        Left = 4,
        DownLeft = 5,
        Down = 6,
        DownRight = 7,
    }

    public enum GestureKind
    {
        None,
        Press,      // finger down on the action zone
        HoldStart,  // finger stayed still long enough to become a hold
        Swipe,      // quick straight flick
        HoldSwipe,  // flick performed while holding (body tricks)
        Circle,     // finger drew another 180 degrees of a circle
        Release,    // finger up
    }

    public static class Dir8Util
    {
        /// <summary>Converts an angle (0 = right, CCW positive) into one of 8 sectors.</summary>
        public static Dir8 FromAngle(float angleDeg)
        {
            float a = angleDeg % 360f;
            if (a < 0) a += 360f;
            int sector = (int)Math.Floor((a + 22.5f) / 45f) % 8;
            return (Dir8)sector;
        }

        public static Dir8 FromVector(Vec2 v) => v.Magnitude < 1e-5f ? Dir8.None : FromAngle(v.AngleDeg);

        /// <summary>Mirror horizontally (Left &lt;-&gt; Right).</summary>
        public static Dir8 MirrorX(Dir8 d)
        {
            switch (d)
            {
                case Dir8.Right: return Dir8.Left;
                case Dir8.Left: return Dir8.Right;
                case Dir8.UpRight: return Dir8.UpLeft;
                case Dir8.UpLeft: return Dir8.UpRight;
                case Dir8.DownRight: return Dir8.DownLeft;
                case Dir8.DownLeft: return Dir8.DownRight;
                default: return d;
            }
        }

        /// <summary>-1 for left-ish directions, +1 for right-ish, 0 for pure vertical.</summary>
        public static int HorizontalSign(Dir8 d)
        {
            switch (d)
            {
                case Dir8.Right: case Dir8.UpRight: case Dir8.DownRight: return 1;
                case Dir8.Left: case Dir8.UpLeft: case Dir8.DownLeft: return -1;
                default: return 0;
            }
        }

        /// <summary>Collapse diagonals into the 4 cardinal directions (vertical wins ties on the diagonal).</summary>
        public static Dir8 ToCardinal(Dir8 d)
        {
            switch (d)
            {
                case Dir8.UpLeft: case Dir8.UpRight: return Dir8.Up;
                case Dir8.DownLeft: case Dir8.DownRight: return Dir8.Down;
                default: return d;
            }
        }
    }

    /// <summary>The input that starts a trick.</summary>
    [Serializable]
    public struct TrickTrigger
    {
        public GestureKind Kind;
        public Dir8 Direction;
        /// <summary>If true, the horizontally mirrored direction also triggers the trick (e.g. barspin left/right).</summary>
        public bool Mirrored;

        public TrickTrigger(GestureKind kind, Dir8 direction, bool mirrored)
        {
            Kind = kind; Direction = direction; Mirrored = mirrored;
        }

        public bool Matches(GestureKind kind, Dir8 dir)
        {
            if (kind != Kind) return false;
            if (Direction == Dir8.None) return true;
            return dir == Direction || (Mirrored && Dir8Util.MirrorX(dir) == Direction);
        }

        public static readonly TrickTrigger None = new TrickTrigger(GestureKind.None, Dir8.None, false);
    }
}

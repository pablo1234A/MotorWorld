using System;
using System.Collections.Generic;

namespace ScooterUnleashed.Core.Network
{
    // Architecture for real online play. No transport is implemented yet: the game ships an offline
    // service that reports itself unavailable instead of faking remote players.

    public enum ConnectionState { Offline, Connecting, Online, Reconnecting, Failed }

    [Serializable]
    public struct PlayerIdentity
    {
        public string PlayerId;
        public string DisplayName;
        public int Level;
    }

    [Serializable]
    public class RoomInfo
    {
        public string RoomId;
        public string InviteCode;
        public bool IsPrivate = true;
        public int MaxPlayers = 2;
        public string ModeId;
        public List<PlayerIdentity> Players = new List<PlayerIdentity>();
    }

    /// <summary>State replicated ~15-20 times per second per rider.</summary>
    [Serializable]
    public struct RiderSnapshot
    {
        public double Time;        // sender clock (seconds)
        public float PosX, PosY, PosZ;
        public float RotX, RotY, RotZ, RotW;
        public float VelX, VelY, VelZ;
        public byte State;         // ScooterState
        public ushort ActiveTrick; // index into the trick catalog, 0 = none
        public float TrickProgress;
        public float Crouch;
    }

    /// <summary>Discrete gameplay events are sent reliably and validated by the host/server.</summary>
    [Serializable]
    public struct TrickEventMessage
    {
        public double Time;
        public string TrickId;
        public float Points;
        public bool Landed;
    }

    public interface INetworkService
    {
        ConnectionState State { get; }
        bool IsAvailable { get; }
        string UnavailableReason { get; }
        PlayerIdentity Local { get; }
        void CreatePrivateRoom(string modeId, Action<RoomInfo, string> callback);
        void JoinWithInvite(string inviteCode, Action<RoomInfo, string> callback);
        void Leave();
        void SendSnapshot(in RiderSnapshot snapshot);
        void SendTrickEvent(in TrickEventMessage message);
        event Action<string, RiderSnapshot> SnapshotReceived;
        event Action<string, TrickEventMessage> TrickEventReceived;
        event Action<ConnectionState> StateChanged;
    }

    public interface ILeaderboardService
    {
        bool IsAvailable { get; }
        void Submit(string boardId, int score, Action<bool, string> callback);
        void Fetch(string boardId, int count, Action<IReadOnlyList<(string name, int score)>, string> callback);
    }

    /// <summary>The honest default: online features are not available until a backend is configured.</summary>
    public sealed class OfflineNetworkService : INetworkService
    {
        public OfflineNetworkService(PlayerIdentity local) { Local = local; }
        public ConnectionState State => ConnectionState.Offline;
        public bool IsAvailable => false;
        public string UnavailableReason => "El modo online necesita un proveedor de red y credenciales (aún no configurado).";
        public PlayerIdentity Local { get; }
        public void CreatePrivateRoom(string modeId, Action<RoomInfo, string> callback) => callback?.Invoke(null, UnavailableReason);
        public void JoinWithInvite(string inviteCode, Action<RoomInfo, string> callback) => callback?.Invoke(null, UnavailableReason);
        public void Leave() { }
        public void SendSnapshot(in RiderSnapshot snapshot) { }
        public void SendTrickEvent(in TrickEventMessage message) { }
#pragma warning disable 67
        public event Action<string, RiderSnapshot> SnapshotReceived;
        public event Action<string, TrickEventMessage> TrickEventReceived;
        public event Action<ConnectionState> StateChanged;
#pragma warning restore 67
    }

    /// <summary>
    /// Buffers remote snapshots and returns an interpolated state rendered slightly in the past
    /// (classic entity interpolation) so remote riders move smoothly despite jitter.
    /// </summary>
    public sealed class SnapshotBuffer
    {
        private readonly List<RiderSnapshot> _buffer = new List<RiderSnapshot>();
        public float InterpolationDelay = 0.12f;
        public int Capacity = 32;
        public int Count => _buffer.Count;

        public void Add(in RiderSnapshot s)
        {
            if (_buffer.Count > 0 && s.Time <= _buffer[_buffer.Count - 1].Time) return; // out of order / duplicate
            _buffer.Add(s);
            if (_buffer.Count > Capacity) _buffer.RemoveAt(0);
        }

        /// <summary>Samples the buffer at renderTime = latestTime - delay. Returns false when empty.</summary>
        public bool Sample(double now, out RiderSnapshot result)
        {
            result = default;
            if (_buffer.Count == 0) return false;
            double t = now - InterpolationDelay;
            if (t <= _buffer[0].Time) { result = _buffer[0]; return true; }
            for (int i = 0; i < _buffer.Count - 1; i++)
            {
                var a = _buffer[i];
                var b = _buffer[i + 1];
                if (t >= a.Time && t <= b.Time)
                {
                    float k = (float)((t - a.Time) / Math.Max(1e-6, b.Time - a.Time));
                    result = Lerp(a, b, k);
                    return true;
                }
            }
            // Past the newest snapshot: short extrapolation using velocity, capped to avoid overshoot.
            var last = _buffer[_buffer.Count - 1];
            float dt = (float)Math.Min(0.25, t - last.Time);
            result = last;
            result.PosX += last.VelX * dt; result.PosY += last.VelY * dt; result.PosZ += last.VelZ * dt;
            return true;
        }

        private static RiderSnapshot Lerp(in RiderSnapshot a, in RiderSnapshot b, float k)
        {
            var r = k < 0.5f ? a : b;
            r.Time = a.Time + (b.Time - a.Time) * k;
            r.PosX = a.PosX + (b.PosX - a.PosX) * k;
            r.PosY = a.PosY + (b.PosY - a.PosY) * k;
            r.PosZ = a.PosZ + (b.PosZ - a.PosZ) * k;
            r.VelX = a.VelX + (b.VelX - a.VelX) * k;
            r.VelY = a.VelY + (b.VelY - a.VelY) * k;
            r.VelZ = a.VelZ + (b.VelZ - a.VelZ) * k;
            // Normalized lerp of quaternions (shortest path).
            float dot = a.RotX * b.RotX + a.RotY * b.RotY + a.RotZ * b.RotZ + a.RotW * b.RotW;
            float s = dot < 0 ? -1f : 1f;
            float x = a.RotX + (b.RotX * s - a.RotX) * k, y = a.RotY + (b.RotY * s - a.RotY) * k;
            float z = a.RotZ + (b.RotZ * s - a.RotZ) * k, w = a.RotW + (b.RotW * s - a.RotW) * k;
            float m = (float)Math.Sqrt(x * x + y * y + z * z + w * w);
            if (m > 1e-6f) { x /= m; y /= m; z /= m; w /= m; }
            r.RotX = x; r.RotY = y; r.RotZ = z; r.RotW = w;
            r.TrickProgress = a.TrickProgress + (b.TrickProgress - a.TrickProgress) * k;
            r.Crouch = a.Crouch + (b.Crouch - a.Crouch) * k;
            return r;
        }
    }

    /// <summary>Plausibility checks a host/server runs before accepting a submitted score.</summary>
    public static class ScoreValidator
    {
        /// <summary>Very generous upper bound on points per second of riding (catalog max * multiplier cap).</summary>
        public const float MaxPointsPerSecond = 60000f;

        public static bool IsPlausible(int score, float sessionSeconds, int tricks, out string reason)
        {
            reason = null;
            if (score < 0) { reason = "negative score"; return false; }
            if (sessionSeconds <= 0f && score > 0) { reason = "zero duration"; return false; }
            if (score > MaxPointsPerSecond * Math.Max(1f, sessionSeconds)) { reason = "score rate too high"; return false; }
            if (tricks <= 0 && score > 0) { reason = "score without tricks"; return false; }
            if (tricks > sessionSeconds * 8f + 4) { reason = "too many tricks for duration"; return false; }
            return true;
        }
    }
}

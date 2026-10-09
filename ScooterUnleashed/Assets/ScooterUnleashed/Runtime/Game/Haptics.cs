using UnityEngine;

namespace ScooterUnleashed.Game
{
    /// <summary>Optional, short haptic pulses (Android vibrator with duration; iOS falls back to the system vibration only for strong events).</summary>
    public static class Haptics
    {
        public static bool Enabled = true;
#if UNITY_ANDROID && !UNITY_EDITOR
        private static AndroidJavaObject _vibrator;
        private static bool _init;
#endif

        public static void Pulse(int milliseconds, bool strong = false)
        {
            if (!Enabled) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                if (!_init)
                {
                    _init = true;
                    using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                    using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                        _vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
                }
                _vibrator?.Call("vibrate", (long)Mathf.Clamp(milliseconds, 5, 200));
            }
            catch (System.Exception e) { Debug.LogWarning("[Haptics] " + e.Message); Enabled = false; }
#elif UNITY_IOS && !UNITY_EDITOR
            if (strong) SystemVibrate();
#endif
        }

        private static void SystemVibrate()
        {
            // Handheld.Vibrate is resolved by reflection to keep the assembly platform-neutral.
            var t = System.Type.GetType("UnityEngine.Handheld, UnityEngine.CoreModule") ?? System.Type.GetType("UnityEngine.Handheld, UnityEngine");
            t?.GetMethod("Vibrate")?.Invoke(null, null);
        }
    }
}

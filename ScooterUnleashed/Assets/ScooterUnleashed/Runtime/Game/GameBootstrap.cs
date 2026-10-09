using UnityEngine;

namespace ScooterUnleashed.Game
{
    /// <summary>
    /// Drop this on an empty GameObject in an empty scene (the editor setup does it for you) and press Play:
    /// the whole game (world, player, UI, audio) is created at runtime.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class GameBootstrap : MonoBehaviour
    {
        private void Awake()
        {
            if (GameManager.Instance != null) return;
            var go = new GameObject("ScooterUnleashed");
            go.AddComponent<GameManager>();
        }
    }
}

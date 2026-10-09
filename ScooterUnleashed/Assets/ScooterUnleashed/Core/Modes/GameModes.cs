namespace ScooterUnleashed.Core.Modes
{
    public enum GameModeId
    {
        FreeRoam,
        Freestyle,      // timed scoring session
        Duel,           // 1 vs 1 trick battle
        BestTrick,
        BestLine,
        TimeAttack,
        Tutorial,
    }

    public static class GameModeInfo
    {
        public static string Title(GameModeId id)
        {
            switch (id)
            {
                case GameModeId.FreeRoam: return "Mundo libre";
                case GameModeId.Freestyle: return "Sesión freestyle";
                case GameModeId.Duel: return "Duelo 1 vs 1";
                case GameModeId.BestTrick: return "Best Trick";
                case GameModeId.BestLine: return "Mejor línea";
                case GameModeId.TimeAttack: return "Contrarreloj";
                default: return "Tutorial";
            }
        }
    }
}

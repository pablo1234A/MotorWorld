using UnrealBuildTool;
using System.Collections.Generic;

public class IslandUntamedTarget : TargetRules
{
	public IslandUntamedTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("IslandUntamed");
	}
}

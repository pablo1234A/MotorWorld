using UnrealBuildTool;

public class IslandUntamed : ModuleRules
{
	public IslandUntamed(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// Folders (Core/, World/, Player/, Sim/ ...) are included relative to the module root.
		PublicIncludePaths.Add(ModuleDirectory);

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"ProceduralMeshComponent",
			"AIModule",
			"GameplayTasks",
			"NavigationSystem",
			"PhysicsCore",
			"Slate",
			"SlateCore",
			"UMG"
		});

		// The Sim/ layer is plain C++ (std containers), compiled without exceptions like the rest of UE.
		bEnableExceptions = false;
		bUseRTTI = false;
	}
}

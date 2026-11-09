// Island Untamed - in-engine automation tests (Session Frontend > Automation,
// or: UnrealEditor-Cmd IslandUntamed.uproject -ExecCmds="Automation RunTests IslandUntamed" -unattended -nullrhi).
// They complement the headless Sim tests (Tests/) by checking the data and
// systems through the Unreal module (paths, string conversion, packaging).
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Core/IUTypes.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Sim/SimGameData.h"
#include "Sim/SimIsland.h"

namespace IUAutomationLocal
{
	bool LoadDb(IUSim::GameDatabase& Db, FString& OutError)
	{
		const FString DataDir = FPaths::ProjectContentDir() / TEXT("Data");
		std::string Error;
		const bool bOk = Db.LoadAll([DataDir](const std::string& Name, std::string& Out)
		{
			FString Text;
			if (!FFileHelper::LoadFileToString(Text, *(DataDir / IU::ToFString(Name)))) { return false; }
			Out = IU::ToStd(Text);
			return true;
		}, Error);
		OutError = IU::ToFString(Error);
		return bOk;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FIUDataLoadsTest, "IslandUntamed.Data.LoadsAndValidates", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FIUDataLoadsTest::RunTest(const FString& Parameters)
{
	IUSim::GameDatabase Db;
	FString Error;
	const bool bOk = IUAutomationLocal::LoadDb(Db, Error);
	TestTrue(FString::Printf(TEXT("Game data loads (%s)"), *Error), bOk);
	TestTrue(TEXT("Has items"), Db.Items.All().size() > 50);
	TestNotNull(TEXT("Stone hatchet recipe"), Db.Recipes.Find("r_stone_hatchet"));
	TestNotNull(TEXT("Lean-to building"), Db.Buildings.Find("lean_to"));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FIUIslandTest, "IslandUntamed.World.IslandGenerates", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FIUIslandTest::RunTest(const FString& Parameters)
{
	IUSim::GameDatabase Db;
	FString Error;
	if (!IUAutomationLocal::LoadDb(Db, Error)) { AddError(Error); return false; }
	IUSim::IslandModel Island;
	Island.Generate(IUSim::IslandParams(), &Db.Nodes);
	TestNotNull(TEXT("Crash site exists"), Island.FindPOI("crash_site"));
	const FVector Spawn = IU::ToVector(Island.GetPlayerSpawn());
	TestTrue(TEXT("Spawn above sea level"), Spawn.Z > 0.0);
	TestTrue(TEXT("Rivers generated"), Island.GetRivers().size() > 0);
	return true;
}

#endif

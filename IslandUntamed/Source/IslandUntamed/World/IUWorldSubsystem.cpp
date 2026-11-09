#include "World/IUWorldSubsystem.h"

#include "IslandUntamed.h"
#include "Core/IUGameInstance.h"
#include "Creatures/IUCreature.h"
#include "Gameplay/IUStructure.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUIslandWorld.h"
#include "World/IUStorySubsystem.h"
#include "World/IUVillage.h"
#include "CollisionQueryParams.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"

namespace IUWorldSubsystemLocal
{
	constexpr float NotificationLifetime = 6.0f;
	constexpr int32 MaxNotifications = 6;
	constexpr float FogRevealRadiusMeters = 75.0f;

	TAutoConsoleVariable<float> CVarTimeScale(TEXT("iu.TimeScale"), 1.0f, TEXT("Multiplies the speed of the day/night cycle (debug)."));
}

UIUWorldSubsystem* UIUWorldSubsystem::Get(const UObject* WorldContext)
{
	const UWorld* World = (WorldContext && GEngine) ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	return World ? World->GetSubsystem<UIUWorldSubsystem>() : nullptr;
}

bool UIUWorldSubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

void UIUWorldSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Clock.Reset(5.5f, 0x15A1D5EEDULL);
	Persistence.InitFog(128);
	Random.Seed(static_cast<uint64>(FDateTime::Now().GetTicks()));
}

void UIUWorldSubsystem::Deinitialize()
{
	Island.Reset();
	Super::Deinitialize();
}

TStatId UIUWorldSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UIUWorldSubsystem, STATGROUP_Tickables);
}

bool UIUWorldSubsystem::GenerateIsland()
{
	if (Island.IsValid()) { return true; }
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!Db)
	{
		UE_LOG(LogIsland, Error, TEXT("Cannot generate the island: game data not loaded."));
		return false;
	}
	const double Start = FPlatformTime::Seconds();
	Island = MakeUnique<IUSim::IslandModel>();
	Island->Generate(IUSim::IslandParams(), &Db->Nodes);
	UE_LOG(LogIsland, Log, TEXT("Island generated in %.0f ms (%d POIs, %d rivers, %d lakes)"),
		(FPlatformTime::Seconds() - Start) * 1000.0, static_cast<int32>(Island->GetPOIs().size()),
		static_cast<int32>(Island->GetRivers().size()), static_cast<int32>(Island->GetLakes().size()));
	return true;
}

float UIUWorldSubsystem::GetGroundHeightCm(float X, float Y) const
{
	return Island ? Island->GetHeight(X * IU::CmToMeters, Y * IU::CmToMeters) * IU::MetersToCm : 0.0f;
}

float UIUWorldSubsystem::GetWaterLevelCm(float X, float Y) const
{
	return Island ? Island->GetWaterLevel(X * IU::CmToMeters, Y * IU::CmToMeters) * IU::MetersToCm : 0.0f;
}

IUSim::EBiome UIUWorldSubsystem::GetBiomeAt(const FVector& Location) const
{
	return Island ? Island->GetBiome(Location.X * IU::CmToMeters, Location.Y * IU::CmToMeters) : IUSim::EBiome::Ocean;
}

float UIUWorldSubsystem::GetAmbientTemperature(const FVector& Location) const
{
	if (!Island) { return 26.0f; }
	// Underground (caves) is stable and cool.
	if (IU::IsUnderground(Location)) { return 19.0f; }
	return Island->GetBaseTemperature(Location.X * IU::CmToMeters, Location.Y * IU::CmToMeters) + Clock.GetTemperatureOffset();
}

FVector UIUWorldSubsystem::GetPlayerSpawnLocation() const
{
	return Island ? IU::ToVector(Island->GetPlayerSpawn()) + FVector(0, 0, 120) : FVector(0, 0, 500);
}

void UIUWorldSubsystem::BroadcastEvent(IUSim::EGameEvent Type, const std::string& Target, int32 Count)
{
	IUSim::GameEvent E;
	E.Type = Type;
	E.Target = Target;
	E.Count = Count;
	OnGameEvent.Broadcast(E);
}

void UIUWorldSubsystem::Notify(const FString& Text, const FLinearColor& Color)
{
	FIUNotification N;
	N.Text = Text;
	N.Color = Color;
	N.Time = GetWorld() ? GetWorld()->GetRealTimeSeconds() : 0.0;
	Notifications.Add(N);
	while (Notifications.Num() > IUWorldSubsystemLocal::MaxNotifications) { Notifications.RemoveAt(0); }
	UE_LOG(LogIsland, Verbose, TEXT("Notify: %s"), *Text);
}

void UIUWorldSubsystem::NotifyPickup(const FString& ItemName, int32 Count)
{
	const double Now = GetWorld() ? GetWorld()->GetRealTimeSeconds() : 0.0;
	for (FIUNotification& N : Notifications)
	{
		if (N.MergeKey == ItemName && Now - N.Time < 3.0)
		{
			N.Count += Count;
			N.Time = Now;
			N.Text = FString::Printf(TEXT("+%d  %s"), N.Count, *ItemName);
			return;
		}
	}
	FIUNotification N;
	N.MergeKey = ItemName;
	N.Count = Count;
	N.Text = FString::Printf(TEXT("+%d  %s"), Count, *ItemName);
	N.Color = IU::Palette::Good;
	N.Time = Now;
	Notifications.Add(N);
	while (Notifications.Num() > IUWorldSubsystemLocal::MaxNotifications) { Notifications.RemoveAt(0); }
}

void UIUWorldSubsystem::TickNotifications()
{
	const double Now = GetWorld() ? GetWorld()->GetRealTimeSeconds() : 0.0;
	Notifications.RemoveAll([Now](const FIUNotification& N) { return Now - N.Time > IUWorldSubsystemLocal::NotificationLifetime; });
}

void UIUWorldSubsystem::Tick(float DeltaTime)
{
	if (!Island) { return; }
	TickNotifications();
	if (Flow != EIUGameFlow::Playing && Flow != EIUGameFlow::Intro) { return; }

	PlaySeconds += DeltaTime;
	const float Scale = TimeScale * IUWorldSubsystemLocal::CVarTimeScale.GetValueOnGameThread();
	const float Hours = Clock.Advance(DeltaTime * Scale);
	HoursAccumulator += Hours;
	SecondAccumulator += DeltaTime;
	if (SecondAccumulator >= 1.0f)
	{
		SecondAccumulator = 0.0f;
		const float H = HoursAccumulator;
		HoursAccumulator = 0.0f;
		OnGameHoursPassed.Broadcast(H);
	}

	DiscoveryTimer += DeltaTime;
	if (DiscoveryTimer >= 0.5f)
	{
		DiscoveryTimer = 0.0f;
		TickDiscovery();
	}

	RegrowTimer += DeltaTime;
	if (RegrowTimer >= 10.0f)
	{
		RegrowTimer = 0.0f;
		const std::vector<uint32_t> Regrown = Persistence.CollectRegrown(Clock.GetTotalHours());
		if (AIUIslandWorld* Actor = IslandActor.Get())
		{
			for (const uint32_t Id : Regrown) { Actor->RestoreNode(Id); }
		}
	}
}

FVector2D UIUWorldSubsystem::WorldToMap(const FVector& Location) const
{
	if (!Island) { return FVector2D(0.5, 0.5); }
	const double Size = Island->GetParams().Size * IU::MetersToCm;
	const double H = Size * 0.5;
	return FVector2D((Location.X + H) / Size, (H - Location.Y) / Size);
}

FVector UIUWorldSubsystem::MapToWorld(const FVector2D& Map) const
{
	if (!Island) { return FVector::ZeroVector; }
	const double Size = Island->GetParams().Size * IU::MetersToCm;
	const double H = Size * 0.5;
	const float X = static_cast<float>(Map.X * Size - H);
	const float Y = static_cast<float>(H - Map.Y * Size);
	return FVector(X, Y, GetGroundHeightCm(X, Y));
}

void UIUWorldSubsystem::TickDiscovery()
{
	const APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Pawn || !Island) { return; }
	const FVector Loc = Pawn->GetActorLocation();
	if (IU::IsUnderground(Loc)) { return; } // inside a cave pocket: no overworld discovery

	const FVector2D UV = WorldToMap(Loc);
	if (Persistence.RevealFog(static_cast<float>(UV.X), static_cast<float>(UV.Y), IUWorldSubsystemLocal::FogRevealRadiusMeters / Island->GetParams().Size))
	{
		++FogRevision;
	}
	const IUSim::Vec3 P = IU::ToSim(Loc);
	for (const IUSim::PointOfInterest& Poi : Island->GetPOIs())
	{
		if (Persistence.IsDiscovered(Poi.Id)) { continue; }
		// Height matters for the caldera/caves: use full 3D distance with generous vertical tolerance.
		const IUSim::Vec3 D = Poi.Position - P;
		const float Horizontal = IUSim::Vec2(D.X, D.Y).Length();
		if (Horizontal <= Poi.Radius && std::fabs(D.Z) < Poi.Radius + 30.0f)
		{
			DiscoverPOI(Poi, false);
		}
	}
}

void UIUWorldSubsystem::DiscoverPOI(const IUSim::PointOfInterest& Poi, bool bSilent)
{
	if (!Persistence.Discover(Poi.Id)) { return; }
	if (!bSilent)
	{
		Notify(FString::Printf(TEXT("Descubierto: %s"), *IU::ToFString(Poi.Name)), IU::Palette::Accent);
		if (!Poi.Description.empty()) { Notify(IU::ToFString(Poi.Description), IU::Palette::TextDim); }
	}
	BroadcastEvent(IUSim::EGameEvent::Discover, Poi.Id, 1);
	BroadcastEvent(IUSim::EGameEvent::Discover, std::string("type:") + IUSim::POITypeToString(Poi.Type), 1);
	if (!Poi.TribeId.empty())
	{
		if (UIUStorySubsystem* Story = GetWorld()->GetSubsystem<UIUStorySubsystem>()) { Story->OnTribeDiscovered(Poi.TribeId); }
	}
	// Reveal the surroundings of the POI on the map.
	const FVector2D UV = WorldToMap(IU::ToVector(Poi.Position));
	Persistence.RevealFog(static_cast<float>(UV.X), static_cast<float>(UV.Y), (Poi.Radius + 40.0f) / Island->GetParams().Size);
	++FogRevision;
}

void UIUWorldSubsystem::RegisterStructure(AIUStructure* S)
{
	Structures.AddUnique(S);
}

void UIUWorldSubsystem::UnregisterStructure(AIUStructure* S)
{
	Structures.Remove(S);
}

AIUVillage* UIUWorldSubsystem::FindVillageAt(const FVector& Location, bool bInnerOnly) const
{
	for (const TWeakObjectPtr<AIUVillage>& V : Villages)
	{
		if (!V.IsValid()) { continue; }
		const float Radius = bInnerOnly ? V->GetInnerRadiusCm() : V->GetTerritoryRadiusCm();
		if (FVector::Dist2D(V->GetCenter(), Location) < Radius) { return V.Get(); }
	}
	return nullptr;
}

AIUVillage* UIUWorldSubsystem::FindVillage(const FString& TribeId) const
{
	for (const TWeakObjectPtr<AIUVillage>& V : Villages)
	{
		if (V.IsValid() && V->GetTribeId() == TribeId) { return V.Get(); }
	}
	return nullptr;
}

float UIUWorldSubsystem::GetFireHeatAt(const FVector& Location) const
{
	float Heat = 0.0f;
	for (const TWeakObjectPtr<AIUStructure>& W : Structures)
	{
		const AIUStructure* S = W.Get();
		if (!S || !S->IsLitFire()) { continue; }
		const float Radius = S->GetHeatRadiusCm();
		if (Radius <= 0.0f) { continue; }
		const float D = FVector::Dist(S->GetActorLocation(), Location);
		Heat = FMath::Max(Heat, FMath::Clamp(1.0f - D / Radius, 0.0f, 1.0f));
	}
	// Village fires warm too.
	for (const TWeakObjectPtr<AIUVillage>& V : Villages)
	{
		if (V.IsValid())
		{
			const float D = FVector::Dist(V->GetFireLocation(), Location);
			Heat = FMath::Max(Heat, FMath::Clamp(1.0f - D / 600.0f, 0.0f, 1.0f));
		}
	}
	return Heat;
}

bool UIUWorldSubsystem::IsShelteredAt(const FVector& Location, const AActor* Ignore) const
{
	UWorld* World = GetWorld();
	if (!World) { return false; }
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUShelter), false, Ignore);
	const FVector Start = Location + FVector(0, 0, 60);
	const FVector End = Start + FVector(0, 0, 1200);
	if (!World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params)) { return false; }
	// Anything solid overhead counts (roof pieces, shelters, cave ceilings, dense canopy actors).
	return Hit.GetActor() != nullptr;
}

std::set<IUSim::EStation> UIUWorldSubsystem::GetStationsNear(const FVector& Location, float RadiusCm) const
{
	std::set<IUSim::EStation> Out;
	for (const TWeakObjectPtr<AIUStructure>& W : Structures)
	{
		const AIUStructure* S = W.Get();
		if (!S || !S->IsStationUsable()) { continue; }
		if (FVector::Dist(S->GetActorLocation(), Location) <= RadiusCm) { Out.insert(S->GetStation()); }
	}
	// Village fires count as campfires for cooking.
	for (const TWeakObjectPtr<AIUVillage>& V : Villages)
	{
		if (V.IsValid() && FVector::Dist(V->GetFireLocation(), Location) <= RadiusCm) { Out.insert(IUSim::EStation::Campfire); }
	}
	return Out;
}

bool UIUWorldSubsystem::AnyHostileNear(const FVector& Location, float RadiusCm, const AActor* Player) const
{
	for (TActorIterator<AIUCreature> It(GetWorld()); It; ++It)
	{
		const AIUCreature* C = *It;
		if (C->IsAlive() && C->IsHostileTo(Player) && FVector::Dist(C->GetActorLocation(), Location) < RadiusCm) { return true; }
	}
	return false;
}

void UIUWorldSubsystem::OnContainerLooted(UIUInventoryComponent* Container, const std::string& ItemId, int32 Count)
{
	if (!Container || Container->OwnerTribe.IsEmpty()) { return; }
	UIUStorySubsystem* Story = GetWorld()->GetSubsystem<UIUStorySubsystem>();
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!Story || !Db) { return; }
	const IUSim::ItemDef* Def = Db->Items.Find(ItemId);
	const float Value = (Def ? Def->Value : 1.0f) * static_cast<float>(Count);
	const APawn* Thief = UGameplayStatics::GetPlayerPawn(this, 0);
	AIUVillage* Village = FindVillage(Container->OwnerTribe);
	const bool bSeen = Village && Thief && Village->IsWitnessed(Thief);
	Story->ApplySocialEvent(Container->OwnerTribe, bSeen ? IUSim::ESocialEvent::TheftWitnessed : IUSim::ESocialEvent::TheftUnseen, Value);
	if (bSeen)
	{
		Notify(TEXT("¡Te han visto robar!"), IU::Palette::Bad);
		if (Village) { Village->RaiseAlarm(const_cast<APawn*>(Thief)); }
	}
}

void UIUWorldSubsystem::RestoreContainerIfSaved(UIUInventoryComponent* Inventory)
{
	if (!Inventory || Inventory->PersistentId.IsEmpty()) { return; }
	if (const FString* Saved = ContainerStates.Find(Inventory->PersistentId))
	{
		IUSim::JsonValue J;
		std::string Error;
		if (IUSim::JsonValue::Parse(IU::ToStd(*Saved), J, Error))
		{
			Inventory->FromJson(J);
		}
	}
}

void UIUWorldSubsystem::CaptureContainer(const UIUInventoryComponent* Inventory)
{
	if (!Inventory || Inventory->PersistentId.IsEmpty() || !Inventory->bDirtyForSave) { return; }
	ContainerStates.Add(Inventory->PersistentId, IU::ToFString(Inventory->ToJson().Dump()));
}

bool UIUWorldSubsystem::TrySleep(AIUCharacter* Player, bool bInBed, FText& OutReason)
{
	if (!Player) { return false; }
	UIUSurvivalComponent* Survival = Player->GetSurvival();
	if (!Survival) { return false; }
	if (AnyHostileNear(Player->GetActorLocation(), 3000.0f, Player))
	{
		OutReason = NSLOCTEXT("IU", "SleepEnemies", "No puedes dormir con enemigos cerca");
		return false;
	}
	if (!Survival->Model().CanSleep())
	{
		OutReason = NSLOCTEXT("IU", "SleepRested", "No tienes sueno");
		return false;
	}
	// Sleep until 6:00 at night; short nap during the day.
	const float Hour = Clock.GetHour();
	float Hours = 3.0f;
	if (Hour >= 19.0f) { Hours = 24.0f - Hour + 6.0f; }
	else if (Hour < 6.0f) { Hours = 6.0f - Hour; }
	Hours = FMath::Clamp(Hours, 1.0f, 11.0f);

	Survival->SimulateSleep(Hours, bInBed);
	Clock.SkipHours(Hours);
	OnGameHoursPassed.Broadcast(Hours);
	BroadcastEvent(IUSim::EGameEvent::Sleep, "", 1);
	Notify(FString::Printf(TEXT("Has dormido %.0f horas"), Hours), IU::Palette::TextDim);
	return true;
}

IUSim::JsonValue UIUWorldSubsystem::ToJson() const
{
	IUSim::JsonValue J = IUSim::JsonValue::MakeObject();
	J.Set("clock", Clock.ToJson());
	J.Set("persistence", Persistence.ToJson());
	J.Set("play_seconds", IUSim::JsonValue::MakeNumber(PlaySeconds));
	IUSim::JsonValue Containers = IUSim::JsonValue::MakeObject();
	for (const TPair<FString, FString>& Pair : ContainerStates)
	{
		IUSim::JsonValue V;
		std::string Error;
		if (IUSim::JsonValue::Parse(IU::ToStd(Pair.Value), V, Error)) { Containers.Set(IU::ToStd(Pair.Key), V); }
	}
	J.Set("containers", Containers);
	return J;
}

void UIUWorldSubsystem::FromJson(const IUSim::JsonValue& J)
{
	Clock.FromJson(J["clock"]);
	Persistence.FromJson(J["persistence"]);
	PlaySeconds = J.GetNumber("play_seconds", 0.0);
	ContainerStates.Reset();
	if (const IUSim::JsonValue* Containers = J.Find("containers"))
	{
		for (const auto& M : Containers->Members()) { ContainerStates.Add(IU::ToFString(M.first), IU::ToFString(M.second.Dump())); }
	}
	++FogRevision;
}

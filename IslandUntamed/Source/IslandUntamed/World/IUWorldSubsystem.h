// Island Untamed - world session subsystem.
//
// Owns the procedural island model, the clock/weather, world persistence
// (harvested nodes, discoveries, fog of war), the gameplay event bus and the
// registries of placed structures and villages. Everything else talks to the
// world through this subsystem, which keeps actors decoupled from each other.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/IUTypes.h"
#include "Sim/SimGameData.h"
#include "Sim/SimIsland.h"
#include "Sim/SimWorldClock.h"
#include "IUWorldSubsystem.generated.h"

class AIUCharacter;
class AIUIslandWorld;
class AIUStructure;
class AIUVillage;
class UIUInventoryComponent;

UENUM()
enum class EIUGameFlow : uint8
{
	Boot,
	MainMenu,
	Intro,
	Playing,
	Dead
};

struct FIUNotification
{
	FString Text;
	FLinearColor Color = FLinearColor::White;
	double Time = 0.0;
	int32 Count = 0;      // >0 for merged pickup notifications
	FString MergeKey;
};

DECLARE_MULTICAST_DELEGATE_OneParam(FIUOnGameEvent, const IUSim::GameEvent&);
DECLARE_MULTICAST_DELEGATE_OneParam(FIUOnGameHours, float /*GameHours*/);

UCLASS()
class ISLANDUNTAMED_API UIUWorldSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	static UIUWorldSubsystem* Get(const UObject* WorldContext);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	// ------------------------------------------------------------------ World model
	/** Generates the island from the data-driven seed. Idempotent. */
	bool GenerateIsland();
	const IUSim::IslandModel* GetIsland() const { return Island.Get(); }
	IUSim::WorldClock& GetClock() { return Clock; }
	const IUSim::WorldClock& GetClock() const { return Clock; }
	IUSim::WorldPersistence& GetPersistence() { return Persistence; }
	double GetTotalHours() const { return Clock.GetTotalHours(); }
	IUSim::Rng& GetRandom() { return Random; }

	float GetGroundHeightCm(float X, float Y) const;
	float GetWaterLevelCm(float X, float Y) const;
	IUSim::EBiome GetBiomeAt(const FVector& Location) const;
	/** Final ambient temperature (biome + altitude + time of day + weather), Celsius. */
	float GetAmbientTemperature(const FVector& Location) const;
	FVector GetPlayerSpawnLocation() const;

	// ------------------------------------------------------------------ Events / notifications
	void BroadcastEvent(IUSim::EGameEvent Type, const std::string& Target, int32 Count = 1);
	FIUOnGameEvent OnGameEvent;
	/** Fired roughly once per real second with the game hours that elapsed (farming, fires...). */
	FIUOnGameHours OnGameHoursPassed;

	void Notify(const FString& Text, const FLinearColor& Color = IU::Palette::TextMain);
	void NotifyPickup(const FString& ItemName, int32 Count);
	const TArray<FIUNotification>& GetNotifications() const { return Notifications; }

	// ------------------------------------------------------------------ Flow
	EIUGameFlow Flow = EIUGameFlow::Boot;
	double PlaySeconds = 0.0;

	// ------------------------------------------------------------------ Registries
	void SetIslandActor(AIUIslandWorld* Actor) { IslandActor = Actor; }
	AIUIslandWorld* GetIslandActor() const { return IslandActor.Get(); }
	void RegisterStructure(AIUStructure* S);
	void UnregisterStructure(AIUStructure* S);
	const TArray<TWeakObjectPtr<AIUStructure>>& GetStructures() const { return Structures; }
	void RegisterVillage(AIUVillage* V) { Villages.AddUnique(V); }
	const TArray<TWeakObjectPtr<AIUVillage>>& GetVillages() const { return Villages; }
	AIUVillage* FindVillageAt(const FVector& Location, bool bInnerOnly) const;
	AIUVillage* FindVillage(const FString& TribeId) const;

	// ------------------------------------------------------------------ Gameplay queries
	/** 0..1 warmth from lit fires around a location. */
	float GetFireHeatAt(const FVector& Location) const;
	/** True if a roof (structure or cave ceiling) is above the location. */
	bool IsShelteredAt(const FVector& Location, const AActor* Ignore) const;
	/** Crafting stations usable from a location (lit fires only). */
	std::set<IUSim::EStation> GetStationsNear(const FVector& Location, float RadiusCm) const;
	bool AnyHostileNear(const FVector& Location, float RadiusCm, const AActor* Player) const;
	/** Called when items leave a container into the player's inventory (theft rules). */
	void OnContainerLooted(UIUInventoryComponent* Container, const std::string& ItemId, int32 Count);

	/** Generated containers (POI loot, village stores) keep their contents across saves by persistent id. */
	void RestoreContainerIfSaved(UIUInventoryComponent* Inventory);
	void CaptureContainer(const UIUInventoryComponent* Inventory);

	/** Sleeps until morning (or a nap). Returns false with a reason if not possible. */
	bool TrySleep(AIUCharacter* Player, bool bInBed, FText& OutReason);

	// ------------------------------------------------------------------ Discovery / fog
	void DiscoverPOI(const IUSim::PointOfInterest& Poi, bool bSilent);
	/** Incremented whenever new fog cells are revealed (map texture refresh hint). */
	uint32 GetFogRevision() const { return FogRevision; }
	/** Normalized map coordinates (0..1, row 0 = north) for a world location. */
	FVector2D WorldToMap(const FVector& Location) const;
	FVector MapToWorld(const FVector2D& Map) const;

	/** Debug: time multiplier (console iu.TimeScale). */
	float TimeScale = 1.0f;

	/** Save helpers. */
	IUSim::JsonValue ToJson() const;
	void FromJson(const IUSim::JsonValue& J);

protected:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

private:
	void TickDiscovery();
	void TickNotifications();

	TUniquePtr<IUSim::IslandModel> Island;
	IUSim::WorldClock Clock;
	IUSim::WorldPersistence Persistence;
	IUSim::Rng Random;

	TArray<FIUNotification> Notifications;
	TMap<FString, FString> ContainerStates; // persistent id -> inventory json
	TArray<TWeakObjectPtr<AIUStructure>> Structures;
	TArray<TWeakObjectPtr<AIUVillage>> Villages;
	TWeakObjectPtr<AIUIslandWorld> IslandActor;

	float HoursAccumulator = 0.0f;
	float SecondAccumulator = 0.0f;
	float DiscoveryTimer = 0.0f;
	float RegrowTimer = 0.0f;
	uint32 FogRevision = 0;
};

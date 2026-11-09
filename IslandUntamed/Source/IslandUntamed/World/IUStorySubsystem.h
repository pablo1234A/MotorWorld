// Island Untamed - story & society subsystem: quests (main + side), tribes,
// reputation, trade/gifts and lore documents. Listens to the world event bus.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Sim/SimFactions.h"
#include "Sim/SimQuests.h"
#include "IUStorySubsystem.generated.h"

class UIUInventoryComponent;

struct FIULoreDoc
{
	FString Id;
	FString PoiId;
	FString Title;
	FString Text;
};

struct FIULootTable
{
	FString PoiId;
	TArray<IUSim::ItemAmount> Items;
};

struct FIUTradeOffer
{
	std::string ItemId;
	float Price = 0.0f;
};

struct FIUBanner
{
	FString Title;
	FString Subtitle;
	FLinearColor Color = FLinearColor::White;
	double Time = -100.0;
};

UCLASS()
class ISLANDUNTAMED_API UIUStorySubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	static UIUStorySubsystem* Get(const UObject* WorldContext);

	/** Resets quest/tribe progress for a new game and starts the first quests. */
	void StartNewStory();

	IUSim::QuestLog& Quests() { return QuestLog; }
	const IUSim::QuestLog& Quests() const { return QuestLog; }
	IUSim::FactionSystem& Factions() { return FactionSystem; }
	const IUSim::FactionSystem& Factions() const { return FactionSystem; }

	// ---- Society
	void ApplySocialEvent(const FString& TribeId, IUSim::ESocialEvent Event, float Magnitude = 1.0f);
	void OnTribeDiscovered(const std::string& TribeId);
	FString GetTribeName(const FString& TribeId) const;
	bool IsTribeHostile(const FString& TribeId) const;

	bool CanTrade(const FString& TribeId, FText& OutReason) const;
	TArray<FIUTradeOffer> GetTradeOffers(const FString& TribeId) const;
	/** Barter: pays with the most suitable items from the player's inventory. */
	bool TryBuy(const FString& TribeId, const FIUTradeOffer& Offer, UIUInventoryComponent* PlayerInv, FString& OutMessage);
	/** Gives a whole inventory slot as a gift; returns the reputation gained. */
	float GiftSlot(const FString& TribeId, int32 Slot, UIUInventoryComponent* PlayerInv);
	/** Talking: learns rules, fires the Talk event (starts tribe side quests). */
	void TalkTo(const FString& TribeId);

	// ---- Lore
	const TArray<FIULoreDoc>& GetLore() const { return Lore; }
	const FIULoreDoc* FindLore(const FString& Id) const;
	const TArray<FIULootTable>& GetPoiLoot() const { return PoiLoot; }
	void ReadDocument(const FString& Id);

	// ---- UI
	const FIUBanner& GetBanner() const { return Banner; }
	IUSim::ReputationQuery MakeRepQuery() const;

	IUSim::JsonValue ToJson() const;
	void FromJson(const IUSim::JsonValue& J);

private:
	void HandleEvent(const IUSim::GameEvent& Event);
	void HandleHours(float Hours);
	void ProcessUpdates(const std::vector<IUSim::QuestUpdate>& Updates);
	void ShowBanner(const FString& Title, const FString& Subtitle, const FLinearColor& Color);

	IUSim::QuestLog QuestLog;
	IUSim::FactionSystem FactionSystem;
	TArray<FIULoreDoc> Lore;
	TArray<FIULootTable> PoiLoot;
	FIUBanner Banner;
	FDelegateHandle EventHandle;
	FDelegateHandle HoursHandle;
	float RefreshAccumulator = 0.0f;
	bool bProcessing = false;
};

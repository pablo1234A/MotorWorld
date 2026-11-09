#include "World/IUStorySubsystem.h"

#include "IslandUntamed.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

namespace IUStoryLocal
{
	FLinearColor AttitudeColor(IUSim::EAttitude A)
	{
		switch (A)
		{
		case IUSim::EAttitude::Hostile: return IU::Palette::Bad;
		case IUSim::EAttitude::Unfriendly: return FLinearColor(0.9f, 0.55f, 0.2f);
		case IUSim::EAttitude::Neutral: return IU::Palette::TextMain;
		case IUSim::EAttitude::Friendly: return IU::Palette::Good;
		case IUSim::EAttitude::Allied: return FLinearColor(0.35f, 0.75f, 1.0f);
		}
		return IU::Palette::TextMain;
	}
}

UIUStorySubsystem* UIUStorySubsystem::Get(const UObject* WorldContext)
{
	const UWorld* World = (WorldContext && GEngine) ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	return World ? World->GetSubsystem<UIUStorySubsystem>() : nullptr;
}

void UIUStorySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UIUWorldSubsystem* WS = Collection.InitializeDependency<UIUWorldSubsystem>();

	const IUSim::GameDatabase* Db = UIUGameInstance::Db(GetWorld());
	if (Db)
	{
		std::string Error;
		if (!QuestLog.LoadFromJson(Db->QuestsJson, Error)) { UE_LOG(LogIsland, Error, TEXT("Quests: %s"), *IU::ToFString(Error)); }
		if (!FactionSystem.LoadFromJson(Db->TribesJson, Error)) { UE_LOG(LogIsland, Error, TEXT("Tribes: %s"), *IU::ToFString(Error)); }
		if (const IUSim::JsonValue* Docs = Db->LoreJson.Find("documents"))
		{
			for (const IUSim::JsonValue& D : Docs->Items())
			{
				FIULoreDoc Doc;
				Doc.Id = IU::ToFString(D.GetString("id"));
				Doc.PoiId = IU::ToFString(D.GetString("poi"));
				Doc.Title = IU::ToFString(D.GetString("title"));
				Doc.Text = IU::ToFString(D.GetString("text"));
				Lore.Add(Doc);
			}
		}
		if (const IUSim::JsonValue* Loot = Db->LoreJson.Find("poi_loot"))
		{
			for (const IUSim::JsonValue& L : Loot->Items())
			{
				FIULootTable T;
				T.PoiId = IU::ToFString(L.GetString("poi"));
				if (const IUSim::JsonValue* Items = L.Find("items"))
				{
					for (const IUSim::JsonValue& I : Items->Items()) { T.Items.Add(IUSim::ItemAmount{ I.GetString("item"), I.GetInt("count", 1) }); }
				}
				PoiLoot.Add(T);
			}
		}
	}
	if (WS)
	{
		EventHandle = WS->OnGameEvent.AddUObject(this, &UIUStorySubsystem::HandleEvent);
		HoursHandle = WS->OnGameHoursPassed.AddUObject(this, &UIUStorySubsystem::HandleHours);
	}
}

void UIUStorySubsystem::Deinitialize()
{
	if (UIUWorldSubsystem* WS = GetWorld() ? GetWorld()->GetSubsystem<UIUWorldSubsystem>() : nullptr)
	{
		WS->OnGameEvent.Remove(EventHandle);
		WS->OnGameHoursPassed.Remove(HoursHandle);
	}
	Super::Deinitialize();
}

IUSim::ReputationQuery UIUStorySubsystem::MakeRepQuery() const
{
	const IUSim::FactionSystem* F = &FactionSystem;
	return [F](const std::string& Tribe) { return F->GetReputation(Tribe); };
}

void UIUStorySubsystem::StartNewStory()
{
	QuestLog.ResetProgress();
	FactionSystem.ResetRuntime();
	ProcessUpdates(QuestLog.Refresh(MakeRepQuery()));
}

void UIUStorySubsystem::HandleEvent(const IUSim::GameEvent& Event)
{
	if (bProcessing) { return; } // rewards can fire Acquire events; avoid re-entrancy
	ProcessUpdates(QuestLog.OnEvent(Event, MakeRepQuery()));
}

void UIUStorySubsystem::HandleHours(float Hours)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	const std::vector<std::string> News = FactionSystem.TickHours(Hours, WS->GetRandom());
	for (const std::string& N : News) { WS->Notify(IU::ToFString(N), IU::Palette::TextDim); }
	RefreshAccumulator += 1.0f;
	if (RefreshAccumulator >= 2.0f)
	{
		RefreshAccumulator = 0.0f;
		ProcessUpdates(QuestLog.Refresh(MakeRepQuery()));
	}
}

void UIUStorySubsystem::ShowBanner(const FString& Title, const FString& Subtitle, const FLinearColor& Color)
{
	Banner.Title = Title;
	Banner.Subtitle = Subtitle;
	Banner.Color = Color;
	Banner.Time = GetWorld() ? GetWorld()->GetRealTimeSeconds() : 0.0;
}

void UIUStorySubsystem::ProcessUpdates(const std::vector<IUSim::QuestUpdate>& Updates)
{
	if (Updates.empty()) { return; }
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	AIUCharacter* Player = Cast<AIUCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	TGuardValue<bool> Guard(bProcessing, true);

	for (const IUSim::QuestUpdate& U : Updates)
	{
		const IUSim::QuestDef* Def = QuestLog.FindDef(U.QuestId);
		if (!Def) { continue; }
		const FString Title = IU::ToFString(Def->Title);
		switch (U.Type)
		{
		case IUSim::EQuestUpdateType::Started:
			ShowBanner(Def->bMain ? TEXT("NUEVA MISION PRINCIPAL") : TEXT("NUEVA MISION"), Title, IU::Palette::Accent);
			break;
		case IUSim::EQuestUpdateType::ObjectiveDone:
			if (WS && U.ObjectiveIndex >= 0 && U.ObjectiveIndex < static_cast<int32>(Def->Objectives.size()))
			{
				WS->Notify(FString::Printf(TEXT("Objetivo completado: %s"), *IU::ToFString(Def->Objectives[static_cast<size_t>(U.ObjectiveIndex)].Text)), IU::Palette::Good);
			}
			break;
		case IUSim::EQuestUpdateType::Completed:
		{
			ShowBanner(TEXT("MISION COMPLETADA"), Title, IU::Palette::Good);
			if (WS && !Def->CompletionText.empty()) { WS->Notify(IU::ToFString(Def->CompletionText), IU::Palette::TextMain); }
			if (U.Reward)
			{
				if (Player && Player->GetInventory())
				{
					for (const IUSim::ItemAmount& A : U.Reward->Items) { Player->GetInventory()->GiveOrDrop(A.ItemId, A.Count); }
				}
				if (WS)
				{
					const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
					for (const std::string& R : U.Reward->Recipes)
					{
						if (Db && Db->Buildings.Find(R)) { WS->GetPersistence().UnlockedBuildings.insert(R); }
						else { WS->GetPersistence().UnlockedRecipes.insert(R); }
						WS->Notify(TEXT("Nuevo plano desbloqueado"), IU::Palette::Accent);
					}
				}
				for (const auto& Pair : U.Reward->Reputation)
				{
					if (IUSim::TribeRuntime* R = FactionSystem.FindRuntime(Pair.first))
					{
						R->Reputation = FMath::Clamp(R->Reputation + Pair.second, -100.0f, 100.0f);
						if (WS) { WS->Notify(FString::Printf(TEXT("Reputacion %s %+.0f"), *GetTribeName(IU::ToFString(Pair.first)), Pair.second), IU::Palette::Good); }
					}
				}
			}
			break;
		}
		case IUSim::EQuestUpdateType::Failed:
			ShowBanner(TEXT("CAMINO CERRADO"), Title, IU::Palette::TextDim);
			break;
		case IUSim::EQuestUpdateType::Progress:
			break;
		}
	}
}

void UIUStorySubsystem::ApplySocialEvent(const FString& TribeId, IUSim::ESocialEvent Event, float Magnitude)
{
	const std::string Id = IU::ToStd(TribeId);
	const IUSim::EAttitude Before = FactionSystem.GetAttitude(Id);
	const IUSim::SocialOutcome Out = FactionSystem.ApplyEvent(Id, Event, Magnitude);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	const IUSim::EAttitude After = FactionSystem.GetAttitude(Id);
	if (FMath::Abs(Out.ReputationDelta) >= 1.0f)
	{
		WS->Notify(FString::Printf(TEXT("Reputacion con %s %+.0f"), *GetTribeName(TribeId), Out.ReputationDelta),
			Out.ReputationDelta > 0.0f ? IU::Palette::Good : IU::Palette::Bad);
	}
	if (Before != After)
	{
		WS->Notify(FString::Printf(TEXT("%s: actitud %s"), *GetTribeName(TribeId), UTF8_TO_TCHAR(IUSim::AttitudeToString(After))), IUStoryLocal::AttitudeColor(After));
	}
	if (Out.bBecameHostile) { ShowBanner(TEXT("TRIBU HOSTIL"), GetTribeName(TribeId), IU::Palette::Bad); }
	if (Out.bBecameAllied) { ShowBanner(TEXT("NUEVOS ALIADOS"), GetTribeName(TribeId), FLinearColor(0.35f, 0.75f, 1.0f)); }
	// Reputation objectives may have completed.
	ProcessUpdates(QuestLog.Refresh(MakeRepQuery()));
}

void UIUStorySubsystem::OnTribeDiscovered(const std::string& TribeId)
{
	if (IUSim::TribeRuntime* R = FactionSystem.FindRuntime(TribeId))
	{
		if (!R->bDiscovered)
		{
			R->bDiscovered = true;
			ShowBanner(TEXT("TRIBU DESCUBIERTA"), GetTribeName(IU::ToFString(TribeId)), IU::Palette::Accent);
		}
	}
}

FString UIUStorySubsystem::GetTribeName(const FString& TribeId) const
{
	const IUSim::TribeDef* D = FactionSystem.FindDef(IU::ToStd(TribeId));
	return D ? IU::ToFString(D->Name) : TribeId;
}

bool UIUStorySubsystem::IsTribeHostile(const FString& TribeId) const
{
	return FactionSystem.IsHostileToPlayer(IU::ToStd(TribeId));
}

bool UIUStorySubsystem::CanTrade(const FString& TribeId, FText& OutReason) const
{
	const std::string Id = IU::ToStd(TribeId);
	const IUSim::TribeDef* D = FactionSystem.FindDef(Id);
	if (!D || !D->bTrades)
	{
		OutReason = NSLOCTEXT("IU", "NoTrade", "Esta tribu no comercia con extranjeros");
		return false;
	}
	const IUSim::EAttitude A = FactionSystem.GetAttitude(Id);
	// Territorial tribes only trade with friends; peaceful ones with anyone not hostile.
	const bool bOk = D->Temperament == IUSim::ETemperament::Peaceful ? A >= IUSim::EAttitude::Neutral : A >= IUSim::EAttitude::Friendly;
	if (!bOk) { OutReason = NSLOCTEXT("IU", "NoTrust", "No confian lo suficiente en ti"); }
	return bOk;
}

TArray<FIUTradeOffer> UIUStorySubsystem::GetTradeOffers(const FString& TribeId) const
{
	TArray<FIUTradeOffer> Out;
	const std::string Id = IU::ToStd(TribeId);
	const IUSim::TribeDef* D = FactionSystem.FindDef(Id);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(GetWorld());
	if (!D || !Db) { return Out; }
	const IUSim::EAttitude A = FactionSystem.GetAttitude(Id);
	const float Markup = A == IUSim::EAttitude::Allied ? 1.0f : (A == IUSim::EAttitude::Friendly ? 1.25f : 1.6f);
	for (const std::string& Good : D->TradeGoods)
	{
		const IUSim::ItemDef* Item = Db->Items.Find(Good);
		if (!Item) { continue; }
		FIUTradeOffer O;
		O.ItemId = Good;
		O.Price = FMath::Max(1.0f, Item->Value * Markup);
		Out.Add(O);
	}
	return Out;
}

bool UIUStorySubsystem::TryBuy(const FString& TribeId, const FIUTradeOffer& Offer, UIUInventoryComponent* PlayerInv, FString& OutMessage)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(GetWorld());
	if (!Db || !PlayerInv) { return false; }
	FText Reason;
	if (!CanTrade(TribeId, Reason)) { OutMessage = Reason.ToString(); return false; }
	const std::string Tribe = IU::ToStd(TribeId);
	IUSim::Inventory& Inv = PlayerInv->Inv();

	// Candidate payment units: everything tradeable except quest items, most wanted/valuable first.
	struct FUnit { int32 Slot; float Value; };
	TArray<FUnit> Units;
	for (int32 S = 0; S < Inv.NumSlots(); ++S)
	{
		const IUSim::ItemStack& Stack = Inv.GetSlot(S);
		const IUSim::ItemDef* Def = Stack.IsEmpty() ? nullptr : Db->Items.Find(Stack.ItemId);
		if (!Def || Def->Category == IUSim::EItemCategory::Quest || Stack.ItemId == Offer.ItemId) { continue; }
		const float V = FactionSystem.ValueFor(Tribe, Stack.ItemId, Def->Value);
		for (int32 N = 0; N < Stack.Count; ++N) { Units.Add(FUnit{ S, V }); }
	}
	Units.Sort([](const FUnit& A, const FUnit& B) { return A.Value > B.Value; });

	// Smallest set that covers the price: take high values first, then try to replace the last pick by a cheaper unit.
	float Paid = 0.0f;
	TMap<int32, int32> TakeFromSlot;
	for (const FUnit& U : Units)
	{
		if (Paid >= Offer.Price) { break; }
		Paid += U.Value;
		TakeFromSlot.FindOrAdd(U.Slot)++;
	}
	if (Paid < Offer.Price)
	{
		OutMessage = FString::Printf(TEXT("No tienes suficiente para intercambiar (valor %.0f / %.0f)"), Paid, Offer.Price);
		return false;
	}
	FString PaidText;
	for (const TPair<int32, int32>& Pair : TakeFromSlot)
	{
		const IUSim::ItemStack Stack = Inv.GetSlot(Pair.Key);
		const IUSim::ItemDef* Def = Db->Items.Find(Stack.ItemId);
		PaidText += FString::Printf(TEXT("%s%d %s"), PaidText.IsEmpty() ? TEXT("") : TEXT(", "), Pair.Value, Def ? *IU::ToFString(Def->Name) : TEXT("?"));
		Inv.RemoveFromSlot(Pair.Key, Pair.Value);
	}
	PlayerInv->MarkChanged();
	PlayerInv->GiveOrDrop(Offer.ItemId, 1);
	FactionSystem.ApplyEvent(Tribe, IUSim::ESocialEvent::Trade, 1.0f);
	OutMessage = FString::Printf(TEXT("Intercambio hecho. Pagaste: %s"), *PaidText);
	return true;
}

float UIUStorySubsystem::GiftSlot(const FString& TribeId, int32 Slot, UIUInventoryComponent* PlayerInv)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(GetWorld());
	if (!Db || !PlayerInv) { return 0.0f; }
	const IUSim::ItemStack Stack = PlayerInv->Inv().GetSlot(Slot);
	const IUSim::ItemDef* Def = Stack.IsEmpty() ? nullptr : Db->Items.Find(Stack.ItemId);
	if (!Def || Def->Category == IUSim::EItemCategory::Quest) { return 0.0f; }
	const std::string Tribe = IU::ToStd(TribeId);
	const float Value = FactionSystem.ValueFor(Tribe, Stack.ItemId, Def->Value) * static_cast<float>(Stack.Count);
	PlayerInv->Inv().RemoveFromSlot(Slot, Stack.Count);
	PlayerInv->MarkChanged();
	const float Before = FactionSystem.GetReputation(Tribe);
	ApplySocialEvent(TribeId, IUSim::ESocialEvent::Gift, Value);
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->BroadcastEvent(IUSim::EGameEvent::Deliver, Stack.ItemId, Stack.Count);
	}
	return FactionSystem.GetReputation(Tribe) - Before;
}

void UIUStorySubsystem::TalkTo(const FString& TribeId)
{
	if (IUSim::TribeRuntime* R = FactionSystem.FindRuntime(IU::ToStd(TribeId)))
	{
		R->bPlayerKnowsRules = true;
		R->bDiscovered = true;
	}
	if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		WS->BroadcastEvent(IUSim::EGameEvent::Talk, IU::ToStd(TribeId), 1);
	}
}

const FIULoreDoc* UIUStorySubsystem::FindLore(const FString& Id) const
{
	return Lore.FindByPredicate([&Id](const FIULoreDoc& D) { return D.Id == Id; });
}

void UIUStorySubsystem::ReadDocument(const FString& Id)
{
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!WS) { return; }
	const std::string StdId = IU::ToStd(Id);
	if (WS->GetPersistence().ReadDocuments.insert(StdId).second)
	{
		WS->Notify(TEXT("Documento anadido al diario [J]"), IU::Palette::Accent);
	}
	WS->BroadcastEvent(IUSim::EGameEvent::Read, StdId, 1);
}

IUSim::JsonValue UIUStorySubsystem::ToJson() const
{
	IUSim::JsonValue J = IUSim::JsonValue::MakeObject();
	J.Set("quests", QuestLog.ToJson());
	J.Set("factions", FactionSystem.ToJson());
	return J;
}

void UIUStorySubsystem::FromJson(const IUSim::JsonValue& J)
{
	QuestLog.FromJson(J["quests"]);
	FactionSystem.FromJson(J["factions"]);
}

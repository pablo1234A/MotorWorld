#include "Player/IUCraftingComponent.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUWorldSubsystem.h"

UIUCraftingComponent::UIUCraftingComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

IUSim::CraftContext UIUCraftingComponent::MakeContext() const
{
	IUSim::CraftContext Ctx;
	if (const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this))
	{
		Ctx.Stations = WS->GetStationsNear(GetOwner()->GetActorLocation(), 450.0f);
		UnlockedCache = WS->GetPersistence().UnlockedRecipes;
	}
	Ctx.Unlocked = &UnlockedCache;
	return Ctx;
}

IUSim::CraftCheck UIUCraftingComponent::Check(const IUSim::Recipe& R) const
{
	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	if (!Character || !Character->GetInventory()) { return IUSim::CraftCheck(); }
	return IUSim::Crafting::Check(R, Character->GetInventory()->Inv(), MakeContext());
}

bool UIUCraftingComponent::Enqueue(const std::string& RecipeId, int32 Count)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::Recipe* R = Db ? Db->Recipes.Find(RecipeId) : nullptr;
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	if (!R || !WS) { return false; }
	const IUSim::CraftCheck C = Check(*R);
	if (!C.Ok())
	{
		WS->Notify(UTF8_TO_TCHAR(IUSim::CraftFailToText(C.Fail)), IU::Palette::Bad);
		return false;
	}
	for (int32 I = 0; I < Count; ++I) { Queue.Add(RecipeId); }
	return true;
}

float UIUCraftingComponent::GetProgress() const
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::Recipe* R = (Db && Queue.Num() > 0) ? Db->Recipes.Find(Queue[0]) : nullptr;
	return R ? FMath::Clamp(Progress / FMath::Max(0.1f, R->CraftSeconds), 0.0f, 1.0f) : 0.0f;
}

void UIUCraftingComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (Queue.Num() == 0) { return; }
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const IUSim::Recipe* R = Db ? Db->Recipes.Find(Queue[0]) : nullptr;
	if (!Character || !R || !WS) { Queue.RemoveAt(0); return; }

	Progress += DeltaTime;
	if (Progress < R->CraftSeconds) { return; }
	Progress = 0.0f;
	Queue.RemoveAt(0);

	std::vector<IUSim::ItemAmount> Overflow;
	const IUSim::CraftCheck Result = IUSim::Crafting::Craft(*R, Character->GetInventory()->Inv(), MakeContext(), Overflow);
	if (!Result.Ok())
	{
		WS->Notify(FString::Printf(TEXT("No se pudo fabricar: %s"), UTF8_TO_TCHAR(IUSim::CraftFailToText(Result.Fail))), IU::Palette::Bad);
		return;
	}
	Character->GetInventory()->MarkChanged();
	for (const IUSim::ItemAmount& O : Overflow) { Character->GetInventory()->GiveOrDrop(O.ItemId, O.Count); }
	for (const IUSim::ItemAmount& O : R->Outputs)
	{
		WS->BroadcastEvent(IUSim::EGameEvent::Craft, O.ItemId, O.Count);
		const IUSim::ItemDef* Def = Db->Items.Find(O.ItemId);
		WS->NotifyPickup(Def ? IU::ToFString(Def->Name) : IU::ToFString(O.ItemId), O.Count);
	}
	Character->PlayActionSound(TEXT("craft"));
}

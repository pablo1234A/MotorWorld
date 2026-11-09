// Island Untamed - HUD screens: inventory, containers/cooking, crafting, building.
#include "UI/IUHUD.h"

#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Gameplay/IUStructure.h"
#include "Gameplay/IUStructureComponents.h"
#include "Player/IUBuildComponent.h"
#include "Player/IUCharacter.h"
#include "Player/IUCraftingComponent.h"
#include "Player/IUInventoryComponent.h"
#include "Player/IUSurvivalComponent.h"
#include "World/IUWorldSubsystem.h"
#include "Engine/Canvas.h"

namespace IUC = IU::Palette;

namespace IUHudScreensLocal
{
	const TCHAR* CraftCategories[] = { TEXT("Todas"), TEXT("Herramientas"), TEXT("Armas"), TEXT("Supervivencia"), TEXT("Cocina"), TEXT("Medicina"), TEXT("Materiales"), TEXT("Equipo"), TEXT("Cultivo") };
	constexpr int32 RecipesPerPage = 13;
}

// ================================================================================================
// Inventory
// ================================================================================================

void AIUHUD::DrawInventoryGrid(UIUInventoryComponent* Inventory, UIUInventoryComponent* Other, float X, float Y, int32 Columns, float SlotSize, bool bShowHotbar)
{
	if (!Inventory) { return; }
	const float Gap = 6.0f * S();
	const int32 Count = Inventory->Inv().NumSlots();
	TWeakObjectPtr<UIUInventoryComponent> InvPtr = Inventory;
	TWeakObjectPtr<UIUInventoryComponent> OtherPtr = Other;
	AIUCharacter* C = Player();
	for (int32 I = 0; I < Count; ++I)
	{
		const float SX = X + (I % Columns) * (SlotSize + Gap);
		const float SY = Y + (I / Columns) * (SlotSize + Gap);
		const bool bSelected = SelectedInventory.Get() == Inventory && SelectedSlot == I;
		ItemSlot(Inventory->Inv().GetSlot(I), SX, SY, SlotSize, bSelected, (bShowHotbar && I < 8) ? I + 1 : 0);
		const FBox2D Box(FVector2D(SX, SY), FVector2D(SX + SlotSize, SY + SlotSize));
		AddHit(Box,
			[this, InvPtr, I]()
			{
				UIUInventoryComponent* Inv = InvPtr.Get();
				if (!Inv) { return; }
				UIUInventoryComponent* From = SelectedInventory.Get();
				if (From && SelectedSlot != INDEX_NONE)
				{
					// Second click: move/merge/swap within or across inventories.
					if (From == Inv) { Inv->Inv().MoveSlot(SelectedSlot, I); Inv->MarkChanged(); }
					else { From->TransferTo(Inv, SelectedSlot, 0); }
					SelectedSlot = INDEX_NONE;
					SelectedInventory.Reset();
					return;
				}
				if (!Inv->Inv().GetSlot(I).IsEmpty()) { SelectedInventory = Inv; SelectedSlot = I; }
			},
			[this, InvPtr, OtherPtr, I, C]()
			{
				// Right click: quick transfer when a container is open, otherwise use/equip.
				UIUInventoryComponent* Inv = InvPtr.Get();
				if (!Inv) { return; }
				if (UIUInventoryComponent* O = OtherPtr.Get()) { Inv->TransferTo(O, I, 0); return; }
				if (!C) { return; }
				const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
				const IUSim::ItemStack Stack = Inv->Inv().GetSlot(I);
				const IUSim::ItemDef* Def = (Db && !Stack.IsEmpty()) ? Db->Items.Find(Stack.ItemId) : nullptr;
				if (!Def) { return; }
				if (Def->Armor.Slot != IUSim::EArmorSlot::None) { Inv->EquipFromSlot(I); return; }
				if ((Def->bHasFood || Def->bHasMedicine) && Def->Category != IUSim::EItemCategory::Tool && Def->Category != IUSim::EItemCategory::Weapon)
				{
					if (C->GetSurvival()->Consume(Stack.ItemId)) { Inv->Inv().RemoveFromSlot(I, 1); Inv->MarkChanged(); }
				}
			});
	}
}

void AIUHUD::DrawEquipment(float X, float Y)
{
	AIUCharacter* C = Player();
	if (!C || !C->GetInventory()) { return; }
	UIUInventoryComponent* Inv = C->GetInventory();
	Text(TEXT("EQUIPO"), X, Y, IUC::TextDim, 1.0f);
	const TCHAR* Labels[3] = { TEXT("Cabeza"), TEXT("Torso"), TEXT("Piernas") };
	const float SlotSize = 64.0f * S();
	for (int32 I = 0; I < 3; ++I)
	{
		const float SY = Y + 26.0f * S() + I * (SlotSize + 10.0f * S());
		ItemSlot(Inv->Equipment().GetSlot(I), X, SY, SlotSize, false);
		Text(Labels[I], X + SlotSize + 10.0f * S(), SY + SlotSize * 0.35f, IUC::TextDim, 0.9f);
		TWeakObjectPtr<UIUInventoryComponent> InvPtr = Inv;
		AddHit(FBox2D(FVector2D(X, SY), FVector2D(X + SlotSize, SY + SlotSize)), nullptr, [InvPtr, I]() { if (InvPtr.IsValid()) { InvPtr->UnequipToStorage(static_cast<EIUEquipSlot>(I)); } });
	}
	const float SY = Y + 26.0f * S() + 3 * (SlotSize + 10.0f * S());
	Text(FString::Printf(TEXT("Proteccion %.0f%%"), Inv->GetArmorProtection() * 100.0f), X, SY, IUC::TextMain, 0.9f);
	Text(FString::Printf(TEXT("Abrigo +%.0f C"), Inv->GetArmorInsulation()), X, SY + 20.0f * S(), IUC::TextMain, 0.9f);
}

void AIUHUD::DrawItemActions(float X, float Y, float W)
{
	AIUCharacter* C = Player();
	UIUInventoryComponent* Inv = SelectedInventory.Get();
	if (!C || !Inv || SelectedSlot == INDEX_NONE) { Text(TEXT("Selecciona un objeto. Clic derecho: usar / equipar / transferir."), X, Y, IUC::TextDim, 0.9f); return; }
	const IUSim::ItemStack Stack = Inv->Inv().GetSlot(SelectedSlot);
	if (Stack.IsEmpty()) { SelectedSlot = INDEX_NONE; return; }
	const int32 Slot = SelectedSlot;
	TWeakObjectPtr<UIUInventoryComponent> InvPtr = Inv;
	const float BW = (W - 18.0f * S()) / 4.0f;
	const float BH = 36.0f * S();
	Text(FString::Printf(TEXT("%s x%d"), *ItemName(Stack.ItemId), Stack.Count), X, Y, IUC::Accent, 1.1f);
	const float BY = Y + 30.0f * S();
	Button(TEXT("Usar"), X, BY, BW, BH, [this, InvPtr, Slot, C]()
	{
		UIUInventoryComponent* I = InvPtr.Get();
		const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
		if (!I || !Db || !C) { return; }
		const IUSim::ItemStack St = I->Inv().GetSlot(Slot);
		const IUSim::ItemDef* Def = St.IsEmpty() ? nullptr : Db->Items.Find(St.ItemId);
		if (!Def) { return; }
		if (Def->Armor.Slot != IUSim::EArmorSlot::None) { I->EquipFromSlot(Slot); return; }
		if (C->GetSurvival()->Consume(St.ItemId)) { I->Inv().RemoveFromSlot(Slot, 1); I->MarkChanged(); }
	});
	Button(TEXT("Soltar"), X + (BW + 6.0f * S()), BY, BW, BH, [this, InvPtr, Slot]() { if (InvPtr.IsValid()) { InvPtr->DropSlot(Slot, 0); } SelectedSlot = INDEX_NONE; });
	Button(TEXT("Dividir"), X + 2 * (BW + 6.0f * S()), BY, BW, BH, [InvPtr, Slot]()
	{
		if (UIUInventoryComponent* I = InvPtr.Get()) { I->Inv().SplitStack(Slot, I->Inv().GetSlot(Slot).Count / 2); I->MarkChanged(); }
	}, Stack.Count > 1);
	Button(TEXT("A barra"), X + 3 * (BW + 6.0f * S()), BY, BW, BH, [this, InvPtr, Slot, C]()
	{
		// Moves the item into the first free hotbar slot (or swaps with the selected one).
		UIUInventoryComponent* I = InvPtr.Get();
		if (!I || !C || I != C->GetInventory()) { return; }
		int32 Target = C->GetSelectedSlot();
		for (int32 H = 0; H < 8; ++H) { if (I->Inv().GetSlot(H).IsEmpty()) { Target = H; break; } }
		I->Inv().MoveSlot(Slot, Target);
		I->MarkChanged();
		SelectedSlot = INDEX_NONE;
	}, Inv == C->GetInventory() && Slot >= 8);
}

void AIUHUD::DrawInventoryScreen(bool bContainer)
{
	AIUCharacter* C = Player();
	if (!C) { return; }
	DrawRect(FLinearColor(0, 0, 0, 0.55f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	UIUInventoryComponent* Container = bContainer && PC() ? PC()->GetOpenContainer() : nullptr;
	ScreenTitle(bContainer ? TEXT("INVENTARIO Y CONTENEDOR") : TEXT("INVENTARIO"), TEXT("Clic: seleccionar / mover   ·   Clic derecho: usar, equipar o transferir   ·   [Tab] cerrar"));
	const float SlotSize = 72.0f * S();
	const float X = 60.0f * S();
	const float Y = 150.0f * S();
	const IUSim::Inventory& Inv = C->GetInventory()->Inv();
	Text(FString::Printf(TEXT("MOCHILA  ·  %.1f / %.0f kg"), Inv.GetTotalWeight(), Inv.GetMaxWeight()), X, Y - 28.0f * S(), Inv.GetLoadRatio() > 1.0f ? IUC::Bad : IUC::TextDim, 1.0f);
	DrawInventoryGrid(C->GetInventory(), Container, X, Y, 6, SlotSize, true);
	const float GridW = 6 * SlotSize + 5 * 6.0f * S();
	const float GridH = 5 * SlotSize + 4 * 6.0f * S();
	DrawItemActions(X, Y + GridH + 24.0f * S(), GridW);

	if (Container)
	{
		const float CX = X + GridW + 80.0f * S();
		Text(Container->DisplayName.IsEmpty() ? PC()->GetContainerTitle().ToString() : PC()->GetContainerTitle().ToString(), CX, Y - 28.0f * S(), IUC::Accent, 1.1f);
		const int32 Cols = FMath::Min(6, FMath::Max(4, Container->Inv().NumSlots() / 3));
		DrawInventoryGrid(Container, C->GetInventory(), CX, Y, Cols, SlotSize, false);
		// Cooking fire extras.
		const AIUStructure* Owner = Cast<AIUStructure>(Container->GetOwner());
		UIUFireComponent* Fire = Owner ? Owner->GetFire() : nullptr;
		if (Fire && Fire->GetCookingSlots() == Container)
		{
			const float FY = Y + ((Container->Inv().NumSlots() + Cols - 1) / Cols) * (SlotSize + 6.0f * S()) + 20.0f * S();
			const float FW = Cols * (SlotSize + 6.0f * S());
			Bar(CX, FY, FW, 18.0f * S(), Fire->GetFuel() / FMath::Max(1.0f, Fire->GetFuelCapacity()), Fire->IsLit() ? IUC::Accent : IUC::TextDim,
				FString::Printf(TEXT("%s  ·  combustible %.0f s"), Fire->IsLit() ? TEXT("Encendido") : TEXT("Apagado"), Fire->GetFuel()));
			for (int32 I = 0; I < Container->Inv().NumSlots(); ++I)
			{
				const float P = Fire->GetCookProgress(I);
				if (P > 0.0f) { Bar(CX + (I % Cols) * (SlotSize + 6.0f * S()), Y + (I / Cols) * (SlotSize + 6.0f * S()) + SlotSize - 8.0f * S(), SlotSize, 6.0f * S(), P, IUC::Accent); }
			}
			TWeakObjectPtr<UIUFireComponent> FirePtr = Fire;
			Button(TEXT("Anadir combustible / encender"), CX, FY + 30.0f * S(), FW, 38.0f * S(), [FirePtr, C]() { if (FirePtr.IsValid()) { FirePtr->InteractSecondary(C); } });
			Text(TEXT("Coloca alimentos crudos o agua sin hervir en los huecos: se cocinan mientras el fuego arde."), CX, FY + 80.0f * S(), IUC::TextDim, 0.85f);
		}
		else
		{
			TWeakObjectPtr<UIUInventoryComponent> ContPtr = Container;
			TWeakObjectPtr<UIUInventoryComponent> PlayerInv = C->GetInventory();
			const float BY = Y + ((Container->Inv().NumSlots() + Cols - 1) / Cols) * (SlotSize + 6.0f * S()) + 20.0f * S();
			Button(TEXT("Cogerlo todo"), CX, BY, 220.0f * S(), 38.0f * S(), [ContPtr, PlayerInv]()
			{
				if (!ContPtr.IsValid() || !PlayerInv.IsValid()) { return; }
				for (int32 I = 0; I < ContPtr->Inv().NumSlots(); ++I) { ContPtr->TransferTo(PlayerInv.Get(), I, 0); }
			});
			if (!Container->OwnerTribe.IsEmpty()) { Text(TEXT("Este almacen pertenece a una tribu: coger cosas es robar."), CX, BY + 48.0f * S(), IUC::Bad, 0.9f); }
		}
	}
	else
	{
		DrawEquipment(X + GridW + 80.0f * S(), Y);
		// Survival summary.
		const IUSim::SurvivalState& St = C->GetSurvival()->Model().State;
		const float SX = X + GridW + 320.0f * S();
		Text(TEXT("ESTADO"), SX, Y, IUC::TextDim, 1.0f);
		const FString Lines[] = {
			FString::Printf(TEXT("Salud %.0f / %.0f"), St.Health, St.MaxHealth),
			FString::Printf(TEXT("Hambre %.0f   Sed %.0f"), St.Satiety, St.Hydration),
			FString::Printf(TEXT("Energia %.0f   Sueno %.0f"), St.Energy, St.Rest),
			FString::Printf(TEXT("Temperatura corporal %.1f C"), St.BodyTempC),
			FString::Printf(TEXT("Humedad %.0f%%"), St.Wetness * 100.0f),
			FString::Printf(TEXT("Veneno %.0f   Infeccion %.0f"), St.Poison, St.Infection),
			St.Bleeding > 0.0f ? FString(TEXT("Hemorragia activa: usa una venda")) : FString(),
			St.bFracture ? FString(TEXT("Fractura: usa una ferula")) : FString(),
		};
		float LY = Y + 28.0f * S();
		for (const FString& L : Lines) { if (!L.IsEmpty()) { Text(L, SX, LY, IUC::TextMain, 0.95f); LY += 22.0f * S(); } }
	}
}

// ================================================================================================
// Crafting
// ================================================================================================

void AIUHUD::DrawCraftingScreen()
{
	using namespace IUHudScreensLocal;
	AIUCharacter* C = Player();
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!C || !Db) { return; }
	UIUCraftingComponent* Crafting = C->GetCrafting();
	DrawRect(FLinearColor(0, 0, 0, 0.6f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	const IUSim::CraftContext Ctx = Crafting->MakeContext();
	FString Stations = TEXT("A mano");
	for (const IUSim::EStation St : Ctx.Stations) { Stations += FString::Printf(TEXT(", %s"), UTF8_TO_TCHAR(IUSim::StationToString(St))); }
	ScreenTitle(TEXT("FABRICACION"), FString::Printf(TEXT("Estaciones cercanas: %s"), *Stations));

	// Category tabs.
	float TX = 60.0f * S();
	const float TY = 140.0f * S();
	for (int32 I = 0; I < static_cast<int32>(UE_ARRAY_COUNT(CraftCategories)); ++I)
	{
		const float W = Measure(CraftCategories[I], 1.0f).X + 26.0f * S();
		Button(CraftCategories[I], TX, TY, W, 34.0f * S(), [this, I]() { CraftCategory = I; CraftPage = 0; }, true, CraftCategory == I);
		TX += W + 6.0f * S();
	}

	// Recipe list.
	TArray<const IUSim::Recipe*> List;
	for (const IUSim::Recipe& R : Db->Recipes.All())
	{
		if (CraftCategory != 0 && IU::ToFString(R.Category) != CraftCategories[CraftCategory]) { continue; }
		if (!R.bUnlockedByDefault && Ctx.Unlocked && Ctx.Unlocked->count(R.Id) == 0) { continue; } // hidden until discovered
		List.Add(&R);
	}
	const int32 Pages = FMath::Max(1, (List.Num() + RecipesPerPage - 1) / RecipesPerPage);
	CraftPage = FMath::Clamp(CraftPage, 0, Pages - 1);
	const float LX = 60.0f * S();
	float LY = 190.0f * S();
	const float LW = 460.0f * S();
	for (int32 I = CraftPage * RecipesPerPage; I < FMath::Min(List.Num(), (CraftPage + 1) * RecipesPerPage); ++I)
	{
		const IUSim::Recipe* R = List[I];
		const IUSim::CraftCheck Check = IUSim::Crafting::Check(*R, C->GetInventory()->Inv(), Ctx);
		const bool bSel = SelectedRecipe == R->Id;
		const bool bHover = IsHovered(LX, LY, LW, 40.0f * S());
		DrawRect(bSel ? FLinearColor(IUC::Accent.R * 0.35f, IUC::Accent.G * 0.35f, IUC::Accent.B * 0.35f, 0.9f) : FLinearColor(0, 0, 0, bHover ? 0.6f : 0.4f), LX, LY, LW, 40.0f * S());
		DrawRect(ItemColor(R->Outputs[0].ItemId), LX, LY, 6.0f * S(), 40.0f * S());
		const FString Label = R->Outputs[0].Count > 1 ? FString::Printf(TEXT("%s x%d"), *IU::ToFString(R->Name), R->Outputs[0].Count) : IU::ToFString(R->Name);
		Text(Label, LX + 16.0f * S(), LY + 10.0f * S(), Check.Ok() ? IUC::TextMain : IUC::TextDim, 1.0f);
		if (!Check.Ok()) { Text(UTF8_TO_TCHAR(IUSim::CraftFailToText(Check.Fail)), LX + LW - 10.0f * S() - Measure(UTF8_TO_TCHAR(IUSim::CraftFailToText(Check.Fail)), 0.75f).X, LY + 13.0f * S(), IUC::Bad, 0.75f); }
		const std::string Id = R->Id;
		AddHit(FBox2D(FVector2D(LX, LY), FVector2D(LX + LW, LY + 40.0f * S())), [this, Id]() { SelectedRecipe = Id; });
		LY += 44.0f * S();
	}
	if (Pages > 1)
	{
		Button(TEXT("<"), LX, LY + 6.0f * S(), 50.0f * S(), 32.0f * S(), [this]() { --CraftPage; }, CraftPage > 0);
		Text(FString::Printf(TEXT("%d / %d"), CraftPage + 1, Pages), LX + LW * 0.5f, LY + 12.0f * S(), IUC::TextDim, 1.0f, true);
		Button(TEXT(">"), LX + LW - 50.0f * S(), LY + 6.0f * S(), 50.0f * S(), 32.0f * S(), [this]() { ++CraftPage; }, CraftPage < Pages - 1);
	}

	// Details.
	const IUSim::Recipe* Sel = Db->Recipes.Find(SelectedRecipe);
	const float DX = LX + LW + 50.0f * S();
	const float DY = 190.0f * S();
	const float DW = 520.0f * S();
	Panel(DX, DY, DW, 520.0f * S(), IUC::PanelBg);
	if (!Sel) { Text(TEXT("Selecciona una receta"), DX + 20.0f * S(), DY + 20.0f * S(), IUC::TextDim, 1.0f); return; }
	const IUSim::CraftCheck Check = IUSim::Crafting::Check(*Sel, C->GetInventory()->Inv(), Ctx);
	Text(IU::ToFString(Sel->Name), DX + 20.0f * S(), DY + 16.0f * S(), IUC::Accent, 2.2f);
	float Y = DY + 70.0f * S();
	const IUSim::ItemDef* OutDef = Db->Items.Find(Sel->Outputs[0].ItemId);
	if (OutDef && !OutDef->Description.empty()) { Y += WrappedText(IU::ToFString(OutDef->Description), DX + 20.0f * S(), Y, DW - 40.0f * S(), IUC::TextDim, 0.95f) + 10.0f * S(); }
	Text(TEXT("MATERIALES"), DX + 20.0f * S(), Y, IUC::TextDim, 0.9f);
	Y += 24.0f * S();
	for (const IUSim::ItemAmount& In : Sel->Inputs)
	{
		const int32 Have = C->GetInventory()->CountItem(In.ItemId);
		Text(FString::Printf(TEXT("%s   %d / %d"), *ItemName(In.ItemId), Have, In.Count), DX + 30.0f * S(), Y, Have >= In.Count ? IUC::Good : IUC::Bad, 1.0f);
		Y += 24.0f * S();
	}
	Y += 8.0f * S();
	if (Sel->Station != IUSim::EStation::Hand)
	{
		const bool bHas = Ctx.Stations.count(Sel->Station) > 0;
		Text(FString::Printf(TEXT("Estacion: %s %s"), UTF8_TO_TCHAR(IUSim::StationToString(Sel->Station)), bHas ? TEXT("(cerca)") : TEXT("(no disponible)")), DX + 20.0f * S(), Y, bHas ? IUC::Good : IUC::Bad, 0.95f);
		Y += 24.0f * S();
	}
	if (Sel->RequiredTool != IUSim::EToolType::None)
	{
		const bool bHas = IUSim::Crafting::HasTool(C->GetInventory()->Inv(), Sel->RequiredTool);
		Text(FString::Printf(TEXT("Herramienta: %s"), UTF8_TO_TCHAR(IUSim::ToolTypeToString(Sel->RequiredTool))), DX + 20.0f * S(), Y, bHas ? IUC::Good : IUC::Bad, 0.95f);
		Y += 24.0f * S();
	}
	Text(FString::Printf(TEXT("Tiempo: %.0f s"), Sel->CraftSeconds), DX + 20.0f * S(), Y, IUC::TextDim, 0.95f);
	const std::string RecipeId = Sel->Id;
	TWeakObjectPtr<UIUCraftingComponent> CraftPtr = Crafting;
	Button(TEXT("FABRICAR"), DX + 20.0f * S(), DY + 520.0f * S() - 60.0f * S(), 240.0f * S(), 44.0f * S(), [CraftPtr, RecipeId]() { if (CraftPtr.IsValid()) { CraftPtr->Enqueue(RecipeId, 1); } }, Check.Ok());
	Button(TEXT("x5"), DX + 270.0f * S(), DY + 520.0f * S() - 60.0f * S(), 80.0f * S(), 44.0f * S(), [CraftPtr, RecipeId]() { if (CraftPtr.IsValid()) { CraftPtr->Enqueue(RecipeId, 5); } }, Check.Ok());
	if (Crafting->IsCrafting())
	{
		Bar(DX + 20.0f * S(), DY + 540.0f * S(), DW - 40.0f * S(), 16.0f * S(), Crafting->GetProgress(), IUC::Accent, FString::Printf(TEXT("En cola: %d"), Crafting->GetQueueLength()));
	}
}

// ================================================================================================
// Build menu
// ================================================================================================

void AIUHUD::DrawBuildMenu()
{
	AIUCharacter* C = Player();
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	if (!C || !Db) { return; }
	DrawRect(FLinearColor(0, 0, 0, 0.6f), 0, 0, Canvas->ClipX, Canvas->ClipY);
	ScreenTitle(TEXT("CONSTRUCCION"), TEXT("Elige una estructura. Las piezas modulares encajan en suelos y paredes existentes."));
	UIUBuildComponent* Build = C->GetBuild();
	const TArray<const IUSim::BuildingDef*> Defs = Build->GetAvailableBuildings();
	const float CardW = 300.0f * S();
	const float CardH = 128.0f * S();
	const int32 Cols = FMath::Max(1, static_cast<int32>((Canvas->ClipX - 120.0f * S()) / (CardW + 12.0f * S())));
	int32 Index = 0;
	for (const IUSim::BuildingDef* Def : Defs)
	{
		const float X = 60.0f * S() + (Index % Cols) * (CardW + 12.0f * S());
		const float Y = 150.0f * S() + (Index / Cols) * (CardH + 12.0f * S());
		++Index;
		const bool bUnlocked = Build->IsUnlocked(*Def);
		const bool bAffordable = C->GetInventory()->Inv().HasAll(Def->Cost);
		const bool bHover = IsHovered(X, Y, CardW, CardH);
		DrawRect(FLinearColor(0, 0, 0, bHover ? 0.75f : 0.5f), X, Y, CardW, CardH);
		DrawRect(bAffordable && bUnlocked ? IUC::Good : (bUnlocked ? IUC::Accent : IUC::TextDim), X, Y, CardW, 3.0f * S());
		Text(IU::ToFString(Def->Name), X + 12.0f * S(), Y + 10.0f * S(), bUnlocked ? IUC::TextMain : IUC::TextDim, 1.2f);
		Text(UTF8_TO_TCHAR(IUSim::BuildCategoryToString(Def->Category)), X + CardW - 12.0f * S() - Measure(UTF8_TO_TCHAR(IUSim::BuildCategoryToString(Def->Category)), 0.75f).X, Y + 14.0f * S(), IUC::TextDim, 0.75f);
		if (!bUnlocked)
		{
			Text(TEXT("Bloqueado: ganate la confianza de una tribu"), X + 12.0f * S(), Y + 48.0f * S(), IUC::TextDim, 0.85f);
			continue;
		}
		float CY = Y + 44.0f * S();
		FString Line;
		int32 N = 0;
		for (const IUSim::ItemAmount& Cost : Def->Cost)
		{
			const int32 Have = C->GetInventory()->CountItem(Cost.ItemId);
			Text(FString::Printf(TEXT("%s %d/%d"), *ItemName(Cost.ItemId), Have, Cost.Count), X + 12.0f * S() + (N % 2) * (CardW * 0.5f), CY, Have >= Cost.Count ? IUC::Good : IUC::Bad, 0.85f);
			if (N % 2 == 1) { CY += 20.0f * S(); }
			++N;
		}
		const std::string Id = Def->Id;
		TWeakObjectPtr<UIUBuildComponent> BuildPtr = Build;
		AddHit(FBox2D(FVector2D(X, Y), FVector2D(X + CardW, Y + CardH)), [this, BuildPtr, Id]()
		{
			if (!BuildPtr.IsValid()) { return; }
			BuildPtr->Begin(Id);
			if (AIUPlayerController* Controller = PC()) { Controller->CloseScreen(); }
		});
	}
}

#include "SimCrafting.h"

namespace IUSim
{
	EStation StationFromString(const std::string& S)
	{
		if (S == "campfire") { return EStation::Campfire; }
		if (S == "workbench") { return EStation::Workbench; }
		if (S == "furnace") { return EStation::Furnace; }
		if (S == "drying_rack") { return EStation::DryingRack; }
		if (S == "tribe") { return EStation::Tribe; }
		return EStation::Hand;
	}

	const char* StationToString(EStation S)
	{
		switch (S)
		{
		case EStation::Campfire: return "campfire";
		case EStation::Workbench: return "workbench";
		case EStation::Furnace: return "furnace";
		case EStation::DryingRack: return "drying_rack";
		case EStation::Tribe: return "tribe";
		case EStation::Hand: break;
		}
		return "hand";
	}

	const char* CraftFailToText(ECraftFail F)
	{
		switch (F)
		{
		case ECraftFail::None: return "";
		case ECraftFail::UnknownRecipe: return "Receta desconocida";
		case ECraftFail::Locked: return "Receta no descubierta";
		case ECraftFail::MissingStation: return "Requiere una estacion de trabajo cercana";
		case ECraftFail::MissingTool: return "Falta la herramienta necesaria";
		case ECraftFail::MissingItems: return "Faltan materiales";
		case ECraftFail::NoSpace: return "Inventario lleno";
		}
		return "";
	}

	namespace RecipeDetail
	{
		bool ParseAmounts(const JsonValue* Arr, const ItemDatabase& Items, std::vector<ItemAmount>& Out, std::string& OutError, const std::string& RecipeId)
		{
			if (!Arr || !Arr->IsArray()) { return true; }
			for (const JsonValue& E : Arr->Items())
			{
				ItemAmount A;
				A.ItemId = E.GetString("item");
				A.Count = E.GetInt("count", 1);
				if (!Items.Contains(A.ItemId))
				{
					OutError = "recipes.json: recipe '" + RecipeId + "' references unknown item '" + A.ItemId + "'";
					return false;
				}
				Out.push_back(A);
			}
			return true;
		}
	}

	bool RecipeBook::LoadFromJson(const JsonValue& Root, const ItemDatabase& Items, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("recipes");
		if (!Arr || !Arr->IsArray()) { OutError = "recipes.json: missing 'recipes' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			Recipe R;
			R.Id = J.GetString("id");
			if (R.Id.empty()) { OutError = "recipes.json: recipe without id"; return false; }
			if (Find(R.Id)) { OutError = "recipes.json: duplicate id '" + R.Id + "'"; return false; }
			R.Category = J.GetString("category", "Survival");
			R.Station = StationFromString(J.GetString("station", "hand"));
			R.RequiredTool = ToolTypeFromString(J.GetString("tool"));
			R.CraftSeconds = J.GetFloat("time", 2.0f);
			R.bUnlockedByDefault = J.GetBool("unlocked", true);
			if (!RecipeDetail::ParseAmounts(J.Find("in"), Items, R.Inputs, OutError, R.Id)) { return false; }
			if (!RecipeDetail::ParseAmounts(J.Find("out"), Items, R.Outputs, OutError, R.Id)) { return false; }
			if (R.Outputs.empty()) { OutError = "recipes.json: recipe '" + R.Id + "' has no output"; return false; }
			const ItemDef* First = Items.Find(R.Outputs[0].ItemId);
			R.Name = J.GetString("name", First ? First->Name : R.Id);
			Recipes.push_back(R);
		}
		return true;
	}

	const Recipe* RecipeBook::Find(const std::string& Id) const
	{
		for (const Recipe& R : Recipes) { if (R.Id == Id) { return &R; } }
		return nullptr;
	}

	bool Crafting::HasTool(const Inventory& Inv, EToolType Tool)
	{
		if (Tool == EToolType::None) { return true; }
		const ItemDatabase* Db = Inv.GetDatabase();
		if (!Db) { return false; }
		for (int32_t I = 0; I < Inv.NumSlots(); ++I)
		{
			const ItemStack& S = Inv.GetSlot(I);
			if (S.IsEmpty()) { continue; }
			const ItemDef* D = Db->Find(S.ItemId);
			if (D && D->Tool.Type == Tool) { return true; }
		}
		return false;
	}

	CraftCheck Crafting::Check(const Recipe& R, const Inventory& Inv, const CraftContext& Ctx)
	{
		CraftCheck Result;
		if (!R.bUnlockedByDefault && (!Ctx.Unlocked || Ctx.Unlocked->count(R.Id) == 0))
		{
			Result.Fail = ECraftFail::Locked;
			return Result;
		}
		if (R.Station != EStation::Hand && Ctx.Stations.count(R.Station) == 0)
		{
			Result.Fail = ECraftFail::MissingStation;
			return Result;
		}
		if (!HasTool(Inv, R.RequiredTool))
		{
			Result.Fail = ECraftFail::MissingTool;
			return Result;
		}
		for (const ItemAmount& In : R.Inputs)
		{
			const int32_t Have = Inv.CountItem(In.ItemId);
			if (Have < In.Count) { Result.Missing.push_back(ItemAmount{ In.ItemId, In.Count - Have }); }
		}
		if (!Result.Missing.empty()) { Result.Fail = ECraftFail::MissingItems; }
		return Result;
	}

	CraftCheck Crafting::Craft(const Recipe& R, Inventory& Inv, const CraftContext& Ctx, std::vector<ItemAmount>& OutOverflow)
	{
		CraftCheck Result = Check(R, Inv, Ctx);
		if (!Result.Ok()) { return Result; }
		Inv.ConsumeAll(R.Inputs);
		for (const ItemAmount& Out : R.Outputs)
		{
			const int32_t Left = Inv.AddItem(Out.ItemId, Out.Count);
			if (Left > 0) { OutOverflow.push_back(ItemAmount{ Out.ItemId, Left }); }
		}
		return Result;
	}
}

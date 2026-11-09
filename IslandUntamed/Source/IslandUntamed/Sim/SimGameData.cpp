#include "SimGameData.h"

#include <cstdlib>

namespace IUSim
{
	namespace GameDataDetail
	{
		bool ReadJson(const FileReader& Reader, const std::string& File, JsonValue& Out, std::string& OutError)
		{
			std::string Text;
			if (!Reader(File, Text)) { OutError = "No se pudo leer el archivo de datos: " + File; return false; }
			std::string ParseError;
			if (!JsonValue::Parse(Text, Out, ParseError)) { OutError = File + ": " + ParseError; return false; }
			return true;
		}
	}

	bool GameDatabase::LoadAll(const FileReader& Reader, std::string& OutError)
	{
		bLoaded = false;
		*this = GameDatabase();
		JsonValue J;
		if (!GameDataDetail::ReadJson(Reader, "items.json", J, OutError) || !Items.LoadFromJson(J, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "recipes.json", J, OutError) || !Recipes.LoadFromJson(J, Items, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "buildings.json", J, OutError) || !Buildings.LoadFromJson(J, Items, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "crops.json", J, OutError) || !Crops.LoadFromJson(J, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "fish.json", J, OutError) || !Fish.LoadFromJson(J, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "animals.json", J, OutError) || !Animals.LoadFromJson(J, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "nodes.json", J, OutError) || !Nodes.LoadFromJson(J, Items, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "tribes.json", TribesJson, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "quests.json", QuestsJson, OutError)) { return false; }
		if (!GameDataDetail::ReadJson(Reader, "lore.json", LoreJson, OutError)) { return false; }
		if (!Validate(OutError)) { return false; }
		bLoaded = true;
		return true;
	}

	bool GameDatabase::Validate(std::string& OutError) const
	{
		for (const ItemDef& I : Items.All())
		{
			if (!I.SeedCrop.empty() && !Crops.Find(I.SeedCrop)) { OutError = "Semilla '" + I.Id + "' apunta a cultivo inexistente '" + I.SeedCrop + "'"; return false; }
			if (!I.PlaceBuilding.empty() && !Buildings.Find(I.PlaceBuilding)) { OutError = "Objeto '" + I.Id + "' coloca edificio inexistente '" + I.PlaceBuilding + "'"; return false; }
			if (!I.CookResult.empty() && !Items.Contains(I.CookResult)) { OutError = "Objeto '" + I.Id + "' se cocina en '" + I.CookResult + "' inexistente"; return false; }
			if (!I.Weapon.AmmoItem.empty() && !Items.Contains(I.Weapon.AmmoItem)) { OutError = "Arma '" + I.Id + "' usa municion inexistente"; return false; }
		}
		for (const CropDef& C : Crops.All())
		{
			if (!Items.Contains(C.SeedItem) || !Items.Contains(C.ProduceItem)) { OutError = "Cultivo '" + C.Id + "' con objetos inexistentes"; return false; }
		}
		for (const FishSpecies& F : Fish.All())
		{
			if (!Items.Contains(F.Item)) { OutError = "Pez '" + F.Id + "' produce objeto inexistente '" + F.Item + "'"; return false; }
		}
		for (const AnimalDef& A : Animals.All())
		{
			for (const LootEntry& L : A.Loot)
			{
				if (!Items.Contains(L.ItemId)) { OutError = "Animal '" + A.Id + "' suelta objeto inexistente '" + L.ItemId + "'"; return false; }
			}
		}
		// Quests: reward items must exist.
		if (const JsonValue* Quests = QuestsJson.Find("quests"))
		{
			for (const JsonValue& Q : Quests->Items())
			{
				if (const JsonValue* R = Q.Find("reward"))
				{
					if (const JsonValue* RI = R->Find("items"))
					{
						for (const JsonValue& I : RI->Items())
						{
							if (!Items.Contains(I.GetString("item"))) { OutError = "Mision '" + Q.GetString("id") + "' recompensa objeto inexistente '" + I.GetString("item") + "'"; return false; }
						}
					}
					for (const std::string& Rec : R->GetStringArray("recipes"))
					{
						if (!Recipes.Find(Rec) && !Buildings.Find(Rec)) { OutError = "Mision '" + Q.GetString("id") + "' desbloquea receta inexistente '" + Rec + "'"; return false; }
					}
				}
			}
		}
		return true;
	}

	bool WorldPersistence::IsDepleted(uint32_t StableId, double NowHours) const
	{
		const auto It = Depleted.find(StableId);
		if (It == Depleted.end()) { return false; }
		return It->second < 0.0 || NowHours < It->second;
	}

	std::vector<uint32_t> WorldPersistence::CollectRegrown(double NowHours)
	{
		std::vector<uint32_t> Out;
		for (auto It = Depleted.begin(); It != Depleted.end();)
		{
			if (It->second >= 0.0 && NowHours >= It->second)
			{
				Out.push_back(It->first);
				It = Depleted.erase(It);
			}
			else
			{
				++It;
			}
		}
		return Out;
	}

	bool WorldPersistence::RevealFog(float U, float V, float RadiusNorm)
	{
		if (FogRes <= 0) { return false; }
		bool bChanged = false;
		const float R = RadiusNorm * static_cast<float>(FogRes);
		const float CX = U * static_cast<float>(FogRes);
		const float CY = V * static_cast<float>(FogRes);
		const int32_t MinX = std::max(0, static_cast<int32_t>(CX - R));
		const int32_t MaxX = std::min(FogRes - 1, static_cast<int32_t>(CX + R));
		const int32_t MinY = std::max(0, static_cast<int32_t>(CY - R));
		const int32_t MaxY = std::min(FogRes - 1, static_cast<int32_t>(CY + R));
		for (int32_t Y = MinY; Y <= MaxY; ++Y)
		{
			for (int32_t X = MinX; X <= MaxX; ++X)
			{
				const float DX = static_cast<float>(X) + 0.5f - CX;
				const float DY = static_cast<float>(Y) + 0.5f - CY;
				if (DX * DX + DY * DY > R * R) { continue; }
				uint8_t& Cell = Fog[static_cast<size_t>(Y) * static_cast<size_t>(FogRes) + static_cast<size_t>(X)];
				if (Cell == 0) { Cell = 1; bChanged = true; }
			}
		}
		return bChanged;
	}

	bool WorldPersistence::IsFogRevealed(int32_t X, int32_t Y) const
	{
		if (X < 0 || Y < 0 || X >= FogRes || Y >= FogRes) { return false; }
		return Fog[static_cast<size_t>(Y) * static_cast<size_t>(FogRes) + static_cast<size_t>(X)] != 0;
	}

	float WorldPersistence::ExploredFraction() const
	{
		if (Fog.empty()) { return 0.0f; }
		size_t Count = 0;
		for (const uint8_t C : Fog) { Count += C ? 1U : 0U; }
		return static_cast<float>(Count) / static_cast<float>(Fog.size());
	}

	JsonValue WorldPersistence::ToJson() const
	{
		JsonValue J = JsonValue::MakeObject();
		JsonValue Dep = JsonValue::MakeArray();
		for (const auto& Pair : Depleted)
		{
			JsonValue E = JsonValue::MakeArray();
			E.Push(JsonValue::MakeNumber(static_cast<double>(Pair.first)));
			E.Push(JsonValue::MakeNumber(Pair.second));
			Dep.Push(E);
		}
		J.Set("depleted", Dep);
		const auto SetToJson = [](const std::set<std::string>& S)
		{
			JsonValue A = JsonValue::MakeArray();
			for (const std::string& V : S) { A.Push(JsonValue::MakeString(V)); }
			return A;
		};
		J.Set("discovered", SetToJson(Discovered));
		J.Set("recipes", SetToJson(UnlockedRecipes));
		J.Set("buildings", SetToJson(UnlockedBuildings));
		J.Set("documents", SetToJson(ReadDocuments));
		// Fog as run-length encoded string of 0/1 runs: "count,count,..." starting with zeros.
		std::string Rle;
		uint8_t Cur = 0;
		size_t Run = 0;
		for (const uint8_t C : Fog)
		{
			const uint8_t V = C ? 1 : 0;
			if (V == Cur) { ++Run; continue; }
			Rle += std::to_string(Run) + ",";
			Cur = V;
			Run = 1;
		}
		Rle += std::to_string(Run);
		J.Set("fog_res", JsonValue::MakeNumber(FogRes));
		J.Set("fog", JsonValue::MakeString(Rle));
		return J;
	}

	void WorldPersistence::FromJson(const JsonValue& J)
	{
		Depleted.clear();
		if (const JsonValue* Dep = J.Find("depleted"))
		{
			for (const JsonValue& E : Dep->Items())
			{
				if (E.Items().size() < 2) { continue; }
				Depleted[static_cast<uint32_t>(E.Items()[0].AsNumber())] = E.Items()[1].AsNumber();
			}
		}
		const auto ReadSet = [&J](const char* Key, std::set<std::string>& Out)
		{
			Out.clear();
			for (const std::string& V : J.GetStringArray(Key)) { Out.insert(V); }
		};
		ReadSet("discovered", Discovered);
		ReadSet("recipes", UnlockedRecipes);
		ReadSet("buildings", UnlockedBuildings);
		ReadSet("documents", ReadDocuments);
		const int32_t Res = J.GetInt("fog_res", FogRes);
		if (Res > 0) { InitFog(Res); }
		const std::vector<std::string> Runs = SplitString(J.GetString("fog"), ',');
		size_t Pos = 0;
		uint8_t Cur = 0;
		for (const std::string& R : Runs)
		{
			if (R.empty()) { continue; }
			const size_t Len = static_cast<size_t>(std::strtoull(R.c_str(), nullptr, 10));
			for (size_t I = 0; I < Len && Pos < Fog.size(); ++I) { Fog[Pos++] = Cur; }
			Cur = Cur ? 0 : 1;
		}
	}
}

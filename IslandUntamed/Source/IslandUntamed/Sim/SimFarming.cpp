#include "SimFarming.h"

namespace IUSim
{
	bool CropDatabase::LoadFromJson(const JsonValue& Root, std::string& OutError)
	{
		const JsonValue* Arr = Root.Find("crops");
		if (!Arr || !Arr->IsArray()) { OutError = "crops.json: missing 'crops' array"; return false; }
		for (const JsonValue& J : Arr->Items())
		{
			CropDef C;
			C.Id = J.GetString("id");
			if (C.Id.empty()) { OutError = "crops.json: crop without id"; return false; }
			C.Name = J.GetString("name", C.Id);
			C.SeedItem = J.GetString("seed");
			C.ProduceItem = J.GetString("produce");
			C.YieldMin = J.GetInt("yield_min", 2);
			C.YieldMax = J.GetInt("yield_max", 4);
			C.SeedsReturnedMax = J.GetInt("seeds_back", 2);
			C.GrowthHours = J.GetFloat("growth_hours", 48.0f);
			C.WaterUsePerHour = J.GetFloat("water_use", 0.02f);
			C.IdealTempMin = J.GetFloat("temp_min", 20.0f);
			C.IdealTempMax = J.GetFloat("temp_max", 32.0f);
			C.bRegrows = J.GetBool("regrows", false);
			C.Color = J.GetString("color", "#6aa84f");
			Crops.push_back(C);
		}
		return true;
	}

	const CropDef* CropDatabase::Find(const std::string& Id) const
	{
		for (const CropDef& C : Crops) { if (C.Id == Id) { return &C; } }
		return nullptr;
	}

	bool FarmPlot::Till()
	{
		if (State != EPlotState::Untilled) { return false; }
		State = EPlotState::Tilled;
		return true;
	}

	bool FarmPlot::Plant(const CropDef& Crop)
	{
		if (State != EPlotState::Tilled) { return false; }
		State = EPlotState::Growing;
		CropId = Crop.Id;
		Growth = 0.0f;
		Health = 1.0f;
		return true;
	}

	float FarmPlot::GrowthFactor(const FarmPlot& Plot, const PlotEnvironment& Env, const CropDef& Crop)
	{
		const float WaterFactor = Plot.Water > 0.05f ? SmoothStep(0.0f, 0.35f, Plot.Water) : 0.0f;
		float TempFactor = 1.0f;
		if (Env.AmbientTempC < Crop.IdealTempMin) { TempFactor = Clamp01(1.0f - (Crop.IdealTempMin - Env.AmbientTempC) / 10.0f); }
		else if (Env.AmbientTempC > Crop.IdealTempMax) { TempFactor = Clamp01(1.0f - (Env.AmbientTempC - Crop.IdealTempMax) / 8.0f); }
		const float FertFactor = 0.6f + Plot.Fertility * 0.8f; // 0.6 .. 1.4
		return WaterFactor * TempFactor * FertFactor * (0.5f + 0.5f * Plot.Health);
	}

	void FarmPlot::Tick(float GameHours, const PlotEnvironment& Env, const CropDef* Crop)
	{
		if (GameHours <= 0.0f) { return; }
		// Rain waters every plot (even empty ones keep moisture).
		if (!Env.bSheltered && Env.RainIntensity > 0.0f) { Water = Clamp01(Water + Env.RainIntensity * 0.5f * GameHours); }
		// Evaporation, stronger when hot.
		const float Evap = 0.005f + std::max(0.0f, Env.AmbientTempC - 25.0f) * 0.001f;
		Water = Clamp01(Water - Evap * GameHours);

		if (State != EPlotState::Growing || !Crop) { return; }

		Water = Clamp01(Water - Crop->WaterUsePerHour * GameHours);
		const float Factor = GrowthFactor(*this, Env, *Crop);
		Growth = Clamp01(Growth + Factor * GameHours / std::max(1.0f, Crop->GrowthHours));

		// Stress: drought or extreme cold/heat damages the plant.
		const bool bDrought = Water <= 0.05f;
		const bool bTempStress = Env.AmbientTempC < Crop->IdealTempMin - 8.0f || Env.AmbientTempC > Crop->IdealTempMax + 6.0f;
		if (bDrought || bTempStress)
		{
			Health = Clamp01(Health - 0.04f * GameHours);
		}
		else
		{
			Health = Clamp01(Health + 0.02f * GameHours);
		}

		if (Health <= 0.0f) { State = EPlotState::Dead; return; }
		if (Growth >= 1.0f) { State = EPlotState::Harvestable; }
	}

	HarvestResult FarmPlot::Harvest(const CropDef& Crop, Rng& Random)
	{
		HarvestResult R;
		if (State != EPlotState::Harvestable) { return R; }
		R.ProduceItem = Crop.ProduceItem;
		const float Quality = 0.5f + 0.5f * Health; // healthy plants yield more
		const int32_t Base = Random.RangeInt(Crop.YieldMin, Crop.YieldMax);
		R.ProduceCount = std::max(1, static_cast<int32_t>(std::lround(static_cast<float>(Base) * Quality + Fertility)));
		R.SeedItem = Crop.SeedItem;
		R.SeedCount = Crop.bRegrows ? 0 : Random.RangeInt(1, std::max(1, Crop.SeedsReturnedMax));
		Fertility = Clamp01(Fertility - 0.15f);

		if (Crop.bRegrows)
		{
			State = EPlotState::Growing;
			Growth = 0.5f;
		}
		else
		{
			State = EPlotState::Tilled;
			CropId.clear();
			Growth = 0.0f;
		}
		return R;
	}

	void FarmPlot::ClearDead()
	{
		if (State == EPlotState::Dead)
		{
			State = EPlotState::Tilled;
			CropId.clear();
			Growth = 0.0f;
			Health = 1.0f;
		}
	}

	int32_t FarmPlot::GetVisualStage() const
	{
		if (State == EPlotState::Harvestable) { return 3; }
		if (State != EPlotState::Growing) { return 0; }
		if (Growth < 0.33f) { return 0; }
		if (Growth < 0.66f) { return 1; }
		return 2;
	}

	JsonValue FarmPlot::ToJson() const
	{
		JsonValue J = JsonValue::MakeObject();
		J.Set("state", JsonValue::MakeNumber(static_cast<int>(State)));
		J.Set("crop", JsonValue::MakeString(CropId));
		J.Set("growth", JsonValue::MakeNumber(Growth));
		J.Set("water", JsonValue::MakeNumber(Water));
		J.Set("fert", JsonValue::MakeNumber(Fertility));
		J.Set("health", JsonValue::MakeNumber(Health));
		return J;
	}

	void FarmPlot::FromJson(const JsonValue& J)
	{
		const int S = J.GetInt("state", 0);
		State = static_cast<EPlotState>(S >= 0 && S <= 4 ? S : 0);
		CropId = J.GetString("crop");
		Growth = J.GetFloat("growth");
		Water = J.GetFloat("water", 0.3f);
		Fertility = J.GetFloat("fert", 0.4f);
		Health = J.GetFloat("health", 1.0f);
	}
}

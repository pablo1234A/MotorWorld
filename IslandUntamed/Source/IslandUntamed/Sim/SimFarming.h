// Island Untamed - Simulation Core
// Crop definitions and farm plot growth model (data: Content/Data/crops.json).
#pragma once

#include "SimCore.h"
#include "SimJson.h"

#include <string>
#include <vector>

namespace IUSim
{
	struct CropDef
	{
		std::string Id;
		std::string Name;
		std::string SeedItem;
		std::string ProduceItem;
		int32_t YieldMin = 2;
		int32_t YieldMax = 4;
		int32_t SeedsReturnedMax = 2;
		float GrowthHours = 48.0f;        // game hours at ideal conditions
		float WaterUsePerHour = 0.02f;    // water level consumed per hour
		float IdealTempMin = 20.0f;
		float IdealTempMax = 32.0f;
		bool bRegrows = false;            // perennial: returns to mid growth after harvest
		std::string Color;                // visual hint "#rrggbb"
	};

	class CropDatabase
	{
	public:
		bool LoadFromJson(const JsonValue& Root, std::string& OutError);
		const CropDef* Find(const std::string& Id) const;
		const std::vector<CropDef>& All() const { return Crops; }
	private:
		std::vector<CropDef> Crops;
	};

	enum class EPlotState : uint8_t { Untilled, Tilled, Growing, Harvestable, Dead };

	struct PlotEnvironment
	{
		float RainIntensity = 0.0f;
		float AmbientTempC = 26.0f;
		bool bSheltered = false;  // greenhouse/roof: no rain watering
	};

	struct HarvestResult
	{
		std::string ProduceItem;
		int32_t ProduceCount = 0;
		std::string SeedItem;
		int32_t SeedCount = 0;
	};

	class FarmPlot
	{
	public:
		EPlotState State = EPlotState::Untilled;
		std::string CropId;
		float Growth = 0.0f;     // 0..1
		float Water = 0.3f;      // 0..1
		float Fertility = 0.4f;  // 0..1 (fertilizer raises, harvest lowers)
		float Health = 1.0f;     // 0..1 drought/cold damage

		bool Till();
		bool Plant(const CropDef& Crop);
		void AddWater(float Amount) { Water = Clamp01(Water + Amount); }
		void Fertilize(float Amount) { Fertility = Clamp01(Fertility + Amount); }
		void Tick(float GameHours, const PlotEnvironment& Env, const CropDef* Crop);
		bool CanHarvest() const { return State == EPlotState::Harvestable; }
		HarvestResult Harvest(const CropDef& Crop, Rng& Random);
		void ClearDead();

		/** Visual stage 0..3 for the engine layer. */
		int32_t GetVisualStage() const;
		/** Growth speed multiplier under the given conditions (exposed for UI tooltips). */
		static float GrowthFactor(const FarmPlot& Plot, const PlotEnvironment& Env, const CropDef& Crop);

		JsonValue ToJson() const;
		void FromJson(const JsonValue& J);
	};
}

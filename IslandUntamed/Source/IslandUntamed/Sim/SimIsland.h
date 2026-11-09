// Island Untamed - Simulation Core
// Procedural island model: heightfield, biomes, rivers, lakes, waterfalls,
// points of interest and deterministic resource scattering.
//
// The island is generated once from a seed (identical on every machine) and
// queried by the engine layer to build terrain chunks, water bodies, foliage
// instances and to place villages/caves/ruins. Units: meters, Z up,
// origin at the island center, sea level at Z = 0.
#pragma once

#include "SimFishing.h"
#include "SimNoise.h"
#include "SimResources.h"

#include <string>
#include <vector>

namespace IUSim
{
	enum class EBiome : uint8_t { Ocean, Reef, Beach, Jungle, Forest, Plains, Swamp, Mountain, Volcanic, Cliff, River, Lake };
	const char* BiomeToString(EBiome B);
	const char* BiomeDisplayName(EBiome B);
	EBiome BiomeFromString(const std::string& S);

	enum class EPOIType : uint8_t
	{
		CrashSite, PlaneTail, Village, Ruins, Cave, Waterfall, Facility, Camp, Lighthouse, Secret, Lake, Volcano
	};
	const char* POITypeToString(EPOIType T);

	struct PointOfInterest
	{
		std::string Id;
		std::string Name;
		EPOIType Type = EPOIType::Camp;
		Vec3 Position;          // ground position
		float Radius = 40.0f;   // discovery radius
		std::string TribeId;    // for villages
		std::string Description;
		bool bHiddenOnMap = false; // secret: never shown until discovered
	};

	struct RiverPath
	{
		std::vector<Vec3> Points;  // water surface points from source to mouth
		std::vector<float> Widths; // meters
	};

	struct LakeBody
	{
		Vec2 Center;
		float Radius = 60.0f;
		float WaterLevel = 10.0f;
	};

	struct ScatterInstance
	{
		int32_t NodeIndex = -1;  // index into ResourceDatabase
		Vec3 Position;
		float Yaw = 0.0f;
		float Scale = 1.0f;
		uint32_t StableId = 0;   // unique per island (for harvest persistence)
	};

	struct IslandParams
	{
		uint32_t Seed = 20261109U;
		float Size = 4096.0f;      // meters, square world extent
		float MaxHeight = 380.0f;
		int32_t GridResolution = 512;
		float ScatterCell = 4.0f;  // meters
	};

	class IslandModel
	{
	public:
		/** Builds the full model. Takes ~100-300 ms for default params. */
		void Generate(const IslandParams& InParams, const ResourceDatabase* InResources);

		const IslandParams& GetParams() const { return Params; }
		float HalfSize() const { return Params.Size * 0.5f; }

		/** Terrain height (meters) at world XY, bilinear on the base grid + fine detail. */
		float GetHeight(float X, float Y) const;
		/** Surface normal (unit). */
		Vec3 GetNormal(float X, float Y) const;
		float GetSlopeDeg(float X, float Y) const;
		EBiome GetBiome(float X, float Y) const;
		/** Water surface height at XY if inside a river/lake, else sea level (0). */
		float GetWaterLevel(float X, float Y) const;
		/** Water depth (water level - terrain), <= 0 if dry. */
		float GetWaterDepth(float X, float Y) const { return GetWaterLevel(X, Y) - GetHeight(X, Y); }
		EWaterZone GetWaterZone(float X, float Y) const;
		/** Base ambient temperature (biome + altitude). Add WorldClock offset for the final value. */
		float GetBaseTemperature(float X, float Y) const;
		/** Distance (m) to the nearest river centerline. */
		float DistanceToRiver(float X, float Y, float* OutWaterLevel = nullptr, float* OutWidth = nullptr) const;
		bool IsInsideLake(float X, float Y, const LakeBody** OutLake = nullptr) const;

		const std::vector<PointOfInterest>& GetPOIs() const { return POIs; }
		const PointOfInterest* FindPOI(const std::string& Id) const;
		const PointOfInterest* FindNearestPOI(float X, float Y, EPOIType Type) const;
		const std::vector<RiverPath>& GetRivers() const { return Rivers; }
		const std::vector<LakeBody>& GetLakes() const { return Lakes; }
		Vec3 GetPlayerSpawn() const { return PlayerSpawn; }
		Vec2 GetVolcanoCenter() const { return VolcanoCenter; }

		/** Deterministic resource scatter for a square region (used per streaming chunk). */
		std::vector<ScatterInstance> ScatterRegion(float MinX, float MinY, float RegionSize) const;

		/** Low-res color map (RGBA8) for the in-game map screen. */
		std::vector<uint8_t> BuildMapImage(int32_t Resolution) const;

	private:
		float GridHeightRaw(float X, float Y) const;      // procedural function before carving
		Vec2 WarpUV(const Vec2& UV) const;                // noise-distorted region coordinates
		float SampleGrid(float X, float Y) const;         // bilinear lookup
		float& GridAt(int32_t GX, int32_t GY);
		float GridValue(int32_t GX, int32_t GY) const;
		void BuildHeightGrid();
		void PlaceLakes();
		void TraceRivers();
		void PlacePOIs();
		bool FindSpot(const Vec2& PreferredUV, float SearchRadiusM, EBiome WantBiome, bool bAnyLand, float MinHeight, float MaxHeight, float MinSlope, float MaxSlope, Vec3& Out) const;
		void AddPOI(const std::string& Id, const std::string& Name, EPOIType Type, const Vec3& Pos, float Radius, const std::string& Desc, bool bHidden = false, const std::string& Tribe = std::string());
		float DistanceToNearestPOI(float X, float Y) const;
		float ExclusionRadiusAt(float X, float Y) const;

		/** Water/river acceleration grids, same resolution as the height grid. */
		struct AuxGrids
		{
			std::vector<float> WaterLevel;
			std::vector<uint8_t> WaterKind;  // 0 none, 1 river, 2 lake
			std::vector<float> RiverDist;    // meters to nearest river centerline (capped)
			int32_t Res = 0;
		};

		IslandParams Params;
		const ResourceDatabase* Resources = nullptr;
		AuxGrids WaterGrids;
		Noise2D Noise;
		Noise2D DetailNoise;
		Noise2D MoistureNoise;
		std::vector<float> Grid;
		float CellSize = 8.0f;
		std::vector<PointOfInterest> POIs;
		std::vector<RiverPath> Rivers;
		std::vector<LakeBody> Lakes;
		Vec3 PlayerSpawn;
		Vec2 VolcanoCenter;
		Vec2 SwampCenter;
		Vec2 MountainCenter;
		Vec2 PlainsCenter;
	};
}

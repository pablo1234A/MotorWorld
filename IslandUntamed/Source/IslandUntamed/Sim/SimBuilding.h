// Island Untamed - Simulation Core
// Building piece definitions, grid/edge snapping and placement validation.
// Data: Content/Data/buildings.json
//
// Coordinates are meters, Z up. A piece transform is (Position of its base
// center, Yaw in degrees).
#pragma once

#include "SimInventory.h"

#include <string>
#include <vector>

namespace IUSim
{
	enum class EBuildCategory : uint8_t { Foundation, Wall, Roof, Door, Stairs, Fence, Station, Storage, Defense, Farm, Shelter, Light };
	enum class ESnapMode : uint8_t { Free, Grid, WallEdge, OnTop };

	EBuildCategory BuildCategoryFromString(const std::string& S);
	const char* BuildCategoryToString(EBuildCategory C);

	struct PrefabPart
	{
		std::string PieceId;
		Vec3 Offset;
		float Yaw = 0.0f;
	};

	struct BuildingDef
	{
		std::string Id;
		std::string Name;
		std::string Description;
		EBuildCategory Category = EBuildCategory::Foundation;
		ESnapMode Snap = ESnapMode::Free;
		Vec3 Size = Vec3(2.0f, 2.0f, 2.0f);    // meters (X width, Y depth, Z height)
		std::vector<ItemAmount> Cost;
		float MaxHealth = 300.0f;
		float MaxSlopeDeg = 30.0f;
		bool bRequiresGround = true;           // must touch terrain (not floating)
		bool bProvidesRoof = false;            // shelters the player
		bool bBlocksMovement = true;
		std::string Station;                   // crafting station type (campfire/workbench/...)
		int32_t StorageSlots = 0;
		bool bIsBed = false;
		bool bIsFarmPlot = false;
		float LightRadius = 0.0f;              // meters
		float HeatRadius = 0.0f;               // meters
		float FuelCapacity = 0.0f;             // seconds of burn (campfire/furnace)
		float TrapDamage = 0.0f;
		std::string Material = "wood";         // visual/material hint
		std::vector<PrefabPart> Prefab;        // composite buildings (cabin, house)
		bool bUnlockedByDefault = true;
	};

	class BuildingDatabase
	{
	public:
		bool LoadFromJson(const JsonValue& Root, const ItemDatabase& Items, std::string& OutError);
		const BuildingDef* Find(const std::string& Id) const;
		const std::vector<BuildingDef>& All() const { return Defs; }
	private:
		std::vector<BuildingDef> Defs;
	};

	struct PieceTransform
	{
		Vec3 Position;
		float Yaw = 0.0f;
	};

	/** Facts about the candidate location collected by the engine (traces/overlaps). */
	struct PlacementProbe
	{
		bool bHitGround = false;      // trace found terrain/structure below
		float GroundSlopeDeg = 0.0f;
		float GapToGround = 0.0f;     // meters between piece base and support surface
		bool bOverlapsBlocking = false;  // intersects terrain bumps, trees, other pieces
		bool bInDeepWater = false;
		bool bSupportedByStructure = false; // snapped to an existing piece
		bool bInsideTribeTerritory = false;
		float DistanceToPlayer = 0.0f;
	};

	enum class EPlacementFail : uint8_t { None, NoGround, TooSteep, Floating, Overlap, Water, TribeTerritory, TooFar, MissingMaterials };
	const char* PlacementFailToText(EPlacementFail F);

	class BuildRules
	{
	public:
		static constexpr float GridSize = 2.0f;      // meters
		static constexpr float MaxPlaceDistance = 8.0f;
		static constexpr float MaxGap = 0.35f;        // allowed float before considered floating

		/** Snap a world position to the build grid (XY) and yaw to 90 degree steps. */
		static PieceTransform SnapToGrid(const PieceTransform& In);
		/** Candidate transforms for NewDef attached to an existing piece. */
		static std::vector<PieceTransform> SnapCandidates(const BuildingDef& ExistingDef, const PieceTransform& Existing, const BuildingDef& NewDef);
		/** Picks the candidate closest to the aim point; returns false if none within MaxDistance. */
		static bool BestSnap(const std::vector<PieceTransform>& Candidates, const Vec3& Aim, float MaxDistance, PieceTransform& Out);
		static EPlacementFail Validate(const BuildingDef& Def, const PlacementProbe& Probe);
		static EPlacementFail ValidateWithCost(const BuildingDef& Def, const PlacementProbe& Probe, const Inventory& Inv);
		/** Rotate a local offset by yaw (degrees). */
		static Vec3 RotateYaw(const Vec3& V, float YawDeg);
	};
}

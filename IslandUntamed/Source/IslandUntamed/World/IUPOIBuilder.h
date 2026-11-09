// Island Untamed - builds every point of interest of the generated island:
// plane wreck, ruins, caves, research station, lighthouse, camp, waterfalls,
// volcano, secrets, villages, plus their loot and documents.
#pragma once

#include "CoreMinimal.h"

class UWorld;
namespace IUSim { class IslandModel; struct PointOfInterest; }

namespace IUPOIBuilder
{
	void BuildAll(UWorld* World, const IUSim::IslandModel& Island);
	/** Ground-snapped location in cm for a POI-relative offset (meters, rotated by yaw). */
	FVector GroundAt(const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi, const FVector2D& OffsetMeters, float YawDeg);
}

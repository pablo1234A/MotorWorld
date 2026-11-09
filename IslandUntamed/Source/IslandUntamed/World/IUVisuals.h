// Island Untamed - procedural visual library.
//
// Placeholder art pipeline: every resource, item and building is described as
// a small set of primitives (FIUShapePart). The same descriptions feed the
// instanced foliage renderer (one HISM per part) and individual actors.
// Replacing a visual with a real mesh later only requires changing the
// description for that id (or swapping the HISM mesh), not gameplay code.
#pragma once

#include "CoreMinimal.h"
#include "Core/IUAssets.h"

#include <string>

namespace IUSim { struct BuildingDef; }

namespace IUVisuals
{
	/** Harvestable world resources and decoration ("palm", "boulder", "grass"...). Origin = ground. */
	TArray<FIUShapePart> ResourceParts(const std::string& Visual);
	/** Small dropped/held item visuals by mesh hint ("axe", "log", "fish"...). Origin = center. */
	TArray<FIUShapePart> ItemParts(const std::string& MeshHint);
	/** Building pieces. Origin = base center. Parts tagged "Flame" are toggled by fires, "Crop" reserved. */
	TArray<FIUShapePart> StructureParts(const IUSim::BuildingDef& Def);

	/** Material colors by name. */
	namespace Colors
	{
		const FLinearColor Bark(0.18f, 0.11f, 0.06f);
		const FLinearColor BarkLight(0.32f, 0.22f, 0.13f);
		const FLinearColor Wood(0.42f, 0.27f, 0.14f);
		const FLinearColor WoodDark(0.26f, 0.16f, 0.08f);
		const FLinearColor Leaf(0.10f, 0.32f, 0.08f);
		const FLinearColor LeafDark(0.05f, 0.20f, 0.05f);
		const FLinearColor LeafLight(0.30f, 0.50f, 0.12f);
		const FLinearColor Palm(0.16f, 0.42f, 0.10f);
		const FLinearColor Dry(0.55f, 0.47f, 0.25f);
		const FLinearColor Stone(0.36f, 0.35f, 0.33f);
		const FLinearColor StoneDark(0.18f, 0.18f, 0.18f);
		const FLinearColor Sand(0.76f, 0.68f, 0.50f);
		const FLinearColor Clay(0.48f, 0.26f, 0.16f);
		const FLinearColor Soil(0.16f, 0.10f, 0.06f);
		const FLinearColor Metal(0.55f, 0.56f, 0.58f);
		const FLinearColor Rust(0.45f, 0.20f, 0.08f);
		const FLinearColor Obsidian(0.03f, 0.03f, 0.04f);
		const FLinearColor Crystal(0.20f, 0.55f, 1.0f);
		const FLinearColor Flame(1.0f, 0.45f, 0.08f);
		const FLinearColor Cloth(0.70f, 0.66f, 0.58f);
		const FLinearColor Hide(0.45f, 0.30f, 0.18f);
		const FLinearColor Bone(0.85f, 0.82f, 0.72f);
		const FLinearColor White(0.85f, 0.85f, 0.83f);
		const FLinearColor Concrete(0.42f, 0.42f, 0.40f);
		const FLinearColor Gold(0.83f, 0.62f, 0.15f);
	}
}

#include "World/IUVisuals.h"

#include "Sim/SimBuilding.h"

namespace IUVisualsLocal
{
	using namespace IUVisuals::Colors;

	FIUShapePart Part(EIUShape Shape, const FVector& Offset, const FVector& Size, const FLinearColor& Color, bool bCollision = true, const FRotator& Rot = FRotator::ZeroRotator, EIUMaterialKind Mat = EIUMaterialKind::Solid)
	{
		FIUShapePart P(Shape, Offset, Size, Color, bCollision, Rot);
		P.Material = Mat;
		return P;
	}

	FIUShapePart Foliage(EIUShape Shape, const FVector& Offset, const FVector& Size, const FLinearColor& Color, const FRotator& Rot = FRotator::ZeroRotator)
	{
		return Part(Shape, Offset, Size, Color, false, Rot, EIUMaterialKind::Foliage);
	}

	/** Vertical trunk standing on the ground. */
	FIUShapePart Trunk(float Diameter, float Height, const FLinearColor& Color, float Lean = 0.0f)
	{
		return Part(EIUShape::Cylinder, FVector(0, 0, Height * 0.5f), FVector(Diameter, Diameter, Height), Color, true, FRotator(Lean, 0, 0));
	}
}

TArray<FIUShapePart> IUVisuals::ResourceParts(const std::string& Visual)
{
	using namespace IUVisualsLocal;
	TArray<FIUShapePart> P;
	if (Visual == "palm")
	{
		P.Add(Trunk(34, 900, BarkLight, 5.0f));
		P.Add(Foliage(EIUShape::Sphere, FVector(40, 0, 900), FVector(560, 520, 110), Palm));
		P.Add(Foliage(EIUShape::Cone, FVector(40, 0, 835), FVector(300, 300, 160), LeafDark, FRotator(180, 0, 0)));
	}
	else if (Visual == "jungle_tree")
	{
		P.Add(Trunk(110, 1500, Bark));
		P.Add(Foliage(EIUShape::Sphere, FVector(0, 0, 1550), FVector(1150, 1100, 650), LeafDark));
		P.Add(Foliage(EIUShape::Sphere, FVector(260, 180, 1250), FVector(800, 760, 480), Leaf));
	}
	else if (Visual == "broadleaf")
	{
		P.Add(Trunk(60, 700, Bark));
		P.Add(Foliage(EIUShape::Sphere, FVector(0, 0, 850), FVector(680, 650, 560), Leaf));
	}
	else if (Visual == "fruit_tree")
	{
		P.Add(Trunk(50, 450, Bark));
		P.Add(Foliage(EIUShape::Sphere, FVector(0, 0, 600), FVector(520, 500, 400), LeafLight));
		P.Add(Part(EIUShape::Sphere, FVector(160, 120, 520), FVector(40), FLinearColor(0.95f, 0.55f, 0.08f), false));
	}
	else if (Visual == "pine")
	{
		P.Add(Trunk(50, 900, Bark));
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 850), FVector(520, 520, 850), LeafDark));
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 1300), FVector(360, 360, 560), LeafDark));
	}
	else if (Visual == "dead_tree")
	{
		P.Add(Trunk(45, 620, FLinearColor(0.30f, 0.28f, 0.25f)));
		P.Add(Part(EIUShape::Cylinder, FVector(60, 0, 450), FVector(22, 22, 260), FLinearColor(0.30f, 0.28f, 0.25f), false, FRotator(0, 0, 40)));
	}
	else if (Visual == "bush")
	{
		P.Add(Foliage(EIUShape::Sphere, FVector(0, 0, 50), FVector(170, 160, 115), Leaf));
	}
	else if (Visual == "berry_bush" || Visual == "red_berry_bush")
	{
		const FLinearColor Berry = Visual == "berry_bush" ? FLinearColor(0.15f, 0.12f, 0.55f) : FLinearColor(0.85f, 0.05f, 0.05f);
		P.Add(Foliage(EIUShape::Sphere, FVector(0, 0, 50), FVector(150, 140, 105), LeafDark));
		P.Add(Part(EIUShape::Sphere, FVector(55, 20, 70), FVector(26, 26, 22), Berry, false));
		P.Add(Part(EIUShape::Sphere, FVector(-40, -45, 60), FVector(24, 24, 20), Berry, false));
	}
	else if (Visual == "fiber")
	{
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 75), FVector(70, 70, 150), LeafLight));
		P.Add(Foliage(EIUShape::Cone, FVector(30, 20, 55), FVector(50, 50, 110), LeafLight, FRotator(10, 0, 15)));
	}
	else if (Visual == "rock")
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 10), FVector(70, 55, 40), Stone, false));
	}
	else if (Visual == "boulder")
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 50), FVector(230, 190, 160), Stone));
		P.Add(Part(EIUShape::Sphere, FVector(80, 60, 20), FVector(110, 90, 70), StoneDark, false));
	}
	else if (Visual == "ore")
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 45), FVector(200, 170, 140), StoneDark));
		P.Add(Part(EIUShape::Sphere, FVector(50, 40, 70), FVector(70, 60, 50), Rust, false));
		P.Add(Part(EIUShape::Sphere, FVector(-60, -20, 50), FVector(60, 50, 40), Rust, false));
	}
	else if (Visual == "obsidian")
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 40), FVector(160, 130, 120), Obsidian));
	}
	else if (Visual == "crystal")
	{
		P.Add(Part(EIUShape::Cone, FVector(0, 0, 110), FVector(60, 60, 220), Crystal, true, FRotator::ZeroRotator, EIUMaterialKind::Emissive));
		P.Add(Part(EIUShape::Cone, FVector(40, 20, 70), FVector(40, 40, 150), Crystal, false, FRotator(20, 0, 10), EIUMaterialKind::Emissive));
	}
	else if (Visual == "clay")
	{
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 4), FVector(190, 170, 14), Clay, false));
	}
	else if (Visual == "sand")
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 0), FVector(150, 140, 40), Sand, false));
	}
	else if (Visual == "driftwood")
	{
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 16), FVector(34, 34, 260), FLinearColor(0.45f, 0.40f, 0.33f), false, FRotator(90, 0, 0)));
	}
	else if (Visual == "mushroom" || Visual == "glow_mushroom")
	{
		const bool bGlow = Visual == "glow_mushroom";
		const FLinearColor Cap = bGlow ? FLinearColor(0.1f, 0.9f, 0.85f) : FLinearColor(0.62f, 0.45f, 0.30f);
		const EIUMaterialKind Mat = bGlow ? EIUMaterialKind::Emissive : EIUMaterialKind::Solid;
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 12), FVector(12, 12, 25), Bone, false));
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 27), FVector(36, 36, 16), Cap, false, FRotator::ZeroRotator, Mat));
		P.Add(Part(EIUShape::Sphere, FVector(25, 15, 14), FVector(22, 22, 10), Cap, false, FRotator::ZeroRotator, Mat));
	}
	else if (Visual == "herb")
	{
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 30), FVector(40, 40, 60), FLinearColor(0.45f, 0.62f, 0.12f)));
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 62), FVector(14), FLinearColor(0.85f, 0.85f, 0.95f), false));
	}
	else if (Visual == "reeds")
	{
		P.Add(Foliage(EIUShape::Cylinder, FVector(0, 0, 110), FVector(8, 8, 220), FLinearColor(0.35f, 0.40f, 0.15f)));
		P.Add(Foliage(EIUShape::Cylinder, FVector(25, 10, 95), FVector(8, 8, 190), FLinearColor(0.35f, 0.40f, 0.15f), FRotator(6, 0, 0)));
		P.Add(Foliage(EIUShape::Cylinder, FVector(-15, 22, 100), FVector(8, 8, 200), FLinearColor(0.40f, 0.36f, 0.15f), FRotator(0, 0, -5)));
	}
	else if (Visual == "wild_crop")
	{
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 45), FVector(50, 50, 90), FLinearColor(0.55f, 0.62f, 0.15f)));
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 90), FVector(18), FLinearColor(0.9f, 0.75f, 0.2f), false));
	}
	else if (Visual == "grass")
	{
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 35), FVector(28, 28, 70), FLinearColor(0.28f, 0.48f, 0.10f)));
		P.Add(Foliage(EIUShape::Cone, FVector(20, 12, 28), FVector(22, 22, 56), FLinearColor(0.33f, 0.52f, 0.12f), FRotator(8, 0, 6)));
	}
	else if (Visual == "fern")
	{
		P.Add(Foliage(EIUShape::Cone, FVector(0, 0, 30), FVector(170, 170, 60), LeafDark, FRotator(180, 0, 0)));
	}
	else
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 25), FVector(60), Stone, false));
	}
	return P;
}

TArray<FIUShapePart> IUVisuals::ItemParts(const std::string& Hint)
{
	using namespace IUVisualsLocal;
	TArray<FIUShapePart> P;
	const auto Handle = [&P](float Length) { P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 0), FVector(4.5f, 4.5f, Length), Wood, false)); };
	if (Hint == "log") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(22, 22, 80), Wood, false, FRotator(90, 0, 0))); }
	else if (Hint == "stick") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(5, 5, 70), BarkLight, false, FRotator(90, 0, 0))); }
	else if (Hint == "rock") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(24, 20, 16), Stone, false)); }
	else if (Hint == "crystal") { P.Add(Part(EIUShape::Cone, FVector::ZeroVector, FVector(14, 14, 30), Crystal, false, FRotator::ZeroRotator, EIUMaterialKind::Emissive)); }
	else if (Hint == "fiber" || Hint == "rope") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(22, 22, 8), Dry, false)); }
	else if (Hint == "leaf") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(40, 25, 3), Leaf, false)); }
	else if (Hint == "cloth") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(35, 30, 5), Cloth, false)); }
	else if (Hint == "hide") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(45, 35, 4), Hide, false)); }
	else if (Hint == "bone") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(6, 6, 35), Bone, false, FRotator(90, 0, 0))); }
	else if (Hint == "feather") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(25, 5, 1), White, false)); }
	else if (Hint == "berries")
	{
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 0), FVector(8), FLinearColor(0.2f, 0.1f, 0.5f), false));
		P.Add(Part(EIUShape::Sphere, FVector(7, 3, 0), FVector(8), FLinearColor(0.2f, 0.1f, 0.5f), false));
		P.Add(Part(EIUShape::Sphere, FVector(2, 7, 3), FVector(8), FLinearColor(0.25f, 0.1f, 0.55f), false));
	}
	else if (Hint == "mushroom") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(16, 16, 9), FLinearColor(0.6f, 0.45f, 0.3f), false)); }
	else if (Hint == "coconut") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(20), FLinearColor(0.35f, 0.22f, 0.1f), false)); }
	else if (Hint == "fruit") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(12, 12, 14), FLinearColor(0.95f, 0.6f, 0.1f), false)); }
	else if (Hint == "meat") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(24, 18, 10), FLinearColor(0.6f, 0.12f, 0.1f), false)); }
	else if (Hint == "fish") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(40, 12, 10), Metal, false)); }
	else if (Hint == "corn") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(8, 8, 24), FLinearColor(0.95f, 0.8f, 0.2f), false, FRotator(90, 0, 0))); }
	else if (Hint == "potato") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(11, 9, 8), FLinearColor(0.5f, 0.38f, 0.2f), false)); }
	else if (Hint == "pumpkin") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(36, 36, 26), FLinearColor(0.9f, 0.45f, 0.05f), false)); }
	else if (Hint == "bowl") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(20, 20, 8), Clay, false)); }
	else if (Hint == "flask") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(11, 11, 24), Clay, false)); }
	else if (Hint == "axe" || Hint == "pick")
	{
		Handle(60.0f);
		const FVector HeadSize = Hint == "axe" ? FVector(4, 18, 13) : FVector(4, 32, 6);
		P.Add(Part(EIUShape::Cube, FVector(0, Hint == "axe" ? 7.0f : 0.0f, 26), HeadSize, Stone, false));
	}
	else if (Hint == "knife" || Hint == "machete")
	{
		Handle(14.0f);
		const float Blade = Hint == "knife" ? 16.0f : 42.0f;
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 7 + Blade * 0.5f), FVector(1.2f, 4, Blade), Metal, false));
	}
	else if (Hint == "rod") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(2.5f, 2.5f, 160), BarkLight, false)); }
	else if (Hint == "torch")
	{
		Handle(50.0f);
		FIUShapePart Fl = Part(EIUShape::Cone, FVector(0, 0, 32), FVector(12, 12, 20), Flame, false, FRotator::ZeroRotator, EIUMaterialKind::Emissive);
		Fl.Tag = FName(TEXT("Flame"));
		P.Add(Fl);
	}
	else if (Hint == "club")
	{
		Handle(60.0f);
		P.Add(Part(EIUShape::Sphere, FVector(0, 0, 30), FVector(16, 16, 22), Stone, false));
	}
	else if (Hint == "spear")
	{
		P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(4, 4, 180), Wood, false));
		P.Add(Part(EIUShape::Cone, FVector(0, 0, 98), FVector(7, 7, 18), Stone, false));
	}
	else if (Hint == "bow")
	{
		P.Add(Part(EIUShape::Cylinder, FVector(0, -4, 28), FVector(3, 3, 60), Wood, false, FRotator(0, 0, 12)));
		P.Add(Part(EIUShape::Cylinder, FVector(0, -4, -28), FVector(3, 3, 60), Wood, false, FRotator(0, 0, -12)));
		P.Add(Part(EIUShape::Cylinder, FVector(0, 3, 0), FVector(0.6f, 0.6f, 112), White, false));
	}
	else if (Hint == "arrow") { P.Add(Part(EIUShape::Cylinder, FVector::ZeroVector, FVector(1.6f, 1.6f, 70), BarkLight, false, FRotator(90, 0, 0))); }
	else if (Hint == "medkit") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(25, 16, 14), White, false)); P.Add(Part(EIUShape::Cube, FVector(0, 0, 7.5f), FVector(12, 4, 1), FLinearColor(0.8f, 0.05f, 0.05f), false)); }
	else if (Hint == "box") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(32, 22, 20), FLinearColor(0.95f, 0.45f, 0.05f), false)); }
	else if (Hint == "card" || Hint == "paper") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(12, 8, 0.6f), White, false)); }
	else if (Hint == "amulet") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(9, 9, 2.5f), Gold, false)); P.Add(Part(EIUShape::Sphere, FVector(0, 0, 1.2f), FVector(4, 4, 1.5f), Crystal, false, FRotator::ZeroRotator, EIUMaterialKind::Emissive)); }
	else if (Hint == "scrap") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(42, 26, 3), Metal, false, FRotator(0, 20, 8))); }
	else if (Hint == "ingot" || Hint == "brick") { P.Add(Part(EIUShape::Cube, FVector::ZeroVector, FVector(20, 10, 6), Hint == "ingot" ? Metal : Clay, false)); }
	else if (Hint == "seeds") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(10, 10, 6), Dry, false)); }
	else if (Hint == "sapling") { P.Add(Part(EIUShape::Cone, FVector::ZeroVector, FVector(14, 14, 30), LeafLight, false)); }
	else if (Hint == "mask") { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(22, 8, 28), FLinearColor(0.6f, 0.15f, 0.1f), false)); }
	else { P.Add(Part(EIUShape::Sphere, FVector::ZeroVector, FVector(20, 20, 15), Hide, false)); }
	return P;
}

TArray<FIUShapePart> IUVisuals::StructureParts(const IUSim::BuildingDef& Def)
{
	using namespace IUVisualsLocal;
	TArray<FIUShapePart> P;
	const std::string& Id = Def.Id;
	const FLinearColor Mat = Def.Material == "stone" ? Stone : (Def.Material == "leaves" ? Dry : Wood);
	const auto FlamePart = [](const FVector& Offset, const FVector& Size)
	{
		FIUShapePart F = Part(EIUShape::Cone, Offset, Size, Flame, false, FRotator::ZeroRotator, EIUMaterialKind::Emissive);
		F.Tag = FName(TEXT("Flame"));
		return F;
	};

	if (Id == "lean_to")
	{
		P.Add(Part(EIUShape::Cylinder, FVector(130, -110, 100), FVector(12, 12, 200), Wood));
		P.Add(Part(EIUShape::Cylinder, FVector(130, 110, 100), FVector(12, 12, 200), Wood));
		P.Add(Part(EIUShape::Cube, FVector(30, 0, 120), FVector(280, 300, 18), Dry, true, FRotator(-38, 0, 0)));
		P.Add(Part(EIUShape::Cube, FVector(40, 0, 6), FVector(180, 220, 12), Leaf, false));
	}
	else if (Id == "leaf_bed") { P.Add(Part(EIUShape::Cube, FVector(0, 0, 10), FVector(100, 200, 20), Leaf, false)); }
	else if (Id == "campfire")
	{
		for (int32 I = 0; I < 7; ++I)
		{
			const float A = static_cast<float>(I) / 7.0f * 2.0f * PI;
			P.Add(Part(EIUShape::Sphere, FVector(FMath::Cos(A) * 48, FMath::Sin(A) * 48, 8), FVector(26, 22, 18), Stone, false));
		}
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 10), FVector(10, 10, 80), WoodDark, false, FRotator(80, 30, 0)));
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 10), FVector(10, 10, 80), WoodDark, false, FRotator(80, 120, 0)));
		P.Add(FlamePart(FVector(0, 0, 38), FVector(40, 40, 60)));
	}
	else if (Id == "torch_stand")
	{
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 85), FVector(9, 9, 170), Wood, false));
		P.Add(FlamePart(FVector(0, 0, 185), FVector(16, 16, 26)));
	}
	else if (Id == "workbench")
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 92), FVector(200, 100, 12), Wood));
		for (int32 I = 0; I < 4; ++I) { P.Add(Part(EIUShape::Cube, FVector((I & 1) ? 85 : -85, (I & 2) ? 38 : -38, 43), FVector(12, 12, 86), WoodDark)); }
		P.Add(Part(EIUShape::Cube, FVector(40, 10, 100), FVector(30, 12, 6), Stone, false));
	}
	else if (Id == "drying_rack")
	{
		P.Add(Part(EIUShape::Cylinder, FVector(-90, 0, 90), FVector(8, 8, 180), Wood));
		P.Add(Part(EIUShape::Cylinder, FVector(90, 0, 90), FVector(8, 8, 180), Wood));
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 170), FVector(6, 6, 190), Wood, false, FRotator(0, 0, 90)));
		for (int32 I = 0; I < 4; ++I) { P.Add(Part(EIUShape::Cube, FVector(-60 + I * 40, 0, 130), FVector(14, 3, 70), FLinearColor(0.5f, 0.15f, 0.1f), false)); }
	}
	else if (Id == "furnace")
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 70), FVector(160, 160, 140), Stone));
		P.Add(Part(EIUShape::Cylinder, FVector(0, 0, 175), FVector(60, 60, 70), StoneDark));
		P.Add(Part(EIUShape::Cube, FVector(81, 0, 45), FVector(4, 60, 50), FLinearColor(0.02f, 0.02f, 0.02f), false));
		P.Add(FlamePart(FVector(70, 0, 40), FVector(30, 30, 35)));
	}
	else if (Id == "storage_box")
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 32), FVector(120, 70, 64), Wood));
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 66), FVector(124, 74, 6), WoodDark));
	}
	else if (Id == "storehouse")
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 120), FVector(400, 300, 240), Wood));
		P.Add(Part(EIUShape::Cube, FVector(0, -80, 270), FVector(440, 190, 15), Dry, true, FRotator(0, 0, 25)));
		P.Add(Part(EIUShape::Cube, FVector(0, 80, 270), FVector(440, 190, 15), Dry, true, FRotator(0, 0, -25)));
	}
	else if (Def.Category == IUSim::EBuildCategory::Foundation || Id == "farm_plot")
	{
		const bool bFarm = Id == "farm_plot";
		P.Add(Part(EIUShape::Cube, FVector(0, 0, Def.Size.Z * 50.0f), FVector(Def.Size.X * 100.0f, Def.Size.Y * 100.0f, Def.Size.Z * 100.0f), bFarm ? Soil : Mat, !bFarm));
		if (bFarm)
		{
			P.Add(Part(EIUShape::Cylinder, FVector(0, 100, 15), FVector(12, 12, 200), WoodDark, false, FRotator(0, 0, 90)));
			P.Add(Part(EIUShape::Cylinder, FVector(0, -100, 15), FVector(12, 12, 200), WoodDark, false, FRotator(0, 0, 90)));
		}
	}
	else if (Id == "door")
	{
		P.Add(Part(EIUShape::Cube, FVector(-75, 0, 125), FVector(50, 25, 250), Mat));
		P.Add(Part(EIUShape::Cube, FVector(75, 0, 125), FVector(50, 25, 250), Mat));
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 235), FVector(100, 25, 30), Mat));
		// The leaf itself is built by the door component (needs a hinge).
	}
	else if (Def.Category == IUSim::EBuildCategory::Wall)
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, Def.Size.Z * 50.0f), FVector(Def.Size.X * 100.0f, Def.Size.Y * 100.0f, Def.Size.Z * 100.0f), Mat));
	}
	else if (Def.Category == IUSim::EBuildCategory::Roof)
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 12), FVector(212, 212, 24), Dry));
	}
	else if (Id == "stairs")
	{
		for (int32 I = 0; I < 8; ++I) { P.Add(Part(EIUShape::Cube, FVector(0, -110 + I * 31, 15 + I * 31), FVector(120, 31, 30), Wood)); }
	}
	else if (Id == "fence")
	{
		for (int32 I = 0; I < 3; ++I) { P.Add(Part(EIUShape::Cylinder, FVector(-95 + I * 95, 0, 60), FVector(10, 10, 120), Wood)); }
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 90), FVector(200, 5, 8), Wood));
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 45), FVector(200, 5, 8), Wood));
	}
	else if (Id == "spike_trap")
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 5), FVector(200, 200, 10), WoodDark, false));
		for (int32 X = -1; X <= 1; ++X)
		{
			for (int32 Y = -1; Y <= 1; ++Y) { P.Add(Part(EIUShape::Cone, FVector(X * 60, Y * 60, 35), FVector(14, 14, 60), BarkLight, false)); }
		}
	}
	else if (Id == "watchtower")
	{
		for (int32 I = 0; I < 4; ++I) { P.Add(Part(EIUShape::Cylinder, FVector((I & 1) ? 130 : -130, (I & 2) ? 130 : -130, 350), FVector(25, 25, 700), Wood)); }
		P.Add(Part(EIUShape::Cube, FVector(0, 0, 500), FVector(300, 300, 20), Wood));
		P.Add(Part(EIUShape::Cube, FVector(0, 150, 560), FVector(300, 8, 100), Wood, true));
		P.Add(Part(EIUShape::Cube, FVector(0, -150, 560), FVector(300, 8, 100), Wood, true));
		P.Add(Part(EIUShape::Cone, FVector(0, 0, 760), FVector(420, 420, 160), Dry));
		for (int32 I = 0; I < 12; ++I) { P.Add(Part(EIUShape::Cube, FVector(160, 0, 30 + I * 40), FVector(10, 80, 8), Wood)); }
	}
	else
	{
		P.Add(Part(EIUShape::Cube, FVector(0, 0, Def.Size.Z * 50.0f), FVector(Def.Size.X * 100.0f, Def.Size.Y * 100.0f, Def.Size.Z * 100.0f), Mat));
	}
	return P;
}

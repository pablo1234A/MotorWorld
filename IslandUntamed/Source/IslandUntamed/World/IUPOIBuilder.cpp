#include "World/IUPOIBuilder.h"

#include "IslandUntamed.h"
#include "Core/IUTypes.h"
#include "Creatures/IUVillage.h"
#include "Gameplay/IUContainer.h"
#include "Gameplay/IULoreNote.h"
#include "Sim/SimIsland.h"
#include "World/IUCave.h"
#include "World/IUPropActor.h"
#include "World/IUStorySubsystem.h"
#include "World/IUVisuals.h"
#include "Engine/World.h"

namespace IUPOILocal
{
	using namespace IUVisuals::Colors;

	FIUShapePart P(EIUShape S, const FVector& O, const FVector& Size, const FLinearColor& C, bool bCol = true, const FRotator& R = FRotator::ZeroRotator)
	{
		return FIUShapePart(S, O, Size, C, bCol, R);
	}

	FIUShapePart Glow(EIUShape S, const FVector& O, const FVector& Size, const FLinearColor& C)
	{
		FIUShapePart Part(S, O, Size, C, false);
		Part.Material = EIUMaterialKind::Emissive;
		return Part;
	}

	AIUContainer* SpawnLoot(UWorld* World, const IUSim::PointOfInterest& Poi, const FVector& Location, const FText& Name, const TArray<FIUShapePart>& Visual, const std::string& KeyItem = std::string())
	{
		UIUStorySubsystem* Story = UIUStorySubsystem::Get(World);
		if (!Story) { return nullptr; }
		const FString PoiId = IU::ToFString(Poi.Id);
		const FIULootTable* Table = Story->GetPoiLoot().FindByPredicate([&PoiId](const FIULootTable& T) { return T.PoiId == PoiId; });
		if (!Table) { return nullptr; }
		FActorSpawnParameters SP;
		SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AIUContainer* C = World->SpawnActor<AIUContainer>(AIUContainer::StaticClass(), Location, FRotator(0, IU::ToSim(Location).X, 0), SP);
		if (!C) { return nullptr; }
		C->Setup(FString::Printf(TEXT("poi:%s"), *PoiId), Name, Visual, 12);
		C->RequiredKeyItem = KeyItem;
		for (const IUSim::ItemAmount& Item : Table->Items) { C->GetStorage()->AddItem(Item.ItemId, Item.Count, -1.0f, false); }
		C->FinishLoot();
		return C;
	}

	void SpawnNotes(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi, const FVector2D& Offset, const std::string& KeyItem = std::string())
	{
		UIUStorySubsystem* Story = UIUStorySubsystem::Get(World);
		if (!Story) { return; }
		const FString PoiId = IU::ToFString(Poi.Id);
		int32 N = 0;
		for (const FIULoreDoc& Doc : Story->GetLore())
		{
			if (Doc.PoiId != PoiId) { continue; }
			const FVector Loc = IUPOIBuilder::GroundAt(Island, Poi, Offset + FVector2D(N * 1.6, 0.0), 0.0f) + FVector(0, 0, 60);
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIULoreNote* Note = World->SpawnActor<AIULoreNote>(AIULoreNote::StaticClass(), Loc, FRotator::ZeroRotator, SP))
			{
				Note->Setup(Doc.Id);
				Note->RequiredKeyItem = KeyItem;
			}
			++N;
		}
	}

	TArray<FIUShapePart> CrateVisual(const FLinearColor& Color)
	{
		return { P(EIUShape::Cube, FVector(0, 0, 0), FVector(110, 80, 70), Color) };
	}

	// ------------------------------------------------------------------------------------------
	void BuildCrash(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		TArray<FIUShapePart> Parts;
		// Broken fuselage lying on the sand, tilted.
		Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 150), FVector(420, 420, 1800), White, true, FRotator(84, 20, 8)));
		Parts.Add(P(EIUShape::Cylinder, FVector(-40, 120, 220), FVector(380, 380, 30), FLinearColor(0.05f, 0.05f, 0.06f), false, FRotator(84, 20, 8)));
		Parts.Add(P(EIUShape::Cube, FVector(250, -700, 60), FVector(1300, 300, 40), Metal, true, FRotator(0, 35, -8)));
		Parts.Add(P(EIUShape::Cylinder, FVector(900, -950, 90), FVector(160, 160, 300), StoneDark, true, FRotator(90, 35, 0)));
		for (int32 I = 0; I < 10; ++I)
		{
			const float A = I * 0.7f;
			Parts.Add(P(EIUShape::Cube, FVector(FMath::Cos(A) * (500 + I * 80), FMath::Sin(A) * (500 + I * 60), 20), FVector(80 + I * 10, 60, 30), I % 3 == 0 ? FLinearColor(0.1f, 0.15f, 0.45f) : Metal, false, FRotator(I * 9, I * 37, I * 5)));
		}
		// Seats and luggage.
		for (int32 I = 0; I < 6; ++I)
		{
			Parts.Add(P(EIUShape::Cube, FVector(-700 + I * 120, 600 - I * 40, 45), FVector(55, 55, 90), FLinearColor(0.08f, 0.12f, 0.35f), true, FRotator(0, I * 25, I % 2 ? 70 : 0)));
			Parts.Add(P(EIUShape::Cube, FVector(400 + I * 90, 700 + I * 70, 25), FVector(70, 45, 50), FLinearColor(0.2f + I * 0.1f, 0.1f, 0.05f), false, FRotator(0, I * 40, 0)));
		}
		if (AIUPropActor* Prop = AIUPropActor::Spawn(World, Base, 0.0f, Parts))
		{
			Prop->AddLight(FVector(200, -300, 120), FLinearColor(1.0f, 0.45f, 0.15f), 6000.0f, 900.0f, true); // smouldering wreck
		}
		SpawnLoot(World, Poi, IUPOIBuilder::GroundAt(Island, Poi, FVector2D(-6, 4), 0.0f) + FVector(0, 0, 40), FText::FromString(TEXT("Carrito de cabina")), CrateVisual(Metal));
		SpawnNotes(World, Island, Poi, FVector2D(-4, -3));
	}

	void BuildTail(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		TArray<FIUShapePart> Parts;
		Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 170), FVector(340, 340, 900), White, true, FRotator(78, 60, 0)));
		Parts.Add(P(EIUShape::Cube, FVector(-280, 160, 520), FVector(40, 520, 620), White, true, FRotator(-12, 60, 0)));
		Parts.Add(P(EIUShape::Cube, FVector(-280, 160, 640), FVector(44, 300, 200), FLinearColor(0.75f, 0.08f, 0.08f), false, FRotator(-12, 60, 0)));
		Parts.Add(P(EIUShape::Cube, FVector(-300, 160, 220), FVector(700, 120, 30), Metal, true, FRotator(0, -30, 12)));
		AIUPropActor::Spawn(World, Base, 0.0f, Parts);
		SpawnLoot(World, Poi, IUPOIBuilder::GroundAt(Island, Poi, FVector2D(4, -3), 0.0f) + FVector(0, 0, 40), FText::FromString(TEXT("Bodega de cola")), CrateVisual(FLinearColor(0.9f, 0.45f, 0.05f)));
		SpawnNotes(World, Island, Poi, FVector2D(3, 3));
	}

	void BuildRuins(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		const FLinearColor Old(0.42f, 0.40f, 0.33f);
		const FLinearColor Moss(0.20f, 0.30f, 0.12f);
		TArray<FIUShapePart> Parts;
		if (Poi.Id == "ruins_sun")
		{
			// Stepped pyramid with stairs and an altar on top.
			for (int32 L = 0; L < 5; ++L)
			{
				const float S = 2200.0f - L * 380.0f;
				Parts.Add(P(EIUShape::Cube, FVector(0, 0, 100 + L * 200), FVector(S, S, 200), L % 2 ? Old : Moss));
			}
			for (int32 I = 0; I < 10; ++I) { Parts.Add(P(EIUShape::Cube, FVector(0, -1150 + I * 100, 50 + I * 100), FVector(400, 100, 100), Old)); }
			Parts.Add(P(EIUShape::Cube, FVector(0, 0, 1100), FVector(260, 160, 100), StoneDark));
			AIUPropActor::Spawn(World, Base, 0.0f, Parts);
			SpawnLoot(World, Poi, Base + FVector(0, 0, 1190), FText::FromString(TEXT("Altar del Sol")), { P(EIUShape::Cylinder, FVector::ZeroVector, FVector(90, 90, 40), Gold) });
			SpawnNotes(World, Island, Poi, FVector2D(14, -12));
			return;
		}
		if (Poi.Id == "ruins_observatory")
		{
			for (int32 I = 0; I < 12; ++I)
			{
				const float A = I / 12.0f * 2.0f * PI;
				const float H = (I % 4 == 0) ? 250.0f : 480.0f;
				Parts.Add(P(EIUShape::Cube, FVector(FMath::Cos(A) * 1500, FMath::Sin(A) * 1500, H * 0.5f), FVector(130, 70, H), Old, true, FRotator(0, FMath::RadiansToDegrees(A), 0)));
			}
			Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 60), FVector(500, 500, 120), StoneDark));
			AIUPropActor::Spawn(World, Base, 0.0f, Parts);
			SpawnLoot(World, Poi, Base + FVector(0, 0, 160), FText::FromString(TEXT("Piedra central")), { P(EIUShape::Cube, FVector::ZeroVector, FVector(120, 120, 60), Old) });
			SpawnNotes(World, Island, Poi, FVector2D(4, 0));
			return;
		}
		// Sunken gate: monumental arch half in the swamp.
		Parts.Add(P(EIUShape::Cube, FVector(-500, 0, 400), FVector(220, 220, 900), Old));
		Parts.Add(P(EIUShape::Cube, FVector(500, 0, 400), FVector(220, 220, 900), Old));
		Parts.Add(P(EIUShape::Cube, FVector(0, 0, 900), FVector(1300, 260, 200), Moss));
		Parts.Add(P(EIUShape::Cube, FVector(800, 600, 50), FVector(400, 300, 150), Old, true, FRotator(10, 30, 5)));
		AIUPropActor::Spawn(World, Base, 30.0f, Parts);
		SpawnLoot(World, Poi, Base + FVector(0, 0, 60), FText::FromString(TEXT("Cofre sumergido")), CrateVisual(Moss));
		SpawnNotes(World, Island, Poi, FVector2D(3, 3));
	}

	void BuildFacility(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		TArray<FIUShapePart> Parts;
		// Main bunker (hollow: walls + roof) with a door gap facing south.
		Parts.Add(P(EIUShape::Cube, FVector(0, 0, -20), FVector(1600, 1000, 60), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(0, 500, 300), FVector(1600, 60, 600), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(-800, 0, 300), FVector(60, 1000, 600), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(800, 0, 300), FVector(60, 1000, 600), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(-500, -500, 300), FVector(600, 60, 600), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(500, -500, 300), FVector(600, 60, 600), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(0, -500, 500), FVector(400, 60, 200), Concrete));
		Parts.Add(P(EIUShape::Cube, FVector(0, 0, 630), FVector(1700, 1100, 60), FLinearColor(0.3f, 0.3f, 0.3f)));
		// Antenna tower and dish.
		Parts.Add(P(EIUShape::Cylinder, FVector(1300, 600, 1500), FVector(40, 40, 3000), Rust));
		Parts.Add(P(EIUShape::Cone, FVector(1300, 600, 2900), FVector(500, 500, 160), Metal, false, FRotator(150, 0, 0)));
		// Fences and a ruined hut.
		for (int32 I = 0; I < 14; ++I) { Parts.Add(P(EIUShape::Cylinder, FVector(-1500 + I * 230, -1300, 120), FVector(10, 10, 240), Rust)); }
		Parts.Add(P(EIUShape::Cube, FVector(-1400, 700, 200), FVector(600, 600, 400), Concrete, true, FRotator(0, 15, 0)));
		if (AIUPropActor* Prop = AIUPropActor::Spawn(World, Base, 0.0f, Parts))
		{
			Prop->AddLight(FVector(0, 0, 450), FLinearColor(0.6f, 0.8f, 1.0f), 1500.0f, 900.0f);
			Prop->AddLight(FVector(1300, 600, 3000), FLinearColor(1.0f, 0.1f, 0.05f), 3000.0f, 2000.0f);
		}
		// Inside: locked terminal + supplies. The keycard comes from the observatory.
		SpawnLoot(World, Poi, Base + FVector(300, 200, 40), FText::FromString(TEXT("Armario de suministros")), CrateVisual(FLinearColor(0.25f, 0.3f, 0.25f)), "meridian_keycard");
		SpawnNotes(World, Island, Poi, FVector2D(-3, 2), "meridian_keycard");
	}

	void BuildLighthouse(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		TArray<FIUShapePart> Parts;
		Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 1200), FVector(520, 520, 2400), White));
		Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 1700), FVector(530, 530, 300), FLinearColor(0.7f, 0.08f, 0.06f), false));
		Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 2550), FVector(360, 360, 300), FLinearColor(0.15f, 0.2f, 0.22f)));
		Parts.Add(P(EIUShape::Cone, FVector(0, 0, 2800), FVector(420, 420, 200), FLinearColor(0.15f, 0.15f, 0.15f)));
		Parts.Add(P(EIUShape::Cube, FVector(700, 300, 150), FVector(700, 500, 300), Stone, true, FRotator(0, 10, 0)));
		AIUPropActor::Spawn(World, Base, 0.0f, Parts);
		SpawnLoot(World, Poi, Base + FVector(700, 300, 330), FText::FromString(TEXT("Baul del farero")), CrateVisual(Wood));
		SpawnNotes(World, Island, Poi, FVector2D(5, -2));
	}

	void BuildCamp(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		TArray<FIUShapePart> Parts;
		Parts.Add(P(EIUShape::Cone, FVector(-400, 200, 110), FVector(320, 280, 220), FLinearColor(0.45f, 0.42f, 0.25f)));
		Parts.Add(P(EIUShape::Cone, FVector(300, 350, 100), FVector(280, 260, 200), FLinearColor(0.35f, 0.40f, 0.30f), true, FRotator(8, 0, 0)));
		for (int32 I = 0; I < 6; ++I)
		{
			const float A = I / 6.0f * 2.0f * PI;
			Parts.Add(P(EIUShape::Sphere, FVector(FMath::Cos(A) * 60, FMath::Sin(A) * 60, 8), FVector(30, 26, 20), Stone, false));
		}
		Parts.Add(P(EIUShape::Cylinder, FVector(0, 0, 8), FVector(90, 90, 6), FLinearColor(0.05f, 0.05f, 0.05f), false));
		AIUPropActor::Spawn(World, Base, 0.0f, Parts);
		SpawnLoot(World, Poi, Base + FVector(150, -250, 40), FText::FromString(TEXT("Mochila abandonada")), CrateVisual(Hide));
		SpawnNotes(World, Island, Poi, FVector2D(-1, -2));
	}

	void BuildWaterfall(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		// Find the river segment around the POI to orient and size the falling sheet.
		for (const IUSim::RiverPath& R : Island.GetRivers())
		{
			for (size_t I = 3; I + 3 < R.Points.size(); ++I)
			{
				if ((R.Points[I].XY() - Poi.Position.XY()).Length() > 1.0f) { continue; }
				const IUSim::Vec3 Top = R.Points[I - 3];
				const IUSim::Vec3 Bottom = R.Points[I + 3];
				const float Drop = FMath::Max(4.0f, Top.Z - Bottom.Z);
				const FVector Mid = IU::ToVector(IUSim::Vec3(Poi.Position.X, Poi.Position.Y, (Top.Z + Bottom.Z) * 0.5f));
				const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(Bottom.Y - Top.Y, Bottom.X - Top.X));
				const float Width = R.Widths[I] * IU::MetersToCm;
				TArray<FIUShapePart> Parts;
				FIUShapePart Sheet(EIUShape::Cube, FVector::ZeroVector, FVector(60, Width, Drop * IU::MetersToCm), FLinearColor(0.75f, 0.85f, 0.95f), false);
				Sheet.Material = EIUMaterialKind::Water;
				Parts.Add(Sheet);
				Parts.Add(P(EIUShape::Sphere, FVector(200, 0, -Drop * 50.0f), FVector(600, Width + 200, 250), FLinearColor(0.9f, 0.95f, 1.0f), false));
				AIUPropActor::Spawn(World, Mid, Yaw, Parts, false);
				return;
			}
		}
	}

	void BuildVolcano(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const IUSim::Vec2 C = Island.GetVolcanoCenter();
		const FVector Crater = IU::ToVector(IUSim::Vec3(C.X, C.Y, Island.GetHeight(C.X, C.Y)));
		TArray<FIUShapePart> Parts;
		Parts.Add(Glow(EIUShape::Cylinder, FVector(0, 0, 50), FVector(2600, 2600, 40), FLinearColor(1.0f, 0.25f, 0.02f)));
		for (int32 I = 0; I < 8; ++I)
		{
			const float S = 1500.0f + I * 900.0f;
			Parts.Add(P(EIUShape::Sphere, FVector(I * 150.0f, I * 80.0f, 2500.0f + I * 3200.0f), FVector(S, S, S * 0.7f), FLinearColor(0.25f, 0.24f, 0.24f), false));
		}
		if (AIUPropActor* Prop = AIUPropActor::Spawn(World, Crater, 0.0f, Parts, false))
		{
			Prop->AddLight(FVector(0, 0, 600), FLinearColor(1.0f, 0.3f, 0.05f), 60000.0f, 9000.0f);
		}
		// The caldera secret: a cluster of pulsing crystals at the crater bottom.
		TArray<FIUShapePart> Core;
		for (int32 I = 0; I < 7; ++I)
		{
			const float A = I / 7.0f * 2.0f * PI;
			Core.Add(Glow(EIUShape::Cone, FVector(FMath::Cos(A) * 250, FMath::Sin(A) * 250, 300), FVector(140, 140, 600), Crystal));
		}
		Core.Add(Glow(EIUShape::Sphere, FVector(0, 0, 250), FVector(300), FLinearColor(0.5f, 0.8f, 1.0f)));
		if (AIUPropActor* CoreProp = AIUPropActor::Spawn(World, Crater + FVector(0, 0, 60), 0.0f, Core, false))
		{
			CoreProp->AddLight(FVector(0, 0, 400), FLinearColor(0.3f, 0.6f, 1.0f), 20000.0f, 3000.0f);
		}
	}

	void BuildGrotto(UWorld* World, const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi)
	{
		const FVector Base = IUPOIBuilder::GroundAt(Island, Poi, FVector2D(0, 0), 0.0f);
		TArray<FIUShapePart> Parts;
		Parts.Add(P(EIUShape::Sphere, FVector(0, -400, 300), FVector(500, 400, 700), FLinearColor(0.25f, 0.24f, 0.22f)));
		Parts.Add(P(EIUShape::Sphere, FVector(0, 400, 300), FVector(500, 400, 700), FLinearColor(0.25f, 0.24f, 0.22f)));
		Parts.Add(P(EIUShape::Sphere, FVector(0, 0, 650), FVector(600, 1100, 300), FLinearColor(0.22f, 0.21f, 0.2f)));
		Parts.Add(Glow(EIUShape::Cone, FVector(-150, 0, 80), FVector(80, 80, 200), Crystal));
		if (AIUPropActor* Prop = AIUPropActor::Spawn(World, Base, 0.0f, Parts))
		{
			Prop->AddLight(FVector(0, 0, 200), FLinearColor(0.2f, 0.5f, 1.0f), 5000.0f, 1200.0f);
		}
		SpawnLoot(World, Poi, Base + FVector(-100, 0, 40), FText::FromString(TEXT("Tesoro escondido")), CrateVisual(Gold));
	}
}

FVector IUPOIBuilder::GroundAt(const IUSim::IslandModel& Island, const IUSim::PointOfInterest& Poi, const FVector2D& OffsetMeters, float YawDeg)
{
	const float R = FMath::DegreesToRadians(YawDeg);
	const float X = Poi.Position.X + static_cast<float>(OffsetMeters.X) * FMath::Cos(R) - static_cast<float>(OffsetMeters.Y) * FMath::Sin(R);
	const float Y = Poi.Position.Y + static_cast<float>(OffsetMeters.X) * FMath::Sin(R) + static_cast<float>(OffsetMeters.Y) * FMath::Cos(R);
	return FVector(X * IU::MetersToCm, Y * IU::MetersToCm, Island.GetHeight(X, Y) * IU::MetersToCm);
}

void IUPOIBuilder::BuildAll(UWorld* World, const IUSim::IslandModel& Island)
{
	using namespace IUPOILocal;
	if (!World) { return; }
	int32 CaveIndex = 0;
	for (const IUSim::PointOfInterest& Poi : Island.GetPOIs())
	{
		switch (Poi.Type)
		{
		case IUSim::EPOIType::CrashSite: BuildCrash(World, Island, Poi); break;
		case IUSim::EPOIType::PlaneTail: BuildTail(World, Island, Poi); break;
		case IUSim::EPOIType::Ruins: BuildRuins(World, Island, Poi); break;
		case IUSim::EPOIType::Facility: BuildFacility(World, Island, Poi); break;
		case IUSim::EPOIType::Lighthouse: BuildLighthouse(World, Island, Poi); break;
		case IUSim::EPOIType::Camp: BuildCamp(World, Island, Poi); break;
		case IUSim::EPOIType::Waterfall: BuildWaterfall(World, Island, Poi); break;
		case IUSim::EPOIType::Volcano: BuildVolcano(World, Island, Poi); break;
		case IUSim::EPOIType::Secret:
			if (Poi.Id == "secret_bluegrotto") { BuildGrotto(World, Island, Poi); }
			break;
		case IUSim::EPOIType::Cave:
		{
			// Face the entrance down-slope (towards lower terrain).
			const IUSim::Vec3 N = Island.GetNormal(Poi.Position.X, Poi.Position.Y);
			const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(N.Y, N.X));
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIUCave* Cave = World->SpawnActor<AIUCave>(AIUCave::StaticClass(), IU::ToVector(Poi.Position) + FVector(0, 0, 150), FRotator(0, Yaw, 0), SP))
			{
				Cave->Setup(Poi, CaveIndex++);
			}
			break;
		}
		case IUSim::EPOIType::Village:
		{
			FActorSpawnParameters SP;
			SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AIUVillage* Village = World->SpawnActor<AIUVillage>(AIUVillage::StaticClass(), IU::ToVector(Poi.Position), FRotator::ZeroRotator, SP))
			{
				Village->SetupVillage(Poi);
			}
			break;
		}
		case IUSim::EPOIType::Lake:
			break;
		}
	}
	UE_LOG(LogIsland, Log, TEXT("POIs built: %d"), static_cast<int32>(Island.GetPOIs().size()));
}

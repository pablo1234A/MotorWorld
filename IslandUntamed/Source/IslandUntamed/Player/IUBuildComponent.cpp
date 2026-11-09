#include "Player/IUBuildComponent.h"

#include "Core/IUAssets.h"
#include "Core/IUGameInstance.h"
#include "Core/IUTypes.h"
#include "Creatures/IUVillage.h"
#include "Gameplay/IUStructure.h"
#include "Player/IUCharacter.h"
#include "Player/IUInventoryComponent.h"
#include "World/IUIslandWorld.h"
#include "World/IUPropActor.h"
#include "World/IUStorySubsystem.h"
#include "World/IUVisuals.h"
#include "World/IUWorldSubsystem.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/OverlapResult.h"
#include "Engine/World.h"

namespace IUBuildLocal
{
	constexpr float PlaceDistance = 800.0f;
	constexpr float SnapDistance = 250.0f;

	FTransform ToTransform(const IUSim::PieceTransform& P)
	{
		return FTransform(FRotator(0, P.Yaw, 0), IU::ToVector(P.Position));
	}
	IUSim::PieceTransform ToPiece(const FTransform& T)
	{
		IUSim::PieceTransform P;
		P.Position = IU::ToSim(T.GetLocation());
		P.Yaw = static_cast<float>(T.Rotator().Yaw);
		return P;
	}
}

UIUBuildComponent::UIUBuildComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

bool UIUBuildComponent::IsUnlocked(const IUSim::BuildingDef& Def) const
{
	if (Def.bUnlockedByDefault) { return true; }
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	return WS && WS->GetPersistence().UnlockedBuildings.count(Def.Id) > 0;
}

TArray<const IUSim::BuildingDef*> UIUBuildComponent::GetAvailableBuildings() const
{
	TArray<const IUSim::BuildingDef*> Out;
	if (const IUSim::GameDatabase* Db = UIUGameInstance::Db(this))
	{
		for (const IUSim::BuildingDef& D : Db->Buildings.All()) { Out.Add(&D); }
	}
	return Out;
}

void UIUBuildComponent::Begin(const std::string& InBuildingId)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::BuildingDef* Def = Db ? Db->Buildings.Find(InBuildingId) : nullptr;
	if (!Def) { return; }
	if (!IsUnlocked(*Def))
	{
		if (UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this)) { WS->Notify(TEXT("Plano no desbloqueado"), IU::Palette::Bad); }
		return;
	}
	BuildingId = InBuildingId;
	bActive = true;
	RotationOffset = 0.0f;
	RebuildPreview();
}

void UIUBuildComponent::Cancel()
{
	bActive = false;
	if (Preview) { Preview->Destroy(); Preview = nullptr; }
	PreviewParts.Reset();
}

void UIUBuildComponent::RebuildPreview()
{
	if (Preview) { Preview->Destroy(); Preview = nullptr; }
	PreviewParts.Reset();
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::BuildingDef* Def = Db ? Db->Buildings.Find(BuildingId) : nullptr;
	if (!Def) { return; }
	TArray<FIUShapePart> Parts;
	if (Def->Prefab.empty())
	{
		Parts = IUVisuals::StructureParts(*Def);
	}
	else
	{
		for (const IUSim::PrefabPart& PP : Def->Prefab)
		{
			const IUSim::BuildingDef* PartDef = Db->Buildings.Find(PP.PieceId);
			if (!PartDef) { continue; }
			for (FIUShapePart P : IUVisuals::StructureParts(*PartDef))
			{
				const FTransform Local(FRotator(0, PP.Yaw, 0), IU::ToVector(PP.Offset));
				P.Offset = Local.TransformPosition(P.Offset);
				P.Rotation = (Local.GetRotation() * P.Rotation.Quaternion()).Rotator();
				Parts.Add(P);
			}
		}
	}
	for (FIUShapePart& P : Parts) { P.bCollision = false; }
	Preview = AIUPropActor::Spawn(GetWorld(), GetOwner()->GetActorLocation(), 0.0f, Parts, false);
	if (Preview)
	{
		Preview->SetActorEnableCollision(false);
		Preview->GetComponents<UStaticMeshComponent>(PreviewParts);
		bPreviewValid = false;
		SetPreviewValid(true);
	}
}

void UIUBuildComponent::SetPreviewValid(bool bValid)
{
	if (bValid == bPreviewValid) { return; }
	bPreviewValid = bValid;
	UIUAssets* Assets = UIUAssets::Get(this);
	if (!Assets) { return; }
	UMaterialInterface* Mat = Assets->GetGhostMaterial(bValid);
	for (UStaticMeshComponent* C : PreviewParts) { if (C) { C->SetMaterial(0, Mat); } }
}

void UIUBuildComponent::Rotate(float Direction)
{
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::BuildingDef* Def = Db ? Db->Buildings.Find(BuildingId) : nullptr;
	const float Step = (Def && Def->Snap != IUSim::ESnapMode::Free) ? 90.0f : 15.0f;
	RotationOffset = FMath::Fmod(RotationOffset + Step * FMath::Sign(Direction) + 360.0f, 360.0f);
}

IUSim::PlacementProbe UIUBuildComponent::Probe(const IUSim::BuildingDef& Def, const FTransform& Candidate, const AActor* SnapParent) const
{
	IUSim::PlacementProbe P;
	UWorld* World = GetWorld();
	const UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const FVector Size = FVector(Def.Size.X, Def.Size.Y, Def.Size.Z) * IU::MetersToCm;
	const FVector Base = Candidate.GetLocation();
	P.DistanceToPlayer = FVector::Dist(Base, GetOwner()->GetActorLocation()) * IU::CmToMeters;
	P.bSupportedByStructure = SnapParent != nullptr;

	// Corner probes: ground support and slope.
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUBuildProbe), false, GetOwner());
	if (Preview) { Params.AddIgnoredActor(Preview); }
	float MinZ = TNumericLimits<float>::Max();
	float MaxZ = -TNumericLimits<float>::Max();
	int32 Hits = 0;
	const FVector Half(Size.X * 0.45f, Size.Y * 0.45f, 0.0f);
	const FVector Corners[4] = { FVector(Half.X, Half.Y, 0), FVector(-Half.X, Half.Y, 0), FVector(Half.X, -Half.Y, 0), FVector(-Half.X, -Half.Y, 0) };
	for (const FVector& C : Corners)
	{
		const FVector W = Candidate.TransformPosition(C);
		FHitResult Hit;
		if (World->LineTraceSingleByChannel(Hit, W + FVector(0, 0, 150), W - FVector(0, 0, 400), ECC_Visibility, Params))
		{
			MinZ = FMath::Min(MinZ, static_cast<float>(Hit.ImpactPoint.Z));
			MaxZ = FMath::Max(MaxZ, static_cast<float>(Hit.ImpactPoint.Z));
			++Hits;
		}
	}
	P.bHitGround = Hits == 4;
	if (P.bHitGround)
	{
		P.GapToGround = FMath::Max(0.0f, static_cast<float>(Base.Z) - MinZ) * IU::CmToMeters;
		const float Span = FMath::Max(1.0f, FMath::Min(Size.X, Size.Y) * 0.9f);
		P.GroundSlopeDeg = FMath::RadiansToDegrees(FMath::Atan((MaxZ - MinZ) / Span));
	}
	if (WS && !IU::IsUnderground(Base))
	{
		P.bInDeepWater = WS->GetWaterLevelCm(Base.X, Base.Y) - WS->GetGroundHeightCm(Base.X, Base.Y) > 100.0f;
		if (const AIUVillage* Village = WS->FindVillageAt(Base, true))
		{
			const UIUStorySubsystem* Story = UIUStorySubsystem::Get(this);
			const bool bAllied = Story && Story->Factions().GetAttitude(IU::ToStd(Village->GetTribeId())) == IUSim::EAttitude::Allied;
			P.bInsideTribeTerritory = !bAllied;
		}
	}

	// Overlap test against anything that blocks pawns (trees, rocks, buildings, creatures), terrain excluded.
	TArray<FOverlapResult> Overlaps;
	const FVector Center = Candidate.TransformPosition(FVector(0, 0, Size.Z * 0.5f + 15.0f));
	const FCollisionShape Box = FCollisionShape::MakeBox(FVector(Size.X * 0.45f - 8.0f, Size.Y * 0.45f - 8.0f, FMath::Max(10.0f, Size.Z * 0.45f - 15.0f)));
	FCollisionObjectQueryParams Objects;
	Objects.AddObjectTypesToQuery(ECC_WorldStatic);
	Objects.AddObjectTypesToQuery(ECC_WorldDynamic);
	Objects.AddObjectTypesToQuery(ECC_Pawn);
	World->OverlapMultiByObjectType(Overlaps, Center, Candidate.GetRotation(), Objects, Box, Params);
	const AIUIslandWorld* IslandActor = WS ? WS->GetIslandActor() : nullptr;
	for (const FOverlapResult& O : Overlaps)
	{
		const UPrimitiveComponent* C = O.GetComponent();
		if (!C || (IslandActor && IslandActor->IsTerrainComponent(C))) { continue; }
		if (O.GetActor() == SnapParent || O.GetActor() == Preview) { continue; }
		if (C->GetCollisionResponseToChannel(ECC_Pawn) != ECR_Block) { continue; }
		// Pieces snapped to a structure may touch neighbour pieces of the same building.
		if (SnapParent && O.GetActor() && O.GetActor()->ActorHasTag(FName(TEXT("IUStructure")))) { continue; }
		P.bOverlapsBlocking = true;
		break;
	}
	return P;
}

void UIUBuildComponent::UpdatePlacement()
{
	const AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::BuildingDef* Def = Db ? Db->Buildings.Find(BuildingId) : nullptr;
	if (!Character || !Def || !Preview) { return; }

	const FVector Start = Character->GetCamera()->GetComponentLocation();
	const FVector End = Start + Character->GetCamera()->GetForwardVector() * IUBuildLocal::PlaceDistance;
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUBuildAim), false, Character);
	Params.AddIgnoredActor(Preview);
	const bool bHit = GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params);
	const FVector Aim = bHit ? FVector(Hit.ImpactPoint) : End;

	// Try snapping to an existing structure first.
	const AActor* SnapParent = nullptr;
	FTransform Candidate;
	if (bHit)
	{
		if (const AIUStructure* Existing = Cast<AIUStructure>(Hit.GetActor()))
		{
			if (const IUSim::BuildingDef* ExistingDef = Existing->GetDef())
			{
				const std::vector<IUSim::PieceTransform> Options = IUSim::BuildRules::SnapCandidates(*ExistingDef, IUBuildLocal::ToPiece(Existing->GetActorTransform()), *Def);
				IUSim::PieceTransform Best;
				if (IUSim::BuildRules::BestSnap(Options, IU::ToSim(Aim), IUBuildLocal::SnapDistance * IU::CmToMeters, Best))
				{
					Best.Yaw += std::round(RotationOffset / 180.0f) * 180.0f; // flip walls/doors in place
					Candidate = IUBuildLocal::ToTransform(Best);
					SnapParent = Existing;
				}
			}
		}
	}
	if (!SnapParent)
	{
		IUSim::PieceTransform Free;
		Free.Position = IU::ToSim(Aim);
		Free.Yaw = static_cast<float>(Character->GetControlRotation().Yaw) + 180.0f + RotationOffset;
		if (Def->Snap == IUSim::ESnapMode::Grid) { Free = IUSim::BuildRules::SnapToGrid(Free); Free.Position.Z = IU::ToSim(Aim).Z; }
		Candidate = IUBuildLocal::ToTransform(Free);
	}

	// Rest ground pieces on the terrain (slightly embedded on slopes).
	IUSim::PlacementProbe P = Probe(*Def, Candidate, SnapParent);
	if (!SnapParent && P.bHitGround)
	{
		FCollisionQueryParams Down(SCENE_QUERY_STAT(IUBuildRest), false, Character);
		Down.AddIgnoredActor(Preview);
		FHitResult Ground;
		const FVector L = Candidate.GetLocation();
		if (GetWorld()->LineTraceSingleByChannel(Ground, L + FVector(0, 0, 150), L - FVector(0, 0, 400), ECC_Visibility, Down))
		{
			Candidate.SetLocation(FVector(L.X, L.Y, Ground.ImpactPoint.Z));
			P = Probe(*Def, Candidate, nullptr);
		}
	}
	Target = Candidate;
	Preview->SetActorTransform(Candidate);
	LastFail = IUSim::BuildRules::ValidateWithCost(*Def, P, Character->GetInventory()->Inv());
	SetPreviewValid(LastFail == IUSim::EPlacementFail::None);
}

void UIUBuildComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (bActive) { UpdatePlacement(); }
}

void UIUBuildComponent::Confirm()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	UIUWorldSubsystem* WS = UIUWorldSubsystem::Get(this);
	const IUSim::GameDatabase* Db = UIUGameInstance::Db(this);
	const IUSim::BuildingDef* Def = Db ? Db->Buildings.Find(BuildingId) : nullptr;
	if (!Character || !WS || !Def) { return; }
	if (LastFail != IUSim::EPlacementFail::None)
	{
		WS->Notify(UTF8_TO_TCHAR(IUSim::PlacementFailToText(LastFail)), IU::Palette::Bad);
		return;
	}
	if (!Character->GetInventory()->Inv().ConsumeAll(Def->Cost)) { return; }
	Character->GetInventory()->MarkChanged();

	const auto SpawnPiece = [this](const std::string& Id, const FTransform& T)
	{
		FActorSpawnParameters SP;
		SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		if (AIUStructure* S = GetWorld()->SpawnActor<AIUStructure>(AIUStructure::StaticClass(), T, SP)) { S->InitStructure(Id, false); }
	};
	if (Def->Prefab.empty())
	{
		SpawnPiece(BuildingId, Target);
	}
	else
	{
		for (const IUSim::PrefabPart& Part : Def->Prefab)
		{
			const FTransform Local(FRotator(0, Part.Yaw, 0), IU::ToVector(Part.Offset));
			SpawnPiece(Part.PieceId, Local * Target);
		}
	}
	WS->BroadcastEvent(IUSim::EGameEvent::Build, BuildingId, 1);
	WS->Notify(FString::Printf(TEXT("Construido: %s"), *IU::ToFString(Def->Name)), IU::Palette::Good);
	Character->PlayActionSound(TEXT("build"));
	Character->MakeNoiseEvent(0.8f, 2000.0f);
	if (!Character->GetInventory()->Inv().HasAll(Def->Cost)) { Cancel(); }
}

void UIUBuildComponent::DeconstructTarget()
{
	AIUCharacter* Character = Cast<AIUCharacter>(GetOwner());
	if (!Character) { return; }
	const FVector Start = Character->GetCamera()->GetComponentLocation();
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(IUDeconstruct), false, Character);
	if (Preview) { Params.AddIgnoredActor(Preview); }
	if (GetWorld()->LineTraceSingleByChannel(Hit, Start, Start + Character->GetCamera()->GetForwardVector() * 500.0f, IU_TRACE_INTERACT, Params))
	{
		if (AIUStructure* S = Cast<AIUStructure>(Hit.GetActor())) { S->Deconstruct(Character); }
	}
}

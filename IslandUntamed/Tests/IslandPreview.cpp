// Renders the procedural island to a PPM image (map preview) and prints POIs.
// Usage: IslandPreview [out.ppm] [resolution]
#include "SimGameData.h"
#include "SimIsland.h"

#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

int main(int Argc, char** Argv)
{
	const std::string Out = Argc > 1 ? Argv[1] : "island.ppm";
	const int Res = Argc > 2 ? std::atoi(Argv[2]) : 1024;
	IUSim::GameDatabase Db;
	std::string Error;
	const bool bOk = Db.LoadAll([](const std::string& Name, std::string& Text)
	{
		std::ifstream In(std::string(IU_DATA_DIR) + "/" + Name, std::ios::binary);
		if (!In) { return false; }
		std::stringstream SS; SS << In.rdbuf(); Text = SS.str();
		return true;
	}, Error);
	if (!bOk) { std::printf("Data error: %s\n", Error.c_str()); return 1; }

	IUSim::IslandModel Model;
	const auto T0 = std::chrono::steady_clock::now();
	Model.Generate(IUSim::IslandParams(), &Db.Nodes);
	const double Ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - T0).count();
	std::printf("Island generated in %.1f ms\n", Ms);

	std::vector<uint8_t> Img = Model.BuildMapImage(Res);
	const float H = Model.HalfSize();
	const auto Plot = [&Img, Res, H, &Model](float X, float Y, uint8_t R, uint8_t G, uint8_t B, int Size)
	{
		const int PX = static_cast<int>((X + H) / Model.GetParams().Size * static_cast<float>(Res));
		const int PY = static_cast<int>((H - Y) / Model.GetParams().Size * static_cast<float>(Res));
		for (int DY = -Size; DY <= Size; ++DY)
		{
			for (int DX = -Size; DX <= Size; ++DX)
			{
				const int X2 = PX + DX, Y2 = PY + DY;
				if (X2 < 0 || Y2 < 0 || X2 >= Res || Y2 >= Res) { continue; }
				const size_t I = (static_cast<size_t>(Y2) * static_cast<size_t>(Res) + static_cast<size_t>(X2)) * 4U;
				Img[I] = R; Img[I + 1] = G; Img[I + 2] = B;
			}
		}
	};
	for (const IUSim::PointOfInterest& P : Model.GetPOIs())
	{
		uint8_t R = 255, G = 255, B = 255;
		switch (P.Type)
		{
		case IUSim::EPOIType::Village: R = 230; G = 60; B = 40; break;
		case IUSim::EPOIType::Cave: R = 30; G = 30; B = 30; break;
		case IUSim::EPOIType::Ruins: R = 200; G = 170; B = 40; break;
		case IUSim::EPOIType::CrashSite: case IUSim::EPOIType::PlaneTail: R = 255; G = 140; B = 0; break;
		case IUSim::EPOIType::Waterfall: R = 120; G = 220; B = 255; break;
		case IUSim::EPOIType::Facility: R = 180; G = 60; B = 220; break;
		default: break;
		}
		Plot(P.Position.X, P.Position.Y, R, G, B, Res / 256 + 2);
		std::printf("  %-20s %-12s (%7.1f, %7.1f, %6.1f) %s\n", P.Id.c_str(), IUSim::POITypeToString(P.Type), static_cast<double>(P.Position.X), static_cast<double>(P.Position.Y), static_cast<double>(P.Position.Z), IUSim::BiomeDisplayName(Model.GetBiome(P.Position.X, P.Position.Y)));
	}
	const IUSim::Vec3 S = Model.GetPlayerSpawn();
	Plot(S.X, S.Y, 255, 255, 0, Res / 256 + 1);
	std::printf("Rivers: %zu  Lakes: %zu  Spawn: (%.1f, %.1f, %.1f)\n", Model.GetRivers().size(), Model.GetLakes().size(), static_cast<double>(S.X), static_cast<double>(S.Y), static_cast<double>(S.Z));

	std::ofstream F(Out, std::ios::binary);
	F << "P6\n" << Res << " " << Res << "\n255\n";
	for (size_t I = 0; I < Img.size(); I += 4) { F.put(static_cast<char>(Img[I])); F.put(static_cast<char>(Img[I + 1])); F.put(static_cast<char>(Img[I + 2])); }
	std::printf("Wrote %s\n", Out.c_str());
	return 0;
}

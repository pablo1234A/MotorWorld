#include "TestFramework.h"

#include <chrono>
#include <fstream>
#include <sstream>

namespace IUTest
{
	std::vector<TestCase>& Registry() { static std::vector<TestCase> R; return R; }
	int& FailureCount() { static int F = 0; return F; }
	int& CheckCount() { static int C = 0; return C; }
	const char*& CurrentTest() { static const char* N = ""; return N; }

	bool ReadDataFile(const std::string& Name, std::string& Out)
	{
		std::ifstream In(std::string(IU_DATA_DIR) + "/" + Name, std::ios::binary);
		if (!In) { return false; }
		std::stringstream SS;
		SS << In.rdbuf();
		Out = SS.str();
		return true;
	}
}

int main()
{
	int FailedTests = 0;
	for (const IUTest::TestCase& T : IUTest::Registry())
	{
		IUTest::CurrentTest() = T.Name;
		const int Before = IUTest::FailureCount();
		const auto Start = std::chrono::steady_clock::now();
		T.Fn();
		const double Ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - Start).count();
		const bool bOk = IUTest::FailureCount() == Before;
		if (!bOk) { ++FailedTests; }
		std::printf("[%s] %-40s %8.1f ms\n", bOk ? " OK " : "FAIL", T.Name, Ms);
	}
	std::printf("\n%zu tests, %d checks, %d failed checks, %d failed tests\n", IUTest::Registry().size(), IUTest::CheckCount(), IUTest::FailureCount(), FailedTests);
	return FailedTests == 0 ? 0 : 1;
}

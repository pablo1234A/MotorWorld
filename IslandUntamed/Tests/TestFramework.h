// Minimal self-registering test framework (no external dependencies, no exceptions).
#pragma once

#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace IUTest
{
	struct TestCase
	{
		const char* Name;
		std::function<void()> Fn;
	};

	std::vector<TestCase>& Registry();
	int& FailureCount();
	int& CheckCount();
	const char*& CurrentTest();

	struct Registrar
	{
		Registrar(const char* Name, std::function<void()> Fn) { Registry().push_back(TestCase{ Name, std::move(Fn) }); }
	};

	/** Reads a data file from Content/Data. */
	bool ReadDataFile(const std::string& Name, std::string& Out);
}

#define IU_TEST_CONCAT2(A, B) A##B
#define IU_TEST_CONCAT(A, B) IU_TEST_CONCAT2(A, B)
#define IU_TEST(Name) \
	static void Name(); \
	static IUTest::Registrar IU_TEST_CONCAT(Registrar_, Name)(#Name, &Name); \
	static void Name()

#define EXPECT_TRUE(Cond) do { ++IUTest::CheckCount(); if (!(Cond)) { ++IUTest::FailureCount(); std::printf("  FAIL %s:%d [%s] %s\n", __FILE__, __LINE__, IUTest::CurrentTest(), #Cond); } } while (0)
#define EXPECT_FALSE(Cond) EXPECT_TRUE(!(Cond))
#define EXPECT_EQ(A, B) do { ++IUTest::CheckCount(); if (!((A) == (B))) { ++IUTest::FailureCount(); std::printf("  FAIL %s:%d [%s] %s == %s\n", __FILE__, __LINE__, IUTest::CurrentTest(), #A, #B); } } while (0)
#define EXPECT_NEAR(A, B, Eps) do { ++IUTest::CheckCount(); if (std::fabs(static_cast<double>(A) - static_cast<double>(B)) > (Eps)) { ++IUTest::FailureCount(); std::printf("  FAIL %s:%d [%s] %s (%f) ~= %s (%f)\n", __FILE__, __LINE__, IUTest::CurrentTest(), #A, static_cast<double>(A), #B, static_cast<double>(B)); } } while (0)
#define EXPECT_GT(A, B) EXPECT_TRUE((A) > (B))
#define EXPECT_LT(A, B) EXPECT_TRUE((A) < (B))

# Island Untamed - headless test harness for the engine-agnostic simulation core.
#
# Builds Source/IslandUntamed/Sim with flags that mirror Unreal's defaults
# (no exceptions, no RTTI, shadowing as error) so that anything that compiles
# here also compiles inside the Unreal module.
#
#   cmake -S Tests -B build/tests && cmake --build build/tests -j && ctest --test-dir build/tests --output-on-failure
cmake_minimum_required(VERSION 3.20)
project(IslandUntamedSimTests CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(IU_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)
set(IU_SIM_DIR "${IU_ROOT}/Source/IslandUntamed/Sim")

file(GLOB IU_SIM_SOURCES CONFIGURE_DEPENDS "${IU_SIM_DIR}/*.cpp")

add_library(IslandSim STATIC ${IU_SIM_SOURCES})
target_include_directories(IslandSim PUBLIC "${IU_SIM_DIR}")

set(IU_WARNINGS -Wall -Wextra -Wshadow -Wconversion-null -Wnon-virtual-dtor -Werror -fno-exceptions -fno-rtti)
target_compile_options(IslandSim PRIVATE ${IU_WARNINGS})

# Unity build mirrors UBT's default and catches helper-name collisions between .cpp files.
set_target_properties(IslandSim PROPERTIES UNITY_BUILD ON UNITY_BUILD_BATCH_SIZE 0)

add_executable(IslandSimTests
    TestMain.cpp
    TestCore.cpp
    TestGameplay.cpp
    TestWorld.cpp)
target_link_libraries(IslandSimTests PRIVATE IslandSim)
target_compile_options(IslandSimTests PRIVATE ${IU_WARNINGS})
target_compile_definitions(IslandSimTests PRIVATE IU_DATA_DIR="${IU_ROOT}/Content/Data")

add_executable(IslandPreview IslandPreview.cpp)
target_link_libraries(IslandPreview PRIVATE IslandSim)
target_compile_options(IslandPreview PRIVATE ${IU_WARNINGS})
target_compile_definitions(IslandPreview PRIVATE IU_DATA_DIR="${IU_ROOT}/Content/Data")

enable_testing()
add_test(NAME SimCore COMMAND IslandSimTests)

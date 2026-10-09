#!/usr/bin/env bash
# Full verification available without the Unity editor:
#   1) unit tests of the engine-agnostic Core
#   2) compile Runtime against UnityEngine reference assemblies
#   3) compile Editor scripts against UnityEditor reference assemblies
set -euo pipefail
cd "$(dirname "$0")"
./fetch-unity-refs.sh >/dev/null
echo "== Core unit tests" && dotnet test CoreTests/CoreTests.csproj --nologo -v q
echo "== Runtime compile" && dotnet build UnityCompileCheck/Runtime/Runtime.csproj --nologo -v q
echo "== Editor compile" && dotnet build UnityCompileCheck/Editor/Editor.csproj --nologo -v q
echo "All checks passed."

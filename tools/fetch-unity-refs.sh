#!/usr/bin/env bash
# Downloads Unity reference assemblies from NuGet so the game code can be compiled without a Unity install.
#  - UnityEngine.Modules 2021.3.33 (per-module engine reference assemblies, used for Runtime)
#  - Unity3D.SDK 2021.1.14.1 (monolithic UnityEngine.dll + UnityEditor.dll, used for Editor scripts)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/.unityref"
mkdir -p "$DIR"
fetch() {
  local id="$1" ver="$2" out="$DIR/$1"
  [ -d "$out" ] && return 0
  curl -sSL -o "$DIR/$id.nupkg" "https://api.nuget.org/v3-flatcontainer/$id/$ver/$id.$ver.nupkg"
  mkdir -p "$out" && (cd "$out" && unzip -qo "../$id.nupkg") && rm "$DIR/$id.nupkg"
  find "$out" -name "*.dll" -exec chmod 644 {} \;
}
fetch unityengine.modules 2021.3.33
fetch unity3d.sdk 2021.1.14.1
fetch nunit 3.13.3
echo "Unity reference assemblies in $DIR"

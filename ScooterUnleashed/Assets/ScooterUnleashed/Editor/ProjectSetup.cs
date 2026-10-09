using System;
using System.IO;
using System.Reflection;
using ScooterUnleashed.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScooterUnleashed.EditorTools
{
    /// <summary>
    /// One-click project configuration: URP asset, shader templates kept in builds, the Main scene, build settings and
    /// mobile player settings. Runs automatically the first time the project is opened.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        public const string Root = "Assets/ScooterUnleashed";
        public const string ScenePath = Root + "/Scenes/Main.unity";
        public const string ResourcesDir = Root + "/Resources/ScooterUnleashed";
        public const string SettingsDir = Root + "/Settings";

        static ProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (SessionState.GetBool("SU_SetupChecked", false)) return;
                SessionState.SetBool("SU_SetupChecked", true);
                if (!File.Exists(ScenePath))
                {
                    Debug.Log("[Scooter Unleashed] First run: configuring the project…");
                    Setup();
                }
            };
        }

        [MenuItem("Scooter Unleashed/Setup Project", priority = 0)]
        public static void Setup()
        {
            EnsureDir(Root + "/Scenes");
            EnsureDir(ResourcesDir);
            EnsureDir(SettingsDir);
            bool urp = SetupUrp();
            CreateShaderTemplates(urp);
            ConfigurePlayer();
            CreateScene();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[Scooter Unleashed] Setup complete" + (urp ? " (URP)" : " (built-in pipeline: URP package not found)") + ". Open Assets/ScooterUnleashed/Scenes/Main.unity and press Play.");
        }

        private static void EnsureDir(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureDir(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        // ------------------------------------------------------------------------------------------
        private static bool SetupUrp()
        {
            var assetType = FindType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset");
            var dataType = FindType("UnityEngine.Rendering.Universal.UniversalRendererData") ?? FindType("UnityEngine.Rendering.Universal.ForwardRendererData");
            if (assetType == null || dataType == null)
            {
                Debug.LogWarning("[Scooter Unleashed] URP not installed; using the built-in render pipeline. Install com.unity.render-pipelines.universal for mobile-optimised rendering.");
                return false;
            }
            string assetPath = SettingsDir + "/SU_URP_Mobile.asset";
            string dataPath = SettingsDir + "/SU_URP_Renderer.asset";
            var existing = AssetDatabase.LoadAssetAtPath(assetPath, assetType) as RenderPipelineAsset;
            if (existing == null)
            {
                var data = ScriptableObject.CreateInstance(dataType);
                AssetDatabase.CreateAsset(data, dataPath);
                var create = assetType.GetMethod("Create", BindingFlags.Public | BindingFlags.Static);
                if (create == null) { Debug.LogWarning("[Scooter Unleashed] URP API changed: create the URP asset manually."); return false; }
                existing = (RenderPipelineAsset)create.Invoke(null, new object[] { data });
                AssetDatabase.CreateAsset(existing, assetPath);
                SetProp(existing, "supportsHDR", true);
                SetProp(existing, "shadowDistance", 60f);
                SetProp(existing, "msaaSampleCount", 2);
                SetProp(existing, "renderScale", 1f);
                SetProp(existing, "supportsCameraDepthTexture", false);
                SetProp(existing, "supportsCameraOpaqueTexture", false);
                EditorUtility.SetDirty(existing);
            }
#if UNITY_2021_2_OR_NEWER
            GraphicsSettings.defaultRenderPipeline = existing;
#else
            GraphicsSettings.renderPipelineAsset = existing;
#endif
            int levels = QualitySettings.names.Length;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < levels; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = existing;
            }
            QualitySettings.SetQualityLevel(current, false);
            return true;
        }

        private static void SetProp(object o, string name, object value)
        {
            var p = o.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            if (p != null && p.CanWrite) { try { p.SetValue(o, value); } catch (Exception) { } }
        }

        private static Type FindType(string fullName)
        {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = a.GetType(fullName, false);
                if (t != null) return t;
            }
            return null;
        }

        // ------------------------------------------------------------------------------------------
        private static void CreateShaderTemplates(bool urp)
        {
            void Make(string name, params string[] shaders)
            {
                string path = ResourcesDir + "/" + name + ".mat";
                if (File.Exists(path)) return;
                Shader s = null;
                foreach (var sn in shaders) { s = Shader.Find(sn); if (s != null) break; }
                if (s == null) { Debug.LogWarning("[Scooter Unleashed] Shader not found for " + name); return; }
                var m = new Material(s) { enableInstancing = true };
                AssetDatabase.CreateAsset(m, path);
            }
            if (urp)
            {
                Make("SU_LitTemplate", "Universal Render Pipeline/Lit");
                Make("SU_ParticleTemplate", "Universal Render Pipeline/Particles/Unlit");
            }
            else
            {
                Make("SU_LitTemplate", "Standard");
                Make("SU_ParticleTemplate", "Particles/Standard Unlit", "Sprites/Default");
            }
            Make("SU_SkyTemplate", "Skybox/Procedural");
        }

        // ------------------------------------------------------------------------------------------
        private static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "ScooterUnleashed";
            PlayerSettings.productName = "Scooter Unleashed";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.scooterunleashed.game");
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.iOS, "com.scooterunleashed.game");
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            PlayerSettings.iOS.targetOSVersionString = "13.0";
            PlayerSettings.gpuSkinning = true;
            Time.fixedDeltaTime = 1f / 60f;

            // The game reads touches through the classic Input API: make sure it is enabled (Input Manager or Both).
            var settingsAssets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (settingsAssets != null && settingsAssets.Length > 0)
            {
                var so = new SerializedObject(settingsAssets[0]);
                var prop = so.FindProperty("activeInputHandler");
                if (prop != null && prop.intValue == 1)
                {
                    prop.intValue = 2;
                    so.ApplyModifiedProperties();
                    Debug.LogWarning("[Scooter Unleashed] Active Input Handling set to 'Both'. Restart the editor for it to take effect.");
                }
            }
        }

        private static void CreateScene()
        {
            if (!File.Exists(ScenePath))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var go = new GameObject("GameBootstrap");
                go.AddComponent<GameBootstrap>();
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        // ------------------------------------------------------------------------------------------
        [MenuItem("Scooter Unleashed/Build/Android APK", priority = 20)]
        public static void BuildAndroid() => Build(BuildTarget.Android, "Builds/Android/ScooterUnleashed.apk");

        [MenuItem("Scooter Unleashed/Build/iOS Xcode Project", priority = 21)]
        public static void BuildIos() => Build(BuildTarget.iOS, "Builds/iOS");

        private static void Build(BuildTarget target, string output)
        {
            Setup();
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = target,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log($"[Scooter Unleashed] Build {target}: {report.summary.result} · {report.summary.totalSize / (1024 * 1024)} MB · {report.summary.totalErrors} errors");
        }

        [MenuItem("Scooter Unleashed/Open Main Scene", priority = 1)]
        public static void OpenScene()
        {
            if (!File.Exists(ScenePath)) Setup();
            EditorSceneManager.OpenScene(ScenePath);
        }
    }
}

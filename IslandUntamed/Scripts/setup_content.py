"""
Island Untamed - editor content bootstrap (run inside the Unreal Editor).

    Tools > Execute Python Script... > Scripts/setup_content.py
    (or: UnrealEditor-Cmd.exe IslandUntamed.uproject -run=pythonscript -script="Scripts/setup_content.py")

Creates the optional project materials that the runtime looks for in
/Game/IslandUntamed/Materials. Without them the game still runs using the
engine's BasicShapeMaterial and VertexColorMaterial fallbacks, but these give:

  M_IU_Solid      lit PBR material with a "Color" parameter
  M_IU_Foliage    two-sided, wind animated (SimpleGrassWind driven by MPC WindStrength)
  M_IU_Emissive   glowing material for crystals, flames and lights
  M_IU_Water      glossy water surface
  M_IU_Terrain    vertex-colour terrain (biome colours baked by the generator)
  M_IU_Ghost      translucent unlit placement preview
  MPC_IU_Environment  WindStrength / Wetness, updated by AIUEnvironment
  /Game/IslandUntamed/Maps/L_Island  (World Partition map, optional)

The script is idempotent: existing assets are left untouched.
"""
import unreal

MAT_DIR = "/Game/IslandUntamed/Materials"
MAP_PATH = "/Game/IslandUntamed/Maps/L_Island"

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary


def log(msg):
    unreal.log("[IslandUntamed] " + msg)


def exists(path):
    return eal.does_asset_exist(path)


def new_material(name):
    path = MAT_DIR + "/" + name
    if exists(path):
        log(name + " already exists, skipping")
        return None
    return asset_tools.create_asset(name, MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())


def color_param(mat, x=-600, y=0, default=(0.5, 0.5, 0.5, 1.0)):
    node = mel.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, x, y)
    node.set_editor_property("parameter_name", "Color")
    node.set_editor_property("default_value", unreal.LinearColor(*default))
    return node


def constant(mat, value, x, y):
    node = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, x, y)
    node.set_editor_property("r", value)
    return node


def finish(mat):
    mel.recompile_material(mat)
    eal.save_asset(mat.get_path_name())
    log("created " + mat.get_name())


def make_mpc():
    path = MAT_DIR + "/MPC_IU_Environment"
    if exists(path):
        return unreal.load_asset(path)
    mpc = asset_tools.create_asset("MPC_IU_Environment", MAT_DIR, unreal.MaterialParameterCollection, unreal.MaterialParameterCollectionFactoryNew())
    params = []
    for pname, default in (("WindStrength", 0.3), ("Wetness", 0.0)):
        p = unreal.CollectionScalarParameter()
        p.set_editor_property("parameter_name", pname)
        p.set_editor_property("default_value", default)
        params.append(p)
    mpc.set_editor_property("scalar_parameters", params)
    eal.save_asset(mpc.get_path_name())
    log("created MPC_IU_Environment")
    return mpc


def make_solid():
    mat = new_material("M_IU_Solid")
    if not mat:
        return
    c = color_param(mat)
    mel.connect_material_property(c, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(constant(mat, 0.82, -600, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
    finish(mat)


def make_foliage(mpc):
    mat = new_material("M_IU_Foliage")
    if not mat:
        return
    mat.set_editor_property("two_sided", True)
    c = color_param(mat, default=(0.1, 0.35, 0.08, 1.0))
    mel.connect_material_property(c, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(constant(mat, 0.7, -600, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
    try:
        wind = mel.create_material_expression(mat, unreal.MaterialExpressionMaterialFunctionCall, -400, 400)
        func = unreal.load_asset("/Engine/Functions/Engine_MaterialFunctions01/WorldPositionOffset/SimpleGrassWind.SimpleGrassWind")
        wind.set_editor_property("material_function", func)
        strength = mel.create_material_expression(mat, unreal.MaterialExpressionCollectionParameter, -800, 400)
        strength.set_editor_property("collection", mpc)
        strength.set_editor_property("parameter_name", "WindStrength")
        mel.connect_material_expressions(strength, "", wind, "WindIntensity")
        mel.connect_material_expressions(constant(mat, 1.0, -800, 520), "", wind, "WindWeight")
        mel.connect_material_expressions(constant(mat, 0.6, -800, 620), "", wind, "WindSpeed")
        mel.connect_material_property(wind, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    except Exception as exc:  # engine content layout differs between versions
        unreal.log_warning("[IslandUntamed] wind setup skipped: %s" % exc)
    finish(mat)


def make_emissive():
    mat = new_material("M_IU_Emissive")
    if not mat:
        return
    c = color_param(mat, default=(1.0, 0.5, 0.1, 1.0))
    mel.connect_material_property(c, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    mult = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, 150)
    mel.connect_material_expressions(c, "RGB", mult, "A")
    mel.connect_material_expressions(constant(mat, 8.0, -600, 250), "", mult, "B")
    mel.connect_material_property(mult, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    finish(mat)


def make_water():
    mat = new_material("M_IU_Water")
    if not mat:
        return
    c = color_param(mat, default=(0.02, 0.16, 0.24, 1.0))
    mel.connect_material_property(c, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(constant(mat, 0.04, -600, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(constant(mat, 0.9, -600, 350), "", unreal.MaterialProperty.MP_SPECULAR)
    finish(mat)


def make_terrain():
    mat = new_material("M_IU_Terrain")
    if not mat:
        return
    vc = mel.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -600, 0)
    mel.connect_material_property(vc, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(constant(mat, 0.92, -600, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
    finish(mat)


def make_ghost():
    mat = new_material("M_IU_Ghost")
    if not mat:
        return
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    c = color_param(mat, default=(0.1, 0.9, 0.3, 0.4))
    mel.connect_material_property(c, "RGB", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.connect_material_property(c, "A", unreal.MaterialProperty.MP_OPACITY)
    finish(mat)


def make_map():
    if exists(MAP_PATH):
        log("map already exists")
        return
    try:
        subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        ok = subsystem.new_level(MAP_PATH, True)  # World Partition enabled
        if ok:
            subsystem.save_current_level()
            log("created World Partition map " + MAP_PATH)
            log("To use it: set GameDefaultMap/EditorStartupMap in Config/DefaultEngine.ini to " + MAP_PATH)
    except Exception as exc:
        unreal.log_warning("[IslandUntamed] map creation skipped (%s). The game runs on /Engine/Maps/Entry." % exc)


def main():
    if not eal.does_directory_exist(MAT_DIR):
        eal.make_directory(MAT_DIR)
    mpc = make_mpc()
    make_solid()
    make_foliage(mpc)
    make_emissive()
    make_water()
    make_terrain()
    make_ghost()
    make_map()
    log("content setup finished")


main()

using ScooterUnleashed.Core.Stats;
using ScooterUnleashed.Rendering;
using ScooterUnleashed.World;
using UnityEngine;

namespace ScooterUnleashed.Character
{
    /// <summary>
    /// Procedural, part-driven scooter model. Proportions come from the equipped parts (deck length/width, bar height,
    /// wheel diameter) and the hierarchy exposes real pivots used by tricks:
    ///  Root (lean / manual pitch) → Headtube → Bars (steer, barspin, x-up)
    ///                                       → DeckPivot (tailwhip around the headtube, bri flip around the bar axis)
    /// Replace with an authored model by keeping the same pivot names.
    /// </summary>
    public sealed class ScooterVisual : MonoBehaviour
    {
        public static readonly Color[] Palette =
        {
            new Color(0.08f, 0.08f, 0.09f), new Color(0.85f, 0.85f, 0.87f), new Color(0.9f, 0.3f, 0.1f), new Color(0.12f, 0.45f, 0.85f),
            new Color(0.95f, 0.8f, 0.1f), new Color(0.1f, 0.65f, 0.35f), new Color(0.75f, 0.1f, 0.25f), new Color(0.55f, 0.25f, 0.75f),
            new Color(0.95f, 0.45f, 0.65f), new Color(0.3f, 0.32f, 0.35f), new Color(0.85f, 0.65f, 0.3f), new Color(0.2f, 0.8f, 0.8f),
        };
        public static readonly string[] PaletteNames = { "Negro", "Cromo", "Naranja", "Azul", "Amarillo", "Verde", "Granate", "Violeta", "Rosa", "Grafito", "Oro", "Turquesa" };

        public Transform Headtube { get; private set; }
        public Transform Bars { get; private set; }
        public Transform DeckPivot { get; private set; }
        public Transform FrontWheel { get; private set; }
        public Transform RearWheel { get; private set; }
        public Transform GripLeft { get; private set; }
        public Transform GripRight { get; private set; }
        public Transform FootFront { get; private set; }
        public Transform FootBack { get; private set; }
        public Transform RearContact { get; private set; }
        public float WheelRadius { get; private set; } = 0.055f;
        public float DeckLength { get; private set; } = 0.52f;
        public float BarHeight { get; private set; } = 0.6f;
        public float DeckTopY { get; private set; }

        private Transform _visualRoot;
        private float _wheelAngle;

        /// <summary>Builds (or rebuilds) the scooter from a build + catalog.</summary>
        public void Build(ScooterBuild build, PartCatalog catalog)
        {
            if (_visualRoot != null) Destroy(_visualRoot.gameObject);
            var deck = catalog.Get(build.Get(PartSlot.Deck)) ?? catalog.DefaultFor(PartSlot.Deck);
            var bars = catalog.Get(build.Get(PartSlot.Bars)) ?? catalog.DefaultFor(PartSlot.Bars);
            var wheels = catalog.Get(build.Get(PartSlot.Wheels)) ?? catalog.DefaultFor(PartSlot.Wheels);
            var pegs = catalog.Get(build.Get(PartSlot.Pegs));
            var brake = catalog.Get(build.Get(PartSlot.Brake));
            var clamp = catalog.Get(build.Get(PartSlot.Clamp));
            bool titanium = bars != null && bars.Id.Contains("ti");

            DeckLength = (deck?.GeometryA ?? 520f) / 1000f;
            float deckW = (deck?.GeometryB ?? 115f) / 1000f;
            BarHeight = (bars?.GeometryA ?? 600f) / 1000f;
            float barW = (bars?.GeometryB ?? 560f) / 1000f;
            WheelRadius = (wheels?.GeometryA ?? 110f) / 2000f;

            Material deckMat = MaterialLibrary.Tinted(Mat.Aluminium, Palette[Mathf.Clamp(build.DeckColor, 0, Palette.Length - 1)]);
            Material barMat = MaterialLibrary.Tinted(titanium ? Mat.Titanium : Mat.Chrome, Palette[Mathf.Clamp(build.BarsColor, 0, Palette.Length - 1)]);
            Material wheelCore = MaterialLibrary.Tinted(Mat.Aluminium, Palette[Mathf.Clamp(build.WheelColor, 0, Palette.Length - 1)]);
            Material gripMat = MaterialLibrary.Tinted(Mat.Rubber, Color.Lerp(Palette[Mathf.Clamp(build.GripColor, 0, Palette.Length - 1)], Color.black, 0.35f));
            Material rubber = MaterialLibrary.Get(Mat.Rubber);
            Material grip = MaterialLibrary.Get(Mat.Griptape);
            Material chrome = MaterialLibrary.Get(Mat.Chrome);

            _visualRoot = new GameObject("ScooterModel").transform;
            _visualRoot.SetParent(transform, false);

            // The controller's origin is the deck height (RideHeight above ground). Deck sits slightly below it.
            const float deckThick = 0.035f;
            float deckY = 0f;
            DeckTopY = deckY + deckThick * 0.5f;
            float halfL = DeckLength * 0.5f;

            Headtube = Node("Headtube", _visualRoot, new Vector3(0f, deckY + 0.075f, halfL + 0.03f));
            DeckPivot = Node("DeckPivot", Headtube, Vector3.zero);
            Bars = Node("Bars", Headtube, Vector3.zero);

            // ---- Deck group (relative to headtube)
            Vector3 deckCenter = new Vector3(0f, deckY - Headtube.localPosition.y, -halfL - 0.03f);
            Part("Deck", PrimitiveType.Cube, DeckPivot, deckCenter, new Vector3(deckW, deckThick, DeckLength), deckMat);
            Part("Griptape", PrimitiveType.Cube, DeckPivot, deckCenter + Vector3.up * (deckThick * 0.5f + 0.002f), new Vector3(deckW - 0.012f, 0.004f, DeckLength - 0.03f), grip);
            Part("Neck", PrimitiveType.Cube, DeckPivot, new Vector3(0f, -0.02f, -0.02f), new Vector3(0.05f, 0.06f, 0.08f), deckMat);
            Part("Dropout", PrimitiveType.Cube, DeckPivot, deckCenter + new Vector3(0f, -0.01f, -halfL - 0.03f), new Vector3(deckW * 0.75f, 0.045f, 0.08f), deckMat);
            Vector3 rearAxle = deckCenter + new Vector3(0f, -deckThick * 0.5f - 0.02f + WheelRadius - 0.02f, -halfL - 0.045f);
            rearAxle.y = -Headtube.localPosition.y - (0.1f - WheelRadius);
            RearWheel = Wheel("RearWheel", DeckPivot, rearAxle, wheelCore, rubber);
            RearContact = Node("RearContact", DeckPivot, rearAxle + Vector3.down * WheelRadius);
            if (brake == null || brake.Id != "brake_none")
                Part("Brake", PrimitiveType.Cube, DeckPivot, rearAxle + new Vector3(0f, WheelRadius + 0.012f, 0.01f), new Vector3(deckW * 0.6f, 0.006f, WheelRadius * 1.6f), chrome);
            if (pegs != null && pegs.Id != "pegs_none")
            {
                var pegMat = pegs.Id == "pegs_nylon" ? MaterialLibrary.Tinted(Mat.Plastic, new Color(0.9f, 0.9f, 0.88f)) : chrome;
                Cyl("PegL", DeckPivot, rearAxle + new Vector3(-0.09f, 0f, 0f), new Vector3(0.042f, 0.05f, 0.042f), Quaternion.Euler(0, 0, 90), pegMat);
                Cyl("PegR", DeckPivot, rearAxle + new Vector3(0.09f, 0f, 0f), new Vector3(0.042f, 0.05f, 0.042f), Quaternion.Euler(0, 0, 90), pegMat);
            }
            FootFront = Node("FootFront", DeckPivot, deckCenter + new Vector3(0f, deckThick * 0.5f + 0.03f, halfL * 0.45f));
            FootBack = Node("FootBack", DeckPivot, deckCenter + new Vector3(0f, deckThick * 0.5f + 0.03f, -halfL * 0.45f));

            // ---- Bars group
            float frontAxleY = -Headtube.localPosition.y - (0.1f - WheelRadius);
            Cyl("Headset", Bars, new Vector3(0f, 0.05f, 0f), new Vector3(0.05f, 0.07f, 0.05f), Quaternion.identity, deckMat);
            Cyl("Fork", Bars, new Vector3(0f, frontAxleY * 0.5f, 0f), new Vector3(0.038f, Mathf.Abs(frontAxleY) * 0.5f + 0.01f, 0.038f), Quaternion.identity, barMat);
            FrontWheel = Wheel("FrontWheel", Bars, new Vector3(0f, frontAxleY, 0f), wheelCore, rubber);
            Cyl("Stem", Bars, new Vector3(0f, 0.12f + BarHeight * 0.5f, 0f), new Vector3(0.034f, BarHeight * 0.5f, 0.034f), Quaternion.identity, barMat);
            bool scs = clamp != null && clamp.Id == "clamp_scs";
            Cyl("Clamp", Bars, new Vector3(0f, 0.16f, 0f), scs ? new Vector3(0.062f, 0.05f, 0.062f) : new Vector3(0.052f, 0.035f, 0.052f), Quaternion.identity, chrome);
            float barY = 0.12f + BarHeight;
            Cyl("Crossbar", Bars, new Vector3(0f, barY, 0f), new Vector3(0.03f, barW * 0.5f, 0.03f), Quaternion.Euler(0, 0, 90), barMat);
            // Gusset for strength look
            Part("Gusset", PrimitiveType.Cube, Bars, new Vector3(0f, barY - 0.06f, 0f), new Vector3(0.12f, 0.012f, 0.012f), barMat);
            Cyl("GripL", Bars, new Vector3(-barW * 0.5f + 0.08f, barY, 0f), new Vector3(0.04f, 0.08f, 0.04f), Quaternion.Euler(0, 0, 90), gripMat);
            Cyl("GripR", Bars, new Vector3(barW * 0.5f - 0.08f, barY, 0f), new Vector3(0.04f, 0.08f, 0.04f), Quaternion.Euler(0, 0, 90), gripMat);
            GripLeft = Node("GripTargetL", Bars, new Vector3(-barW * 0.5f + 0.07f, barY, 0f));
            GripRight = Node("GripTargetR", Bars, new Vector3(barW * 0.5f - 0.07f, barY, 0f));

            foreach (var r in _visualRoot.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
        }

        private static Transform Node(string name, Transform parent, Vector3 localPos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = localPos;
            return t;
        }

        private static GameObject Part(string name, PrimitiveType type, Transform parent, Vector3 localPos, Vector3 scale, Material mat)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            go.layer = Layers.Player;
            return go;
        }

        private static GameObject Cyl(string name, Transform parent, Vector3 localPos, Vector3 scale, Quaternion rot, Material mat)
        {
            var go = Part(name, PrimitiveType.Cylinder, parent, localPos, scale, mat);
            go.transform.localRotation = rot;
            return go;
        }

        private Transform Wheel(string name, Transform parent, Vector3 axle, Material core, Material rubber)
        {
            var hub = Node(name, parent, axle);
            float d = WheelRadius * 2f;
            Cyl("Tyre", hub, Vector3.zero, new Vector3(d, 0.012f, d), Quaternion.Euler(0, 0, 90), rubber);
            Cyl("Core", hub, Vector3.zero, new Vector3(d * 0.72f, 0.0125f, d * 0.72f), Quaternion.Euler(0, 0, 90), core);
            // Spokes give a visible spin cue.
            Part("Spoke", PrimitiveType.Cube, hub, Vector3.zero, new Vector3(0.026f, d * 0.68f, 0.01f), rubber);
            return hub;
        }

        /// <summary>Per-frame visual pose: steering, wheel spin, lean, manual pitch, trick rotations.</summary>
        public void Pose(float steerDeg, float speed, float leanDeg, float manualPitchDeg, float barspinDeg, float tailwhipDeg, float briflipDeg, float dt)
        {
            if (_visualRoot == null) return;
            _wheelAngle += speed / Mathf.Max(0.01f, WheelRadius) * Mathf.Rad2Deg * dt;
            _wheelAngle %= 360f;
            if (FrontWheel != null) FrontWheel.localRotation = Quaternion.Euler(_wheelAngle, 0f, 0f);
            if (RearWheel != null) RearWheel.localRotation = Quaternion.Euler(_wheelAngle, 0f, 0f);

            // Manual: pivot around the rear (or front) contact by moving the root.
            float halfWB = DeckLength * 0.5f + 0.05f;
            Quaternion lean = Quaternion.AngleAxis(leanDeg, Vector3.forward);
            Quaternion pitch = Quaternion.AngleAxis(-manualPitchDeg, Vector3.right);
            Vector3 pivot = manualPitchDeg >= 0f ? new Vector3(0f, -0.1f, -halfWB) : new Vector3(0f, -0.1f, halfWB);
            if (_tumble == null)
            {
                _visualRoot.localRotation = lean * pitch;
                _visualRoot.localPosition = lean * (pivot - pitch * pivot);
            }

            Bars.localRotation = Quaternion.Euler(0f, steerDeg + barspinDeg, 0f);
            DeckPivot.localRotation = Quaternion.Euler(-briflipDeg, tailwhipDeg, 0f);
        }

        public Transform Model => _visualRoot;

        private Rigidbody _tumble;
        private Transform _tumbleParent;

        /// <summary>Bail: the scooter flies off on its own (provisional physics tumble).</summary>
        public void BeginTumble(Vector3 velocity)
        {
            if (_visualRoot == null || _tumble != null) return;
            _tumbleParent = _visualRoot.parent;
            _visualRoot.SetParent(null, true);
            _visualRoot.gameObject.layer = Layers.Player;
            var box = _visualRoot.gameObject.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0.3f, 0f);
            box.size = new Vector3(0.25f, 0.6f, DeckLength + 0.15f);
            _tumble = _visualRoot.gameObject.AddComponent<Rigidbody>();
            _tumble.mass = 4f;
            _tumble.interpolation = RigidbodyInterpolation.Interpolate;
            _tumble.SetVelocity(velocity * 0.9f + Vector3.up * 1.2f);
            _tumble.angularVelocity = new Vector3(Random.Range(-8f, 8f), Random.Range(-6f, 6f), Random.Range(-8f, 8f));
        }

        public void EndTumble()
        {
            if (_visualRoot == null || _tumble == null) return;
            _tumble.isKinematic = true;
            Destroy(_tumble);
            Destroy(_visualRoot.GetComponent<BoxCollider>());
            _tumble = null;
            _visualRoot.SetParent(_tumbleParent, false);
            _visualRoot.localPosition = Vector3.zero;
            _visualRoot.localRotation = Quaternion.identity;
        }
    }
}

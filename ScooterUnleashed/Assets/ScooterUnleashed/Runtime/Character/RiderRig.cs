using System.Collections.Generic;
using ScooterUnleashed.Core.Save;
using ScooterUnleashed.Rendering;
using UnityEngine;

namespace ScooterUnleashed.Character
{
    /// <summary>Pose request evaluated every frame by the rider (weights are 0..1).</summary>
    public struct RiderPose
    {
        public float Crouch;
        public float TorsoLean;      // degrees forward
        public float HipShiftZ;
        public bool Kicking;
        public float KickPhase;      // 0..1
        public float BarRelease;     // hands leave the grips (barspin)
        public float FeetLift;       // tailwhip / bri flip
        public float Superman;
        public float NoFooted;
        public float CanCan;
        public float ManualLean;     // + back, - forward
        public float ArmsOut;        // balance arms (grinds)
        public float Celebrate;
        public Vector3 LookDir;      // model space
    }

    /// <summary>
    /// Procedural rider made of simple primitives placed between IK-solved joints. This keeps hands on the grips and
    /// feet on the deck without authored animation; the same joint targets can drive a skinned humanoid later
    /// (Animator IK) when professional animations are available.
    /// </summary>
    public sealed class RiderRig : MonoBehaviour
    {
        public static readonly Color[] SkinTones =
        {
            new Color(0.98f, 0.84f, 0.72f), new Color(0.93f, 0.75f, 0.6f), new Color(0.82f, 0.62f, 0.48f),
            new Color(0.66f, 0.46f, 0.33f), new Color(0.48f, 0.32f, 0.22f), new Color(0.32f, 0.21f, 0.15f),
        };
        public static readonly Color[] ClothColors =
        {
            new Color(0.1f, 0.1f, 0.11f), new Color(0.92f, 0.92f, 0.9f), new Color(0.2f, 0.3f, 0.48f), new Color(0.75f, 0.15f, 0.15f),
            new Color(0.95f, 0.62f, 0.12f), new Color(0.24f, 0.45f, 0.28f), new Color(0.5f, 0.5f, 0.52f), new Color(0.55f, 0.35f, 0.65f),
            new Color(0.85f, 0.8f, 0.65f), new Color(0.2f, 0.65f, 0.75f),
        };
        public static readonly Color[] HairColors =
        {
            new Color(0.08f, 0.06f, 0.05f), new Color(0.3f, 0.18f, 0.1f), new Color(0.65f, 0.45f, 0.25f), new Color(0.9f, 0.8f, 0.55f),
            new Color(0.6f, 0.2f, 0.12f), new Color(0.75f, 0.75f, 0.78f), new Color(0.2f, 0.45f, 0.85f),
        };
        public static readonly string[] HairNames = { "Corto", "Largo", "Rapado", "Coleta" };
        public static readonly string[] TopNames = { "Camiseta", "Sudadera", "Chaqueta" };
        public static readonly string[] BottomNames = { "Vaqueros", "Shorts", "Cargo" };
        public static readonly string[] HelmetNames = { "Sin casco", "Casco skate", "Gorra" };
        public static readonly string[] BodyNames = { "Modelo A", "Modelo B" };

        private sealed class Seg
        {
            public Transform T;
            public float Radius;
            public bool Box;
        }

        // Proportions
        private float _thigh = 0.45f, _shin = 0.44f, _upperArm = 0.29f, _forearm = 0.27f, _spine = 0.52f, _shoulderW = 0.2f, _hipW = 0.1f;

        private Transform _root;
        private Seg _torso, _pelvis, _neck, _head, _hair, _helmet;
        private Seg _thighL, _thighR, _shinL, _shinR, _footL, _footR, _uArmL, _uArmR, _fArmL, _fArmR, _handL, _handR, _kneePadL, _kneePadR;
        private readonly List<Seg> _segs = new List<Seg>();
        private ScooterVisual _scooter;
        private Rigidbody _ragdoll;
        private Transform _originalParent;

        public Vector3 HipPos { get; private set; }
        public Vector3 HeadPos { get; private set; }
        public bool IsRagdoll => _ragdoll != null;

        public void Build(CharacterData c, ScooterVisual scooter)
        {
            _scooter = scooter;
            if (_root != null) Destroy(_root.gameObject);
            _segs.Clear();
            _root = new GameObject("RiderModel").transform;
            _root.gameObject.layer = Layers.Player;
            _root.SetParent(transform, false);

            bool b = c.Body == 1;
            _shoulderW = b ? 0.18f : 0.21f;
            _hipW = b ? 0.11f : 0.1f;
            float bulk = b ? 0.92f : 1f;

            Color skin = SkinTones[Mathf.Clamp(c.SkinTone, 0, SkinTones.Length - 1)];
            Color top = ClothColors[Mathf.Clamp(c.TopColor, 0, ClothColors.Length - 1)];
            Color bottom = ClothColors[Mathf.Clamp(c.BottomColor, 0, ClothColors.Length - 1)];
            Color shoes = ClothColors[Mathf.Clamp(c.ShoesColor, 0, ClothColors.Length - 1)];
            Color helmetC = ClothColors[Mathf.Clamp(c.HelmetColor, 0, ClothColors.Length - 1)];
            Color hairC = HairColors[Mathf.Clamp(c.HairColor, 0, HairColors.Length - 1)];

            var skinM = MaterialLibrary.Tinted(Mat.Skin, skin);
            var topM = MaterialLibrary.Tinted(Mat.Cloth, top);
            var bottomM = c.Bottom == 0 ? MaterialLibrary.Tinted(Mat.Denim, Color.Lerp(bottom, new Color(0.25f, 0.33f, 0.5f), 0.5f)) : MaterialLibrary.Tinted(Mat.Cloth, bottom);
            var shoeM = MaterialLibrary.Tinted(Mat.Cloth, shoes);
            var hairM = MaterialLibrary.Tinted(Mat.Hair, hairC);
            var helmetM = MaterialLibrary.Tinted(Mat.Helmet, helmetC);
            var padM = MaterialLibrary.Tinted(Mat.Plastic, new Color(0.08f, 0.08f, 0.09f));
            var gloveM = MaterialLibrary.Tinted(Mat.Cloth, new Color(0.12f, 0.12f, 0.13f));

            bool sleeves = c.Top >= 1;
            bool shorts = c.Bottom == 1;
            _pelvis = Seg_("Pelvis", PrimitiveType.Capsule, 0.13f * bulk, bottomM);
            _torso = Seg_("Torso", PrimitiveType.Capsule, (c.Top == 2 ? 0.17f : 0.155f) * bulk, topM);
            _neck = Seg_("Neck", PrimitiveType.Capsule, 0.05f, skinM);
            _head = Seg_("Head", PrimitiveType.Sphere, 0.115f, skinM);
            if (c.Hair == 1 || c.Hair == 3) _hair = Seg_("Hair", PrimitiveType.Sphere, 0.125f, hairM);
            else if (c.Hair == 0) _hair = Seg_("Hair", PrimitiveType.Sphere, 0.121f, hairM);
            if (c.Helmet == 1) _helmet = Seg_("Helmet", PrimitiveType.Sphere, 0.14f, helmetM);
            else if (c.Helmet == 2) _helmet = Seg_("Cap", PrimitiveType.Sphere, 0.124f, helmetM);
            _thighL = Seg_("ThighL", PrimitiveType.Capsule, 0.075f * bulk, bottomM);
            _thighR = Seg_("ThighR", PrimitiveType.Capsule, 0.075f * bulk, bottomM);
            _shinL = Seg_("ShinL", PrimitiveType.Capsule, 0.058f, shorts ? skinM : bottomM);
            _shinR = Seg_("ShinR", PrimitiveType.Capsule, 0.058f, shorts ? skinM : bottomM);
            _footL = Seg_("FootL", PrimitiveType.Cube, 0.055f, shoeM, true);
            _footR = Seg_("FootR", PrimitiveType.Cube, 0.055f, shoeM, true);
            _uArmL = Seg_("UpperArmL", PrimitiveType.Capsule, 0.05f, topM);
            _uArmR = Seg_("UpperArmR", PrimitiveType.Capsule, 0.05f, topM);
            _fArmL = Seg_("ForearmL", PrimitiveType.Capsule, 0.043f, sleeves ? topM : skinM);
            _fArmR = Seg_("ForearmR", PrimitiveType.Capsule, 0.043f, sleeves ? topM : skinM);
            _handL = Seg_("HandL", PrimitiveType.Sphere, 0.045f, c.Gloves ? gloveM : skinM);
            _handR = Seg_("HandR", PrimitiveType.Sphere, 0.045f, c.Gloves ? gloveM : skinM);
            if (c.Pads)
            {
                _kneePadL = Seg_("KneePadL", PrimitiveType.Sphere, 0.075f, padM);
                _kneePadR = Seg_("KneePadR", PrimitiveType.Sphere, 0.075f, padM);
            }
        }

        private Seg Seg_(string name, PrimitiveType type, float radius, Material m, bool box = false)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            Destroy(go.GetComponent<Collider>());
            go.layer = Layers.Player;
            go.transform.SetParent(_root, false);
            go.GetComponent<MeshRenderer>().sharedMaterial = m;
            var s = new Seg { T = go.transform, Radius = radius, Box = box };
            _segs.Add(s);
            return s;
        }

        // ------------------------------------------------------------------------------------------
        private static Vector3 SolveIK(Vector3 a, Vector3 target, float l1, float l2, Vector3 pole)
        {
            Vector3 d = target - a;
            float dist = Mathf.Clamp(d.magnitude, Mathf.Abs(l1 - l2) + 0.01f, l1 + l2 - 0.001f);
            Vector3 dir = d.sqrMagnitude > 1e-8f ? d.normalized : Vector3.down;
            float cosA = Mathf.Clamp((l1 * l1 + dist * dist - l2 * l2) / (2f * l1 * dist), -1f, 1f);
            float sinA = Mathf.Sqrt(1f - cosA * cosA);
            Vector3 bend = Vector3.ProjectOnPlane(pole, dir);
            if (bend.sqrMagnitude < 1e-6f) bend = Vector3.ProjectOnPlane(Vector3.forward, dir);
            bend.Normalize();
            return a + dir * (l1 * cosA) + bend * (l1 * sinA);
        }

        private static void Place(Seg s, Vector3 a, Vector3 b)
        {
            Vector3 d = b - a;
            float len = d.magnitude;
            s.T.localPosition = (a + b) * 0.5f;
            s.T.localRotation = len > 1e-5f ? Quaternion.FromToRotation(Vector3.up, d / len) : Quaternion.identity;
            // Capsule primitive: height 2 (y), diameter 1 (x,z).
            s.T.localScale = new Vector3(s.Radius * 2f, Mathf.Max(len * 0.5f + s.Radius * 0.6f, s.Radius), s.Radius * 2f);
        }

        private static void PlaceSphere(Seg s, Vector3 p, Vector3 scale)
        {
            if (s == null) return;
            s.T.localPosition = p;
            s.T.localRotation = Quaternion.identity;
            s.T.localScale = scale;
        }

        /// <summary>Evaluates the pose in the rider's local space (parented to the scooter model).</summary>
        public void Apply(in RiderPose p)
        {
            if (_root == null || _scooter == null || IsRagdoll) return;
            float deckTop = _scooter.DeckTopY + 0.035f;

            // --- Feet targets (model space)
            Vector3 footF = _root.InverseTransformPoint(_scooter.FootFront.position);
            Vector3 footB = _root.InverseTransformPoint(_scooter.FootBack.position);
            Vector3 airF = new Vector3(0.05f, deckTop + 0.3f, 0.14f);
            Vector3 airB = new Vector3(-0.05f, deckTop + 0.32f, -0.12f);
            footF = Vector3.Lerp(footF, airF, p.FeetLift);
            footB = Vector3.Lerp(footB, airB, p.FeetLift);
            footF = Vector3.Lerp(footF, new Vector3(0.3f, deckTop + 0.55f, -0.75f), p.Superman);
            footB = Vector3.Lerp(footB, new Vector3(-0.2f, deckTop + 0.5f, -0.85f), p.Superman);
            footF = Vector3.Lerp(footF, new Vector3(0.42f, deckTop + 0.18f, 0.05f), p.NoFooted);
            footB = Vector3.Lerp(footB, new Vector3(-0.42f, deckTop + 0.18f, -0.18f), p.NoFooted);
            footF = Vector3.Lerp(footF, new Vector3(-0.38f, deckTop + 0.38f, 0.22f), p.CanCan);

            if (p.Kicking)
            {
                // Kick cycle of the back foot: off the deck, push along the ground, back up.
                float ph = p.KickPhase;
                Vector3 ground = new Vector3(0.17f, -0.1f, 0f);
                Vector3 k;
                if (ph < 0.2f) k = Vector3.Lerp(footB, ground + new Vector3(0, 0.05f, 0.12f), ph / 0.2f);
                else if (ph < 0.6f) k = Vector3.Lerp(ground + new Vector3(0, 0, 0.12f), ground + new Vector3(0, 0, -0.38f), (ph - 0.2f) / 0.4f);
                else k = Vector3.Lerp(ground + new Vector3(0, 0.12f, -0.38f), footB, (ph - 0.6f) / 0.4f);
                footB = k;
            }

            // --- Hips & torso
            float crouch = Mathf.Clamp01(p.Crouch);
            float standH = _thigh + _shin - 0.05f;
            float hipH = Mathf.Lerp(standH, standH - 0.32f, crouch) + deckTop;
            hipH = Mathf.Lerp(hipH, deckTop + 0.75f, p.Superman);
            Vector3 hip = new Vector3(0f, hipH, -0.05f + p.HipShiftZ - p.ManualLean * 0.12f);
            hip = Vector3.Lerp(hip, new Vector3(0f, hipH, -0.32f), p.Superman);
            float lean = p.TorsoLean + crouch * 18f - p.ManualLean * 18f;
            lean = Mathf.Lerp(lean, 72f, p.Superman);
            Vector3 spineDir = Quaternion.AngleAxis(lean, Vector3.right) * Vector3.up;
            Vector3 chest = hip + spineDir * _spine;
            Vector3 neckTop = chest + spineDir * 0.12f;
            Vector3 lookDir = p.LookDir.sqrMagnitude > 0.01f ? p.LookDir.normalized : Vector3.forward;
            Vector3 head = neckTop + spineDir * 0.11f + lookDir * 0.02f;
            HipPos = hip;
            HeadPos = head;

            Place(_pelvis, hip + Vector3.left * 0.06f, hip + Vector3.right * 0.06f);
            Place(_torso, hip + spineDir * 0.08f, chest - spineDir * 0.02f);
            Place(_neck, chest, neckTop);
            PlaceSphere(_head, head, Vector3.one * 0.23f);
            if (_hair != null) PlaceSphere(_hair, head + spineDir * 0.02f - lookDir * 0.02f, new Vector3(0.24f, _hair.Radius > 0.124f ? 0.27f : 0.2f, 0.25f));
            if (_helmet != null) PlaceSphere(_helmet, head + spineDir * 0.035f, _helmet.T.name == "Cap" ? new Vector3(0.25f, 0.16f, 0.27f) : new Vector3(0.28f, 0.25f, 0.3f));

            // --- Legs
            Vector3 hipL = hip + Vector3.left * _hipW, hipR = hip + Vector3.right * _hipW;
            // Front foot = left foot (regular stance).
            Vector3 kneeL = SolveIK(hipL, footF + Vector3.up * 0.06f, _thigh, _shin, new Vector3(-0.2f, 0f, 1f));
            Vector3 kneeR = SolveIK(hipR, footB + Vector3.up * 0.06f, _thigh, _shin, new Vector3(0.2f, 0f, 1f));
            Vector3 ankleL = kneeL + (footF + Vector3.up * 0.06f - kneeL).normalized * _shin;
            Vector3 ankleR = kneeR + (footB + Vector3.up * 0.06f - kneeR).normalized * _shin;
            Place(_thighL, hipL, kneeL);
            Place(_thighR, hipR, kneeR);
            Place(_shinL, kneeL, ankleL);
            Place(_shinR, kneeR, ankleR);
            PlaceFoot(_footL, ankleL, Quaternion.Euler(0, -12f, 0));
            PlaceFoot(_footR, ankleR, Quaternion.Euler(0, 25f, 0));
            if (_kneePadL != null) { PlaceSphere(_kneePadL, kneeL + Vector3.forward * 0.04f, Vector3.one * 0.13f); PlaceSphere(_kneePadR, kneeR + Vector3.forward * 0.04f, Vector3.one * 0.13f); }

            // --- Arms
            Vector3 right = Vector3.right;
            Vector3 shL = chest - right * _shoulderW, shR = chest + right * _shoulderW;
            Vector3 gripL = _root.InverseTransformPoint(_scooter.GripLeft.position);
            Vector3 gripR = _root.InverseTransformPoint(_scooter.GripRight.position);
            Vector3 freeL = shL + new Vector3(-0.25f, -0.05f, 0.25f);
            Vector3 freeR = shR + new Vector3(0.25f, -0.05f, 0.25f);
            Vector3 handL = Vector3.Lerp(gripL, gripL + Vector3.up * 0.16f + Vector3.left * 0.08f, p.BarRelease);
            Vector3 handR = Vector3.Lerp(gripR, gripR + Vector3.up * 0.16f + Vector3.right * 0.08f, p.BarRelease);
            handL = Vector3.Lerp(handL, freeL + Vector3.left * 0.25f, p.ArmsOut);
            handR = Vector3.Lerp(handR, freeR + Vector3.right * 0.25f, p.ArmsOut);
            if (p.Celebrate > 0f)
            {
                handL = Vector3.Lerp(handL, shL + new Vector3(-0.15f, 0.55f, 0.05f), p.Celebrate);
                handR = Vector3.Lerp(handR, shR + new Vector3(0.15f, 0.55f, 0.05f), p.Celebrate);
            }
            Vector3 elbowL = SolveIK(shL, handL, _upperArm, _forearm, new Vector3(-1f, -0.4f, -0.6f));
            Vector3 elbowR = SolveIK(shR, handR, _upperArm, _forearm, new Vector3(1f, -0.4f, -0.6f));
            Vector3 wristL = elbowL + (handL - elbowL).normalized * _forearm;
            Vector3 wristR = elbowR + (handR - elbowR).normalized * _forearm;
            Place(_uArmL, shL, elbowL);
            Place(_uArmR, shR, elbowR);
            Place(_fArmL, elbowL, wristL);
            Place(_fArmR, elbowR, wristR);
            PlaceSphere(_handL, wristL, Vector3.one * 0.09f);
            PlaceSphere(_handR, wristR, Vector3.one * 0.09f);
        }

        private static void PlaceFoot(Seg s, Vector3 ankle, Quaternion yaw)
        {
            s.T.localRotation = yaw;
            s.T.localPosition = ankle + yaw * new Vector3(0f, -0.035f, 0.06f);
            s.T.localScale = new Vector3(0.1f, 0.07f, 0.27f);
        }

        // ------------------------------------------------------------------------------------------
        // Bail: provisional rigid tumble (replace with a ragdoll once a skinned rider exists)
        // ------------------------------------------------------------------------------------------
        public void BeginRagdoll(Vector3 velocity)
        {
            if (_root == null || IsRagdoll) return;
            _originalParent = _root.parent;
            _root.SetParent(null, true);
            _ragdoll = _root.gameObject.AddComponent<Rigidbody>();
            _ragdoll.mass = 70f;
            _ragdoll.SetDamping(0.2f, 1.5f);
            _ragdoll.interpolation = RigidbodyInterpolation.Interpolate;
            var cap = _root.gameObject.AddComponent<CapsuleCollider>();
            cap.center = HipPos + Vector3.up * 0.2f;
            cap.height = 1.5f;
            cap.radius = 0.2f;
            _ragdoll.SetVelocity(velocity * 0.8f + Vector3.up * 1.5f);
            _ragdoll.angularVelocity = new Vector3(Random.Range(-5f, 5f), Random.Range(-3f, 3f), Random.Range(-5f, 5f));
        }

        public void EndRagdoll()
        {
            if (_root == null || !IsRagdoll) return;
            _ragdoll.isKinematic = true;
            Destroy(_ragdoll);
            Destroy(_root.GetComponent<CapsuleCollider>());
            _ragdoll = null;
            _root.SetParent(_originalParent, false);
            _root.localPosition = Vector3.zero;
            _root.localRotation = Quaternion.identity;
        }

        public Transform Model => _root;
    }
}

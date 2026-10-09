using UnityEngine;

namespace ScooterUnleashed
{
    /// <summary>Bridges API renames between Unity 2021/2022 and Unity 6 so the project compiles on both.</summary>
    public static class Compat
    {
        public static Vector3 GetVelocity(this Rigidbody rb)
        {
#if UNITY_6000_0_OR_NEWER
            return rb.linearVelocity;
#else
            return rb.velocity;
#endif
        }

        public static void SetVelocity(this Rigidbody rb, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }

        public static void SetDamping(this Rigidbody rb, float linear, float angular)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearDamping = linear;
            rb.angularDamping = angular;
#else
            rb.drag = linear;
            rb.angularDrag = angular;
#endif
        }

        public static T FindFirst<T>() where T : Object
        {
#if UNITY_2023_1_OR_NEWER
            return Object.FindFirstObjectByType<T>();
#else
            return Object.FindObjectOfType<T>();
#endif
        }

        /// <summary>Frictionless material for the rider's body collider so it slides along walls instead of sticking.</summary>
        public static void MakeFrictionless(Collider c)
        {
#if UNITY_6000_0_OR_NEWER
            c.sharedMaterial = new PhysicsMaterial("SU_Frictionless")
            {
                dynamicFriction = 0f, staticFriction = 0f, bounciness = 0f,
                frictionCombine = PhysicsMaterialCombine.Minimum, bounceCombine = PhysicsMaterialCombine.Minimum
            };
#else
            c.sharedMaterial = new PhysicMaterial("SU_Frictionless")
            {
                dynamicFriction = 0f, staticFriction = 0f, bounciness = 0f,
                frictionCombine = PhysicMaterialCombine.Minimum, bounceCombine = PhysicMaterialCombine.Minimum
            };
#endif
        }
    }

    public static class Layers
    {
        /// <summary>Built-in "Ignore Raycast" layer: the player's own colliders never block its wheel probes.</summary>
        public const int Player = 2;
        /// <summary>Built-in "TransparentFX" layer reused for rail colliders: solid for bodies, invisible to wheel probes.</summary>
        public const int Rail = 1;
        public static readonly int WorldMask = ~(1 << Player);
        public static readonly int WheelMask = ~((1 << Player) | (1 << Rail));
    }

    public static class VectorExt
    {
        public static Vector3 Flat(this Vector3 v) => new Vector3(v.x, 0f, v.z);
        public static Vector3 WithY(this Vector3 v, float y) => new Vector3(v.x, y, v.z);
    }
}

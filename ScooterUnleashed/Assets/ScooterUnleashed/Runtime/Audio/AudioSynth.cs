using UnityEngine;

namespace ScooterUnleashed.Audio
{
    /// <summary>
    /// Offline synthesis of every sound effect at startup (small mono clips, 22 kHz). These are real, context-specific
    /// sounds (not one beep for everything) and serve as placeholders until recorded foley replaces them.
    /// </summary>
    public static class AudioSynth
    {
        public const int Rate = 22050;

        private sealed class Rng
        {
            private uint _s;
            public Rng(uint s) { _s = s == 0 ? 1u : s; }
            public float Next() { _s ^= _s << 13; _s ^= _s >> 17; _s ^= _s << 5; return (_s & 0xFFFFFF) / (float)0x800000 - 1f; }
        }

        private static AudioClip Make(string name, float[] data, bool loop)
        {
            if (loop)
            {
                // Crossfade the tail into the head for a seamless loop.
                int fade = Mathf.Min(data.Length / 8, Rate / 10);
                for (int i = 0; i < fade; i++)
                {
                    float t = i / (float)fade;
                    int tail = data.Length - fade + i;
                    data[i] = data[i] * t + data[tail] * (1f - t);
                }
                System.Array.Resize(ref data, data.Length - fade);
            }
            Normalize(data, 0.9f);
            var clip = AudioClip.Create(name, data.Length, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private static void Normalize(float[] d, float peak)
        {
            float m = 1e-6f;
            for (int i = 0; i < d.Length; i++) m = Mathf.Max(m, Mathf.Abs(d[i]));
            float k = peak / m;
            for (int i = 0; i < d.Length; i++) d[i] *= k;
        }

        /// <summary>Wheel roll on a surface: filtered noise + seam clicks. roughness 0..1.</summary>
        public static AudioClip Roll(string name, float roughness, float tone, uint seed)
        {
            int n = Rate * 2;
            var d = new float[n];
            var r = new Rng(seed);
            float lp = 0f, lp2 = 0f;
            float cutoff = Mathf.Lerp(0.08f, 0.35f, roughness);
            for (int i = 0; i < n; i++)
            {
                float w = r.Next();
                lp += (w - lp) * cutoff;
                lp2 += (lp - lp2) * cutoff;
                float hum = Mathf.Sin(i * 2f * Mathf.PI * tone / Rate) * 0.25f + Mathf.Sin(i * 2f * Mathf.PI * tone * 2.03f / Rate) * 0.1f;
                d[i] = lp2 * (0.8f + roughness * 0.6f) + hum * (1f - roughness * 0.6f) + w * roughness * 0.08f;
                // Pavement joints every ~0.35 s on tiles / concrete
                if (roughness > 0.3f && i % (int)(Rate * 0.35f) < 60) d[i] += r.Next() * 0.6f * roughness;
            }
            return Make(name, d, true);
        }

        /// <summary>Metal grind: noise exciting inharmonic resonators. Concrete grind: scrape.</summary>
        public static AudioClip Grind(string name, bool metal, uint seed)
        {
            int n = Rate * 2;
            var d = new float[n];
            var r = new Rng(seed);
            float[] freqs = metal ? new[] { 1180f, 2730f, 4100f, 5650f } : new[] { 700f, 1400f, 2100f };
            var y1 = new float[freqs.Length];
            var y2 = new float[freqs.Length];
            for (int i = 0; i < n; i++)
            {
                float x = r.Next() * (0.7f + 0.3f * Mathf.PerlinNoise(i * 0.0007f, 0.3f));
                float s = 0f;
                for (int k = 0; k < freqs.Length; k++)
                {
                    float rr = metal ? 0.996f : 0.97f;
                    float c = 2f * rr * Mathf.Cos(2f * Mathf.PI * freqs[k] / Rate);
                    float y = x * (1f - rr) + c * y1[k] - rr * rr * y2[k];
                    y2[k] = y1[k]; y1[k] = y;
                    s += y / (k + 1);
                }
                d[i] = s + x * (metal ? 0.05f : 0.35f);
            }
            return Make(name, d, true);
        }

        public static AudioClip Thump(string name, float freq, float decay, float noise, float length, uint seed)
        {
            int n = (int)(Rate * length);
            var d = new float[n];
            var r = new Rng(seed);
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float env = Mathf.Exp(-t * decay);
                float f = freq * (1f + 1.5f * Mathf.Exp(-t * 30f));
                lp += (r.Next() - lp) * 0.3f;
                d[i] = (Mathf.Sin(2f * Mathf.PI * f * t) + lp * noise * Mathf.Exp(-t * decay * 2.5f)) * env;
            }
            return Make(name, d, false);
        }

        public static AudioClip Clank(string name, uint seed)
        {
            int n = (int)(Rate * 0.5f);
            var d = new float[n];
            var r = new Rng(seed);
            float[] f = { 820f, 1960f, 3310f, 4870f };
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float s = 0f;
                for (int k = 0; k < f.Length; k++) s += Mathf.Sin(2f * Mathf.PI * f[k] * t) * Mathf.Exp(-t * (9f + k * 5f)) / (k + 1);
                d[i] = s + r.Next() * Mathf.Exp(-t * 60f) * 0.5f;
            }
            return Make(name, d, false);
        }

        public static AudioClip Noise(string name, float length, float cutoff, bool loop, uint seed)
        {
            int n = (int)(Rate * length);
            var d = new float[n];
            var r = new Rng(seed);
            float lp = 0f, lp2 = 0f;
            for (int i = 0; i < n; i++)
            {
                lp += (r.Next() - lp) * cutoff;
                lp2 += (lp - lp2) * cutoff;
                d[i] = lp2 * (0.75f + 0.25f * Mathf.PerlinNoise(i * 0.0002f, 1.7f));
            }
            return Make(name, d, loop);
        }

        public static AudioClip Blip(string name, float f0, float f1, float length, float square)
        {
            int n = (int)(Rate * length);
            var d = new float[n];
            float ph = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)n;
                float f = Mathf.Lerp(f0, f1, t);
                ph += 2f * Mathf.PI * f / Rate;
                float s = Mathf.Sin(ph);
                s = Mathf.Lerp(s, Mathf.Sign(s) * 0.6f, square);
                d[i] = s * Mathf.Sin(Mathf.PI * Mathf.Min(1f, t * 8f)) * (1f - t);
            }
            return Make(name, d, false);
        }

        /// <summary>Lo-fi hip-hop style loop: kick, snare, hats and a bass line, 8 bars at 88 BPM.</summary>
        public static AudioClip MusicLoop(uint seed)
        {
            const float bpm = 88f;
            float beat = 60f / bpm;
            int bars = 8;
            int n = (int)(Rate * beat * 4 * bars);
            var d = new float[n];
            var r = new Rng(seed);
            float[] bassNotes = { 41.2f, 41.2f, 49f, 36.7f, 41.2f, 55f, 49f, 36.7f };
            float[] chord = { 164.8f, 196f, 246.9f };
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float bt = t / beat;
                int b = (int)bt;
                float inBeat = bt - b;
                int bar = (b / 4) % bars;
                float s = 0f;
                // Kick on 1 and 3 (+ swing ghost)
                if (b % 4 == 0 || b % 4 == 2 || (b % 8 == 7 && inBeat > 0.5f))
                {
                    float kt = (b % 8 == 7 ? inBeat - 0.5f : inBeat) * beat;
                    if (kt >= 0) s += Mathf.Sin(2f * Mathf.PI * (50f + 90f * Mathf.Exp(-kt * 35f)) * kt) * Mathf.Exp(-kt * 9f) * 0.9f;
                }
                // Snare on 2 and 4
                if (b % 4 == 1 || b % 4 == 3)
                {
                    float st = inBeat * beat;
                    s += (r.Next() * 0.6f + Mathf.Sin(2f * Mathf.PI * 190f * st) * 0.3f) * Mathf.Exp(-st * 18f) * 0.55f;
                }
                // Hats on 8ths with swing
                float eighth = bt * 2f;
                float et = (eighth - Mathf.Floor(eighth)) * beat * 0.5f;
                if (((int)eighth) % 2 == 1) et -= beat * 0.06f;
                if (et >= 0) s += r.Next() * Mathf.Exp(-et * 80f) * 0.18f;
                // Bass
                float bf = bassNotes[bar];
                s += (Mathf.Sin(2f * Mathf.PI * bf * t) + 0.3f * Mathf.Sin(4f * Mathf.PI * bf * t)) * 0.3f * (0.6f + 0.4f * Mathf.Exp(-inBeat * 3f));
                // Soft chord pad
                float pad = 0f;
                foreach (var f in chord) pad += Mathf.Sin(2f * Mathf.PI * f * (bar % 2 == 0 ? 1f : 0.89f) * t);
                s += pad * 0.035f * (0.7f + 0.3f * Mathf.Sin(t * 0.8f));
                d[i] = s;
            }
            // Vinyl-ish lowpass
            float lp = 0f;
            for (int i = 0; i < n; i++) { lp += (d[i] - lp) * 0.45f; d[i] = lp; }
            Normalize(d, 0.8f);
            var clip = AudioClip.Create("MusicLoop", n, 1, Rate, false);
            clip.SetData(d, 0);
            return clip;
        }
    }
}

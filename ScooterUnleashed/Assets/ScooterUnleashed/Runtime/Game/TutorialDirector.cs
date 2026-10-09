using System;
using ScooterUnleashed.Core.Scoring;
using ScooterUnleashed.Core.Tricks;
using ScooterUnleashed.Tricks;
using ScooterUnleashed.Vehicle;
using UnityEngine;

namespace ScooterUnleashed.Game
{
    /// <summary>Interactive tutorial: each step waits for the player to really perform the action.</summary>
    public sealed class TutorialDirector
    {
        public sealed class Step
        {
            public string Title;
            public string Text;
            public string Gesture; // short hint drawn by the HUD
            public Func<float, bool> Done;
        }

        private readonly ScooterController _s;
        private readonly TrickSystem _t;
        public Step[] Steps { get; private set; }
        public int Index { get; private set; }
        public bool Finished => Index >= Steps.Length;
        public Step Current => Finished ? null : Steps[Index];
        public float StepTime { get; private set; }

        private float _accum;
        private bool _flag;
        private float _manualTime;

        public TutorialDirector(ScooterController s, TrickSystem t)
        {
            _s = s;
            _t = t;
            Steps = new[]
            {
                new Step { Title = "Impulso", Text = "Empuja el stick izquierdo hacia delante para impulsarte con el pie.", Gesture = "STICK ↑", Done = dt => _s.Velocity.magnitude > 4f },
                new Step { Title = "Dirección", Text = "Gira a izquierda y derecha con el stick. La scooter se inclina en las curvas.", Gesture = "STICK ← →", Done = dt => Accumulate(Mathf.Abs(_s.Steer) > 0.4f && _s.Velocity.magnitude > 2f, dt, 1.5f) },
                new Step { Title = "Freno", Text = "Tira del stick hacia atrás (o pulsa FRENO) para frenar con el pie trasero.", Gesture = "STICK ↓", Done = dt => Accumulate(_s.Stick.y < -0.4f || _s.Brake > 0.5f, dt, 0.6f) },
                new Step { Title = "Salto", Text = "Mantén pulsada la zona derecha para agacharte y suelta para saltar. Cuanto más cargas, más alto.", Gesture = "MANTÉN · SUELTA", Done = dt => Consume() },
                new Step { Title = "Barspin", Text = "Salta y, en el aire, desliza rápido a izquierda o derecha.", Gesture = "AIRE: ← o →", Done = dt => Consume() },
                new Step { Title = "Tailwhip", Text = "En el aire, desliza hacia abajo: el deck da una vuelta alrededor del manillar. ¡Termínalo antes de aterrizar!", Gesture = "AIRE: ↓", Done = dt => Consume() },
                new Step { Title = "Rotación", Text = "En el aire, mantén el stick a un lado o dibuja medio círculo en la zona derecha para girar 180°.", Gesture = "AIRE: ◜◞", Done = dt => Consume() },
                new Step { Title = "Grind", Text = "Salta y cae sobre un raíl, un banco o un bordillo. Mantén el equilibrio con el stick.", Gesture = "SALTA AL RAÍL", Done = dt => Consume() },
                new Step { Title = "Manual", Text = "Rodando, desliza hacia abajo para levantar la rueda delantera. Equilibra con el stick ↑↓ durante 2 s.", Gesture = "SUELO: ↓", Done = dt => _manualTime >= 2f },
                new Step { Title = "Combo", Text = "Encadena trucos sin parar (salto, truco, manual, grind...) y consigue un combo de 1.500 puntos.", Gesture = "ENCADENA", Done = dt => Consume() },
            };
            _t.Scooter.TookOff += OnTookOff;
            _t.TrickPerformed += OnTrick;
            _t.GrindStarted += OnGrind;
            _t.ManualEnded += OnManualEnded;
            _t.ComboBanked += OnBanked;
        }

        public void Dispose()
        {
            _t.Scooter.TookOff -= OnTookOff;
            _t.TrickPerformed -= OnTrick;
            _t.GrindStarted -= OnGrind;
            _t.ManualEnded -= OnManualEnded;
            _t.ComboBanked -= OnBanked;
        }

        private bool Accumulate(bool cond, float dt, float need)
        {
            if (cond) _accum += dt;
            return _accum >= need;
        }

        private bool Consume()
        {
            if (!_flag) return false;
            _flag = false;
            return true;
        }

        private void OnTookOff(bool popped) { if (Index == 3 && popped) _flag = true; }

        private void OnTrick(string name, int pts)
        {
            if (Index == 4 && name.Contains("Barspin")) _flag = true;
            if (Index == 5 && name.Contains("Tailwhip")) _flag = true;
            if (Index == 6 && (name.Contains("180") || name.Contains("360") || name.Contains("540"))) _flag = true;
        }

        private void OnGrind(TrickDefinition d) { if (Index == 7) _flag = true; }
        private void OnManualEnded(TrickDefinition d, float t) { if (Index == 8) _manualTime = Mathf.Max(_manualTime, t); }
        private void OnBanked(ComboResult r) { if (Index == 9 && r.Total >= 1500) _flag = true; }

        /// <summary>Returns true when the step just advanced.</summary>
        public bool Update(float dt)
        {
            if (Finished) return false;
            StepTime += dt;
            if (_t.ManualDef != null && Index == 8) _manualTime = Mathf.Max(_manualTime, _t.Balance.Elapsed);
            if (StepTime > 0.4f && Steps[Index].Done(dt))
            {
                Index++;
                StepTime = 0f;
                _accum = 0f;
                _flag = false;
                return true;
            }
            return false;
        }
    }
}

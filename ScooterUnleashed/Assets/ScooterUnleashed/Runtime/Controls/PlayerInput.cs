using System;
using System.Collections.Generic;
using ScooterUnleashed.Core;
using ScooterUnleashed.Core.Input;
using ScooterUnleashed.Core.Save;
using ScooterUnleashed.Core.Tricks;
using ScooterUnleashed.Tricks;
using ScooterUnleashed.UI;
using ScooterUnleashed.Vehicle;
using UnityEngine;

namespace ScooterUnleashed.Controls
{
    /// <summary>
    /// Multi-touch input router: floating virtual stick (left), gesture action zone (right), contextual buttons, an
    /// alternative button scheme, plus keyboard/mouse for editor testing. Every input ends up as the same
    /// GestureEvent stream, so all schemes share one trick logic.
    /// </summary>
    public sealed class PlayerInput : MonoBehaviour
    {
        public ScooterController Scooter;
        public TrickSystem Tricks;
        public SettingsData Settings;
        [NonSerialized] public bool GameplayEnabled;
        [NonSerialized] public bool ShowEnter;

        public event Action PauseRequested;
        public event Action MapRequested;
        public event Action EnterRequested;
        public event Action RespawnRequested;

        public readonly GestureRecognizer Recognizer = new GestureRecognizer();

        // HUD feedback state
        public bool StickActive { get; private set; }
        public Vector2 StickCenter { get; private set; }
        public Vector2 StickKnob { get; private set; }
        public Vector2 StickValue { get; private set; }
        public bool ActionActive { get; private set; }
        public Vector2 ActionStart { get; private set; }
        public Vector2 ActionPos { get; private set; }
        public readonly List<Vector2> Trail = new List<Vector2>(32);
        public readonly HashSet<TouchButton> Held = new HashSet<TouchButton>();
        public float LastGestureTime { get; private set; } = -10f;
        public string LastGestureLabel { get; private set; } = "";
        public bool UsedTouch { get; private set; }

        private const int MouseId = 1000;
        private int _stickFinger = -1, _actionFinger = -1;
        private readonly Dictionary<int, TouchButton> _buttonFingers = new Dictionary<int, TouchButton>();
        private double _jumpDown, _spaceDown;
        private bool _brakeHeld, _bodyHeld, _bodyUsed, _shiftUsed;

        private double Now => Time.unscaledTime;

        private void Update()
        {
            ControlsLayout.Compute(Settings, ShowEnter);
            if (!GameplayEnabled)
            {
                ResetAll();
                if (Scooter != null) { Scooter.Stick = Vector2.zero; Scooter.Brake = 0f; }
                return;
            }
            if (Settings != null) Recognizer.Settings.Sensitivity = Settings.TouchSensitivity;

            if (UnityEngine.Input.touchCount > 0)
            {
                UsedTouch = true;
                for (int i = 0; i < UnityEngine.Input.touchCount; i++)
                {
                    var t = UnityEngine.Input.GetTouch(i);
                    HandlePointer(t.fingerId, t.phase, t.position);
                }
            }
            else if (!UnityEngine.Input.touchSupported)
            {
                Vector2 mp = UnityEngine.Input.mousePosition;
                if (UnityEngine.Input.GetMouseButtonDown(0)) HandlePointer(MouseId, TouchPhase.Began, mp);
                else if (UnityEngine.Input.GetMouseButton(0)) HandlePointer(MouseId, TouchPhase.Moved, mp);
                else if (UnityEngine.Input.GetMouseButtonUp(0)) HandlePointer(MouseId, TouchPhase.Ended, mp);
            }

            Vector2 keys = Keyboard();
            Recognizer.Tick(Now);
            while (Recognizer.TryDequeue(out var e)) Dispatch(e);

            Vector2 stick = StickValue + keys;
            if (stick.sqrMagnitude > 1f) stick.Normalize();
            if (Scooter != null)
            {
                Scooter.Stick = stick;
                Scooter.Brake = _brakeHeld ? 1f : 0f;
            }
        }

        private void ResetAll()
        {
            if (_actionFinger >= 0) Recognizer.Cancel();
            _stickFinger = _actionFinger = -1;
            _buttonFingers.Clear();
            Held.Clear();
            StickActive = ActionActive = false;
            StickValue = Vector2.zero;
            Trail.Clear();
            _brakeHeld = _bodyHeld = false;
        }

        private float DpScale => Screen.dpi > 1f ? Screen.dpi / 160f : Mathf.Max(1f, UIKit.Scale);
        private Vector2 ToDp(Vector2 screen) => screen / DpScale;

        private void HandlePointer(int id, TouchPhase phase, Vector2 screenPos)
        {
            Vector2 g = UIKit.ScreenToGui(screenPos);
            switch (phase)
            {
                case TouchPhase.Began:
                {
                    var b = HitButton(g);
                    if (b != TouchButton.None)
                    {
                        _buttonFingers[id] = b;
                        ButtonDown(b);
                        return;
                    }
                    if (!ControlsLayout.ButtonScheme && _actionFinger < 0 && ControlsLayout.ActionZone.Contains(g))
                    {
                        _actionFinger = id;
                        Recognizer.Begin(ToVec(ToDp(screenPos)), Now);
                        ActionActive = true;
                        ActionStart = ActionPos = g;
                        Trail.Clear();
                        Trail.Add(g);
                    }
                    else if (_stickFinger < 0 && ControlsLayout.StickZone.Contains(g))
                    {
                        _stickFinger = id;
                        StickActive = true;
                        StickCenter = g;
                        StickKnob = g;
                        StickValue = Vector2.zero;
                    }
                    break;
                }
                case TouchPhase.Moved:
                case TouchPhase.Stationary:
                    if (id == _actionFinger)
                    {
                        Recognizer.Move(ToVec(ToDp(screenPos)), Now);
                        ActionPos = g;
                        if (Trail.Count == 0 || (Trail[Trail.Count - 1] - g).sqrMagnitude > 9f)
                        {
                            Trail.Add(g);
                            if (Trail.Count > 28) Trail.RemoveAt(0);
                        }
                    }
                    else if (id == _stickFinger) UpdateStick(g);
                    break;
                case TouchPhase.Ended:
                case TouchPhase.Canceled:
                    if (_buttonFingers.TryGetValue(id, out var btn))
                    {
                        _buttonFingers.Remove(id);
                        ButtonUp(btn);
                    }
                    if (id == _actionFinger)
                    {
                        Recognizer.End(ToVec(ToDp(screenPos)), Now);
                        _actionFinger = -1;
                        ActionActive = false;
                    }
                    if (id == _stickFinger)
                    {
                        _stickFinger = -1;
                        StickActive = false;
                        StickValue = Vector2.zero;
                    }
                    break;
            }
        }

        private static Vec2 ToVec(Vector2 v) => new Vec2(v.x, v.y);

        private void UpdateStick(Vector2 g)
        {
            float r = ControlsLayout.StickRadius;
            Vector2 d = g - StickCenter;
            // Floating base follows the thumb if it drifts too far (comfortable on any screen size).
            if (d.magnitude > r * 1.35f) StickCenter += d.normalized * (d.magnitude - r * 1.35f);
            d = g - StickCenter;
            Vector2 clamped = Vector2.ClampMagnitude(d, r);
            StickKnob = StickCenter + clamped;
            Vector2 v = new Vector2(clamped.x / r, -clamped.y / r);
            float m = v.magnitude;
            const float dead = 0.12f;
            if (m < dead) v = Vector2.zero;
            else v = v / m * Mathf.Pow((m - dead) / (1f - dead), 1.15f);
            StickValue = v;
        }

        private TouchButton HitButton(Vector2 g)
        {
            if (ControlsLayout.Pause.Contains(g)) return TouchButton.Pause;
            if (ControlsLayout.Map.Contains(g)) return TouchButton.Map;
            if (ShowEnter && ControlsLayout.Enter.Contains(g)) return TouchButton.Enter;
            if (Tricks != null && Tricks.GrindAvailable && (Settings == null || !Settings.AutoGrind) && ControlsLayout.Grind.Contains(g)) return TouchButton.Grind;
            if (ControlsLayout.Brake.Contains(g)) return TouchButton.Brake;
            if (ControlsLayout.ButtonScheme)
            {
                if (ControlsLayout.Jump.Contains(g)) return TouchButton.Jump;
                if (ControlsLayout.TrickUp.Contains(g)) return TouchButton.TrickUp;
                if (ControlsLayout.TrickDown.Contains(g)) return TouchButton.TrickDown;
                if (ControlsLayout.TrickLeft.Contains(g)) return TouchButton.TrickLeft;
                if (ControlsLayout.TrickRight.Contains(g)) return TouchButton.TrickRight;
                if (ControlsLayout.TrickDiag.Contains(g)) return TouchButton.TrickDiag;
                if (ControlsLayout.Body.Contains(g)) return TouchButton.Body;
                if (ControlsLayout.SpinLeft.Contains(g)) return TouchButton.SpinLeft;
                if (ControlsLayout.SpinRight.Contains(g)) return TouchButton.SpinRight;
            }
            return TouchButton.None;
        }

        private void ButtonDown(TouchButton b)
        {
            Held.Add(b);
            switch (b)
            {
                case TouchButton.Pause: PauseRequested?.Invoke(); break;
                case TouchButton.Map: MapRequested?.Invoke(); break;
                case TouchButton.Enter: EnterRequested?.Invoke(); break;
                case TouchButton.Grind: Tricks?.RequestGrind(); Game.Haptics.Pulse(10); break;
                case TouchButton.Brake: _brakeHeld = true; break;
                case TouchButton.Jump: _jumpDown = Now; Inject(new GestureEvent { Kind = GestureKind.Press, Direction = Dir8.None }); break;
                case TouchButton.TrickUp: TrickButton(Dir8.Up); break;
                case TouchButton.TrickDown: TrickButton(Dir8.Down); break;
                case TouchButton.TrickLeft: TrickButton(Dir8.Left); break;
                case TouchButton.TrickRight: TrickButton(Dir8.Right); break;
                case TouchButton.TrickDiag: TrickButton(Dir8.DownRight); break;
                case TouchButton.Body: _bodyHeld = true; _bodyUsed = false; break;
                case TouchButton.SpinLeft: Inject(new GestureEvent { Kind = GestureKind.Circle, Direction = Dir8.None, CircleSign = 1 }); break;
                case TouchButton.SpinRight: Inject(new GestureEvent { Kind = GestureKind.Circle, Direction = Dir8.None, CircleSign = -1 }); break;
            }
        }

        private void ButtonUp(TouchButton b)
        {
            Held.Remove(b);
            switch (b)
            {
                case TouchButton.Brake: _brakeHeld = false; break;
                case TouchButton.Jump: Inject(new GestureEvent { Kind = GestureKind.Release, Direction = Dir8.None, Duration = (float)(Now - _jumpDown) }); break;
                case TouchButton.Body:
                    _bodyHeld = false;
                    if (_bodyUsed) Inject(new GestureEvent { Kind = GestureKind.Release, Direction = Dir8.None, WasHold = true, Consumed = true });
                    break;
            }
        }

        private void TrickButton(Dir8 dir)
        {
            if (_bodyHeld)
            {
                _bodyUsed = true;
                Inject(new GestureEvent { Kind = GestureKind.HoldSwipe, Direction = dir });
            }
            else Inject(new GestureEvent { Kind = GestureKind.Swipe, Direction = dir });
        }

        private void Inject(GestureEvent e) => Dispatch(e);

        private void Dispatch(GestureEvent e)
        {
            if (e.Kind == GestureKind.Swipe || e.Kind == GestureKind.HoldSwipe || e.Kind == GestureKind.Circle)
            {
                LastGestureTime = Time.unscaledTime;
                LastGestureLabel = e.Kind == GestureKind.Circle ? (e.CircleSign > 0 ? "↺ 180" : "↻ 180") : (e.Kind == GestureKind.HoldSwipe ? "MANTÉN + " : "") + Arrow(e.Direction);
                Game.Haptics.Pulse(8);
            }
            Tricks?.HandleGesture(e);
        }

        public static string Arrow(Dir8 d)
        {
            switch (d)
            {
                case Dir8.Up: return "↑";
                case Dir8.Down: return "↓";
                case Dir8.Left: return "←";
                case Dir8.Right: return "→";
                case Dir8.UpLeft: return "↖";
                case Dir8.UpRight: return "↗";
                case Dir8.DownLeft: return "↙";
                case Dir8.DownRight: return "↘";
                default: return "";
            }
        }

        // ---- Keyboard (editor / desktop / hardware keyboards) -------------------------------------------
        private Vector2 Keyboard()
        {
            var I = (Func<KeyCode, bool>)UnityEngine.Input.GetKey;
            var D = (Func<KeyCode, bool>)UnityEngine.Input.GetKeyDown;
            var U = (Func<KeyCode, bool>)UnityEngine.Input.GetKeyUp;
            Vector2 v = Vector2.zero;
            if (I(KeyCode.A) || I(KeyCode.LeftArrow)) v.x -= 1f;
            if (I(KeyCode.D) || I(KeyCode.RightArrow)) v.x += 1f;
            if (I(KeyCode.W) || I(KeyCode.UpArrow)) v.y += 1f;
            if (I(KeyCode.S) || I(KeyCode.DownArrow)) v.y -= 1f;

            if (D(KeyCode.Space)) { _spaceDown = Now; Inject(new GestureEvent { Kind = GestureKind.Press, Direction = Dir8.None }); }
            if (U(KeyCode.Space)) Inject(new GestureEvent { Kind = GestureKind.Release, Direction = Dir8.None, Duration = (float)(Now - _spaceDown) });

            bool shift = I(KeyCode.LeftShift) || I(KeyCode.RightShift);
            if (D(KeyCode.LeftShift) || D(KeyCode.RightShift)) _shiftUsed = false;
            void Trick(KeyCode k, Dir8 d)
            {
                if (!D(k)) return;
                if (shift) { _shiftUsed = true; Inject(new GestureEvent { Kind = GestureKind.HoldSwipe, Direction = d }); }
                else Inject(new GestureEvent { Kind = GestureKind.Swipe, Direction = d });
            }
            Trick(KeyCode.I, Dir8.Up);
            Trick(KeyCode.K, Dir8.Down);
            Trick(KeyCode.J, Dir8.Left);
            Trick(KeyCode.L, Dir8.Right);
            Trick(KeyCode.U, Dir8.DownLeft);
            Trick(KeyCode.O, Dir8.DownRight);
            if ((U(KeyCode.LeftShift) || U(KeyCode.RightShift)) && _shiftUsed)
                Inject(new GestureEvent { Kind = GestureKind.Release, Direction = Dir8.None, WasHold = true, Consumed = true });
            if (D(KeyCode.Q)) Inject(new GestureEvent { Kind = GestureKind.Circle, Direction = Dir8.None, CircleSign = 1 });
            if (D(KeyCode.E)) Inject(new GestureEvent { Kind = GestureKind.Circle, Direction = Dir8.None, CircleSign = -1 });
            if (D(KeyCode.F)) Tricks?.RequestGrind();
            if (I(KeyCode.F) && Tricks != null) Tricks.RequestGrind();
            _brakeHeld = Held.Contains(TouchButton.Brake) || I(KeyCode.LeftControl) || I(KeyCode.X);
            if (D(KeyCode.Escape) || D(KeyCode.P)) PauseRequested?.Invoke();
            if (D(KeyCode.M) || D(KeyCode.Tab)) MapRequested?.Invoke();
            if (D(KeyCode.R)) RespawnRequested?.Invoke();
            if (D(KeyCode.Return) && ShowEnter) EnterRequested?.Invoke();
            return v;
        }
    }
}

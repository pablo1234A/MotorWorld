import type { TireCompound } from './Surface';

export type DriveLayout = 'FWD' | 'RWD' | 'AWD';
export type DiffType = 'open' | 'lsd' | 'locked';

export interface EngineSpec {
  idleRpm: number;
  redline: number;
  /** Peak torque at the crank including stock boost (Nm). */
  peakTorque: number;
  torqueRpm: number;
  /** End of the torque plateau (rpm). */
  plateauRpm: number;
  /** Torque fraction left at redline. */
  redlineFrac: number;
  /** Torque fraction available just off idle. */
  lowEndFrac: number;
  /** Engine braking torque at redline (Nm). */
  engineBrake: number;
  /** Rev-up rate when declutched (rpm/s). */
  revRate: number;
  cylinders: number;
  layout: 'I' | 'V' | 'F' | 'W' | 'R';
  turbo: TurboSpec | null;
  /** Extra torque multiplier from hybrid/electric assist at low rpm (0 = none). */
  electricAssist: number;
}

export interface TurboSpec {
  maxBoost: number; // bar
  spoolRpm: number;
  spoolRate: number; // bar/s
  gainPerBar: number; // torque multiplier per bar
  twin: boolean;
}

export interface DiffSpec {
  type: DiffType;
  /** Fraction of input torque that can be transferred across (lsd). */
  lock: number;
  preload: number;
}

export interface DrivetrainSpec {
  layout: DriveLayout;
  /** AWD front torque fraction. */
  frontSplit: number;
  gears: number[];
  reverse: number;
  finalDrive: number;
  shiftTime: number;
  efficiency: number;
  frontDiff: DiffSpec;
  rearDiff: DiffSpec;
}

export interface ChassisSpec {
  mass: number;
  cgHeight: number;
  /** Static fraction of weight on the front axle. */
  weightFront: number;
  wheelbase: number;
  trackFront: number;
  trackRear: number;
  length: number;
  width: number;
  height: number;
}

export interface SuspensionSpec {
  travel: number;
  springFront: number; // N/m
  springRear: number;
  damperBump: number; // Ns/m
  damperRebound: number;
  arbFront: number; // N/m
  arbRear: number;
  /** Ride height offset from stock (m, negative = lower). */
  rideOffset: number;
}

export interface TireSpec {
  radius: number;
  widthFront: number; // mm
  widthRear: number;
  compound: TireCompound;
  gripFront: number;
  gripRear: number;
}

export interface BrakeSpec {
  maxTorque: number; // total Nm across all wheels
  bias: number; // front fraction
  handbrake: number; // Nm per rear wheel
}

export interface AeroSpec {
  cd: number;
  frontalArea: number;
  /** Downforce coefficient × area at each axle. */
  clFront: number;
  clRear: number;
}

export interface SteeringSpec {
  maxAngle: number; // rad
  rate: number; // rad/s
}

export interface CarSpec {
  engine: EngineSpec;
  drivetrain: DrivetrainSpec;
  chassis: ChassisSpec;
  suspension: SuspensionSpec;
  tires: TireSpec;
  brakes: BrakeSpec;
  aero: AeroSpec;
  steering: SteeringSpec;
  /** Nitrous torque multiplier while active (0 = not fitted). */
  nitro: number;
}

export interface Assists {
  abs: boolean;
  tcs: boolean;
  stability: boolean;
  steering: boolean;
  autoGear: boolean;
}

export const DEFAULT_ASSISTS: Assists = { abs: true, tcs: true, stability: true, steering: true, autoGear: true };

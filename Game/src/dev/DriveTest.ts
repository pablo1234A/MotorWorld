import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../core/Input';
import { Environment } from '../env/Environment';
import { Vehicle } from '../game/Vehicle';
import { CollisionSystem } from '../physics/CollisionSystem';
import { getCar } from '../vehicles/CarCatalog';
import { defaultVisual } from '../vehicles/Tuning';
import { World } from '../world/World';
import { generateWorld } from '../world/WorldGen';

/** Dev harness: world + one car, keyboard driving, scripted autopilot for screenshots (?view=drive). */
export async function runDriveTest(container: HTMLElement) {
  const params = new URLSearchParams(location.search);
  const q = +(params.get('q') ?? 1);
  const r = new WebGLRenderer({ antialias: q >= 2, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(innerWidth, innerHeight);
  r.toneMapping = ACESFilmicToneMapping;
  r.outputColorSpace = SRGBColorSpace;
  r.shadowMap.enabled = q >= 1;
  r.shadowMap.type = PCFSoftShadowMap;
  container.appendChild(r.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);
  const env = new Environment(r, scene);
  env.time = +(params.get('t') ?? 10);
  env.timeScale = 0;
  env.configureShadows(q >= 1, 1024, 70);
  if (params.get('w')) env.setWeather(params.get('w') as any);
  const info = document.createElement('pre');
  info.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:12px monospace;background:#0008;padding:6px;margin:0;z-index:5';
  document.body.appendChild(info);
  info.textContent = 'generating…';
  const t0 = performance.now();
  const data = await generateWorld((p, l) => (info.textContent = `gen ${l} ${(p * 100).toFixed(0)}%`));
  const genMs = performance.now() - t0;
  const world = new World(data, scene);
  world.configure(q, q >= 1);
  const sx = +(params.get('x') ?? 560), sz = +(params.get('z') ?? 0);
  const sp = world.spawnOnRoad(sx, sz);
  const t1 = performance.now();
  world.update(sp.x, sp.z, 1e9, true);
  const buildMs = performance.now() - t1;
  const def = getCar(params.get('car') ?? 'petra_hot');
  const car = new Vehicle(def, {}, defaultVisual(def), undefined, world, scene, q, q >= 1);
  car.sim.reset(sp.x, sp.y + 1.2, sp.z, sp.heading);
  const input = new Input();
  const rig = new CameraRig(camera);
  if (params.get('cam')) rig.mode = params.get('cam') as any;
  rig.snap(car);
  const col = new CollisionSystem();
  world.onBreak = () => {};
  let last = performance.now();
  let acc = 0;
  const auto = params.get('auto');
  const frames = +(params.get('frames') ?? 0);
  let simTime = 0;
  let frameCount = 0;
  const step = 1 / 120;
  const tick = () => {
    const now = performance.now();
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (frames) dt = 1 / 30; // deterministic capture mode
    input.update(dt);
    const inp = car.sim.input;
    if (auto) {
      inp.throttle = simTime > 0.5 ? 1 : 0;
      inp.steer = +(params.get('steer') ?? 0);
    } else {
      inp.throttle = input.throttle;
      inp.brake = input.brake;
      inp.steer = input.steer;
      inp.handbrake = input.handbrake;
      inp.nitro = input.nitro;
    }
    if (input.consume('camera')) rig.next();
    acc += dt;
    while (acc >= step) {
      car.sim.step(step);
      col.resolve([car.sim], [], world);
      acc -= step;
      simTime += step;
    }
    world.update(car.sim.position.x, car.sim.position.z, 6);
    env.update(dt, car.sim.position, q);
    world.setNight(env.night);
    world.setWetness(env.wetness);
    car.sync(env.night);
    rig.update(dt, car, world);
    env.sky.mesh.position.copy(camera.position);
    r.render(scene, camera);
    frameCount++;
    info.textContent = `gen ${genMs.toFixed(0)}ms build ${buildMs.toFixed(0)}ms chunks ${world.loadedChunks}\n` +
      `v ${(car.sim.forwardSpeed * 3.6).toFixed(0)} km/h  gear ${car.sim.powertrain.gear} rpm ${car.sim.powertrain.rpm.toFixed(0)}\n` +
      `pos ${car.sim.position.x.toFixed(0)},${car.sim.position.y.toFixed(1)},${car.sim.position.z.toFixed(0)} calls ${r.info.render.calls} tris ${r.info.render.triangles}`;
    if (frames && frameCount >= frames) {
      (window as any).__ready = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

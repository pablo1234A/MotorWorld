import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CARS } from '../vehicles/CarCatalog';
import { CarModel } from '../vehicles/CarModel';
import { defaultVisual } from '../vehicles/Tuning';

/** Dev view: renders every car in a grid for visual QA (?view=showroom). */
export function runShowroom(container: HTMLElement) {
  const r = new WebGLRenderer({ antialias: true });
  r.setSize(innerWidth, innerHeight);
  r.toneMapping = ACESFilmicToneMapping;
  r.outputColorSpace = SRGBColorSpace;
  r.shadowMap.enabled = true;
  container.appendChild(r.domElement);
  const scene = new Scene();
  scene.background = new Color(0x22262b);
  const pm = new PMREMGenerator(r);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.add(new HemisphereLight(0xffffff, 0x444444, 0.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(10, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 }));
  floor.receiveShadow = true;
  scene.add(floor);
  const params = new URLSearchParams(location.search);
  const only = params.get('car');
  const list = only ? CARS.filter((c) => c.id === only) : CARS;
  list.forEach((def, i) => {
    const v = defaultVisual(def);
    if (params.get('vinyl')) v.vinyl = +params.get('vinyl')!;
    const m = new CarModel(def.body, v, { quality: 3, interior: true, wingLevel: 0, splitterLevel: 0, diffuserLevel: 0 });
    const col = i % 5, row = Math.floor(i / 5);
    m.root.position.set((col - 2) * 2.8, 0, row * 6.5 - 3);
    m.root.rotation.y = +(params.get('rot') ?? 0.6);
    scene.add(m.root);
  });
  const cam = new PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 500);
  const d = only ? 7 : 22;
  cam.position.set(d * 0.55, d * 0.45, d * 0.85);
  cam.lookAt(0, 0.5, 0);
  r.setAnimationLoop(() => r.render(scene, cam));
  (window as any).__ready = true;
}

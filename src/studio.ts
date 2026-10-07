import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createFlower, createVase, disposeObject } from "./botanicals";
import type { Arrangement, FlowerKind, Stem, VaseKind } from "./catalog";

const PALETTES = {
  linen: { background: "#eae7df", floor: "#e4e0d6" },
  sage: { background: "#e0e5dc", floor: "#d9dfd3" },
  rose: { background: "#e9ddd5", floor: "#e2d4c9" },
};
const radians = THREE.MathUtils.degToRad;
const up = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
type TransformHandler = (
  id: string,
  patch: Partial<Stem>,
  phase: "start" | "move" | "end",
) => void;

function lightScene(scene: THREE.Scene, shadows: boolean) {
  scene.add(new THREE.HemisphereLight("#fffaf0", "#898b74", 1.15));
  const key = new THREE.DirectionalLight("#fff7e6", 2.5);
  key.position.set(-3.5, 6, 4);
  key.castShadow = shadows;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 14;
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.00015;
  key.shadow.radius = 4;
  key.target.position.set(0, 1, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight("#e3edff", 0.45);
  fill.position.set(4, 3, -3);
  scene.add(fill);
}

function placeStem(object: THREE.Group, stem: Stem) {
  const angle = radians(stem.rotation);
  const lean = radians(stem.tilt);
  object.position.set(stem.x, 0.88, stem.z);
  object.scale.setScalar(stem.height);
  object.quaternion.setFromUnitVectors(
    up,
    new THREE.Vector3(
      Math.cos(angle) * Math.sin(lean),
      Math.cos(lean),
      Math.sin(angle) * Math.sin(lean),
    ),
  );
  object.rotateY(radians((stem.seed * 43) % 360));
  object.updateMatrixWorld(true);
}

function makeFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(256, 256);
  let seed = 771;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const value = 238 + (seed % 18);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class FlowerStudio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly controls: OrbitControls;
  private readonly stems = new Map<
    string,
    { object: THREE.Group; signature: string }
  >();
  private readonly bouquet = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly floor: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly resizeObserver: ResizeObserver;
  private readonly thumbnails = new Map<string, string>();
  private readonly abort = new AbortController();
  private vase: THREE.Group | null = null;
  private vaseSignature = "";
  private width = 1;
  private height = 1;
  private pendingFrame = 0;
  private interactionEnabled = true;
  private drag: {
    id: string | null;
    x: number;
    y: number;
    active: boolean;
    plane: THREE.Plane;
    offset: THREE.Vector3;
    pointerId: number;
  } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (id: string | null) => void,
    private readonly onTransform: TransformHandler,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "三维插花画布。拖动花朵调整姿态，拖动空白旋转视角，滚轮缩放。",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.style.cssText =
      "display:block;width:100%;height:100%;touch-action:none;outline:none";
    this.container.append(this.renderer.domElement);
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.55;
    lightScene(this.scene, true);
    const floorTexture = makeFloorTexture();
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: PALETTES.linen.floor,
        map: floorTexture,
        roughness: 0.98,
        metalness: 0,
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.009;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor, this.bouquet);
    this.addContactShadow();
    this.scene.background = new THREE.Color(PALETTES.linen.background);
    this.scene.fog = new THREE.Fog(PALETTES.linen.background, 14, 32);
    this.camera.near = 0.1;
    this.camera.far = 50;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 1.55;
    this.controls.minZoom = 0.7;
    this.controls.maxZoom = 1.8;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    this.controls.addEventListener("change", () => this.requestRender());
    this.resetCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.bindPointers();
  }

  private addContactShadow() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 12, 64, 64, 63);
    gradient.addColorStop(0, "rgba(64, 55, 39, .27)");
    gradient.addColorStop(0.5, "rgba(64, 55, 39, .11)");
    gradient.addColorStop(1, "rgba(64, 55, 39, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 1.5),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.06, -0.004, -0.02);
    this.scene.add(shadow);
  }

  private resize() {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    const aspect = this.width / this.height;
    const targetY = aspect < 0.8 ? 1.18 : 1.4;
    this.camera.position.y += targetY - this.controls.target.y;
    this.controls.target.y = targetY;
    this.controls.update();
    const halfHeight = Math.max(2.02, 1.52 / aspect);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.requestRender();
  }

  private requestRender() {
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  resetCamera() {
    const targetY = this.width / this.height < 0.8 ? 1.18 : 1.4;
    this.camera.position.set(0.5, 1.7 + targetY, 7.5);
    this.camera.zoom = 1;
    this.controls.target.set(0, targetY, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  setOrbit(enabled: boolean) {
    this.interactionEnabled = enabled;
    this.controls.enabled = enabled;
    this.renderer.domElement.style.cursor = enabled ? "grab" : "default";
  }


  setArrangement(arrangement: Arrangement) {
    const ids = new Set(arrangement.stems.map((stem) => stem.id));
    for (const [id, entry] of this.stems) {
      if (!ids.has(id)) {
        this.bouquet.remove(entry.object);
        disposeObject(entry.object);
        this.stems.delete(id);
      }
    }
    for (const stem of arrangement.stems) {
      const signature = `${stem.kind}:${stem.color}:${stem.seed}`;
      let entry = this.stems.get(stem.id);
      if (!entry || entry.signature !== signature) {
        if (entry) {
          this.bouquet.remove(entry.object);
          disposeObject(entry.object);
        }
        const object = createFlower(stem.kind, stem.color, stem.seed);
        object.userData.stemId = stem.id;
        entry = { object, signature };
        this.stems.set(stem.id, entry);
        this.bouquet.add(object);
      }
      placeStem(entry.object, stem);
    }
    const vaseSignature = `${arrangement.vase}:${arrangement.vaseColor}`;
    if (vaseSignature !== this.vaseSignature) {
      if (this.vase) {
        this.scene.remove(this.vase);
        disposeObject(this.vase);
      }
      this.vase = createVase(arrangement.vase, arrangement.vaseColor);
      this.scene.add(this.vase);
      this.vaseSignature = vaseSignature;
    }
    const palette = PALETTES[arrangement.background];
    (this.scene.background as THREE.Color).set(palette.background);
    (this.scene.fog as THREE.Fog).color.set(palette.background);
    this.floor.material.color.set(palette.floor);
    this.requestRender();
  }

  private pointerRay(event: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pick(event: PointerEvent): string | null {
    this.pointerRay(event);
    const roots: THREE.Object3D[] = [this.bouquet];
    if (this.vase) roots.push(this.vase);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object) {
      if (object.userData.stemId) return object.userData.stemId;
      object = object.parent;
    }
    return null;
  }

  private bindPointers() {
    const canvas = this.renderer.domElement;
    const options = { signal: this.abort.signal };
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        const id = this.pick(event);
        const plane = new THREE.Plane();
        const offset = new THREE.Vector3();
        if (id) {
          this.controls.enabled = false;
          const object = this.stems.get(id)!.object;
          const head = object.localToWorld(new THREE.Vector3(0, 1.5, 0));
          plane.setFromNormalAndCoplanarPoint(
            this.camera.getWorldDirection(new THREE.Vector3()),
            head,
          );
          const intersection = this.raycaster.ray.intersectPlane(
            plane,
            new THREE.Vector3(),
          );
          if (intersection) offset.copy(head).sub(intersection);
          canvas.setPointerCapture(event.pointerId);
        }
        this.drag = {
          id,
          x: event.clientX,
          y: event.clientY,
          active: false,
          plane,
          offset,
          pointerId: event.pointerId,
        };
      },
      { ...options, capture: true },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        const drag = this.drag;
        if (!drag?.id) {
          if (!drag)
            canvas.style.cursor = this.pick(event)
              ? "pointer"
              : this.interactionEnabled
                ? "grab"
                : "default";
          return;
        }
        if (
          !drag.active &&
          Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5
        )
          return;
        if (!drag.active) {
          drag.active = true;
          this.onSelect(drag.id);
          this.onTransform(drag.id, {}, "start");
        }
        canvas.style.cursor = "grabbing";
        this.pointerRay(event);
        const intersection = this.raycaster.ray.intersectPlane(
          drag.plane,
          new THREE.Vector3(),
        );
        if (!intersection) return;
        const root = this.stems.get(drag.id)!.object.position;
        const direction = intersection.add(drag.offset).sub(root);
        const length = direction.length();
        if (length < 0.1) return;
        this.onTransform(
          drag.id,
          {
            height: Math.round(clamp(length / 1.5, 0.65, 1.35) * 100) / 100,
            tilt: Math.round(
              clamp(
                THREE.MathUtils.radToDeg(
                  Math.acos(clamp(direction.y / length, -1, 1)),
                ),
                0,
                42,
              ),
            ),
            rotation: Math.round(
              (THREE.MathUtils.radToDeg(Math.atan2(direction.z, direction.x)) +
                360) %
                360,
            ),
          },
          "move",
        );
      },
      options,
    );
    const finish = (event: PointerEvent) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const drag = this.drag;
      if (drag.active && drag.id) this.onTransform(drag.id, {}, "end");
      else if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5)
        this.onSelect(drag.id);
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      this.drag = null;
      this.controls.enabled = this.interactionEnabled;
      canvas.style.cursor = this.interactionEnabled ? "grab" : "default";
    };
    canvas.addEventListener("pointerup", finish, options);
    canvas.addEventListener("pointercancel", finish, options);
    canvas.addEventListener(
      "lostpointercapture",
      (event) => {
        if (this.drag?.id && this.drag.pointerId === event.pointerId)
          finish(event);
      },
      options,
    );
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.container.dispatchEvent(
          new CustomEvent("studio-context-lost", { bubbles: true }),
        );
      },
      options,
    );
    canvas.addEventListener(
      "webglcontextrestored",
      () => this.requestRender(),
      options,
    );
  }

  private image(
    scene: THREE.Scene,
    camera: THREE.OrthographicCamera,
    size: number,
    transparent: boolean,
    mime: "image/png" | "image/jpeg" = "image/png",
  ) {
    // Use the screen pipeline: ordinary render targets omit renderer tone mapping.
    const previousSize = this.renderer.getSize(new THREE.Vector2());
    const previousRatio = this.renderer.getPixelRatio();
    const previousColor = this.renderer.getClearColor(new THREE.Color());
    const previousAlpha = this.renderer.getClearAlpha();
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(size, size, false);
      this.renderer.setClearColor(0xffffff, transparent ? 0 : 1);
      this.renderer.render(scene, camera);
      return this.renderer.domElement.toDataURL(mime, 0.89);
    } finally {
      this.renderer.setPixelRatio(previousRatio);
      this.renderer.setSize(previousSize.x, previousSize.y, false);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.renderer.render(this.scene, this.camera);
    }
  }

  thumbnail(
    kind: FlowerKind | VaseKind,
    color: string,
    isVase = false,
  ): string {
    const key = `${kind}:${color}`;
    const cached = this.thumbnails.get(key);
    if (cached) return cached;
    const scene = new THREE.Scene();
    scene.environment = this.environment.texture;
    scene.environmentIntensity = 0.65;
    lightScene(scene, false);
    const model = isVase
      ? createVase(kind as VaseKind, color)
      : createFlower(kind as FlowerKind, color, 37);
    scene.add(model);
    const half = isVase ? 0.8 : kind === "eucalyptus" ? 1.0 : 0.61;
    const camera = new THREE.OrthographicCamera(
      -half,
      half,
      half,
      -half,
      0.1,
      20,
    );
    const targetY = isVase ? 0.57 : kind === "eucalyptus" ? 0.88 : 1.3;
    camera.position.set(0, targetY + 1.5, 4);
    camera.lookAt(0, targetY, 0);
    try {
      const image = this.image(scene, camera, 256, true);
      this.thumbnails.set(key, image);
      return image;
    } finally {
      disposeObject(model);
    }
  }

  presetThumbnail(arrangement: Arrangement): string {
    const scene = new THREE.Scene();
    scene.environment = this.environment.texture;
    scene.environmentIntensity = 0.55;
    scene.background = new THREE.Color(
      PALETTES[arrangement.background].background,
    );
    lightScene(scene, false);
    const group = new THREE.Group();
    group.add(createVase(arrangement.vase, arrangement.vaseColor));
    for (const stem of arrangement.stems) {
      const flower = createFlower(stem.kind, stem.color, stem.seed);
      placeStem(flower, stem);
      group.add(flower);
    }
    scene.add(group);
    const camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 20);
    camera.position.set(0.5, 3, 7);
    camera.lookAt(0, 1.57, 0);
    try {
      return this.image(scene, camera, 256, false, "image/jpeg");
    } finally {
      disposeObject(group);
    }
  }

  capture(size = 900, mime: "image/png" | "image/jpeg" = "image/jpeg"): string {
    const camera = this.camera.clone();
    const half = 1.94;
    camera.left = camera.bottom = -half;
    camera.right = camera.top = half;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    return this.image(this.scene, camera, size, false, mime);
  }

  dispose() {
    this.abort.abort();
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.pendingFrame);
    this.controls.dispose();
    disposeObject(this.scene);
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.thumbnails.clear();
  }
}

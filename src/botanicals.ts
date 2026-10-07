import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FlowerKind, VaseKind } from "./catalog";

// Each model owns its resources. Geometry batching keeps even the clustered flowers inexpensive.
type Random = () => number;
function random(seed: number): Random {
  let value = seed | 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function texture(
  kind: "petal" | "leaf" | "clay",
  seed: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const rng = random(seed);
  ctx.fillStyle = kind === "leaf" ? "#d4d8ce" : "#efebe4";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3600; i++) {
    const grey = 160 + Math.floor(rng() * 85);
    ctx.fillStyle = `rgba(${grey},${grey},${grey},${kind === "clay" ? 0.22 : 0.08})`;
    ctx.fillRect(rng() * 128, rng() * 128, 1, 1);
  }
  if (kind !== "clay") {
    ctx.lineWidth = 0.7;
    for (let i = -7; i <= 7; i++) {
      ctx.strokeStyle = "rgba(115,112,98,.12)";
      ctx.beginPath();
      ctx.moveTo(64, 127);
      ctx.quadraticCurveTo(64 + i * 5, 62, 64 + i * 9, 0);
      ctx.stroke();
    }
    if (kind === "leaf") {
      ctx.strokeStyle = "rgba(96,109,84,.3)";
      ctx.beginPath();
      ctx.moveTo(64, 128);
      ctx.lineTo(64, 0);
      ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}
class Builder {
  readonly group = new THREE.Group();
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position = new THREE.Vector3(),
    rotation = new THREE.Euler(),
    scale = new THREE.Vector3(1, 1, 1),
  ): void {
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        position,
        new THREE.Quaternion().setFromEuler(rotation),
        scale,
      ),
    );
    const batch = this.batches.get(material) ?? [];
    batch.push(geometry);
    this.batches.set(material, batch);
  }
  finish(): THREE.Group {
    for (const [material, parts] of this.batches) {
      const geometry = mergeGeometries(parts, false)!;
      for (const part of parts) part.dispose();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    return this.group;
  }
}
function petal(
  width: number,
  length: number,
  cup: number,
  curl: number,
  phase: number,
  notch = false,
  rounded = false,
): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  const nx = 14, ny = 20;
  for (let j = 0; j <= ny; j++) {
    const t = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = (i / nx) * 2 - 1;
      const envelope = Math.pow(Math.sin(Math.PI * t * (rounded ? 0.83 : 1)), 0.55) * 0.96 + 0.015;
      const edge = Math.sin(t * 11 + phase) * 0.0025 * Math.pow(Math.abs(u), 3);
      const tip = (rounded ? length * 0.12 * u * u * Math.pow(t, 5) : 0)
        + (notch ? length * 0.035 * Math.cos(u * Math.PI * 3) * Math.pow(t, 9) : 0);
      positions.push(
        u * width * 0.5 * envelope,
        length * t - tip,
        cup * t * t + curl * u * u * Math.sin(Math.PI * t) + edge,
      );
      uv.push(i / nx, t);
      const shade = 0.78 + 0.22 * Math.sqrt(t);
      colors.push(shade, shade, shade);
      if (j < ny && i < nx) {
        const a = j * (nx + 1) + i,
          b = a + nx + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tulipPetal(phase: number): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  const columns = 16, rows = 24;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const radius = 0.022 + 0.151 * Math.pow(Math.sin(Math.PI * t * 0.91), 0.82);
    for (let i = 0; i <= columns; i++) {
      const u = i / columns * 2 - 1;
      const angle = u * 0.72;
      positions.push(Math.sin(angle) * radius,
        0.42 * t - 0.038 * u * u * Math.pow(t, 8),
        Math.cos(angle) * radius + Math.sin(t * 9 + phase) * 0.003);
      uv.push(i / columns, t);
      const shade = 0.84 + 0.16 * Math.sin(t * Math.PI * 0.7);
      colors.push(shade, shade, shade);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function tube(
  builder: Builder,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
): void {
  builder.add(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      18,
      radius,
      6,
      false,
    ),
    material,
  );
}
function sphere(
  builder: Builder,
  material: THREE.Material,
  position: THREE.Vector3,
  radius: number,
  scale = new THREE.Vector3(1, 1, 1),
): void {
  builder.add(
    new THREE.SphereGeometry(radius, 12, 8),
    material,
    position,
    new THREE.Euler(),
    scale,
  );
}
export function createFlower(
  kind: FlowerKind,
  color: string,
  seed: number,
): THREE.Group {
  const rng = random(seed);
  const b = new Builder();
  const petalMap = texture("petal", seed);
  const leafMap = texture("leaf", seed + 7);
  const bloom = new THREE.MeshPhysicalMaterial({
    color,
    map: petalMap,
    bumpMap: petalMap,
    bumpScale: 0.0016,
    roughness: 0.8,
    metalness: 0,
    side: THREE.DoubleSide,
    sheen: 0.32,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color("white"), 0.3),
    vertexColors: true,
  });
  const green = new THREE.MeshStandardMaterial({
    color: kind === "eucalyptus" ? color : "#536e38",
    map: leafMap,
    bumpMap: leafMap,
    bumpScale: 0.0018,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: kind === "eucalyptus" ? "#798772" : "#577143",
    roughness: 0.85,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: "#bf8d32",
    roughness: 0.96,
  });
  const end = new THREE.Vector3(
    0.035 * (rng() - 0.5),
    1.5,
    0.035 * (rng() - 0.5),
  );
  tube(
    b,
    [
      new THREE.Vector3(),
      new THREE.Vector3(-0.025, 0.5, 0.018),
      new THREE.Vector3(0.026, 1.05, -0.012),
      end,
    ],
    kind === "cosmos" || kind === "chamomile" ? 0.008 : 0.013,
    stemMat,
  );
  const leaf = (
    at: THREE.Vector3,
    angle: number,
    length: number,
    width: number,
    round = false,
  ) => {
    const rotation = new THREE.Euler(0.6 + rng() * 0.45, 0, angle);
    const geometry = petal(
      width,
      length,
      round ? 0.035 : 0.09,
      0.035,
      rng() * 6,
    );
    b.add(geometry, green, at, rotation);
    const tip = new THREE.Vector3(0, length, 0.06).applyEuler(rotation).add(at);
    tube(
      b,
      [at, new THREE.Vector3().lerpVectors(at, tip, 0.5), tip],
      0.0025,
      stemMat,
    );
  };
  const disk = (center: THREE.Vector3, radius: number, count: number) => {
    sphere(b, gold, center, radius, new THREE.Vector3(1, 0.48, 1));
    for (let i = 0; i < count; i++) {
      const a = i * 2.399963,
        r = radius * Math.sqrt((i + 0.5) / count);
      sphere(
        b,
        gold,
        center
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(a) * r,
              0.04 * Math.sqrt(1 - (r / radius) ** 2),
              Math.sin(a) * r,
            ),
          ),
        0.008,
      );
    }
  };
  const daisy = (
    center: THREE.Vector3,
    size: number,
    count: number,
    material: THREE.Material,
    notch: boolean,
  ) => {
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + rng() * 0.04;
      b.add(
        petal(size * (notch ? 0.7 : 0.43), size, -0.015, 0.009, rng() * 6, notch, true),
        material,
        center
          .clone()
          .add(new THREE.Vector3(Math.sin(a) * 0.025, 0, Math.cos(a) * 0.025)),
        new THREE.Euler(Math.PI / 2 - 0.18 + rng() * 0.12, a, 0, "YXZ"),
      );
    }
    disk(center.clone().add(new THREE.Vector3(0, 0.025, 0)), size * 0.3, 44);
  };
  if (kind === "rose") {
    for (let layer = 0; layer < 7; layer++) {
      const count = 5 + layer,
        radius = 0.008 + layer * 0.013;
      for (let i = 0; i < count; i++) {
        const a = (i * Math.PI * 2) / count + layer * 1.7;
        const p = new THREE.Vector3(
          Math.sin(a) * radius,
          -0.035 + (6 - layer) * 0.012,
          Math.cos(a) * radius,
        );
        p.applyEuler(new THREE.Euler(0.3, 0, 0)).add(end);
        const rot = new THREE.Euler(
          0.10 + layer * 0.17 + rng() * 0.10,
          a,
          0.04 * (rng() - 0.5),
          "YXZ",
        );
        const q = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0.3, 0, 0))
          .multiply(new THREE.Quaternion().setFromEuler(rot));
        b.add(
          petal(
            0.11 + layer * 0.047,
            0.145 + layer * 0.027,
            -0.065,
            0.072,
            rng() * 6,
            false,
            true,
          ),
          bloom,
          p,
          new THREE.Euler().setFromQuaternion(q),
        );
      }
    }
    for (let i = 0; i < 5; i++)
      b.add(
        petal(0.055, 0.17, -0.04, 0.016, i),
        green,
        end.clone().add(new THREE.Vector3(0, -0.1, 0)),
        new THREE.Euler(1.8, i * 1.256, 0, "YXZ"),
      );
    leaf(new THREE.Vector3(0, 0.83, 0), -1.1, 0.3, 0.14);
    leaf(new THREE.Vector3(0, 1.06, 0), 1, 0.24, 0.12);
  } else if (kind === "tulip") {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      b.add(
        tulipPetal(rng() * 6),
        bloom,
        end.clone().add(new THREE.Vector3(0, -0.18 + (i % 2) * 0.007, 0)),
        new THREE.Euler(0.025 * (i % 2), a, 0, "YXZ"),
      );
    }
    leaf(new THREE.Vector3(0, 0.35, 0), -0.55, 0.8, 0.15);
    leaf(new THREE.Vector3(0, 0.62, 0), 0.75, 0.62, 0.12);
  } else if (kind === "cosmos") {
    daisy(end, 0.19, 8, bloom, true);
    for (let side = -1; side <= 1; side += 2) {
      const at = new THREE.Vector3(side * 0.14, 1.13, 0.03);
      tube(
        b,
        [
          new THREE.Vector3(0, 0.7, 0),
          new THREE.Vector3(side * 0.12, 0.91, 0.02),
          at,
        ],
        0.005,
        stemMat,
      );
      for (let i = 0; i < 7; i++)
        leaf(
          new THREE.Vector3(side * 0.025 * i, 0.75 + i * 0.047, 0.02),
          side * (1 + i * 0.13),
          0.14,
          0.014,
        );
    }
  } else if (kind === "hydrangea") {
    // A Fibonacci hemisphere gives a dense but non-grid-like inflorescence.
    for (let i = 0; i < 64; i++) {
      const y = 0.08 + (0.92 * (i + 0.5)) / 64,
        a = i * 2.399963,
        r = Math.sqrt(1 - y * y);
      const normal = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const center = end.clone().add(normal.clone().multiplyScalar(0.29));
      const orient = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        normal,
      );
      for (let j = 0; j < 4; j++) {
        const local = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.PI / 2 - 0.15, (j * Math.PI) / 2 + a, 0, "YXZ"),
        );
        const geometry = petal(
          0.06 + rng() * 0.012,
          0.073,
          -0.012,
          0.011,
          rng() * 6,
          false,
          true,
        );
        const tint = new THREE.Color(color).multiplyScalar(0.88 + rng() * 0.22);
        const colors = new Float32Array(
          geometry.getAttribute("position").count * 3,
        );
        for (let k = 0; k < colors.length; k += 3) {
          colors[k] = tint.r;
          colors[k + 1] = tint.g;
          colors[k + 2] = tint.b;
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        b.add(
          geometry,
          bloom,
          center,
          new THREE.Euler().setFromQuaternion(orient.clone().multiply(local)),
        );
      }
      sphere(b, gold, center.clone().add(normal.multiplyScalar(0.009)), 0.009);
    }
    bloom.color.set("white");
    bloom.vertexColors = true;
    leaf(new THREE.Vector3(0, 1, 0), -1, 0.36, 0.23);
    leaf(new THREE.Vector3(0, 0.87, 0), 1.1, 0.34, 0.22);
  } else if (kind === "chamomile") {
    daisy(end, 0.098, 14, bloom, false);
    const count = 3 + (((seed % 2) + 2) % 2);
    for (let i = 0; i < count; i++) {
      const a = i * 2.4,
        head = new THREE.Vector3(
          Math.sin(a) * 0.19,
          1.28 + rng() * 0.25,
          Math.cos(a) * 0.16,
        );
      tube(
        b,
        [
          new THREE.Vector3(0, 0.72 + i * 0.08, 0),
          new THREE.Vector3(head.x * 0.6, 1.14, head.z * 0.6),
          head,
        ],
        0.005,
        stemMat,
      );
      daisy(head, 0.09 + rng() * 0.016, 14, bloom, false);
    }
    for (let i = 0; i < 12; i++)
      leaf(
        new THREE.Vector3(0, 0.65 + i * 0.038, 0),
        (i % 2 ? 1 : -1) * 1.05,
        0.12,
        0.013,
      );
  } else {
    for (let branch = 0; branch < 3; branch++) {
      const a = branch * 2.4,
        endpoint = new THREE.Vector3(
          Math.sin(a) * 0.22,
          1.45 + rng() * 0.15,
          Math.cos(a) * 0.18,
        );
      const start = new THREE.Vector3(0, 0.55 + branch * 0.13, 0);
      tube(
        b,
        [
          start,
          new THREE.Vector3(endpoint.x * 0.5, 1.1, endpoint.z * 0.5),
          endpoint,
        ],
        0.006,
        stemMat,
      );
      for (let i = 0; i < 6; i++) {
        const at = start.clone().lerp(endpoint, 0.22 + i * 0.13);
        for (let side = -1; side <= 1; side += 2)
          leaf(
            at,
            side * (1 + rng() * 0.5) + a,
            0.12 + (5 - i) * 0.012,
            0.12 + rng() * 0.025,
            true,
          );
      }
    }
  }
  // Dispose materials unused by a particular species; textures that are in use remain model-owned.
  const result = b.finish();
  result.name = kind;
  const used = new Set(
    result.children.map((child) => (child as THREE.Mesh).material),
  );
  for (const mat of [bloom, green, stemMat, gold])
    if (!used.has(mat)) mat.dispose();
  if (!used.has(bloom)) petalMap.dispose();
  if (!used.has(green)) leafMap.dispose();
  return result;
}

export function createVase(kind: VaseKind, color: string): THREE.Group {
  const b = new Builder();
  const glass = kind === "glass";
  const grain = texture("clay", 912);
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: glass ? 0.17 : kind === "ribbed" ? 0.36 : 0.83,
    metalness: 0,
    map: glass ? null : grain,
    bumpMap: glass ? null : grain,
    bumpScale: kind === "terracotta" ? 0.018 : 0.006,
    transmission: glass ? 0.32 : 0,
    thickness: 0.055,
    transparent: glass,
    opacity: glass ? 0.78 : 1,
    ior: 1.46,
    clearcoat: kind === "ribbed" ? 0.18 : 0,
    side: THREE.DoubleSide,
  });
  if (glass) grain.dispose();
  const profiles: Record<VaseKind, [number, number][]> = {
    ceramic: [
      [0.27, 0],
      [0.33, 0.025],
      [0.39, 0.12],
      [0.45, 0.34],
      [0.44, 0.57],
      [0.37, 0.79],
      [0.28, 0.94],
      [0.265, 1.1],
      [0.275, 1.16],
    ],
    glass: [
      [0.31, 0],
      [0.37, 0.035],
      [0.41, 0.16],
      [0.43, 0.45],
      [0.4, 0.76],
      [0.3, 0.97],
      [0.265, 1.12],
      [0.27, 1.16],
    ],
    terracotta: [
      [0.29, 0],
      [0.35, 0.035],
      [0.43, 0.21],
      [0.46, 0.48],
      [0.43, 0.74],
      [0.34, 0.94],
      [0.285, 1.1],
      [0.29, 1.16],
    ],
    ribbed: [
      [0.27, 0],
      [0.32, 0.035],
      [0.39, 0.25],
      [0.405, 0.5],
      [0.37, 0.75],
      [0.295, 0.98],
      [0.265, 1.11],
      [0.27, 1.16],
    ],
  };
  const curve = new THREE.SplineCurve(
    profiles[kind].map(([r, y]) => new THREE.Vector2(r, y)),
  );
  const outer = curve.getPoints(64);
  // Cross-section returns down the inner wall and along the raised internal floor.
  const section = [
    ...outer,
    new THREE.Vector2(0.263, 1.173),
    new THREE.Vector2(0.245, 1.173),
    new THREE.Vector2(0.232, 1.16),
  ];
  for (let i = outer.length - 2; i >= 3; i--)
    section.push(
      new THREE.Vector2(
        Math.max(0.05, outer[i].x - 0.038),
        Math.max(0.06, outer[i].y),
      ),
    );
  section.push(
    new THREE.Vector2(0.24, 0.065),
    new THREE.Vector2(0, 0.065),
    new THREE.Vector2(0, 0),
    outer[0].clone(),
  );
  const geometry = new THREE.LatheGeometry(section, 128);
  if (kind === "ribbed") {
    const p = geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i),
        y = p.getY(i),
        r = Math.hypot(x, z);
      if (r < 0.01) continue;
      const offset =
        0.009 *
        Math.cos(Math.atan2(x, z) * 36) *
        Math.sin(Math.PI * Math.min(1, y / 1.18));
      p.setXYZ(i, x * (1 + offset / r), y, z * (1 + offset / r));
    }
    geometry.computeVertexNormals();
  }
  b.add(geometry, material);
  const result = b.finish();
  result.name = `${kind}-vase`;
  return result;
}

export function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const map of textures) map.dispose();
}

import * as THREE from 'three';
import { entityList, type CadDocument, type Vec3 } from '@cadw/core';

export interface MeshInput {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export type ViewName = 'top' | 'iso';

/**
 * three.js viewport. Orthographic camera, model units = mm.
 * Wheel zooms about the cursor; middle- or right-drag pans.
 */
export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly linesGroup = new THREE.Group();
  private readonly meshGroup = new THREE.Group();
  private preview: THREE.Line | null = null;
  private halfHeight = 250; // mm visible above/below centre
  private readonly target = new THREE.Vector3(0, 0, 0);
  private view: ViewName = 'top';
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1d2127);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e6, 1e6);
    const grid = new THREE.GridHelper(10_000, 100, 0x3a4150, 0x2a303a);
    grid.rotation.x = Math.PI / 2;
    this.scene.add(grid, new THREE.AxesHelper(100), this.linesGroup, this.meshGroup);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(1, -2, 3);
    this.scene.add(sun);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bindNavigation();
    this.resize();
  }

  setDocument(doc: CadDocument): void {
    clearGroup(this.linesGroup);
    const color = new THREE.Color(0xe6e6e6);
    for (const e of entityList(doc)) {
      if (e.kind === 'line') this.linesGroup.add(makeLine(e.start, e.end, color));
    }
    this.requestRender();
  }

  setPreview(start: Vec3 | null, end: Vec3 | null): void {
    if (this.preview) {
      this.scene.remove(this.preview);
      disposeObject(this.preview);
      this.preview = null;
    }
    if (start && end) {
      this.preview = makeLine(start, end, new THREE.Color(0x4fc3f7));
      this.scene.add(this.preview);
    }
    this.requestRender();
  }

  setMeshes(meshes: readonly MeshInput[]): void {
    clearGroup(this.meshGroup);
    const material = new THREE.MeshStandardMaterial({ color: 0x8fb3d9, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
    for (const m of meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      g.computeVertexNormals();
      this.meshGroup.add(new THREE.Mesh(g, material));
      this.meshGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x0b1320 })));
    }
    this.requestRender();
  }

  setView(view: ViewName): void {
    this.view = view;
    this.updateCamera();
  }

  /** Screen point → model point on the XY plane (z = 0), in mm. */
  screenToModel(clientX: number, clientY: number): Vec3 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const ok = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit);
    return ok ? [hit.x, hit.y, 0] : [this.target.x, this.target.y, 0];
  }

  /** Model units per screen pixel — for pick and snap radii. */
  get unitsPerPixel(): number {
    return (2 * this.halfHeight) / Math.max(1, this.container.clientHeight);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    clearGroup(this.linesGroup);
    clearGroup(this.meshGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.updateCamera();
  }

  private updateCamera(): void {
    const aspect = Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    const c = this.camera;
    c.left = -this.halfHeight * aspect;
    c.right = this.halfHeight * aspect;
    c.top = this.halfHeight;
    c.bottom = -this.halfHeight;
    const dir = this.view === 'top' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, -1, 1).normalize();
    c.up.set(...((this.view === 'top' ? [0, 1, 0] : [0, 0, 1]) as [number, number, number]));
    c.position.copy(this.target).addScaledVector(dir, 10_000);
    c.lookAt(this.target);
    c.updateProjectionMatrix();
    this.requestRender();
  }

  private bindNavigation(): void {
    const el = this.renderer.domElement;
    el.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const before = this.screenToModel(ev.clientX, ev.clientY);
        this.halfHeight = Math.min(1e6, Math.max(0.01, this.halfHeight * Math.exp(ev.deltaY * 0.001)));
        this.updateCamera();
        const after = this.screenToModel(ev.clientX, ev.clientY);
        this.target.x += before[0] - after[0];
        this.target.y += before[1] - after[1];
        this.updateCamera();
      },
      { passive: false },
    );
    let last: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button === 1 || ev.button === 2) {
        last = { x: ev.clientX, y: ev.clientY };
        el.setPointerCapture(ev.pointerId);
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!last) return;
      const k = this.unitsPerPixel;
      this.target.x -= (ev.clientX - last.x) * k;
      this.target.y += (ev.clientY - last.y) * k;
      last = { x: ev.clientX, y: ev.clientY };
      this.updateCamera();
    });
    el.addEventListener('pointerup', () => (last = null));
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  private requestRender(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }
}

function makeLine(a: Vec3, b: Vec3, color: THREE.Color): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}

function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

function clearGroup(g: THREE.Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    disposeObject(c);
  }
}

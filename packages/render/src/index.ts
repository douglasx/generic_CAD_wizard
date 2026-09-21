import * as THREE from 'three';
import { LINETYPES, resolveStyle, visibleEntities, type CadDocument, type Entity, type Vec3 } from '@cadw/core';
import { flattenEntity } from '@cadw/geom2d';

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
  private preview: THREE.Object3D | null = null;
  private marker: THREE.Object3D | null = null;
  private halfHeight = 250; // mm visible above/below centre
  private readonly target = new THREE.Vector3(0, 0, 0);
  private view: ViewName = 'top';
  private lastDoc: CadDocument | null = null;
  private lastTolerance = 0;
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
    // Curves are flattened to a quarter of a pixel, so they stay smooth at any zoom.
    const tolerance = Math.max(this.unitsPerPixel * 0.25, 1e-6);
    for (const entity of visibleEntities(doc)) {
      const object = makeEntityObject(entity, resolveStyle(doc, entity), tolerance);
      if (object) this.linesGroup.add(object);
    }
    this.lastDoc = doc;
    this.requestRender();
  }

  /** Re-flattens curves after a zoom change so they never look faceted. */
  private refreshCurves(): void {
    if (this.lastDoc) this.setDocument(this.lastDoc);
  }

  /** Rubber-band entities for the active tool, drawn in the preview colour. */
  setPreviewEntities(entities: readonly Entity[]): void {
    if (this.preview) {
      this.scene.remove(this.preview);
      disposeObject(this.preview);
      this.preview = null;
    }
    if (entities.length > 0) {
      const group = new THREE.Group();
      const tolerance = Math.max(this.unitsPerPixel * 0.25, 1e-6);
      for (const e of entities) {
        const object = makeEntityObject(e, { color: '#4fc3f7', linetype: 'continuous' }, tolerance);
        if (object) group.add(object);
      }
      this.preview = group;
      this.scene.add(group);
    }
    this.requestRender();
  }

  /**
   * Object-snap marker (REQ-003.3): a fixed-size glyph per snap kind, drawn
   * on top of everything. Shapes follow AutoCAD: square endpoint, triangle
   * midpoint, circle centre, diamond quadrant, X intersection, ⊥ perpendicular,
   * hourglass nearest.
   */
  setSnapMarker(marker: { point: readonly [number, number]; kind: string } | null): void {
    if (this.marker) {
      this.scene.remove(this.marker);
      disposeObject(this.marker);
      this.marker = null;
    }
    if (marker) {
      const s = 7 * this.unitsPerPixel;
      const [x, y] = marker.point;
      const pts = markerOutline(marker.kind).map(([u, v]) => new THREE.Vector3(x + u * s, y + v * s, 0));
      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      const material = new THREE.LineBasicMaterial({ color: 0xffcc00, depthTest: false });
      const object = new THREE.LineSegments(geometry, material);
      object.renderOrder = 999;
      this.marker = object;
      this.scene.add(object);
    }
    this.requestRender();
  }

  /** Model point → client pixel coordinates (for tests and tooltips). */
  modelToScreen(x: number, y: number): [number, number] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
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
        // Only re-flatten when the scale changed enough to matter.
        const tol = this.unitsPerPixel * 0.25;
        if (this.lastTolerance === 0 || tol < this.lastTolerance / 2 || tol > this.lastTolerance * 2) {
          this.lastTolerance = tol;
          this.refreshCurves();
        }
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

/**
 * One entity as a three.js object. Lineweight is shown thin on screen
 * (AutoCAD's LWDISPLAY off); true widths appear in print (M3).
 * Dashed linetypes are drawn in model units, so patterns keep their real size.
 */
function makeEntityObject(entity: Entity, style: { color: string; linetype: string }, tolerance: number): THREE.Object3D | null {
  const points = flattenEntity(entity, tolerance);
  if (points.length < 2) return null;
  const z = entity.kind === 'line' ? entity.start[2] : 0;
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, z)));
  const pattern = LINETYPES[style.linetype] ?? [];
  if (pattern.length >= 2) {
    const line = new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({ color: new THREE.Color(style.color), dashSize: pattern[0], gapSize: pattern[1] }),
    );
    line.computeLineDistances();
    return line;
  }
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(style.color) }));
}

/** Unit-size marker glyphs as line-segment pairs, centred on the snap point. */
function markerOutline(kind: string): [number, number][] {
  const loop = (pts: [number, number][]) => pts.flatMap((p, i) => [p, pts[(i + 1) % pts.length]!]);
  switch (kind) {
    case 'endpoint':
      return loop([[-1, -1], [1, -1], [1, 1], [-1, 1]]);
    case 'midpoint':
      return loop([[-1, -0.8], [1, -0.8], [0, 1]]);
    case 'center':
      return loop(Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)] as [number, number]));
    case 'quadrant':
      return loop([[0, -1], [1, 0], [0, 1], [-1, 0]]);
    case 'intersection':
      return [[-1, -1], [1, 1], [-1, 1], [1, -1]];
    case 'perpendicular':
      return [[-1, -1], [1, -1], [-1, -1], [-1, 1], [-1, 0], [0, 0], [0, 0], [0, -1]];
    case 'nearest':
      return [[-1, -1], [1, 1], [1, 1], [-1, 1], [-1, 1], [1, -1], [1, -1], [-1, -1]];
    default:
      return loop([[-1, -1], [1, -1], [1, 1], [-1, 1]]);
  }
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

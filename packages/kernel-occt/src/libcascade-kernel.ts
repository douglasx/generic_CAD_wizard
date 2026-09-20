import {
  KernelError,
  type AttributeValue,
  type Attributes,
  type BoundingBox,
  type KernelAdapter,
  type KernelInfo,
  type MeshData,
  type ShapeId,
  type StepPart,
  type TessellateOptions,
} from '@cadw/kernel';
import type { OpenCascadeInstance, TDocStd_Document, TopoDS_Shape } from 'libcascade/single/init';
import { candidateAttributeNames, repairUtf8 } from './step-names.ts';

const LIBCASCADE_VERSION = '3.0.2';

/**
 * KernelAdapter over libcascade (OCCT 8.0.1). Owns every OCCT object it creates:
 * shapes live in `shapes` until released; temporaries are deleted before return.
 */
export class LibcascadeKernel implements KernelAdapter {
  private readonly shapes = new Map<ShapeId, TopoDS_Shape>();
  private nextId = 1;
  private fileCounter = 0;

  private readonly oc: OpenCascadeInstance;

  constructor(oc: OpenCascadeInstance) {
    this.oc = oc;
  }

  async info(): Promise<KernelInfo> {
    return { name: 'libcascade', version: `${LIBCASCADE_VERSION} (OCCT 8.0.1)` };
  }

  async makeBox(dx: number, dy: number, dz: number): Promise<ShapeId> {
    if (!(dx > 0 && dy > 0 && dz > 0)) throw new KernelError('Box dimensions must be positive', 'INVALID_ARGUMENT');
    const maker = new this.oc.BRepPrimAPI_MakeBox(dx, dy, dz);
    try {
      return this.store(maker.Shape());
    } finally {
      maker.delete();
    }
  }

  async volume(id: ShapeId): Promise<number> {
    const shape = this.get(id);
    const props = new this.oc.GProp_GProps();
    try {
      this.oc.BRepGProp.VolumeProperties(shape, props, false, false, false);
      return props.Mass();
    } finally {
      props.delete();
    }
  }

  async boundingBox(id: ShapeId): Promise<BoundingBox> {
    const shape = this.get(id);
    const box = new this.oc.Bnd_Box();
    try {
      this.oc.BRepBndLib.AddOptimal(shape, box, false, false);
      return {
        min: [box.GetXMin(), box.GetYMin(), box.GetZMin()],
        max: [box.GetXMax(), box.GetYMax(), box.GetZMax()],
      };
    } finally {
      box.delete();
    }
  }

  async tessellate(id: ShapeId, options: TessellateOptions = {}): Promise<MeshData> {
    const oc = this.oc;
    const shape = this.get(id);
    const mesher = new oc.BRepMesh_IncrementalMesh(shape, options.linearDeflection ?? 0.1, false, options.angularDeflection ?? 0.5, false);
    mesher.delete();
    const positions: number[] = [];
    const indices: number[] = [];
    const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    try {
      for (; explorer.More(); explorer.Next()) {
        const face = oc.TopoDS.Face(explorer.Current());
        const location = new oc.TopLoc_Location();
        const tri = oc.BRep_Tool.Triangulation(face, location, 0);
        if (!tri) {
          location.delete();
          face.delete();
          continue;
        }
        const trsf = location.Transformation();
        const reversed = face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
        const offset = positions.length / 3;
        for (let i = 1; i <= tri.NbNodes(); i++) {
          const p = tri.Node(i).Transformed(trsf);
          positions.push(p.X(), p.Y(), p.Z());
          p.delete();
        }
        for (let i = 1; i <= tri.NbTriangles(); i++) {
          const { theN1: a, theN2: b, theN3: c } = tri.Triangle(i).Get();
          if (reversed) indices.push(offset + a - 1, offset + c - 1, offset + b - 1);
          else indices.push(offset + a - 1, offset + b - 1, offset + c - 1);
        }
        trsf.delete();
        location.delete();
        face.delete();
      }
    } finally {
      explorer.delete();
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  }

  async exportStep(parts: readonly StepPart[]): Promise<string> {
    const oc = this.oc;
    const doc = this.newDocument();
    const tool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
    for (const part of parts) {
      const label = tool.AddShape(this.get(part.shape), false, true);
      oc.TDataStd_Name.Set(label, this.ext(part.name));
      const entries = Object.entries(part.attributes);
      if (entries.length > 0) {
        const props = tool.GetNamedProperties(label, true);
        for (const [key, attr] of entries) this.setAttribute(props, key, attr);
      }
    }
    const path = `/cadw-export-${++this.fileCounter}.step`;
    const writer = new oc.STEPCAFControl_Writer();
    try {
      writer.SetNameMode(true);
      writer.SetColorMode(true);
      writer.SetMetadataMode(true);
      const progress = new oc.Message_ProgressRange();
      const ok = writer.Perform(doc, path, progress);
      progress.delete();
      if (!ok) throw new KernelError('STEP export failed', 'STEP_WRITE_FAILED');
      const text = new TextDecoder().decode(oc.FS.readFile(path));
      oc.FS.unlink(path);
      return text;
    } finally {
      writer.delete();
    }
  }

  async importStep(text: string): Promise<StepPart[]> {
    const oc = this.oc;
    if (!text.includes('ISO-10303-21')) throw new KernelError('Not a STEP file', 'STEP_READ_FAILED');
    const path = `/cadw-import-${++this.fileCounter}.step`;
    oc.FS.writeFile(path, text);
    const doc = this.newDocument();
    const reader = new oc.STEPCAFControl_Reader();
    try {
      reader.SetNameMode(true);
      reader.SetColorMode(true);
      reader.SetMetaMode(true);
      const status = reader.ReadFile(path);
      if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new KernelError('STEP read failed', 'STEP_READ_FAILED');
      const progress = new oc.Message_ProgressRange();
      const ok = reader.Transfer(doc, progress);
      progress.delete();
      if (!ok) throw new KernelError('STEP transfer failed', 'STEP_READ_FAILED');
      const tool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
      const labels = new oc.NCollection_Sequence_TDF_Label();
      tool.GetFreeShapes(labels);
      const candidates = candidateAttributeNames(text);
      const parts: StepPart[] = [];
      for (let i = 1; i <= labels.Length(); i++) {
        const label = labels.Value(i);
        const shape = oc.XCAFDoc_ShapeTool.GetShape(label);
        const props = tool.GetNamedProperties(label, false);
        parts.push({
          shape: this.store(shape),
          name: this.labelName(label),
          attributes: props ? this.readAttributes(props, candidates) : {},
        });
      }
      labels.delete();
      return parts;
    } finally {
      reader.delete();
      try {
        oc.FS.unlink(path);
      } catch {
        /* already removed */
      }
    }
  }

  async release(ids: readonly ShapeId[]): Promise<void> {
    for (const id of ids) {
      const s = this.shapes.get(id);
      if (s) {
        s.delete();
        this.shapes.delete(id);
      }
    }
  }

  async liveHandles(): Promise<number> {
    return this.shapes.size;
  }

  // ---- helpers ----

  private store(shape: TopoDS_Shape): ShapeId {
    const id = `shape_${this.nextId++}` as ShapeId;
    this.shapes.set(id, shape);
    return id;
  }

  private get(id: ShapeId): TopoDS_Shape {
    const s = this.shapes.get(id);
    if (!s) throw new KernelError(`Unknown shape ${id}`, 'UNKNOWN_SHAPE');
    return s;
  }

  private newDocument(): TDocStd_Document {
    const app = this.oc.XCAFApp_Application.GetApplication();
    const doc = new this.oc.TDocStd_Document(this.ext('MDTV-XCAF'));
    app.InitDocument(doc);
    return doc;
  }

  private ext(s: string) {
    // isMultiByte = true: treat JS strings as UTF-8 so non-ASCII names survive.
    return new this.oc.TCollection_ExtendedString(s, true);
  }

  private str(ext: InstanceType<OpenCascadeInstance['TCollection_ExtendedString']>): string {
    const ascii = new this.oc.TCollection_AsciiString(ext, '?');
    try {
      return ascii.ToCString();
    } finally {
      ascii.delete();
    }
  }

  private labelName(label: InstanceType<OpenCascadeInstance['TDF_Label']>): string {
    const found = label.FindAttribute(this.oc.TDataStd_Name.GetID());
    if (!found.returnValue) return '';
    const attr = found.anAttribute as unknown as { Get(): InstanceType<OpenCascadeInstance['TCollection_ExtendedString']> };
    return this.str(attr.Get());
  }

  private setAttribute(props: InstanceType<OpenCascadeInstance['TDataStd_NamedData']>, key: string, attr: AttributeValue): void {
    const k = this.ext(key);
    switch (attr.kind) {
      case 'text':
        props.SetString(k, this.ext(attr.value));
        break;
      case 'real':
        props.SetReal(k, attr.value);
        break;
      case 'integer':
        if (!Number.isInteger(attr.value)) throw new KernelError(`Attribute ${key} is not an integer`, 'INVALID_ARGUMENT');
        props.SetInteger(k, attr.value);
        break;
    }
  }

  private readAttributes(props: InstanceType<OpenCascadeInstance['TDataStd_NamedData']>, names: readonly string[]): Attributes {
    const out: Record<string, AttributeValue> = {};
    for (const name of names) {
      const k = this.ext(name);
      if (props.HasString(k)) out[name] = { kind: 'text', value: repairUtf8(this.str(props.GetString(k))) };
      else if (props.HasInteger(k)) out[name] = { kind: 'integer', value: props.GetInteger(k) };
      else if (props.HasReal(k)) out[name] = { kind: 'real', value: props.GetReal(k) };
    }
    return out;
  }
}

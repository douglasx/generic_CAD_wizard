/**
 * KernelAdapter — the only way the rest of the app reaches a geometry kernel.
 * Implementations: @cadw/kernel-occt (libcascade). Every implementation must
 * pass the contract suite in ./contract.ts.
 */
export type ShapeId = string & { readonly __brand: 'ShapeId' };

export type AttributeValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'real'; readonly value: number }
  | { readonly kind: 'integer'; readonly value: number };

export type Attributes = Readonly<Record<string, AttributeValue>>;

export interface MeshData {
  /** xyz triples, mm */
  readonly positions: Float32Array;
  /** triangle vertex indices, counter-clockwise when viewed from outside */
  readonly indices: Uint32Array;
}

export interface BoundingBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface StepPart {
  readonly shape: ShapeId;
  readonly name: string;
  readonly attributes: Attributes;
}

export interface KernelInfo {
  readonly name: string;
  readonly version: string;
}

export interface TessellateOptions {
  /** chord deviation in mm (default 0.1) */
  readonly linearDeflection?: number;
  /** radians (default 0.5) */
  readonly angularDeflection?: number;
}

export interface KernelAdapter {
  info(): Promise<KernelInfo>;
  makeBox(dx: number, dy: number, dz: number): Promise<ShapeId>;
  volume(shape: ShapeId): Promise<number>;
  boundingBox(shape: ShapeId): Promise<BoundingBox>;
  tessellate(shape: ShapeId, options?: TessellateOptions): Promise<MeshData>;
  /** STEP AP214 text with names and user-defined attributes. */
  exportStep(parts: readonly StepPart[]): Promise<string>;
  /** Top-level parts from STEP text; caller owns the returned shapes. */
  importStep(text: string): Promise<StepPart[]>;
  release(shapes: readonly ShapeId[]): Promise<void>;
  /** Number of live kernel shapes (guardrail 5). */
  liveHandles(): Promise<number>;
}

export type KernelErrorCode = 'UNKNOWN_SHAPE' | 'INVALID_ARGUMENT' | 'STEP_READ_FAILED' | 'STEP_WRITE_FAILED' | 'KERNEL_FAILURE';

export class KernelError extends Error {
  readonly code: KernelErrorCode;

  constructor(message: string, code: KernelErrorCode) {
    super(message);
    this.code = code;
    this.name = 'KernelError';
  }
}

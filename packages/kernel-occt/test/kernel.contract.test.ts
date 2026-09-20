import { describe, expect, it } from 'vitest';
import { defineKernelContract } from '@cadw/kernel/contract';
import { createNodeKernel } from '../src/node.ts';
import { candidateAttributeNames, repairUtf8 } from '../src/step-names.ts';

defineKernelContract('libcascade', () => createNodeKernel());

describe('candidateAttributeNames', () => {
  it('extracts names from representation items and unescapes quotes', () => {
    const step = "#1=DESCRIPTIVE_REPRESENTATION_ITEM('material','AH36');\n#2=INTEGER_REPRESENTATION_ITEM('frame''s',42);\n#3=PROPERTY_DEFINITION('grade',$,#5);";
    expect(candidateAttributeNames(step)).toEqual(["frame's", 'grade', 'material']);
  });
});

describe('repairUtf8', () => {
  it('re-decodes UTF-8 read as Latin-1 and leaves real Latin-1 alone', () => {
    const mojibake = String.fromCharCode(...new TextEncoder().encode('厚度 °C'));
    expect(repairUtf8(mojibake)).toBe('厚度 °C');
    expect(repairUtf8('st\u00e5ltank')).toBe('st\u00e5ltank');
    expect(repairUtf8('plain')).toBe('plain');
  });
});

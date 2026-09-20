#!/usr/bin/env python3
"""SPIKE S-01: measure raw / gzip / brotli size of candidate OCCT WASM builds.

Usage: python3 tools/spikes/kernel_size.py   (needs npm and `pip install brotli`)
"""
import gzip, pathlib, subprocess, sys, tarfile, tempfile

try:
    import brotli
except ImportError:
    sys.exit("pip install brotli")

CANDIDATES = {
    "occt-wasm@5.3.2": "package/dist/occt-wasm.wasm",
    "libcascade@3.0.2": "package/dist/opencascade_single.wasm",
}

with tempfile.TemporaryDirectory() as tmp:
    print(f"| Package | Raw MB | gzip MB | brotli MB |\n| --- | --- | --- | --- |")
    for spec, member in CANDIDATES.items():
        out = subprocess.run(["npm", "pack", spec, "--silent"], cwd=tmp, check=True, capture_output=True, text=True)
        tgz = pathlib.Path(tmp) / out.stdout.strip().splitlines()[-1]
        with tarfile.open(tgz) as t:
            data = t.extractfile(member).read()
        mb = lambda n: f"{n / 1e6:.1f}"
        print(f"| {spec} | {mb(len(data))} | {mb(len(gzip.compress(data, 9)))} | {mb(len(brotli.compress(data, quality=11)))} |")

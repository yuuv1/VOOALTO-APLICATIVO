#!/usr/bin/env python3
"""Rasteriza um SVG em PNG para inspeção visual (dev)."""
import sys, pathlib, resvg_py
src, dst = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 900
data = pathlib.Path(src).read_text(encoding='utf-8')
png = resvg_py.svg_to_bytes(svg_string=data, width=w, background='#0b0d10')
pathlib.Path(dst).write_bytes(bytes(png))
print('ok', dst)

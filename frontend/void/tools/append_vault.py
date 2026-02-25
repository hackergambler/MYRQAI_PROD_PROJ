#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) < 4:
    print("Usage: append_vault.py <input_png> <vault_txt> <output_png>")
    raise SystemExit(1)

inp = Path(sys.argv[1]).read_bytes()
vault = Path(sys.argv[2]).read_bytes()
out = Path(sys.argv[3])

out.write_bytes(inp + b"\n" + vault + b"\n")
print("Wrote:", out)

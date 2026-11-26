"""Repair the hackathon mock data and write a clean, valid JSON copy.

The provided file is missing one closing brace per record: `zieladresse` is
closed at the wrong indent and `behandlung` is never closed. The indentation
shows the intended structure, so we insert the missing `}` after each
`zieladresse."ort"` line.

Usage:  python3 scripts/repair_json.py
Input:  data/raw/update_vollständig_testdatensatz_20.json  (left untouched)
Output: data/clean/testdatensatz_20.json
"""
import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# glob avoids macOS NFD/NFC trouble with the "ä" in the filename
src = Path(glob.glob(str(ROOT / "data/raw/update_vollst*ndig_testdatensatz_20.json"))[0])
dst = ROOT / "data/clean/testdatensatz_20.json"

lines = src.read_text(encoding="utf-8").split("\n")
out, fixes = [], 0
for i, line in enumerate(lines):
    out.append(line)
    nxt = lines[i + 1] if i + 1 < len(lines) else ""
    if re.match(r'^ {12}"ort":', line) and re.match(r"^ {8}\},?$", nxt):
        out.append(" " * 10 + "}")
        fixes += 1

data = json.loads("\n".join(out))
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"inserted {fixes} braces, {len(data['testdaten'])} records -> {dst.relative_to(ROOT)}")

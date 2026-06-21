"""BOSS GX-1 .tsl patch file reader/writer.

Usage (via tonesmith):
  python3 -m tonesmith gx1 new   <file.tsl> [set_name] [n_patches]
                                             # create a new TSL file with blank patches
  python3 -m tonesmith gx1 read  <file.tsl> [index|name]
                                             # print all patches (or one by index/name)
  python3 -m tonesmith gx1 write <file.tsl> <index|name> <block> <field>=<value> ...
                                             # edit a field and save in-place
  python3 -m tonesmith gx1 copy  <src.tsl> <src_idx|name> <dst.tsl> <dst_idx|name>
                                             # copy one patch into another file
"""

import sys
from pathlib import Path
from .tsl import read_tsl, write_tsl, new_tsl, blank_patch
from .codec import decode_patch, encode_patch


def _fmt(d):
    return "  ".join(f"{k}={v}" for k, v in d.items() if not k.startswith("_"))

def print_patch(p, index=None):
    label = f"[{index}] " if index is not None else ""
    print(f"\n{'━'*52}")
    print(f"  {label}{p['name']}")
    print(f"{'━'*52}")
    print(f"  Chain: {' → '.join(p['chain'])}")

    a = p["amp"]
    print(f"\n  AMP/CAB [{'ON' if a['on'] else 'OFF'}]  {a['type']}")
    print(f"    Gain={a['gain']}  Level={a['level']}  Bass={a['bass']}  Mid={a['middle']}  Treble={a['treble']}")
    print(f"    Speaker={a['speaker']}  Mic={a['mic']}")

    od = p["odds"]
    if od["on"]:
        print(f"\n  OD/DS [ON]  {od['type']}  Drive={od['drive']}  Tone={od['tone']}  Level={od['level']}  Direct={od['direct']}")

    ns = p["ns"]
    print(f"\n  NS [{'ON' if ns['on'] else 'OFF'}]  Threshold={ns['threshold']}  Release={ns['release']}  Detect={ns['detect']}")

    for slot in ("fx1", "fx2", "fx3"):
        fx = p[slot]
        lbl = fx["type"] + (f" ({fx['subtype']})" if fx.get("subtype") else "")
        print(f"\n  {slot.upper()} [{'ON' if fx['on'] else 'OFF'}]  {lbl}")
        params = {k: v for k, v in fx.get("params", {}).items() if not k.startswith("_")}
        if params:
            print(f"    {_fmt(params)}")

    dly = p["delay"]
    print(f"\n  DELAY [{'ON' if dly['on'] else 'OFF'}]  {dly['type']}")
    dly_params = {k: v for k, v in dly.items() if k not in ("on","type","_raw")}
    if dly_params:
        print(f"    {_fmt(dly_params)}")

    rev = p["reverb"]
    print(f"\n  REVERB [{'ON' if rev['on'] else 'OFF'}]  {rev['type']}")
    rev_params = {k: v for k, v in rev.items() if k not in ("on","type","_raw")}
    if rev_params:
        print(f"    {_fmt(rev_params)}")

    fv = p["fv"]
    print(f"\n  FV  Position={fv['position']}  Min={fv['min']}  Max={fv['max']}  Curve={fv['curve']}")


def _resolve_index(patches, ref):
    """Accept an integer index or a patch name (case-insensitive). Raises on no match."""
    try:
        return int(ref)
    except ValueError:
        needle = ref.lower()
        matches = [i for i, p in enumerate(patches) if p["name"].strip().lower() == needle]
        if not matches:
            raise SystemExit(f"No patch named {ref!r}")
        if len(matches) > 1:
            raise SystemExit(f"Ambiguous name {ref!r} — matches indices {matches}")
        return matches[0]

def _usage():
    print(__doc__)

def main(argv=None):
    if argv is None:
        argv = sys.argv[1:]

    if len(argv) < 2:
        _usage(); return

    cmd = argv[0]

    if cmd == "read":
        tsl = read_tsl(argv[1])
        print(f"File: {argv[1]}  |  Set: {tsl['name']}  |  Device: {tsl['device']}")
        indices = [_resolve_index(tsl["patches"], argv[2])] if len(argv) > 2 else range(len(tsl["patches"]))
        for i in indices:
            print_patch(tsl["patches"][i], i)
        print()

    elif cmd == "write":
        if len(argv) < 5:
            print("Usage: tonesmith gx1 write <file> <patch_index> <block> <field>=<value> ..."); return
        path = argv[1]; block = argv[3]
        tsl = read_tsl(path)
        idx = _resolve_index(tsl["patches"], argv[2])
        patch = tsl["patches"][idx]
        for kv in argv[4:]:
            k, v = kv.split("=", 1)
            try: v = int(v)
            except ValueError:
                try: v = float(v)
                except ValueError: pass
            parts = (block + "." + k).split(".")
            target = patch
            for part in parts[:-1]:
                target = target[part]
            target[parts[-1]] = v
        write_tsl(tsl, path)
        print(f"Wrote {path} — patch {idx} {block} updated")

    elif cmd == "copy":
        if len(argv) < 5:
            print("Usage: tonesmith gx1 copy <src.tsl> <src_idx> <dst.tsl> <dst_idx>"); return
        src = read_tsl(argv[1])
        dst = read_tsl(argv[3])
        src_idx = _resolve_index(src["patches"], argv[2])
        dst_idx = _resolve_index(dst["patches"], argv[4])
        dst["patches"][dst_idx] = src["patches"][src_idx]
        write_tsl(dst, argv[3])
        print(f"Copied '{src['patches'][src_idx]['name']}' → {argv[3]} patch {dst_idx}")

    elif cmd == "new":
        if len(argv) < 2:
            print("Usage: tonesmith gx1 new <file.tsl> [set_name] [n_patches]"); return
        path = argv[1]
        set_name = argv[2] if len(argv) > 2 else Path(path).stem
        n = int(argv[3]) if len(argv) > 3 else 1
        if Path(path).exists():
            raise SystemExit(f"{path} already exists — refusing to overwrite")
        tsl = new_tsl(set_name, n)
        write_tsl(tsl, path)
        print(f"Created {path} — {n} blank patch(es), set name '{set_name}'")

    else:
        _usage()

if __name__ == "__main__":
    main()

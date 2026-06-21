import json
from pathlib import Path
from .codec import decode_patch, encode_patch, _b, _h


def _blank_paramset():
    z251 = _h([0] * 251)
    # Default chain: PFX > FX1 > OD/DS > NS > AMP > FV > FX2 > FX3 > DLY > REV > INPUT > LOOP > OUTPUT
    chain = [1, 2, 3, 7, 8, 6, 9, 4, 5, 10, 0, 11, 12]
    ps = {
        "MEMORY%COM":     _h([0x20] * 16),
        "MEMORY%CHAIN":   _h(chain),
        "MEMORY%FX1_COM": _h([0, 0, 0]),
        "MEMORY%FX1":     z251,
        "MEMORY%FX2_COM": _h([0, 0, 0]),
        "MEMORY%FX2":     z251,
        "MEMORY%FX3_COM": _h([0, 0, 0]),
        "MEMORY%FX3":     z251,
        "MEMORY%FX3A":    _h([0] * 5),
        "MEMORY%ODDS":    _h([0] * 8),
        # AMP: on=1, type=TRNSPRNT(0), ?=0, gain=50, level=100, bass=50, mid=50, treble=50, sp=ORIGINAL(1), ?=0, mic=DYN57(0), ?=0, ?=0
        "MEMORY%AMP":     _h([1, 0, 0, 50, 100, 50, 50, 50, 1, 0, 0, 0, 0]),
        "MEMORY%DLY":     _h([0] * 29),
        "MEMORY%REV":     _h([0] * 20),
        "MEMORY%PFX":     _h([0] * 14),
        # FV: position=100, min=0, max=100, curve=NORMAL(2)
        "MEMORY%FV":      _h([100, 0, 100, 2]),
        # NS: off, threshold=20, release=20, detect=INPUT(0)
        "MEMORY%NS":      _h([0, 20, 20, 0]),
        "MEMORY%OTHER":   _h([0] * 7),
        "MEMORY%CTL":     _h([0] * 32),
    }
    for i in range(1, 9):
        ps[f"MEMORY%ASGN{i}"] = _h([0] * 15)
    return ps

def blank_patch(name="NEW PATCH"):
    ps = _blank_paramset()
    return decode_patch({"memo": "", "paramSet": ps})

def new_tsl(set_name, n_patches=1):
    patches = [blank_patch() for _ in range(n_patches)]
    raw = {"name": set_name, "formatRev": "0000", "device": "GX-1", "data": [[], []]}
    return {"name": set_name, "format_rev": "0000", "device": "GX-1",
            "patches": patches, "_raw": raw}

def read_tsl(path):
    with open(path) as f:
        raw = json.load(f)
    return {
        "name": raw["name"], "format_rev": raw["formatRev"], "device": raw["device"],
        "patches": [decode_patch(r) for r in raw["data"][0]],
        "_raw": raw,
    }

def write_tsl(tsl, path):
    raw = dict(tsl["_raw"])
    raw["name"] = tsl["name"]; raw["formatRev"] = tsl["format_rev"]
    raw["data"][0] = [encode_patch(p) for p in tsl["patches"]]
    with open(path, "w") as f:
        json.dump(raw, f, indent=4)

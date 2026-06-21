from .constants import (
    FX_TYPES, FX_TYPE_IDX,
    ODDS_TYPES, ODDS_IDX,
    AMP_TYPES, AMP_TYPE_IDX,
    SP_TYPES, SP_TYPE_IDX,
    MIC_TYPES, MIC_TYPE_IDX,
    DLY_TYPES, DLY_TYPE_IDX,
    REV_TYPES, REV_TYPE_IDX,
    CHAIN_NAMES, CHAIN_IDS,
    FX_SUBTYPE_LISTS,
    _WAH_TYPES, _ROTARY_SPEED, _FB_MODE, _RING_INTL, _HUM_VOWELS,
    _SBEND_PITCH, _SLICER_PAT, _HARMONIST_HR, _HARMONIST_KEY,
    _TWIST_MODES, _NS_DETECT, _FV_CURVE,
)

_idx = lambda lst: {v: i for i, v in enumerate(lst)}


# ── low-level helpers ────────────────────────────────────────────────────────

def _b(hex_list):
    return [int(x, 16) for x in hex_list]

def _h(byte_list):
    return [f"{b:02X}" for b in byte_list]

def _lk(table, i, label=""):
    return table[i] if 0 <= i < len(table) else f"UNKNOWN_{label}{i}"

def _li(table_dict, name, label=""):
    if name not in table_dict:
        raise ValueError(f"Unknown {label}: {name!r}. Valid: {list(table_dict)}")
    return table_dict[name]

def _signed(raw, centre=50):
    return raw - centre

def _unsigned(val, centre=50):
    return val + centre


# ── FX type encode/decode ────────────────────────────────────────────────────

def decode_fx_type(hi, lo):
    fx = _lk(FX_TYPES, hi, "FX")
    lst = FX_SUBTYPE_LISTS.get(fx)
    sub = _lk(lst, lo) if lst else None
    return fx, sub

def encode_fx_type(fx_name, subtype=None):
    hi = _li(FX_TYPE_IDX, fx_name, "FX type")
    lst = FX_SUBTYPE_LISTS.get(fx_name)
    if lst and subtype is not None:
        lo = _li(_idx(lst), subtype, f"{fx_name} subtype")
    else:
        lo = 0
    return hi, lo


# ── FX parameter decode (251-byte block) ─────────────────────────────────────

def _decode_fx_params(fx, sub, p):
    """p is a list of ints (the 251-byte FX block)."""

    if fx == "COMPRESSOR":
        return {"sustain": p[0], "attack": p[1], "level": p[2]}

    if fx == "LIMITER":
        return {"threshold": p[0], "ratio": p[1], "level": p[2], "attack": p[3], "release": p[4]}

    if fx == "ENHANCER":
        return {"sens": p[0], "low": p[1], "low_freq": p[2],
                "high": p[3], "high_freq": p[4], "level": p[5]}

    if fx == "TOUCH WAH":
        return {"filter": ["LPF","BPF","HPF"][p[0]], "polarity": ["DOWN","UP"][p[1]],
                "sens": p[2], "level": p[3], "freq": p[4], "reso": p[5], "decay": p[6]}

    if fx == "AUTO WAH":
        return {"filter": ["LPF","BPF","HPF"][p[0]], "rate": p[1], "depth": p[2],
                "level": p[3], "freq": p[4], "reso": p[5]}

    if fx == "FIXED WAH":
        return {"wah_type": _lk(_WAH_TYPES, p[0]), "freq": p[1], "level": p[2], "direct": p[3]}

    if fx == "DEFRETTER":
        return {"sens": p[0], "depth": p[1], "tone": _signed(p[2]),
                "level": p[3], "attack": p[4], "reso": p[5], "direct": p[6]}

    if fx == "SLOW GEAR":
        return {"sens": p[0], "rise_time": p[1], "level": p[2]}

    if fx == "AC. GTR SIM":
        return {"body": p[0], "low": _signed(p[1]), "high": _signed(p[2]), "level": p[3]}

    if fx == "AC RESO":
        return {"reso": p[0], "tone": _signed(p[1]), "level": p[2]}

    if fx == "SITAR SIM":
        return {"sens": p[0], "depth": p[1], "tone": _signed(p[2]),
                "level": p[3], "reso": p[4], "buzz": p[5], "direct": p[6]}

    if fx == "FEEDBACKER":
        return {"mode": _lk(_FB_MODE, p[0]), "trigger": p[1], "depth": p[2],
                "rise_time": p[3], "oct_rise_tm": p[4], "feedback": p[5], "oct_feedback": p[6]}

    if fx == "OD/DS":
        return {"type": sub, "drive": p[0], "tone": _signed(p[1]), "level": p[2], "direct": p[3]}

    if fx == "PARA. EQ":
        return {"level": _signed(p[0], 20), "low_gain": _signed(p[1], 20),
                "mid_gain": _signed(p[2], 20), "high_gain": _signed(p[3], 20),
                "low_cut": p[4], "mid_freq": p[5], "high_cut": p[6]}

    if fx == "GEQ":
        bands = ["125Hz","250Hz","500Hz","1kHz","2kHz","4kHz"]
        return {b: _signed(p[i]) for i, b in enumerate(bands)} | {"level": _signed(p[6], 20)}

    if fx == "LOW GEQ":
        bands = ["63Hz","125Hz","250Hz","500Hz","1kHz","2kHz"]
        return {b: _signed(p[i]) for i, b in enumerate(bands)} | {"level": _signed(p[6], 20)}

    if fx == "HIGH GEQ":
        bands = ["250Hz","500Hz","1kHz","2kHz","4kHz","8kHz"]
        return {b: _signed(p[i]) for i, b in enumerate(bands)} | {"level": _signed(p[6], 20)}

    if fx == "CHORUS":
        return {"rate": p[0], "depth": p[1], "level": p[2], "pre_delay": p[3]}

    if fx == "FLANGER":
        return {"rate": p[0], "depth": p[1], "manual": p[2], "reso": p[3], "level": p[4]}

    if fx == "PHASER":
        return {"stage": p[0]*2+2, "rate": p[1], "depth": p[2],
                "reso": p[3], "manual": p[4], "level": p[5]}

    if fx == "SCRIPT PH":
        return {"rate": p[0], "depth": p[1], "level": p[2]}

    if fx == "CLASSIC-VIBE":
        return {"rate": p[0], "depth": p[1], "level": p[2]}

    if fx == "ROTARY":
        return {"speed": _lk(_ROTARY_SPEED, p[0]), "slow_rate": p[1], "fast_rate": p[2],
                "level": p[3], "balance": p[4], "drive": p[5]}

    if fx == "VIBRATO":
        return {"rate": p[0], "depth": p[1], "level": p[2], "rise_time": p[3], "trigger": p[4]}

    if fx == "TREMOLO":
        return {"rate": p[0], "depth": p[1], "level": p[2]}

    if fx == "SLICER":
        return {"pattern": _lk(_SLICER_PAT, p[0]), "rate": p[1],
                "level": p[2], "attack": p[3], "duty": p[4]}

    if fx == "OVERTONE":
        return {"lower": p[0], "upper": p[1], "unison": p[2], "direct": p[3], "detune": p[4]}

    if fx == "PAN":
        return {"rate": p[0], "depth": p[1], "level": p[2]}

    if fx == "RING MOD":
        return {"intelligent": _lk(_RING_INTL, p[0]), "freq": p[1], "mod_rate": p[2],
                "mod_depth": p[3], "level": p[4], "direct": p[5]}

    if fx == "HUMANIZER":
        return {"vowel1": _lk(_HUM_VOWELS, p[0]), "vowel2": _lk(_HUM_VOWELS, p[1]),
                "sens": p[2], "rate": p[3], "manual": p[4], "level": p[5]}

    if fx == "PITCH SHIFT":
        return {"pitch": p[0] - 24, "mode": p[1], "level": p[2],
                "pre_delay": p[3], "feedback": p[4], "direct": p[5]}

    if fx == "HARMONIST":
        return {"harmony": _lk(_HARMONIST_HR, p[0]) if p[0] < len(_HARMONIST_HR) else p[0],
                "key": _lk(_HARMONIST_KEY, p[1]), "level": p[2],
                "pre_delay": p[3], "feedback": p[4], "direct": p[5]}

    if fx == "OCTAVE":
        return {"minus2_oct": p[0], "minus1_oct": p[1], "direct": p[2]}

    if fx == "HEAVY OCT":
        return {"minus2_oct": p[0], "minus1_oct": p[1], "direct": p[2]}

    if fx == "S-BEND":
        return {"trigger": p[0], "pitch": _lk(_SBEND_PITCH, p[1]),
                "rise_time": p[2], "fall_time": p[3]}

    if fx == "PEDAL BEND":
        return {"pitch_min": p[0] - 24, "pitch_max": p[1] - 24,
                "pdl_pos": p[2], "level": p[3], "direct": p[4]}

    if fx == "TUNE DOWN":
        return {"pitch": p[0] - 12}

    if fx == "DELAY":
        return {"time_ms": (p[0] << 8) | p[1], "feedback": p[2], "level": p[3],
                "high_cut": p[4], "direct": p[5]}

    if fx == "REVERB":
        return {"type": _lk(REV_TYPES, p[0]), "time_s": round(p[1] * 0.1, 1),
                "pre_delay_ms": p[2], "level": p[3], "direct": p[4]}

    return {"_raw": p[:32]}


# ── FX parameter encode (dict → 251-byte block) ──────────────────────────────

def _encode_fx_params(fx, sub, d, original_raw):
    """Return a hex list of 251 bytes. Uses original_raw as a base so untouched
    bytes are preserved. d is the decoded params dict."""
    p = list(original_raw)

    if "_raw" in d:
        return _h(p)

    def _s(key, centre=50): return _unsigned(d[key], centre)

    if fx == "COMPRESSOR":
        p[0]=d["sustain"]; p[1]=d["attack"]; p[2]=d["level"]

    elif fx == "LIMITER":
        p[0]=d["threshold"]; p[1]=d["ratio"]; p[2]=d["level"]; p[3]=d["attack"]; p[4]=d["release"]

    elif fx == "ENHANCER":
        p[0]=d["sens"]; p[1]=d["low"]; p[2]=d["low_freq"]; p[3]=d["high"]; p[4]=d["high_freq"]; p[5]=d["level"]

    elif fx == "TOUCH WAH":
        p[0]=["LPF","BPF","HPF"].index(d["filter"]); p[1]=["DOWN","UP"].index(d["polarity"])
        p[2]=d["sens"]; p[3]=d["level"]; p[4]=d["freq"]; p[5]=d["reso"]; p[6]=d["decay"]

    elif fx == "AUTO WAH":
        p[0]=["LPF","BPF","HPF"].index(d["filter"]); p[1]=d["rate"]; p[2]=d["depth"]
        p[3]=d["level"]; p[4]=d["freq"]; p[5]=d["reso"]

    elif fx == "FIXED WAH":
        p[0]=_li(_idx(_WAH_TYPES), d["wah_type"], "WAH type"); p[1]=d["freq"]; p[2]=d["level"]; p[3]=d["direct"]

    elif fx == "DEFRETTER":
        p[0]=d["sens"]; p[1]=d["depth"]; p[2]=_s("tone"); p[3]=d["level"]; p[4]=d["attack"]; p[5]=d["reso"]; p[6]=d["direct"]

    elif fx == "SLOW GEAR":
        p[0]=d["sens"]; p[1]=d["rise_time"]; p[2]=d["level"]

    elif fx == "AC. GTR SIM":
        p[0]=d["body"]; p[1]=_s("low"); p[2]=_s("high"); p[3]=d["level"]

    elif fx == "AC RESO":
        p[0]=d["reso"]; p[1]=_s("tone"); p[2]=d["level"]

    elif fx == "SITAR SIM":
        p[0]=d["sens"]; p[1]=d["depth"]; p[2]=_s("tone"); p[3]=d["level"]; p[4]=d["reso"]; p[5]=d["buzz"]; p[6]=d["direct"]

    elif fx == "FEEDBACKER":
        p[0]=_li(_idx(_FB_MODE), d["mode"], "FB mode"); p[1]=d["trigger"]; p[2]=d["depth"]
        p[3]=d["rise_time"]; p[4]=d["oct_rise_tm"]; p[5]=d["feedback"]; p[6]=d["oct_feedback"]

    elif fx == "OD/DS":
        p[0]=d["drive"]; p[1]=_s("tone"); p[2]=d["level"]; p[3]=d["direct"]

    elif fx == "PARA. EQ":
        p[0]=_unsigned(d["level"], 20); p[1]=_unsigned(d["low_gain"], 20)
        p[2]=_unsigned(d["mid_gain"], 20); p[3]=_unsigned(d["high_gain"], 20)
        p[4]=d["low_cut"]; p[5]=d["mid_freq"]; p[6]=d["high_cut"]

    elif fx == "GEQ":
        for i, b in enumerate(["125Hz","250Hz","500Hz","1kHz","2kHz","4kHz"]): p[i]=_s(b)
        p[6]=_unsigned(d["level"], 20)

    elif fx == "LOW GEQ":
        for i, b in enumerate(["63Hz","125Hz","250Hz","500Hz","1kHz","2kHz"]): p[i]=_s(b)
        p[6]=_unsigned(d["level"], 20)

    elif fx == "HIGH GEQ":
        for i, b in enumerate(["250Hz","500Hz","1kHz","2kHz","4kHz","8kHz"]): p[i]=_s(b)
        p[6]=_unsigned(d["level"], 20)

    elif fx == "CHORUS":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["level"]; p[3]=d["pre_delay"]

    elif fx == "FLANGER":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["manual"]; p[3]=d["reso"]; p[4]=d["level"]

    elif fx == "PHASER":
        p[0]=(d["stage"]-2)//2; p[1]=d["rate"]; p[2]=d["depth"]; p[3]=d["reso"]; p[4]=d["manual"]; p[5]=d["level"]

    elif fx == "SCRIPT PH":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["level"]

    elif fx == "CLASSIC-VIBE":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["level"]

    elif fx == "ROTARY":
        p[0]=_li(_idx(_ROTARY_SPEED), d["speed"], "ROTARY speed"); p[1]=d["slow_rate"]; p[2]=d["fast_rate"]
        p[3]=d["level"]; p[4]=d["balance"]; p[5]=d["drive"]

    elif fx == "VIBRATO":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["level"]; p[3]=d["rise_time"]; p[4]=d["trigger"]

    elif fx == "TREMOLO":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["level"]

    elif fx == "SLICER":
        p[0]=_li(_idx(_SLICER_PAT), d["pattern"], "SLICER pattern"); p[1]=d["rate"]; p[2]=d["level"]; p[3]=d["attack"]; p[4]=d["duty"]

    elif fx == "OVERTONE":
        p[0]=d["lower"]; p[1]=d["upper"]; p[2]=d["unison"]; p[3]=d["direct"]; p[4]=d["detune"]

    elif fx == "PAN":
        p[0]=d["rate"]; p[1]=d["depth"]; p[2]=d["level"]

    elif fx == "RING MOD":
        p[0]=_li(_idx(_RING_INTL), d["intelligent"], "RING MOD intelligent"); p[1]=d["freq"]
        p[2]=d["mod_rate"]; p[3]=d["mod_depth"]; p[4]=d["level"]; p[5]=d["direct"]

    elif fx == "HUMANIZER":
        p[0]=_li(_idx(_HUM_VOWELS), d["vowel1"], "vowel1")
        p[1]=_li(_idx(_HUM_VOWELS), d["vowel2"], "vowel2"); p[2]=d["sens"]
        p[3]=d["rate"]; p[4]=d["manual"]; p[5]=d["level"]

    elif fx == "PITCH SHIFT":
        p[0]=d["pitch"]+24; p[1]=d["mode"]; p[2]=d["level"]; p[3]=d["pre_delay"]; p[4]=d["feedback"]; p[5]=d["direct"]

    elif fx == "HARMONIST":
        hr_idx = _HARMONIST_HR.index(d["harmony"]) if d["harmony"] in _HARMONIST_HR else int(d["harmony"])
        p[0]=hr_idx; p[1]=_li(_idx(_HARMONIST_KEY), d["key"], "HARMONIST key")
        p[2]=d["level"]; p[3]=d["pre_delay"]; p[4]=d["feedback"]; p[5]=d["direct"]

    elif fx == "OCTAVE":
        p[0]=d["minus2_oct"]; p[1]=d["minus1_oct"]; p[2]=d["direct"]

    elif fx == "HEAVY OCT":
        p[0]=d["minus2_oct"]; p[1]=d["minus1_oct"]; p[2]=d["direct"]

    elif fx == "S-BEND":
        p[0]=d["trigger"]; p[1]=_li(_idx(_SBEND_PITCH), d["pitch"], "S-BEND pitch"); p[2]=d["rise_time"]; p[3]=d["fall_time"]

    elif fx == "PEDAL BEND":
        p[0]=d["pitch_min"]+24; p[1]=d["pitch_max"]+24; p[2]=d["pdl_pos"]; p[3]=d["level"]; p[4]=d["direct"]

    elif fx == "TUNE DOWN":
        p[0]=d["pitch"]+12

    elif fx == "DELAY":
        p[0]=d["time_ms"]>>8; p[1]=d["time_ms"]&0xFF; p[2]=d["feedback"]; p[3]=d["level"]; p[4]=d["high_cut"]; p[5]=d["direct"]

    elif fx == "REVERB":
        p[0]=_li(REV_TYPE_IDX, d["type"], "REV type"); p[1]=round(d["time_s"]/0.1); p[2]=d["pre_delay_ms"]; p[3]=d["level"]; p[4]=d["direct"]

    return _h(p)


# ── block decoders/encoders ──────────────────────────────────────────────────

def _decode_name(hl):
    return bytes.fromhex("".join(hl)).decode("ascii", errors="replace").rstrip()

def _encode_name(name, length=16):
    b = name.encode("ascii", errors="replace")[:length].ljust(length, b" ")
    return _h(list(b))

def _decode_chain(hl):
    return [CHAIN_NAMES.get(v, f"?{v}") for v in _b(hl)]

def _encode_chain(names):
    return _h([CHAIN_IDS.get(n, 0) for n in names])

def _decode_amp(hl):
    b = _b(hl)
    return {
        "on": bool(b[0]), "type": _lk(AMP_TYPES, b[1]),
        "gain": b[3], "level": b[4], "bass": b[5], "middle": b[6], "treble": b[7],
        "speaker": _lk(SP_TYPES, b[8]), "mic": _lk(MIC_TYPES, b[10]),
        "_raw": b,
    }

def _encode_amp(d):
    b = list(d["_raw"])
    b[0]=int(d["on"]); b[1]=_li(AMP_TYPE_IDX, d["type"], "AMP type")
    b[3]=d["gain"]; b[4]=d["level"]; b[5]=d["bass"]
    b[6]=d["middle"]; b[7]=d["treble"]
    b[8]=_li(SP_TYPE_IDX, d["speaker"], "SP type"); b[10]=_li(MIC_TYPE_IDX, d["mic"], "MIC type")
    return _h(b)

def _decode_ns(hl):
    b = _b(hl)
    return {"on": bool(b[0]), "threshold": b[1], "release": b[2],
            "detect": _lk(_NS_DETECT, b[3]), "_raw": b}

def _encode_ns(d):
    b = list(d["_raw"])
    b[0]=int(d["on"]); b[1]=d["threshold"]; b[2]=d["release"]
    b[3]=_NS_DETECT.index(d["detect"]) if d["detect"] in _NS_DETECT else b[3]
    return _h(b)

def _decode_odds(hl):
    b = _b(hl)
    return {"on": bool(b[0]), "type": _lk(ODDS_TYPES, b[1]),
            "drive": b[2], "tone": _signed(b[3]), "level": b[4], "direct": b[7], "_raw": b}

def _encode_odds(d):
    b = list(d["_raw"])
    b[0] = int(d["on"]); b[1] = _li(ODDS_IDX, d["type"], "OD/DS type")
    b[2] = d["drive"]; b[3] = _unsigned(d["tone"]); b[4] = d["level"]; b[7] = d["direct"]
    return _h(b)

def _decode_fv(hl):
    b = _b(hl)
    return {"position": b[0], "min": b[1], "max": b[2],
            "curve": _lk(_FV_CURVE, b[3]) if len(b) > 3 else "NORMAL", "_raw": b}

def _encode_fv(d):
    b = list(d["_raw"])
    b[0]=d["position"]; b[1]=d["min"]; b[2]=d["max"]
    if len(b) > 3:
        b[3] = _FV_CURVE.index(d["curve"]) if d["curve"] in _FV_CURVE else b[3]
    return _h(b)

def _decode_fx_com(hl):
    b = _b(hl)
    fx, sub = decode_fx_type(b[1], b[2])
    return {"on": bool(b[0]), "type": fx, "subtype": sub, "_raw": b}

def _encode_fx_com(d):
    b = list(d["_raw"])
    b[0] = int(d["on"])
    b[1], b[2] = encode_fx_type(d["type"], d.get("subtype"))
    return _h(b)

def _decode_dly(hl):
    b = _b(hl)
    t = _lk(DLY_TYPES, b[1])
    d = {"on": bool(b[0]), "type": t, "_raw": b}
    p = b[2:]
    if t in ("STANDARD", "ANALOG"):
        d |= {"time_ms": (p[0]<<8)|p[1], "feedback": p[2], "level": p[3], "high_cut": p[4]}
    elif t in ("MODULATE", "ANLG MOD"):
        d |= {"time_ms": (p[0]<<8)|p[1], "feedback": p[2], "level": p[3],
               "high_cut": p[4], "mod_rate": p[5], "mod_depth": p[6]}
    elif t == "PAN":
        d |= {"time_ms": (p[0]<<8)|p[1], "feedback": p[2], "level": p[3],
               "high_cut": p[4], "tap_time": p[5]}
    elif t == "REVERSE":
        d |= {"time_ms": (p[0]<<8)|p[1], "feedback": p[2], "level": p[3],
               "high_cut": p[4], "trigger": p[5]}
    elif t == "SPACE ECHO":
        d |= {"time_ms": (p[0]<<8)|p[1], "feedback": p[2], "level": p[3],
               "high_cut": p[4], "head": p[5]}
    elif t == "SHIMMER":
        d |= {"time_ms": (p[0]<<8)|p[1], "feedback": p[2], "level": p[3],
               "high_cut": p[4], "pitch": p[5]-24, "balance": p[6]}
    elif t == "WARP":
        d |= {"time_ms": (p[0]<<8)|p[1], "trigger": p[2], "level": p[3]}
    elif t == "TWIST":
        d |= {"mode": _lk(_TWIST_MODES, p[0]), "trigger": p[1], "level": p[2],
               "rise_time": p[3], "fall_time": p[4], "fade_time": p[5]}
    elif t == "GLITCH":
        d |= {"trigger": p[0], "time": p[1], "glitch": p[2], "balance": p[3]}
    return d

def _encode_dly(d):
    b = list(d["_raw"])
    b[0]=int(d["on"]); b[1]=_li(DLY_TYPE_IDX, d["type"], "DLY type")
    t = d["type"]
    if t in ("STANDARD", "ANALOG"):
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
    elif t in ("MODULATE", "ANLG MOD"):
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
        b[7]=d.get("mod_rate", 0); b[8]=d.get("mod_depth", 0)
    elif t == "PAN":
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
        b[7]=d.get("tap_time", 0)
    elif t == "REVERSE":
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
        b[7]=d.get("trigger", 0)
    elif t == "SPACE ECHO":
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
        b[7]=d.get("head", 0)
    elif t == "SHIMMER":
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
        b[7]=d.get("pitch", 0)+24; b[8]=d.get("balance", 0)
    elif t == "WARP":
        ms = d["time_ms"]; b[2]=ms>>8; b[3]=ms&0xFF
        b[4]=d.get("trigger", 0); b[5]=d["level"]
    elif t == "TWIST":
        b[2]=_li(_idx(_TWIST_MODES), d.get("mode","TAPE"), "TWIST mode")
        b[3]=d.get("trigger",0); b[4]=d["level"]
        b[5]=d.get("rise_time",0); b[6]=d.get("fall_time",0); b[7]=d.get("fade_time",0)
    elif t == "GLITCH":
        b[2]=d.get("trigger",0); b[3]=d.get("time",0); b[4]=d.get("glitch",0); b[5]=d.get("balance",0)
    return _h(b)

def _decode_rev(hl):
    b = _b(hl)
    t = _lk(REV_TYPES, b[1])
    d = {"on": bool(b[0]), "type": t, "_raw": b}
    if t in ("HALL S","HALL M","PLATE","ROOM S","ROOM L","AMBIENCE","SPRING"):
        d |= {"time_s": round(b[2]*0.1,1), "tone": _signed(b[3]),
               "density": b[4]+1, "level": b[5], "pre_delay_ms": b[7], "direct": b[8]}
    elif t == "SHIMMER":
        d |= {"time_s": round(b[2]*0.1,1), "tone": _signed(b[3]),
               "level": b[4], "pre_delay_ms": b[5], "pitch": b[6]-24, "pitch_lvl": b[7]}
    elif t == "SUB DELAY":
        d |= {"time_ms": (b[2]<<8)|b[3], "feedback": b[4], "level": b[5], "high_cut": b[6]}
    elif t == "TERA ECHO":
        d |= {"s_time": b[2], "tone": _signed(b[3]), "level": b[4],
               "feedback": b[5], "direct": b[6], "trigger": b[7]}
    return d

def _encode_rev(d):
    b = list(d["_raw"])
    b[0]=int(d["on"]); b[1]=_li(REV_TYPE_IDX, d["type"], "REV type")
    t = d["type"]
    if t in ("HALL S","HALL M","PLATE","ROOM S","ROOM L","AMBIENCE","SPRING"):
        b[2]=round(d["time_s"]/0.1); b[3]=_unsigned(d["tone"]); b[4]=d["density"]-1
        b[5]=d["level"]; b[7]=d["pre_delay_ms"]; b[8]=d["direct"]
    elif t == "SHIMMER":
        b[2]=round(d["time_s"]/0.1); b[3]=_unsigned(d["tone"]); b[4]=d["level"]
        b[5]=d["pre_delay_ms"]; b[6]=d["pitch"]+24; b[7]=d["pitch_lvl"]
    elif t == "SUB DELAY":
        b[2]=d["time_ms"]>>8; b[3]=d["time_ms"]&0xFF
        b[4]=d["feedback"]; b[5]=d["level"]; b[6]=d["high_cut"]
    elif t == "TERA ECHO":
        b[2]=d["s_time"]; b[3]=_unsigned(d["tone"]); b[4]=d["level"]
        b[5]=d["feedback"]; b[6]=d["direct"]; b[7]=d["trigger"]
    return _h(b)


# ── patch encode/decode ──────────────────────────────────────────────────────

def decode_patch(raw):
    ps = raw["paramSet"]
    p = {
        "memo":   raw.get("memo", ""),
        "name":   _decode_name(ps["MEMORY%COM"]),
        "chain":  _decode_chain(ps["MEMORY%CHAIN"]),
        "amp":    _decode_amp(ps["MEMORY%AMP"]),
        "odds":   _decode_odds(ps["MEMORY%ODDS"]),
        "ns":     _decode_ns(ps["MEMORY%NS"]),
        "fv":     _decode_fv(ps["MEMORY%FV"]),
        "delay":  _decode_dly(ps["MEMORY%DLY"]),
        "reverb": _decode_rev(ps["MEMORY%REV"]),
        "_raw_paramset": ps,
    }
    for slot in ("FX1", "FX2", "FX3"):
        com = _decode_fx_com(ps[f"MEMORY%{slot}_COM"])
        com["params"] = _decode_fx_params(com["type"], com.get("subtype"),
                                          _b(ps[f"MEMORY%{slot}"]))
        p[slot.lower()] = com
    return p

def encode_patch(p):
    ps = dict(p["_raw_paramset"])
    ps["MEMORY%COM"]   = _encode_name(p["name"])
    ps["MEMORY%CHAIN"] = _encode_chain(p["chain"])
    ps["MEMORY%AMP"]   = _encode_amp(p["amp"])
    ps["MEMORY%ODDS"]  = _encode_odds(p["odds"])
    ps["MEMORY%NS"]    = _encode_ns(p["ns"])
    ps["MEMORY%FV"]    = _encode_fv(p["fv"])
    ps["MEMORY%DLY"]   = _encode_dly(p["delay"])
    ps["MEMORY%REV"]   = _encode_rev(p["reverb"])
    for slot in ("FX1", "FX2", "FX3"):
        fx = p[slot.lower()]
        ps[f"MEMORY%{slot}_COM"] = _encode_fx_com(fx)
        original_raw = _b(p["_raw_paramset"][f"MEMORY%{slot}"])
        ps[f"MEMORY%{slot}"] = _encode_fx_params(fx["type"], fx.get("subtype"), fx.get("params", {}), original_raw)
    return {"memo": p["memo"], "paramSet": ps}

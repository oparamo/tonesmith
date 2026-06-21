#!/usr/bin/env python3
"""Helpers for generating TSL files from patch definitions."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from tonesmith.devices import gx1

# HIGH CUT kHz string → raw index (approximate; first pass)
HIGH_CUT_MAP = {
    '2.2kHz': 20, '2.5kHz': 21, '2.8kHz': 22, '3.0kHz': 23,
    '3.15kHz': 24, '3.2kHz': 24, '3.5kHz': 25, '4.0kHz': 26,
    '4.5kHz': 27, '5.0kHz': 28, 'FLAT': 29,
}

# Chain node order presets — 13 node IDs in signal-flow order
# Node IDs: INPUT=0, PFX=1, FX1=2, OD/DS=3, FX3=4, DLY=5, FV=6, NS=7, AMP=8, FX2=9, REV=10, LOOP=11, OUTPUT=12
CHAINS = {
    'FX1>AMP>NS>DLY>REV':
        ['PFX','FX1','OD/DS','NS','AMP','FV','FX2','FX3','DLY','REV','INPUT','LOOP','OUTPUT'],
    'FX1>AMP>FX2>NS>DLY>REV':
        ['PFX','FX1','OD/DS','NS','AMP','FX2','FV','FX3','DLY','REV','INPUT','LOOP','OUTPUT'],
    'FX1>AMP>NS>REV':
        ['PFX','FX1','OD/DS','NS','AMP','FV','FX2','FX3','REV','DLY','INPUT','LOOP','OUTPUT'],
    'FX1>OD>AMP>NS>DLY>REV':
        ['PFX','FX1','OD/DS','NS','AMP','FV','FX2','FX3','DLY','REV','INPUT','LOOP','OUTPUT'],
    'FX1>OD>AMP>FX2>NS>DLY>REV':
        ['PFX','FX1','OD/DS','NS','AMP','FX2','FV','FX3','DLY','REV','INPUT','LOOP','OUTPUT'],
}

def base_patch(name, chain_key='FX1>AMP>NS>DLY>REV'):
    """Create a blank patch with name + chain preset."""
    p = gx1.blank_patch()
    p['name'] = name[:16].ljust(16)
    p['chain'] = CHAINS[chain_key]
    return p

def set_amp(p, type_, gain, bass, mid, treble, speaker='ORIGINAL', mic='DYN57', level=100):
    a = p['amp']
    a['on'] = True
    a['type'] = type_
    a['gain'] = gain; a['bass'] = bass; a['middle'] = mid; a['treble'] = treble
    a['speaker'] = speaker; a['mic'] = mic; a['level'] = level

def set_odds(p, subtype, drive, tone, level, direct=0):
    p['odds']['on'] = True
    p['odds']['type'] = subtype
    p['odds']['drive'] = drive
    p['odds']['tone'] = tone
    p['odds']['level'] = level
    p['odds']['direct'] = direct

def clear_odds(p):
    p['odds']['on'] = False

def set_fx(p, slot, fx_type, subtype=None, **params):
    fx = p[slot]
    fx['on'] = True
    fx['type'] = fx_type
    fx['subtype'] = subtype or params.pop('type', None)
    fx['params'] = params

def set_ns(p, threshold, release, on=True):
    p['ns']['on'] = on; p['ns']['threshold'] = threshold; p['ns']['release'] = release

def set_delay(p, type_, time_ms, feedback, level, high_cut_str='FLAT', on=True, **extra):
    hc = HIGH_CUT_MAP.get(high_cut_str, 29)
    d = p['delay']
    d['on'] = on; d['type'] = type_
    d['time_ms'] = time_ms; d['feedback'] = feedback
    d['level'] = level; d['high_cut'] = hc
    for k, v in extra.items():
        d[k] = v

def set_reverb(p, type_, time_s, level, pre_delay_ms=0, tone=0, density=5, direct=100, on=True, **extra):
    r = p['reverb']
    r['on'] = on; r['type'] = type_
    r['time_s'] = time_s; r['level'] = level
    r['pre_delay_ms'] = pre_delay_ms; r['tone'] = tone
    r['density'] = density; r['direct'] = direct
    for k, v in extra.items():
        r[k] = v

def save_tsl(patches, set_name, out_path):
    tsl = gx1.new_tsl(set_name)
    tsl['patches'] = patches
    gx1.write_tsl(tsl, out_path)
    print(f'Saved {out_path} ({len(patches)} patches)')

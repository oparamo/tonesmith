#!/usr/bin/env python3
from generate_tsl import *

patches = []

# OL-1  Ojitos Lindos — FX1 (Chorus) → AMP → NS → DELAY → SHIMMER REV
p = base_patch('OL-1 OJITOS', 'FX1>AMP>NS>DLY>REV')
set_amp(p, 'TRNSPRNT', gain=12, bass=48, mid=45, treble=55, speaker='1x12"', mic='RIBON121')
set_fx(p, 'fx1', 'CHORUS', type='STEREO', rate=20, depth=35, level=60, pre_delay=5)
clear_odds(p)
set_ns(p, threshold=18, release=40)
set_delay(p, 'ANALOG', time_ms=400, feedback=30, level=48, high_cut_str='FLAT')
set_reverb(p, 'SHIMMER', time_s=4.0, level=55, pre_delay_ms=25, tone=-3, pitch=12, pitch_lvl=28)
patches.append(p)

# DTMF-1  Warm — FX1 (Compressor) → AMP → NS → DELAY → REVERB
p = base_patch('DTMF-1 WARM', 'FX1>AMP>NS>DLY>REV')
set_amp(p, 'DELUXE', gain=14, bass=58, mid=52, treble=50, speaker='1x12"', mic='RIBON121')
set_fx(p, 'fx1', 'COMPRESSOR', type='ORANGE', sustain=35, attack=65, level=55)
clear_odds(p)
set_ns(p, threshold=20, release=40)
set_delay(p, 'ANALOG', time_ms=360, feedback=22, level=38, high_cut_str='2.2kHz')
set_reverb(p, 'HALL M', time_s=3.0, level=42, pre_delay_ms=30, tone=-12, density=4, direct=100)
patches.append(p)

# DTMF-2  Lo-Fi — FX1 (Enhancer) → AMP → FX2 (High GEQ) → NS → DELAY → REVERB
p = base_patch('DTMF-2 LOFI', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TRNSPRNT', gain=8, bass=58, mid=52, treble=50, speaker='1x12"', mic='RIBON121')
set_fx(p, 'fx1', 'ENHANCER', sens=65, level=58, low=0, low_freq=0, high=0, high_freq=0)
set_fx(p, 'fx2', 'HIGH GEQ', **{'250Hz': 4+50, '500Hz': 2+50, '1kHz': 3+50, '2kHz': -3+50, '4kHz': -6+50, '8kHz': 50, 'level': 20})
clear_odds(p)
set_ns(p, threshold=20, release=40)
set_delay(p, 'ANALOG', time_ms=360, feedback=22, level=38, high_cut_str='2.2kHz')
set_reverb(p, 'HALL M', time_s=3.0, level=42, pre_delay_ms=30, tone=-12, density=4, direct=100)
patches.append(p)

# NEV-1  Neverita — FX1 (Compressor) → AMP → FX2 (Chorus) → NS → DELAY → REVERB
p = base_patch('NEV-1 NEVERIT', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TWIN', gain=16, bass=50, mid=42, treble=65, speaker='ORIGINAL', mic='CND87')
set_fx(p, 'fx1', 'COMPRESSOR', type='BOSS COMP', sustain=45, attack=40, level=60)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=10, depth=20, level=45, pre_delay=4)
clear_odds(p)
set_ns(p, threshold=22, release=38)
set_delay(p, 'STANDARD', time_ms=320, feedback=18, level=35, high_cut_str='4.0kHz')
set_reverb(p, 'HALL S', time_s=2.2, level=38, pre_delay_ms=15, tone=-3, density=5, direct=100)
patches.append(p)

# MM-1  Moscow Mule — FX1 (Compressor) → OD/DS → AMP → NS → DELAY → REVERB
p = base_patch('MM-1 MOSCOW', 'FX1>OD>AMP>NS>DLY>REV')
set_amp(p, 'BOUTIQUE', gain=38, bass=52, mid=58, treble=65, speaker='2x12"', mic='DYN57')
set_fx(p, 'fx1', 'COMPRESSOR', type='BOSS COMP', sustain=55, attack=30, level=62)
set_odds(p, 'BLUES OD', drive=18, tone=8, level=65)
set_ns(p, threshold=40, release=25)
set_delay(p, 'STANDARD', time_ms=280, feedback=20, level=38, high_cut_str='FLAT')
set_reverb(p, 'ROOM S', time_s=1.4, level=28, pre_delay_ms=8, tone=3, density=6, direct=100)
patches.append(p)

# PDC-1  Pitorro de Coco — FX1 (Compressor) → AMP → NS → DELAY → REVERB
p = base_patch('PDC-1 PITORRO', 'FX1>AMP>NS>DLY>REV')
set_amp(p, 'TRNSPRNT', gain=10, bass=45, mid=65, treble=58, speaker='ORIGINAL', mic='CND451')
set_fx(p, 'fx1', 'COMPRESSOR', type='ORANGE', sustain=30, attack=70, level=55)
clear_odds(p)
set_ns(p, threshold=20, release=50)
set_delay(p, 'ANALOG', time_ms=240, feedback=15, level=28, high_cut_str='2.5kHz')
set_reverb(p, 'ROOM S', time_s=1.8, level=32, pre_delay_ms=10, tone=-5, density=3, direct=100)
patches.append(p)

# UC-1  Un Coco — FX1 (Compressor) → AMP → FX2 (Chorus) → NS → DELAY → REVERB
p = base_patch('UC-1 UN COCO', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'DELUXE', gain=20, bass=55, mid=50, treble=58, speaker='1x12"', mic='RIBON121')
set_fx(p, 'fx1', 'COMPRESSOR', type='BOSS COMP', sustain=48, attack=45, level=60)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=14, depth=25, level=50, pre_delay=5)
clear_odds(p)
set_ns(p, threshold=22, release=45)
set_delay(p, 'ANALOG', time_ms=420, feedback=25, level=40, high_cut_str='2.5kHz')
set_reverb(p, 'HALL M', time_s=2.8, level=40, pre_delay_ms=20, tone=-8, density=5, direct=100)
patches.append(p)

# TUR-1  Turista — FX1 (Compressor) → AMP → NS → REVERB (no delay)
p = base_patch('TUR-1 TURISTA', 'FX1>AMP>NS>REV')
set_amp(p, 'TRNSPRNT', gain=8, bass=50, mid=58, treble=52, speaker='ORIGINAL', mic='CND451')
set_fx(p, 'fx1', 'COMPRESSOR', type='ORANGE', sustain=25, attack=75, level=52)
clear_odds(p)
set_ns(p, threshold=18, release=55)
p['delay']['on'] = False
set_reverb(p, 'ROOM S', time_s=1.5, level=28, pre_delay_ms=8, tone=-3, density=3, direct=100)
patches.append(p)

save_tsl(patches, 'Bad Bunny', 'samples/gx1/Bad Bunny.tsl')

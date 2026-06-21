#!/usr/bin/env python3
from generate_tsl import *

patches = []

# CN-1  Comfortably Numb Verse — FX1(Chorus) → AMP → FX2(Phaser) → NS → DLY → REV
p = base_patch('CN-1 VERSE', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=18, bass=50, mid=48, treble=58, speaker='4x12"', mic='RIBON121')
set_fx(p, 'fx1', 'CHORUS', type='STEREO', rate=28, depth=55, level=70, pre_delay=4)
set_fx(p, 'fx2', 'SCRIPT PH', rate=15, depth=40, level=55)
clear_odds(p)
set_ns(p, threshold=25, release=35)
set_delay(p, 'ANALOG', time_ms=480, feedback=32, level=45, high_cut_str='2.5kHz')
set_reverb(p, 'HALL M', time_s=3.5, level=42, pre_delay_ms=30, tone=-8, density=5, direct=100)
patches.append(p)

# CN-2  Solo 1 — FX1(Comp) → OD(Muff) → AMP → NS → DLY → REV
p = base_patch('CN-2 SOLO1', 'FX1>OD>AMP>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=30, bass=52, mid=52, treble=60, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=65, attack=48, level=60)
set_odds(p, 'MUFF FUZZ', drive=52, tone=10, level=65)
set_ns(p, threshold=38, release=48)
set_delay(p, 'ANALOG', time_ms=375, feedback=28, level=48, high_cut_str='3.0kHz')
set_reverb(p, 'HALL S', time_s=2.2, level=36, pre_delay_ms=15, tone=-3, density=5, direct=100)
patches.append(p)

# CN-3  Solo 2 — FX1(Comp) → OD(Muff) → AMP → FX2(Chorus) → NS → DLY → REV
p = base_patch('CN-3 SOLO2', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=28, bass=52, mid=55, treble=60, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=75, attack=42, level=63)
set_odds(p, 'MUFF FUZZ', drive=58, tone=15, level=68)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=18, depth=22, level=55, pre_delay=2)
set_ns(p, threshold=40, release=55)
set_delay(p, 'ANALOG', time_ms=390, feedback=35, level=55, high_cut_str='3.2kHz')
set_reverb(p, 'HALL M', time_s=3.2, level=42, pre_delay_ms=20, tone=-5, density=6, direct=100)
patches.append(p)

# SOYCD-1  Four-Note Intro — FX1(Comp) → OD(Muff) → AMP → FX2(Phaser) → NS → DLY → REV
p = base_patch('SOYCD-1 INTRO', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=22, bass=50, mid=55, treble=55, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=85, attack=30, level=65)
set_odds(p, 'MUFF FUZZ', drive=50, tone=0, level=65)
set_fx(p, 'fx2', 'SCRIPT PH', rate=12, depth=60, level=65)
set_ns(p, threshold=20, release=60)
set_delay(p, 'ANALOG', time_ms=550, feedback=40, level=58, high_cut_str='2.2kHz')
set_reverb(p, 'HALL M', time_s=4.0, level=45, pre_delay_ms=35, tone=-12, density=4, direct=100)
patches.append(p)

# SOYCD-2  Clean Rhythm — FX1(Phaser) → AMP → FX2(Chorus) → NS → DLY → REV
p = base_patch('SOYCD-2 RHYTH', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TWIN', gain=22, bass=53, mid=50, treble=63, speaker='ORIGINAL', mic='CND87')
set_fx(p, 'fx1', 'SCRIPT PH', rate=25, depth=55, level=68)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=14, depth=22, level=48, pre_delay=3)
clear_odds(p)
set_ns(p, threshold=28, release=38)
set_delay(p, 'ANALOG', time_ms=460, feedback=28, level=42, high_cut_str='2.8kHz')
set_reverb(p, 'HALL M', time_s=2.8, level=38, pre_delay_ms=22, tone=-5, density=5, direct=100)
patches.append(p)

# SOYCD-3  Main Lead — FX1(Comp) → OD(Muff) → AMP → FX2(Phaser) → NS → DLY → REV
p = base_patch('SOYCD-3 LEAD', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=30, bass=52, mid=58, treble=60, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=70, attack=45, level=62)
set_odds(p, 'MUFF FUZZ', drive=55, tone=8, level=66)
set_fx(p, 'fx2', 'SCRIPT PH', rate=20, depth=45, level=58)
set_ns(p, threshold=35, release=52)
set_delay(p, 'ANALOG', time_ms=500, feedback=35, level=52, high_cut_str='3.0kHz')
set_reverb(p, 'HALL M', time_s=3.5, level=40, pre_delay_ms=22, tone=-5, density=6, direct=100)
patches.append(p)

# WYWH-1  Intro Fingerpicked — FX1(Comp) → AMP → FX2(Phaser) → NS → DLY → REV
p = base_patch('WYWH-1 INTRO', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TWIN', gain=16, bass=48, mid=48, treble=58, speaker='ORIGINAL', mic='RIBON121')
set_fx(p, 'fx1', 'COMPRESSOR', type='ORANGE', sustain=38, attack=65, level=55)
set_fx(p, 'fx2', 'SCRIPT PH', rate=18, depth=48, level=62)
clear_odds(p)
set_ns(p, threshold=25, release=35)
set_delay(p, 'ANALOG', time_ms=420, feedback=25, level=38, high_cut_str='2.5kHz')
set_reverb(p, 'HALL M', time_s=3.0, level=35, pre_delay_ms=28, tone=-8, density=4, direct=100)
patches.append(p)

# WYWH-2  Strummed Rhythm
p = base_patch('WYWH-2 RHYTH', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TWIN', gain=20, bass=52, mid=50, treble=62, speaker='ORIGINAL', mic='CND87')
set_fx(p, 'fx1', 'COMPRESSOR', type='ORANGE', sustain=45, attack=50, level=58)
set_fx(p, 'fx2', 'SCRIPT PH', rate=20, depth=52, level=65)
clear_odds(p)
set_ns(p, threshold=28, release=40)
set_delay(p, 'ANALOG', time_ms=450, feedback=30, level=45, high_cut_str='2.8kHz')
set_reverb(p, 'HALL M', time_s=2.8, level=38, pre_delay_ms=22, tone=-5, density=5, direct=100)
patches.append(p)

# WYWH-3  Outro Lead — FX1(Comp) → OD(Muff) → AMP → FX2(Phaser) → NS → DLY → REV
p = base_patch('WYWH-3 LEAD', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TWIN', gain=22, bass=52, mid=55, treble=60, speaker='ORIGINAL', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=65, attack=45, level=60)
set_odds(p, 'MUFF FUZZ', drive=48, tone=5, level=62)
set_fx(p, 'fx2', 'SCRIPT PH', rate=18, depth=45, level=60)
set_ns(p, threshold=35, release=50)
set_delay(p, 'ANALOG', time_ms=460, feedback=33, level=52, high_cut_str='3.0kHz')
set_reverb(p, 'HALL M', time_s=3.0, level=40, pre_delay_ms=18, tone=-5, density=6, direct=100)
patches.append(p)

# HAC-1  Have A Cigar Rhythm — T-SCREAM boost, high gain
p = base_patch('HAC-1 RHYTHM', 'FX1>OD>AMP>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=55, bass=48, mid=62, treble=65, speaker='4x12"', mic='DYN57')
set_fx(p, 'fx1', 'COMPRESSOR', type='BOSS COMP', sustain=50, attack=35, level=60)
set_odds(p, 'T-SCREAM', drive=28, tone=12, level=72)
set_ns(p, threshold=45, release=28)
set_delay(p, 'ANALOG', time_ms=340, feedback=22, level=35, high_cut_str='3.5kHz')
set_reverb(p, 'PLATE', time_s=1.6, level=28, pre_delay_ms=10, tone=5, density=6, direct=100)
patches.append(p)

# HAC-2  Have A Cigar Lead — 60S FUZZ
p = base_patch('HAC-2 LEAD', 'FX1>OD>AMP>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=42, bass=50, mid=60, treble=68, speaker='4x12"', mic='BLEND B')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=60, attack=38, level=62)
set_odds(p, '60S FUZZ', drive=60, tone=18, level=65)
set_ns(p, threshold=42, release=45)
set_delay(p, 'ANALOG', time_ms=360, feedback=28, level=48, high_cut_str='3.5kHz')
set_reverb(p, 'PLATE', time_s=1.8, level=35, pre_delay_ms=12, tone=5, density=7, direct=100)
patches.append(p)

# HY-1  Hey You Rhythm — clean
p = base_patch('HY-1 RHYTHM', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'DELUXE', gain=15, bass=55, mid=50, treble=52, speaker='1x12"', mic='RIBON121')
set_fx(p, 'fx1', 'COMPRESSOR', type='ORANGE', sustain=40, attack=60, level=58)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=12, depth=20, level=50, pre_delay=3)
clear_odds(p)
set_ns(p, threshold=30, release=40)
set_delay(p, 'ANALOG', time_ms=460, feedback=28, level=42, high_cut_str='2.5kHz')
set_reverb(p, 'HALL M', time_s=2.8, level=38, pre_delay_ms=25, tone=-10, density=5, direct=100)
patches.append(p)

# HY-2  Hey You Lead
p = base_patch('HY-2 LEAD', 'FX1>OD>AMP>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=28, bass=52, mid=55, treble=60, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=72, attack=45, level=62)
set_odds(p, 'MUFF FUZZ', drive=58, tone=8, level=68)
set_ns(p, threshold=40, release=55)
set_delay(p, 'ANALOG', time_ms=480, feedback=38, level=55, high_cut_str='3.0kHz')
set_reverb(p, 'HALL S', time_s=3.2, level=42, pre_delay_ms=20, tone=-5, density=6, direct=100)
patches.append(p)

# ABW-1  Another Brick Rhythm — T-SCREAM, very high gain
p = base_patch('ABW-1 RHYTHM', 'FX1>OD>AMP>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=60, bass=50, mid=40, treble=70, speaker='4x12"', mic='DYN57')
set_fx(p, 'fx1', 'CHORUS', type='STEREO', rate=30, depth=40, level=60, pre_delay=0)
set_odds(p, 'T-SCREAM', drive=20, tone=10, level=70)
set_ns(p, threshold=55, release=30)
set_delay(p, 'STANDARD', time_ms=320, feedback=28, level=45, high_cut_str='FLAT')
set_reverb(p, 'PLATE', time_s=1.8, level=30, pre_delay_ms=0, tone=0, density=5, direct=100)
patches.append(p)

# TD-1  Time/Dogs Lead — 60S FUZZ
p = base_patch('TD-1 LEAD', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=50, bass=55, mid=55, treble=65, speaker='4x12"', mic='BLEND B')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=60, attack=45, level=60)
set_odds(p, '60S FUZZ', drive=65, tone=5, level=60)
set_fx(p, 'fx2', 'VIBRATO', rate=40, depth=35, level=100, rise_time=0, trigger=0)
set_ns(p, threshold=35, release=45)
set_delay(p, 'ANALOG', time_ms=440, feedback=32, level=50, high_cut_str='3.0kHz')
set_reverb(p, 'HALL S', time_s=2.0, level=38, pre_delay_ms=15, tone=0, density=5, direct=100)
patches.append(p)

# ECH-1  Echoes Clean Verse
p = base_patch('ECH-1 CLEAN', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=20, bass=52, mid=45, treble=65, speaker='4x12"', mic='DYN421')
set_fx(p, 'fx1', 'CHORUS', type='STEREO', rate=22, depth=45, level=65, pre_delay=3)
set_fx(p, 'fx2', 'SCRIPT PH', rate=16, depth=38, level=52)
clear_odds(p)
set_ns(p, threshold=30, release=38)
set_delay(p, 'ANALOG', time_ms=430, feedback=30, level=45, high_cut_str='2.8kHz')
set_reverb(p, 'HALL S', time_s=2.5, level=36, pre_delay_ms=18, tone=-5, density=5, direct=100)
patches.append(p)

# ECH-2  Echoes Chaos — extreme settings
p = base_patch('ECH-2 CHAOS', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=75, bass=45, mid=65, treble=70, speaker='4x12"', mic='DYN57')
set_fx(p, 'fx1', 'FLANGER', rate=8, depth=80, manual=55, reso=70, level=75)
set_odds(p, 'LEAD DS', drive=80, tone=5, level=65)
set_fx(p, 'fx2', 'PHASER', stage=12, rate=10, depth=80, reso=65, manual=50, level=70)
set_ns(p, threshold=0, release=0, on=False)
set_delay(p, 'ANALOG', time_ms=680, feedback=55, level=65, high_cut_str='4.0kHz')
set_reverb(p, 'HALL S', time_s=4.5, level=55, pre_delay_ms=10, tone=5, density=8, direct=100)
patches.append(p)

# ECH-3  Echoes Main Lead — 60S FUZZ
p = base_patch('ECH-3 LEAD', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=35, bass=53, mid=55, treble=62, speaker='4x12"', mic='BLEND B')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=65, attack=45, level=60)
set_odds(p, '60S FUZZ', drive=62, tone=10, level=65)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=18, depth=28, level=52, pre_delay=2)
set_ns(p, threshold=36, release=48)
set_delay(p, 'ANALOG', time_ms=450, feedback=32, level=50, high_cut_str='3.0kHz')
set_reverb(p, 'HALL S', time_s=2.8, level=38, pre_delay_ms=16, tone=-3, density=5, direct=100)
patches.append(p)

# BRE-1  Breathe Rhythm
p = base_patch('BRE-1 RHYTHM', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'DELUXE', gain=18, bass=55, mid=48, treble=55, speaker='1x12"', mic='RIBON121')
set_fx(p, 'fx1', 'TREMOLO', rate=35, depth=45, level=70)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=16, depth=48, level=65, pre_delay=5)
clear_odds(p)
set_ns(p, threshold=28, release=42)
set_delay(p, 'ANALOG', time_ms=500, feedback=30, level=40, high_cut_str='2.2kHz')
set_reverb(p, 'HALL M', time_s=3.2, level=40, pre_delay_ms=28, tone=-10, density=4, direct=100)
patches.append(p)

# BRE-2  Breathe Lead
p = base_patch('BRE-2 LEAD', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=32, bass=52, mid=60, treble=58, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=68, attack=45, level=60)
set_odds(p, '60S FUZZ', drive=55, tone=5, level=63)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=16, depth=25, level=50, pre_delay=2)
set_ns(p, threshold=35, release=48)
set_delay(p, 'ANALOG', time_ms=460, feedback=30, level=48, high_cut_str='3.0kHz')
set_reverb(p, 'HALL M', time_s=3.0, level=38, pre_delay_ms=18, tone=-5, density=5, direct=100)
patches.append(p)

# MAR-1  Marooned Slide Rhythm — MODULATE delay, SHIMMER reverb
p = base_patch('MAR-1 RHYTH', 'FX1>AMP>FX2>NS>DLY>REV')
set_amp(p, 'TWIN', gain=16, bass=50, mid=52, treble=60, speaker='ORIGINAL', mic='CND87')
set_fx(p, 'fx1', 'CHORUS', type='STEREO', rate=14, depth=38, level=60, pre_delay=4)
set_fx(p, 'fx2', 'TREMOLO', rate=22, depth=30, level=65)
clear_odds(p)
set_ns(p, threshold=22, release=65)
set_delay(p, 'MODULATE', time_ms=580, feedback=38, level=50, high_cut_str='2.5kHz', mod_rate=12, mod_depth=18)
set_reverb(p, 'SHIMMER', time_s=4.0, level=48, pre_delay_ms=30, tone=-5, pitch=12, pitch_lvl=25)
patches.append(p)

# MAR-2  Marooned Main Slide Lead
p = base_patch('MAR-2 LEAD', 'FX1>OD>AMP>FX2>NS>DLY>REV')
set_amp(p, 'BRIT STACK', gain=25, bass=53, mid=58, treble=60, speaker='4x12"', mic='BLEND A')
set_fx(p, 'fx1', 'COMPRESSOR', type='D-COMP', sustain=80, attack=35, level=65)
set_odds(p, 'MUFF FUZZ', drive=45, tone=3, level=65)
set_fx(p, 'fx2', 'CHORUS', type='STEREO', rate=16, depth=30, level=55, pre_delay=3)
set_ns(p, threshold=28, release=60)
set_delay(p, 'MODULATE', time_ms=520, feedback=40, level=55, high_cut_str='3.2kHz', mod_rate=10, mod_depth=15)
set_reverb(p, 'SHIMMER', time_s=4.5, level=45, pre_delay_ms=20, tone=-3, pitch=12, pitch_lvl=30)
patches.append(p)

save_tsl(patches, 'Gilmour', 'samples/gx1/Gilmour.tsl')

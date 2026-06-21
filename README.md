# tonesmith

Python toolkit for reading, editing, and creating presets for guitar multi-effects processors.
Designed to support multiple devices; currently implements the **BOSS GX-1** (`.tsl` patch files).

No external dependencies — Python 3 standard library only.

## Usage

```bash
# Create a new TSL file with blank patches
python3 -m tonesmith gx1 new <file.tsl> [set_name] [n_patches]

# Print all patches in a file
python3 -m tonesmith gx1 read <file.tsl>

# Print a single patch by index or name
python3 -m tonesmith gx1 read <file.tsl> <index|name>

# Edit a field in a patch (modifies file in-place)
python3 -m tonesmith gx1 write <file.tsl> <index|name> <block> <field>=<value> ...

# Copy a patch from one file to another
python3 -m tonesmith gx1 copy <src.tsl> <src_idx|name> <dst.tsl> <dst_idx|name>
```

### Write examples

```bash
# Change amp gain
python3 -m tonesmith gx1 write "samples/gx1/Rock Tones.tsl" 0 amp gain=90

# Change multiple reverb fields at once
python3 -m tonesmith gx1 write "samples/gx1/Rock Tones.tsl" 0 reverb level=30 time_s=3.0

# Turn FX1 off
python3 -m tonesmith gx1 write "samples/gx1/Rock Tones.tsl" 0 fx1 on=0

# Change FX1 rate parameter
python3 -m tonesmith gx1 write "samples/gx1/Rock Tones.tsl" 0 fx1.params rate=50
```

Blocks: `amp`, `ns`, `fv`, `delay`, `reverb`, `fx1`, `fx2`, `fx3`. Use dot notation for nested
fields (`fx1.params.rate`).

## Repository layout

```
tonesmith/          Python package (dispatcher + per-device sub-packages)
  devices/gx1/     BOSS GX-1 codec, I/O, and CLI
tools/gx1/         Patch generator scripts for the GX-1
tools/html_to_md.py  Converts Roland online manuals to Markdown
docs/gx1/          GX-1 documentation (format spec, parameter guide, reference manual)
samples/gx1/       Example .tsl files
```

## Documentation

- `docs/gx1/FORMAT.md` — reverse-engineered TSL binary format
- `docs/gx1/gx1_parameter_guide.md` — effect types, parameters, value ranges (from Roland HTML)
- `docs/gx1/gx1_reference_manual.md` — hardware operation reference (from Roland HTML)

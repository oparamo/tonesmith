"""tonesmith — multi-device guitar processor patch toolkit.

Usage:
    python3 -m tonesmith <device> <command> [args...]

Available devices:
    gx1   BOSS GX-1

Run `python3 -m tonesmith <device>` for device-specific help.
"""

import sys


def _load_devices():
    from tonesmith.devices.gx1 import cli as _gx1_cli
    return {"gx1": _gx1_cli}


def main(argv=None):
    if argv is None:
        argv = sys.argv[1:]

    devices = _load_devices()

    if not argv or argv[0] not in devices:
        print(__doc__)
        if argv and argv[0] not in devices:
            print(f"Unknown device: {argv[0]!r}")
        return

    device = argv[0]
    devices[device].main(argv[1:])

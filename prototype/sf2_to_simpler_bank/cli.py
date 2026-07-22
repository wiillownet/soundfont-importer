import argparse
import json
from pathlib import Path

from .converter import convert_sf2


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="sf2_to_simpler_bank",
        description="Extract an SF2 SoundFont into WAV samples plus a bank.json manifest.",
    )
    parser.add_argument("sf2", type=Path, help="Path to a .sf2 file")
    parser.add_argument("out", type=Path, help="Output folder")
    parser.add_argument(
        "--preset",
        help="Optional preset name filter. If omitted, all presets are exported.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print conversion summary JSON to stdout.",
    )
    args = parser.parse_args()

    manifest = convert_sf2(args.sf2, args.out, preset_filter=args.preset)
    summary = {
        "name": manifest["name"],
        "presets": len(manifest["presets"]),
        "samples": len(manifest["samples"]),
        "output": str(args.out.resolve()),
    }
    print(json.dumps(summary, indent=2 if args.pretty else None))
    return 0

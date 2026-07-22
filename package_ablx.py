import argparse
import zipfile
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Package an Ableton Extension folder as .ablx")
    parser.add_argument("source", type=Path, help="Folder containing manifest.json and dist/extension.js")
    parser.add_argument("output", type=Path, help="Output .ablx path")
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    manifest = source / "manifest.json"
    entry = source / "dist" / "extension.js"

    if not manifest.exists():
        raise SystemExit(f"Missing {manifest}")
    if not entry.exists():
        raise SystemExit(f"Missing {entry}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source).as_posix())

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

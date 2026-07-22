import json
import wave
from pathlib import Path

from .sf2 import SoundFont


def convert_sf2(sf2_path: Path, out_dir: Path, preset_filter: str | None = None) -> dict:
    sf2_path = sf2_path.expanduser().resolve()
    out_dir = out_dir.expanduser().resolve()
    samples_dir = out_dir / "samples"
    samples_dir.mkdir(parents=True, exist_ok=True)

    soundfont = SoundFont.from_file(sf2_path)
    samples = _write_samples(soundfont, samples_dir)

    presets = []
    for preset in soundfont.presets:
        if preset_filter and preset_filter.lower() not in preset["name"].lower():
            continue
        zones = []
        for zone in preset["zones"]:
            sample = samples.get(zone["sample_index"])
            if not sample:
                continue
            zones.append({**zone, "sample": sample["path"]})
        if zones:
            presets.append(
                {
                    "name": preset["name"],
                    "bank": preset["bank"],
                    "program": preset["program"],
                    "zones": zones,
                }
            )

    manifest = {
        "format": "sf2-to-simpler-bank.v1",
        "name": soundfont.name or sf2_path.stem,
        "source": str(sf2_path),
        "samples": list(samples.values()),
        "presets": presets,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "bank.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def _write_samples(soundfont: SoundFont, samples_dir: Path) -> dict[int, dict]:
    exported = {}
    for index, sample in enumerate(soundfont.samples):
        if sample["type"] not in (1, 2, 4, 8, 0x8001, 0x8002, 0x8004, 0x8008):
            continue
        if sample["end"] <= sample["start"]:
            continue

        raw = soundfont.sample_data[sample["start"] * 2 : sample["end"] * 2]
        filename = f"{index:04d}_{_safe_name(sample['name'])}.wav"
        path = samples_dir / filename
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample["sample_rate"] or 44100)
            wav.writeframes(raw)

        exported[index] = {
            "index": index,
            "name": sample["name"],
            "path": str(path),
            "sampleRate": sample["sample_rate"],
            "originalPitch": sample["original_pitch"],
            "pitchCorrection": sample["pitch_correction"],
            "loopStartFrames": max(0, sample["loop_start"] - sample["start"]),
            "loopEndFrames": max(0, sample["loop_end"] - sample["start"]),
        }
    return exported


def _safe_name(value: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in value.strip())
    return safe[:60] or "sample"

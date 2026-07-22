# SoundFont Converter SDK Extension

Private source repository for Nora Korra's Ableton Live Extension that converts `.sf2` SoundFont files into Ableton Sampler presets and an Ableton-friendly sample bank.

## Repository structure

This repository is split into two layers:

- `extension-package`: installable Extension SDK package source. It provides the SoundFont import dialog, parses SF2 data, exports AIFF samples, and writes Ableton Sampler `.adv` presets.
- `prototype/sf2_to_simpler_bank`: standalone offline converter. It reads SF2 RIFF data, extracts samples to WAV, and writes a structured `bank.json` manifest with presets, zones, key ranges, velocity ranges, roots, tuning, and loop data.
- `extension-ui`: UI and SDK integration notes.
- `package_ablx.py`: packages `extension-package` as an `.ablx` archive.
- `smoke_convert.js`: exercises the JavaScript importer without launching Ableton Live.

The converter is the stable core. Ableton's Extension SDK can change while it is in beta, but the SF2 extraction and normalized bank manifest remain independently useful.

## Run the prototype

```bash
python3 -m sf2_to_simpler_bank /path/to/file.sf2 /path/to/output-folder
```

From this workspace:

```bash
cd prototype
python3 -m sf2_to_simpler_bank ~/Downloads/example.sf2 ../../outputs/example-bank
```

Output:

- `samples/*.wav`
- `bank.json`

## Ableton strategy

The safest implementation path is:

1. Extension UI lets the user drop or select an `.sf2`.
2. Extension runs the converter into a project-local output folder.
3. Extension creates an Instrument Rack or preset bank in Live from `bank.json`.
4. Each preset becomes either:
   - a rack chain containing Simpler devices per zone, or
   - a generated Ableton preset file if the SDK exposes a stable preset-writing API.

Directly writing `.adv`/`.adg` files is possible in principle because many Ableton files are gzip-compressed XML, but it is brittle across Live versions. The manifest-first approach keeps the converter stable and the Ableton-specific layer replaceable.

## Package the extension

```bash
python3 package_ablx.py extension-package SoundFont-Importer.ablx
```

Generated `.ablx` files and converted sample banks are intentionally excluded from version control.

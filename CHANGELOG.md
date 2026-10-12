# Changelog

## 1.1.0-fork.1 (unreleased)

Fork of SoundFont Importer by Nora Korra. Focus: conversion fidelity.

- Presets are written in Live 12.4's own Sampler format instead of the Live 10 format.
  They sound the same as before but now require Live 12.4 or later.
- SF2 generators are merged per the SoundFont 2.04 spec: preset values offset instrument
  values instead of replacing them, and results are clamped to the permitted ranges.
- Per-zone tuning, pan and volume are preserved. Coarse tune moves the root key, fine tune
  and sample pitch correction go to Detune, and fixed-pitch (`scaleTuning`) zones are kept.
  See `docs/fidelity.md` for the one case that is still approximated.
- The SF2 volume envelope (attack, hold, decay, sustain, release) sets Sampler's amp envelope.
  Sampler has one envelope per device, so presets whose zones differ are approximated; the
  import dialog counts them and the log names them. Decay and release times are calibrated
  against renders of Live's own envelope curves.
- Velocity follows SF2's default velocity curve more closely: Vol<Vel is 50% (was 35%).
- Fixed: loops that clicked or bumped on every cycle. Zones' loop offset generators were
  ignored, so the loop seam landed a few samples off (421 zones in `Touhou.sf2`, e.g.
  Clarinet). Sample start/end offsets are applied too, and none of these are read at preset
  level, per the spec.
- The SF2 lowpass filter sets Sampler's filter: cutoff, plus the modulation envelope's sweep
  as the filter envelope. Resonance is not mapped. Presets whose zones filter differently are
  approximated and counted like the envelope.

## 1.0.0

- First stable public release of SoundFont Importer by Nora Korra.
- Native `.sf2` import for Ableton Live.
- Automatic sample extraction to AIFF.
- Instrument mapping preservation.
- Browsable Ableton Live Sampler preset collection.
- Preserves key ranges, velocity ranges, root notes, sample rates, and loop data.
- Built with Ableton’s Extensions SDK.
- Localized English and Dutch interface text.
- Conversion progress, completion details, and user-facing error dialogs.
- Supports macOS and Windows paths through the Ableton Extension host.

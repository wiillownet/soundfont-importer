<!-- Decisions log. Append new entries at the top under the "Decisions" header.
     Records the *why* behind non-trivial choices (and what was rejected), so they
     aren't silently re-litigated or reversed. The *what/when* lives in git history;
     this file holds the reasoning git can't.
     If a tool auto-logs entries (e.g. an audit pass), it appends them at the bottom. -->

# Decisions

## [2026-08-22] Re-base the `.adv` template on the Live 12.4 schema
**Decision:** Replace the hand-written Live 10 template in `samplerPresetXml` with one
derived from Live 12.4's own default Sampler preset. Accepted cost: the working
`<FileRef>` block has to be retested, and output presets will require Live 12.4+.
Landed as its own commit, separate from the generator work.

**Reason:** Phases 2-4 need to write `<Volume>`, `<Envelope>` and `<VoiceSettings>`, and
those are exactly the three elements that no longer exist in the 12.4 schema (they are
now `<VolumeAndPan><Volume>`, `<VolumeAndPan><Envelope>` and `<Globals>`). Decisively,
the populated filter `<Slot>` exists only in 12.4 shape and cannot go under a Live 10
header, so staying on Live 10 either blocks Phase 4 or means inventing a Live 10 Slot
with no reference to copy from. A search of this machine confirmed no Live 10 populated
Slot is available: only Live 12 is installed, and the old-header `.adv` files present are
Max4Live Granulator presets with no `SimplerFilter` block.

**Alternatives considered:** Keep the Live 10 template and header, relying on Live's
preset upgrade path, which demonstrably works today. Rejected: that upgrade path has only
ever been exercised on *default* device-level values, because the current code never
emits anything else, so it is not evidence that it survives the non-default tuning,
envelope and filter values Phases 2-4 will write. The case for keeping it also rested on
Phase 2, which is unaffected by the choice either way, while Phase 4 was separately
blocked by it.

## [2026-08-22] Discard SF2 filter resonance; map cutoff only
**Decision:** `initialFilterQ` is dropped. Only `initialFilterFc` is mapped. Warn and name
any preset where a non-zero Q was discarded. The untested candidate mapping is recorded in
`docs/fidelity.md`.

**Reason:** Live's Sampler filter has no dB-valued resonance field. It exposes `Res`
(normalized `0 .. 1.25`) and `LegacyQ` (a Q factor, `0.3 .. 10`), neither in centibels,
and the factory library never varies them in a way that pins the curve. The mapping is
therefore not determinable from available reference material, and the brief's own rule is
to stop rather than guess at field semantics. Mapping cutoff alone is lossless relative to
the previous behaviour, which wrote no filter at all.

**Alternatives considered:** Ship `Q = clamp(10 ** (dB / 20), 0.3, 10)` into `LegacyQ`.
Rejected as unverified; it needs an ear test against Plogue sforzando before it ships.

## [2026-08-22] Clamp resolved generators to the SF2 permitted ranges
**Decision:** `resolveZoneGenerators` clamps the summed preset + instrument value to the
SF2 2.04 section 8.1.3 range for each generator. `overridingRootKey` is excluded so its
-1 "absent" sentinel survives; `sampleModes` is excluded as an instrument-only bitfield.

**Reason:** The spec requires it, and real files depend on it. Measured on `Touhou.sf2`:
9059 zones sum to a negative `initialAttenuation`, reaching -419 cB, which read literally
through `10 ** (-cB / 200)` is a 123x gain boost rather than the intended unity. Other
generators overflowed too (`sustainVolEnv` to -975 cB, `initialFilterFc` to 24132 cents,
`pan` to +-1004).

**Alternatives considered:** Skip clamping and let each consumer clamp into Ableton's
narrower parameter range. This was the initial implementation and it is wrong: Ableton's
per-zone `Volume` is linear gain and factory presets legitimately exceed 1, so nothing
downstream would have caught the attenuation blowout.

## [2026-08-22] Fold `pitch_correction` into fine tune additively
**Decision:** `fineTune = generator fineTune + sample header pitch_correction`.

**Reason:** The sample header's pitch correction is a property of the recording and the
`fineTune` generator is a separate offset; per the spec both apply, so they add.

**Alternatives considered:** Match the Python prototype, which substitutes -- it uses
`pitch_correction` only as the default when `fineTune` is absent. Rejected as a prototype
bug rather than the spec. Called out in a code comment so it is not "fixed" back.

## [2026-08-22] Rebuild schema ground truth from the installed Live 12.4 factory library
**Decision:** With `reference/live124-sampler.adv` absent from the repo, derive the schema
from the Live 12.4.3 install on this machine: 2628 `.adv` scanned, 78 `MultiSampler`
presets, 380 zones, with `Core Library/Defaults/Instruments/Sampler.adv` as the baseline.
Ableton's presets are not vendored into the repo; `reference/*.adv` is gitignored.

**Reason:** The named reference file was never committed (absent from `git log --all`,
unstashed, not ignored). Many Live-authored files are stronger evidence than one
hand-made file for anything the factory library exercises. It settled both unit questions
outright: per-zone `Volume` is linear gain (round dB values map to non-round stored
numbers -- `1.58489347` is exactly +4.000 dB) and `SustainLevel` is linear amplitude (its
`Min` is exactly -70 dB).

**Alternatives considered:** Stop and wait for the reference file. Rejected because most
of Phase 0 was answerable without it. Its remaining gaps are real and are still
outstanding: factory content never varies `Panorama` (always 0) or `TuneScale` (always
100), and `Detune` never exceeds +-31, so Phase 2's bounds and Phase 4's `<Slot>` still
need the reference file.

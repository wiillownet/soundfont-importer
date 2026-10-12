<!-- Decisions log. Append new entries at the top under the "Decisions" header.
     Records the *why* behind non-trivial choices (and what was rejected), so they
     aren't silently re-litigated or reversed. The *what/when* lives in git history;
     this file holds the reasoning git can't.
     If a tool auto-logs entries (e.g. an audit pass), it appends them at the bottom. -->

# Decisions

## [2026-10-12] Calibrate decay and release to Live's measured curves; Vol<Vel 50%
**Decision:** Supersedes the decay and release formulas of "Amp envelope: decay scaled to
sustain, release timed from full level" below (hold folding, delay and the warning tolerances
stand). Decay = hold + the Live decay time that has fallen 75% of the way to sustain (in dB)
when SF2 has. Release = SF2 release x 83.6 / 100, still timed from full level. Live's default
curves (Slope 1) are kept. Sampler's Vol<Vel is 50% instead of Live's default 35%; device
volume stays at Live's default -12 dB.

**Reason:** Renders of a steady looped Clarinet in Live 12.4 showed the old reading of Live's
manual was wrong. Live's decay is exponential in amplitude toward sustain (time constant =
decay time / 9.62), so it falls 83.6 dB per decay time toward silence, linear in dB like SF2,
but flattens near a higher sustain: the old "distance to sustain" scaling decayed 3.8x too fast
at a -10 dB sustain. Decay Slopes 0.5 and 0 sag and then drop off a cliff, unlike SF2. The 75%
match is within 3% of a least-squares fit at every sustain level and was verified by render to
0.2 dB. Live's release falls linearly in dB to about -83.6 dB in the release time wherever it
starts, so timing it from full level is exact for a note released at full level and slower from
a held sustain (24% at -20 dB); timing it from sustain would still cut plucks short (see below).
For velocity, sforzando follows SF2's default velocity-to-attenuation curve (40 log10(127/v)
dB) to 0.1 dB; Live's Vol<Vel is linear in dB (0.4 dB per velocity step at 100%), so no
setting matches everywhere. 50% stays within 1.4 dB from velocity 48 to 127, where 35% is up
to 5.9 dB off. Device volume is left at -12 dB as headroom; SF2 says nothing about it.

**Alternatives considered:** A flat 1.19x on the old formulas (rejected: right only for sustain
at the floor). Release from the sustain level (rejected: plucks). Vol<Vel fitted down to
velocity 16 (64%, rejected: up to 4 dB too quiet in the 64 to 112 range that matters most).

## [2026-10-11] Map the filter's modulation-envelope sweep, not just the cutoff
**Decision:** Phase 4 maps `modEnvToFilterFc` and the SF2 modulation envelope onto Sampler's
filter envelope (`Amount` in semitones, ADSR converted like the amp envelope), going beyond the
brief's cutoff-only scope. The filter runs with key tracking off (`ModByPitch` 0, Live's default
is 1) and 12 dB slope.

**Reason:** In `Touhou.sf2`, 1625 of the 3427 zones with a cutoff below 18 kHz also sweep it
with the modulation envelope: the filter opens on the attack and closes as it decays. Writing
the static cutoff alone would leave those filters stuck closed, duller than the previous
behaviour of no filter at all. SF2 has no cutoff key tracking, so Live's default of 1 would move
the cutoff with every note.

**Alternatives considered:** Cutoff only as briefed (rejected: about 40 presets would get worse).
Cutoff only and leave swept presets unfiltered (rejected: never worse, but drops the filter
where it matters most).

## [2026-10-11] Amp envelope: decay scaled to sustain, release timed from full level
**Decision:** SF2's decay and release rates (time for a 100 dB change) become Live durations
as follows. Decay = hold + SF2 decay x (sustain depth in dB, at most 70) / 100. Release = SF2
release x 70 / 100, regardless of sustain level. Delay is dropped. Envelopes within 25% in
time and 1.5 dB in sustain count as the same for the per-preset warning.

**Reason:** Live's manual defines decay as the time to reach the sustain level and release as
the time to reach its -70 dB release level, while SF2 defines both as rates. Scaling decay by
the distance travelled keeps SF2's dB-per-second rate; folding hold into decay keeps the time
sustain is reached. For release, timing from the sustain level gives 0 ms when sustain sits at
Live's floor, which is exactly the plucked and piano-like case, released mid-decay while still
loud: a first draft did this and produced a 1 ms release on `BassPick&Mutes`. Timing from full
level is never shorter than SF2 and at worst 40% longer. Unit reading was cross-checked
against sforzando's SFZ output: all 5721 comparable zones match.

**Alternatives considered:** Release from the sustain level (rejected: the click above). Hold
dropped instead of folded (rejected: 2300 zones in `Touhou.sf2` hold over 50 ms and would
decay early). Strict equality for the per-preset warning (rejected: 107 of 185 presets differ
somewhere, mostly by inaudible amounts like 1 ms against 6 ms of attack).

## [2026-10-11] Keep spec semantics for preset-level generators where sforzando differs
**Decision:** Preset-level generators stay additive offsets on the instrument value, summed and
then clamped to the SF2 range, even where Plogue sforzando (the brief's A/B reference) does
otherwise. Do not change the converter to match sforzando on these.

**Reason:** Phase 2 was cross-checked numerically against sforzando's own SF2-to-SFZ output for
`Touhou.sf2` (its `.sfz` files state each zone's tune, pan and volume). On the 87 presets with no
preset-level tuning, pan or volume generators, all 6103 zones match exactly in pitch and pan.
Every remaining difference traces to how Plogue's converter treats preset-level generators,
read from its output: it drops preset `fineTune` (written only as a `NOP` comment), lets a
region's own `pan` override the preset's instead of adding to it, and does not clamp
attenuation, so a preset value of -174 cB becomes a +17.4 dB boost. Each of these contradicts
SF2 2.04 section 9.4 and the clamping decision of 2026-08-22.

**Alternatives considered:** Match sforzando, so the A/B sounds identical. Rejected: it would
copy a third-party converter's departures from the spec. The ear test should treat audible
differences on those presets as expected, not as bugs.

## [2026-10-11] The 12.4 template reproduces what Live plays today, not what the old template wrote
**Decision:** The Live 12.4 template uses the device values Live 12.4 actually applies when it
loads a preset from the old Live 10 template: volume -12 dB, Vol<Vel 35%, attack 0.1 ms,
decay 600 ms, sustain full, release 50 ms, 6 voices (`NumVoices` index 5), interpolation 1,
filter off. The re-base commit changes the file format and nothing audible.

**Reason:** Re-saving an old-template preset from Live 12.4.6 showed that the upgrade path
ignores the Live 10 `<Volume>`, `<Envelope>` and `<VoiceSettings>` values entirely and falls
back to defaults. Shipped presets have therefore always played at -12 dB with velocity
sensitivity, not at the unity gain and 16 voices the old template wrote. A first draft of the
re-base copied the old template's values and came out 12 dB louder with no velocity response,
which the A/B in Live caught.

**Alternatives considered:** Keep the old template's intended values (0 dB, Vol<Vel 0%).
Rejected for this commit: it is an audible change for every existing user, made as a side
effect of a format change. Whether the device volume and velocity curve should follow SF2
(which applies a default velocity-to-attenuation modulator) belongs in its own fidelity
change.

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

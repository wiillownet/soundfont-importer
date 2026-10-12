# What the conversion still loses

Live's Sampler cannot represent everything an SF2 carries. This file records what is
dropped, so nobody has to rediscover it by ear.

## Filter resonance

SF2's `initialFilterQ` is discarded. Cutoff and its envelope sweep are mapped (below).

Live's Sampler filter exposes no dB-valued resonance field. It has `Res`, normalized
`0 .. 1.25`, and `LegacyQ`, a Q factor `0.3 .. 10`. Neither is centibels, and the
factory library never varies them in a way that pins the curve, so the mapping from
`initialFilterQ` onto either field could not be determined from the reference
material. Mapping cutoff alone is lossless relative to the previous behaviour, which
wrote no filter at all.

The untested candidate mapping, should anyone pick this up:

```
Q = clamp(10 ** (dB / 20), 0.3, 10)   ->  LegacyQ        where dB = initialFilterQ / 10
```

This is unverified. It needs an ear test against Plogue sforzando on a soundfont with
a strongly resonant zone before it ships. Do not enable it on the strength of the
formula looking reasonable.

Conversion warns and names any preset where a non-zero `initialFilterQ` was
discarded on a zone whose filter is switched on (18 of 185 presets in `Touhou.sf2`).

## Filter: one per preset, not per zone

SF2's lowpass is per zone; Live's Sampler has one filter per device. As for the amp envelope,
the converter uses the filter of the zone containing middle C, or the most common one. The
filter is switched on only when that cutoff is below 18 kHz (SF2's default, ~19.9 kHz, is
effectively open). It runs at 12 dB/octave (`Slope` off) with no key tracking (`ModByPitch` 0),
matching SF2. Zones whose filter differs (on versus off, cutoff or sweep more than a semitone
apart, or a differently shaped sweep) are approximated, and conversion warns and names each such
preset: 56 of 185 in `Touhou.sf2`, of the 62 that get a filter.

The modulation envelope's sweep of the cutoff (`modEnvToFilterFc`) becomes the filter envelope
`Amount`, in semitones, clamped to Live's ±72 (SF2 allows ±120). The modulation envelope maps
onto the filter envelope like the amp envelope does: delay dropped, hold folded into decay,
decay scaled to the distance to sustain, release timed from full level. The filter envelope's
Decay and Release Slope are set to 0 (linear), since SF2's modulation envelope ramps linearly;
with Live's curved default, a render of `Fifth Sawtooth Wave` closed the sweep about twice as
fast as sforzando. Also lost:

- **Cutoff below 30 Hz**, Live's minimum, is raised to 30 Hz (3 presets in `Touhou.sf2`).
- **LFO to cutoff** (`modLfoToFilterFc`) is dropped: 76 zones in `Touhou.sf2`.
- **Velocity to cutoff.** SF2's default modulators lower the cutoff for soft notes, by up to
  2400 cents. Not mapped; Live's `ModByVelocity` stays 0.

Checked against sforzando's SFZ output on 10030 zones: cutoff, on/off and sweep amount match.
Remaining differences are sforzando's own: it reads `sustainModEnv` nonlinearly (spec: linear
0.1% units) and floors it near 0.018, writes `cutoff=0` for zones with a Q but no cutoff, and
writes a preset-level cutoff offset as an absolute cutoff (`BassPick&Mutes` plays at 6 Hz).

## Tuning on multi-key fixed-pitch zones

Live's per-zone `Detune` reaches only ±50 cents, so coarse tune and larger fine tune are moved
into the root key instead. That trick needs the zone to track the keyboard. A fixed-pitch zone
(`scaleTuning` 0) that covers a single key, the usual drum-kit case, is converted as a normal
zone rooted on that key and keeps its full tuning. A fixed-pitch zone spanning *several* keys
cannot: Live has no per-zone transpose for it, so its tuning is clamped to ±50 cents.

Conversion warns and names any preset where this happens. On `Touhou.sf2` it is one preset
("Burst Noise", 3 zones) out of 185.

`scaleTuning` above 100 cents per key gets the same single-key treatment, which is exact. On a
zone spanning several keys it is clamped to 100, the highest Live `TuneScale` value tested so far,
and warned about. `Touhou.sf2` has 12 such zones, all single-key, so none are approximated.

## Amplitude envelope: one per preset, not per zone

SF2 gives every zone its own volume envelope. Live's Sampler has one amp envelope for the whole
device. The converter uses the envelope of the zone containing middle C (MIDI 60), or the most
common envelope when no zone covers it. Zones whose envelope differs audibly from that one
(times more than 25% apart, or sustain more than 1.5 dB apart) lose their own shape: typically a
piano or plucked instrument whose high notes decay faster than its low ones will decay at the
middle-C rate everywhere. Conversion warns and names each such preset, and the success dialog
counts them. On `Touhou.sf2` that is 104 of 185 presets.

Within the chosen envelope:

- **Delay** (`delayVolEnv`) is dropped. Live's amp envelope has no delay stage. 230 of 11646
  zones in `Touhou.sf2` set one.
- **Hold** is added to the decay time, so the note still reaches its sustain level on time. The
  level starts falling during what was the hold, rather than staying at peak.
- **Sustain** below -70 dB, Live's floor, sits on the floor.
- **Decay curve.** SF2 decays linearly in dB to the sustain level. Live's decay (at its default
  Slope of 1) is exponential in amplitude toward sustain: linear in dB toward silence, but it
  flattens as it nears a higher sustain. The decay time is set so Live has fallen 75% of the way
  (in dB) when SF2 has, typically within 1.5 dB of SF2 over the stage. Measured on Live 12.4
  renders of a steady looped `Clarinet`: 83.6 dB per decay time toward silence, verified to
  0.2 dB against the model with a -20 dB sustain.
- **Release** is timed as if the note were released at full level (see `docs/decisions.md`).
  Live's release reaches about -83.6 dB in the release time wherever it starts, so a note
  released from a held sustain fades slower than in the SF2: 24% longer from -20 dB.

## Velocity

SF2's default modulator attenuates soft notes by 40 log10(127/velocity) dB, a curve sforzando
follows to 0.1 dB. Live's Vol<Vel is linear in dB, so it cannot match everywhere. Presets use
50%: within 1.4 dB of SF2 from velocity 48 to 127. Below that Live stays louder (velocity 32:
-19 dB against SF2's -24; velocity 16: -22 against -36). Device volume is Live's default -12 dB.

# What the conversion still loses

Live's Sampler cannot represent everything an SF2 carries. This file records what is
dropped, so nobody has to rediscover it by ear.

Incomplete while Phases 2-4 are in progress; entries are added as each phase lands.

## Filter resonance (decided, not implemented)

SF2's `initialFilterQ` is discarded. Only cutoff is mapped.

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
discarded.

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

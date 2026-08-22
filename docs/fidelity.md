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

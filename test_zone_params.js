// Self-check for the SF2 zone -> Sampler zone mapping. Run: node test_zone_params.js
const assert = require("node:assert");
const { _test } = require("./extension-package/dist/extension.js");
const { abletonZoneParams, zoneSampleBounds, resolveZoneGenerators, GEN } = _test;

// A resolved zone the way buildPresets produces it.
function zone(instrumentGens = {}, { rootKey = 60, pitchCorrection = 0 } = {}) {
  const gens = resolveZoneGenerators({}, instrumentGens);
  return { rootKey, keyMin: 0, keyMax: 127, fineTune: gens[GEN.fineTune] + pitchCorrection, gens };
}
const signed = (n) => n & 0xffff;

// SF2 defaults map to Live's neutral zone.
assert.deepStrictEqual(abletonZoneParams(zone()), {
  rootKey: 60, detune: 0, tuneScale: 100, panorama: 0, volume: 1, tuningLost: false,
});

// Coarse tune moves the root the other way: +2 semitones plays a tone higher.
assert.strictEqual(abletonZoneParams(zone({ [GEN.coarseTune]: 2 })).rootKey, 58);
assert.strictEqual(abletonZoneParams(zone({ [GEN.coarseTune]: signed(-3) })).rootKey, 63);

// Fine tune within +-50 stays in Detune.
{
  const p = abletonZoneParams(zone({ [GEN.fineTune]: 30 }));
  assert.strictEqual(p.rootKey, 60);
  assert.strictEqual(p.detune, 30);
}

// Fine tune plus pitch correction past 50 cents rolls a key into the root:
// +70 cents == one key up (root 59) and -30 cents.
{
  const p = abletonZoneParams(zone({ [GEN.fineTune]: 40 }, { pitchCorrection: 30 }));
  assert.strictEqual(p.rootKey, 59);
  assert.strictEqual(p.detune, -30);
}

// Coarse and fine combine: -1 semitone - 60 cents = -160 cents == two keys down, +40 cents.
{
  const p = abletonZoneParams(zone({ [GEN.coarseTune]: signed(-1), [GEN.fineTune]: signed(-60) }));
  assert.strictEqual(p.rootKey, 62);
  assert.strictEqual(p.detune, 40);
}

// At 50 cents per key, one semitone of tuning is two keys of root shift.
{
  const p = abletonZoneParams(zone({ [GEN.coarseTune]: 1, [GEN.scaleTuning]: 50 }));
  assert.strictEqual(p.tuneScale, 50);
  assert.strictEqual(p.rootKey, 58);
  assert.strictEqual(p.detune, 0);
}

// Fixed pitch (scaleTuning 0): the root does nothing, so tuning goes to Detune only,
// and anything past +-50 cents is clamped and reported.
{
  const small = abletonZoneParams(zone({ [GEN.scaleTuning]: 0, [GEN.fineTune]: 30 }));
  assert.deepStrictEqual([small.rootKey, small.detune, small.tuningLost], [60, 30, false]);
  const big = abletonZoneParams(zone({ [GEN.scaleTuning]: 0, [GEN.coarseTune]: 1 }));
  assert.deepStrictEqual([big.rootKey, big.detune, big.tuningLost], [60, 50, true]);
}

// ...unless the fixed-pitch zone covers a single key: then it is played as a normal zone
// rooted so that key sounds +1 semitone up, and nothing is lost.
{
  const z = zone({ [GEN.scaleTuning]: 0, [GEN.coarseTune]: 1, [GEN.fineTune]: 20 });
  Object.assign(z, { keyMin: 36, keyMax: 36 });
  assert.deepStrictEqual(abletonZoneParams(z), {
    rootKey: 35, detune: 20, tuneScale: 100, panorama: 0, volume: 1, tuningLost: false,
  });
}

// The root key stays a valid MIDI note; what does not fit is reported as lost.
{
  const p = abletonZoneParams(zone({ [GEN.coarseTune]: 5 }, { rootKey: 2 }));
  assert.strictEqual(p.rootKey, 0);
  assert.strictEqual(p.tuningLost, true);
}

// Scale above Live's tested maximum is clamped on a multi-key zone, and reported.
{
  const p = abletonZoneParams(zone({ [GEN.scaleTuning]: 200 }));
  assert.deepStrictEqual([p.tuneScale, p.tuningLost], [100, true]);
}

// On a single key it is exact: at 500 cents per key, key 62 of a zone rooted at 60 sounds
// 10 semitones up, which a 100% zone rooted at 52 reproduces.
{
  const z = zone({ [GEN.scaleTuning]: 500 });
  Object.assign(z, { keyMin: 62, keyMax: 62 });
  assert.deepStrictEqual(abletonZoneParams(z), {
    rootKey: 52, detune: 0, tuneScale: 100, panorama: 0, volume: 1, tuningLost: false,
  });
}

// Pan: SF2 -500..500 to Live -1..1, same sign (negative = left in both).
assert.strictEqual(abletonZoneParams(zone({ [GEN.pan]: signed(-500) })).panorama, -1);
assert.strictEqual(abletonZoneParams(zone({ [GEN.pan]: 250 })).panorama, 0.5);

// Volume: centibels of attenuation to linear gain. 120 cB = -12 dB, which Live stores
// as 0.2511886358 (float32 of the same value).
{
  const v = abletonZoneParams(zone({ [GEN.initialAttenuation]: 120 })).volume;
  assert.ok(Math.abs(v - 0.2511886358) < 1e-8, `got ${v}`);
}

// Sample and loop bounds. Without offsets they follow the sample header; SF2's loop end is
// the first frame after the loop, Live's is the last frame in it.
const sample = { frameCount: 12000, loopStartFrames: 11036, loopEndFrames: 11336 };
const looped = (gens) => ({ ...zone(gens), loopEnabled: true });
assert.deepStrictEqual(zoneSampleBounds(looped(), sample), {
  sampleStart: 0, sampleEnd: 11999, loopStart: 11036, loopEnd: 11335, loopEnabled: true,
});

// Zone-level offsets move the loop. These are Touhou's Clarinet zone 0 values, and the result
// is the loop sforzando plays (11030..11332).
{
  const b = zoneSampleBounds(looped({ [GEN.startloopAddrsOffset]: signed(-6), [GEN.endloopAddrsOffset]: signed(-3) }), sample);
  assert.deepStrictEqual([b.loopStart, b.loopEnd], [11030, 11332]);
}

// Start and end offsets trim the sample; coarse offsets count in 32768-frame units; nothing
// can reach outside the exported audio.
{
  const b = zoneSampleBounds(looped({ [GEN.startAddrsOffset]: 100, [GEN.endAddrsOffset]: signed(-200) }), sample);
  assert.deepStrictEqual([b.sampleStart, b.sampleEnd], [100, 11799]);
  const far = zoneSampleBounds(looped({ [GEN.startAddrsOffset]: signed(-5), [GEN.endloopAddrsCoarseOffset]: 1 }), sample);
  assert.deepStrictEqual([far.sampleStart, far.loopEnd], [0, 11999]);
}

// A loop built entirely from offsets on a sample whose header has no loop (0..0), as in
// Touhou's "MM JZ.F" zones: the offsets apply to 0, not to the end of the sample.
{
  const bare = { frameCount: 216576, loopStartFrames: 0, loopEndFrames: 0 };
  const b = zoneSampleBounds(looped({ [GEN.startloopAddrsOffset]: 15957, [GEN.startloopAddrsCoarseOffset]: 6, [GEN.endloopAddrsOffset]: 17023, [GEN.endloopAddrsCoarseOffset]: 6 }), bare);
  assert.deepStrictEqual([b.loopStart, b.loopEnd, b.loopEnabled], [212565, 213630, true]);
}

// A loop pushed shut is switched off rather than written backwards.
assert.strictEqual(zoneSampleBounds(looped({ [GEN.startloopAddrsOffset]: 400 }), sample).loopEnabled, false);

// Address offsets are instrument-only: at preset level the spec says to ignore them.
assert.strictEqual(resolveZoneGenerators({ [GEN.startloopAddrsOffset]: 5 }, {})[GEN.startloopAddrsOffset], undefined);

console.log("zone params: all checks passed");

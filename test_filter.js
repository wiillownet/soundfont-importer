// Self-check for the SF2 filter -> Sampler filter mapping. Run: node test_filter.js
const assert = require("node:assert");
const { _test } = require("./extension-package/dist/extension.js");
const { zoneFilter, presetFilter, resolveZoneGenerators, GEN } = _test;

function zone(instrumentGens = {}, keys = [0, 127], presetGens = {}) {
  return { keyMin: keys[0], keyMax: keys[1], gens: resolveZoneGenerators(presetGens, instrumentGens) };
}
const signed = (n) => n & 0xffff;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-3, `${label}: got ${actual}, want ${expected}`);

// SF2's default cutoff (~19.9 kHz) leaves the filter off.
assert.strictEqual(zoneFilter(zone()).on, false);

// Cutoff is absolute cents above 8.176 Hz: 6900 cents is 440 Hz, and switches the filter on.
{
  const f = zoneFilter(zone({ [GEN.initialFilterFc]: 6900 }));
  assert.strictEqual(f.on, true);
  near(f.freq, 440, "cutoff Hz");
}

// Just under the threshold is on, just over is off.
assert.strictEqual(zoneFilter(zone({ [GEN.initialFilterFc]: 13000 })).on, true); // ~14.9 kHz
assert.strictEqual(zoneFilter(zone({ [GEN.initialFilterFc]: 13400 })).on, false); // ~19.3 kHz

// A preset-level offset adds to the instrument's cutoff, it does not replace it. This is the
// case sforzando's converter gets wrong (BassPick&Mutes: it plays 6 Hz, the spec gives ~15.5 kHz).
near(zoneFilter(zone({}, [0, 127], { [GEN.initialFilterFc]: signed(-436) })).freq, 440 * 2 ** ((13064 - 6900) / 1200), "preset offset");

// The mod envelope's sweep: cents to semitones, clamped to Live's +-72.
assert.strictEqual(zoneFilter(zone({ [GEN.modEnvToFilterFc]: 3600 })).amount, 36);
assert.strictEqual(zoneFilter(zone({ [GEN.modEnvToFilterFc]: 12000 })).amount, 72);
assert.strictEqual(zoneFilter(zone({ [GEN.modEnvToFilterFc]: signed(-1200) })).amount, -12);

// Mod envelope: linear sustain (0.1% units of decrease), decay scaled to the distance travelled,
// hold folded into decay, release a full-sweep time. These are BassPick's mute zones.
{
  const f = zoneFilter(zone({
    [GEN.attackModEnv]: signed(-8800), [GEN.holdModEnv]: signed(-4569), [GEN.decayModEnv]: 371,
    [GEN.sustainModEnv]: 982, [GEN.releaseModEnv]: signed(-313),
  }));
  near(f.sustain, 0.018, "sustain");
  near(f.attack, 1000 * 2 ** (-8800 / 1200), "attack");
  near(f.decay, 1000 * 2 ** (-4569 / 1200) + 1000 * 2 ** (371 / 1200) * 0.982, "decay");
  near(f.release, 1000 * 2 ** (-313 / 1200), "release");
}

// Per preset: the middle C zone wins; a zone with a different filter is reported.
{
  const dark = zone({ [GEN.initialFilterFc]: 6900 }, [0, 59]);
  const open = zone({}, [60, 127]);
  const r = presetFilter([dark, open]);
  assert.deepStrictEqual([r.filter.on, r.approximated], [false, true]);
}

// Zones within a semitone of each other are the same filter.
{
  const a = zone({ [GEN.initialFilterFc]: 6900 }, [0, 59]);
  const b = zone({ [GEN.initialFilterFc]: 6950 }, [60, 127]);
  assert.strictEqual(presetFilter([a, b]).approximated, false);
}

// Resonance is dropped, and reported only where a filter is actually switched on.
assert.strictEqual(presetFilter([zone({ [GEN.initialFilterFc]: 6900, [GEN.initialFilterQ]: 100 })]).resonanceDropped, true);
assert.strictEqual(presetFilter([zone({ [GEN.initialFilterQ]: 100 })]).resonanceDropped, false);

console.log("filter: all checks passed");

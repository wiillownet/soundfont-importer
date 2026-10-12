// Self-check for the SF2 volume envelope -> Sampler amp envelope mapping. Run: node test_envelope.js
const assert = require("node:assert");
const { _test } = require("./extension-package/dist/extension.js");
const { ampEnvelope, presetEnvelope, resolveZoneGenerators, successDialogHtml, GEN } = _test;

function zone(instrumentGens = {}, keys = [0, 127]) {
  return { keyMin: keys[0], keyMax: keys[1], gens: resolveZoneGenerators({}, instrumentGens) };
}
const signed = (n) => n & 0xffff;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: got ${actual}, want ${expected}`);

// SF2 defaults (every stage ~1 ms, full sustain) land on Live's minimums.
assert.deepStrictEqual(ampEnvelope(zone()), { attack: 0.9765625, decay: 1, sustain: 1, release: 1 });

// Attack converts directly: 0 timecents = 1 s. Out-of-range values clamp to Live's 20 s.
near(ampEnvelope(zone({ [GEN.attackVolEnv]: 0 })).attack, 1000, "attack 1 s");
near(ampEnvelope(zone({ [GEN.attackVolEnv]: 8000 })).attack, 20000, "attack clamp");

// Decay is a rate in SF2 (time for 100 dB, linear in dB) and Live's decay curves toward the
// sustain level. A 5 s SF2 decay to -20 dB gets there in 1 s; Live's matching decay time is
// ~2.95 s (it has fallen 15 dB, 75% of the way, at 0.75 s like SF2). Hold (~1 ms) adds on.
{
  const e = ampEnvelope(zone({ [GEN.decayVolEnv]: 2786, [GEN.sustainVolEnv]: 200 }));
  near(e.sustain, 0.1, "sustain -20 dB as linear amplitude");
  const sf2 = 1000 * 2 ** (2786 / 1200), tau = (e.decay - 1) / (83.6 / (20 * Math.LOG10E));
  const db = 20 * Math.log10(0.1 + 0.9 * Math.exp(-0.75 * 0.2 * sf2 / tau));
  assert.ok(Math.abs(db + 15) < 0.01, `75% of the fall on time: ${db}`);
}

// Hold is folded into decay.
near(ampEnvelope(zone({ [GEN.holdVolEnv]: 0, [GEN.decayVolEnv]: 1200, [GEN.sustainVolEnv]: 200 })).decay
  - ampEnvelope(zone({ [GEN.decayVolEnv]: 1200, [GEN.sustainVolEnv]: 200 })).decay, 1000 - 1000 * 2 ** (-12000 / 1200), "hold + decay");

// Release is timed from full level: Live falls 83.6 dB in the release time, SF2 100 dB in its
// release time, so a 1 s SF2 release is 836 ms whatever the sustain level...
near(ampEnvelope(zone({ [GEN.releaseVolEnv]: 0 })).release, 836, "release");
// ...so a plucked sound that sustains at silence, and is let go mid-decay, still gets its
// release tail instead of a cut.
near(ampEnvelope(zone({ [GEN.releaseVolEnv]: 0, [GEN.sustainVolEnv]: 1000 })).release, 836, "release, silent sustain");

// Sustain below Live's floor sits on the floor; a decay toward it falls at SF2's rate (100 dB per
// SF2 time) to within 2.5%.
{
  const e = ampEnvelope(zone({ [GEN.decayVolEnv]: 1200, [GEN.sustainVolEnv]: 1000 }));
  near(e.sustain, 10 ** (-70 / 20), "sustain floor");
  const rate = 83.6 / ((e.decay - 1) / 1000) / 100 * 2; // Live dB/s over SF2 dB/s
  assert.ok(Math.abs(rate - 1) < 0.025, `floor decay rate ratio ${rate}`);
}

// One envelope per preset: the zone containing middle C wins, and a zone that differs
// audibly is reported.
{
  const low = zone({ [GEN.releaseVolEnv]: 0 }, [0, 59]);
  const mid = zone({ [GEN.releaseVolEnv]: 1200 }, [60, 127]);
  const r = presetEnvelope([low, mid]);
  near(r.envelope.release, 1672, "middle C zone chosen");
  assert.strictEqual(r.approximated, true);
}

// Inaudibly small differences (1 ms against 1.1 ms attack) are not reported.
{
  const a = zone({ [GEN.attackVolEnv]: signed(-12000) }, [0, 59]);
  const b = zone({ [GEN.attackVolEnv]: signed(-11850) }, [60, 127]);
  assert.strictEqual(presetEnvelope([a, b]).approximated, false);
}

// No zone on middle C: the most common envelope wins.
{
  const short = zone({ [GEN.releaseVolEnv]: 0 }, [70, 80]);
  const long = zone({ [GEN.releaseVolEnv]: 1200 }, [81, 90]);
  near(presetEnvelope([short, long, long]).envelope.release, 1672, "modal envelope");
}

// The success dialog shows the count only when something was approximated.
{
  const base = { presetCount: 2, sampleCount: 2, zoneCount: 2, rootDir: "/tmp/x" };
  assert.ok(decodeURIComponent(successDialogHtml({ ...base, approximatedCount: 3 }, "EN")).includes("3 presets use approximated settings"));
  assert.ok(!decodeURIComponent(successDialogHtml({ ...base, approximatedCount: 0 }, "EN")).includes("approximated"));
  assert.ok(decodeURIComponent(successDialogHtml({ ...base, approximatedCount: 3 }, "NL")).includes("3 presets gebruiken benaderde"));
}

console.log("envelope: all checks passed");

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

// Decay is a rate in SF2 (time for 100 dB) and a duration in Live (time to reach sustain):
// a 2 s SF2 decay falling only 20 dB gets there in 0.4 s. Hold (~1 ms by default) adds on.
{
  const e = ampEnvelope(zone({ [GEN.decayVolEnv]: 1200, [GEN.sustainVolEnv]: 200 }));
  near(e.decay, 400 + 1000 * 2 ** (-12000 / 1200), "scaled decay");
  near(e.sustain, 0.1, "sustain -20 dB as linear amplitude");
}

// Hold is folded into decay, so sustain is still reached on time.
near(ampEnvelope(zone({ [GEN.holdVolEnv]: 0, [GEN.decayVolEnv]: 1200, [GEN.sustainVolEnv]: 200 })).decay, 1400, "hold + decay");

// Release is SF2's rate over Live's 70 dB range, timed from full level: a 1 s SF2 release
// takes 0.7 s whatever the sustain level...
near(ampEnvelope(zone({ [GEN.releaseVolEnv]: 0 })).release, 700, "release from full");
near(ampEnvelope(zone({ [GEN.releaseVolEnv]: 0, [GEN.sustainVolEnv]: 200 })).release, 700, "release, -20 dB sustain");

// ...so a plucked sound that sustains at silence, and is let go mid-decay, still gets its
// release tail instead of a 1 ms cut.
near(ampEnvelope(zone({ [GEN.releaseVolEnv]: 0, [GEN.sustainVolEnv]: 1000 })).release, 700, "release, silent sustain");

// Sustain below Live's floor sits on the floor; decay only travels the 70 dB Live has.
{
  const e = ampEnvelope(zone({ [GEN.decayVolEnv]: 1200, [GEN.sustainVolEnv]: 1000 }));
  near(e.sustain, 10 ** (-70 / 20), "sustain floor");
  near(e.decay, 1400 + 1000 * 2 ** (-12000 / 1200), "decay to floor");
}

// One envelope per preset: the zone containing middle C wins, and a zone that differs
// audibly is reported.
{
  const low = zone({ [GEN.releaseVolEnv]: 0 }, [0, 59]);
  const mid = zone({ [GEN.releaseVolEnv]: 1200 }, [60, 127]);
  const r = presetEnvelope([low, mid]);
  near(r.envelope.release, 1400, "middle C zone chosen");
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
  near(presetEnvelope([short, long, long]).envelope.release, 1400, "modal envelope");
}

// The success dialog shows the count only when something was approximated.
{
  const base = { presetCount: 2, sampleCount: 2, zoneCount: 2, rootDir: "/tmp/x" };
  assert.ok(decodeURIComponent(successDialogHtml({ ...base, approximatedCount: 3 }, "EN")).includes("3 presets use approximated settings"));
  assert.ok(!decodeURIComponent(successDialogHtml({ ...base, approximatedCount: 0 }, "EN")).includes("approximated"));
  assert.ok(decodeURIComponent(successDialogHtml({ ...base, approximatedCount: 3 }, "NL")).includes("3 presets gebruiken benaderde"));
}

console.log("envelope: all checks passed");

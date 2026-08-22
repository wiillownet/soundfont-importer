// Self-check for the SF2 generator merge. Run: node test_generators.js
const assert = require("node:assert");
const { _test } = require("./extension-package/dist/extension.js");
const { resolveZoneGenerators, signedAmount, GEN, GEN_DEFAULTS } = _test;

// Signed reinterpretation of a 16-bit amount stored in an unsigned field.
assert.strictEqual(signedAmount(0), 0);
assert.strictEqual(signedAmount(100), 100);
assert.strictEqual(signedAmount(0xffff), -1);          // -1 cent
assert.strictEqual(signedAmount(65526), -10);          // -10 cents
assert.strictEqual(signedAmount(53536), -12000);       // -12000 timecents
assert.strictEqual(signedAmount(32767), 32767);
assert.strictEqual(signedAmount(32768), -32768);       // the "effectively zero" sentinel

// Absent everywhere -> SF2 defaults.
{
  const g = resolveZoneGenerators({}, {});
  assert.strictEqual(g[GEN.attackVolEnv], -12000);
  assert.strictEqual(g[GEN.scaleTuning], 100);
  assert.strictEqual(g[GEN.initialFilterFc], 13500);
  assert.strictEqual(g[GEN.overridingRootKey], -1);
}

// Instrument level is absolute: it replaces the default outright.
{
  const g = resolveZoneGenerators({}, { [GEN.pan]: signed(-250) });
  assert.strictEqual(g[GEN.pan], -250);
}

// Preset level is additive, NOT a replacement. This is the case the old
// `{ ...presetGens, ...instrumentGens }` spread got wrong.
{
  const g = resolveZoneGenerators({ [GEN.fineTune]: 10 }, { [GEN.fineTune]: signed(-5) });
  assert.strictEqual(g[GEN.fineTune], 5, "preset fineTune must add to the instrument value");
}

// A preset offset with no instrument value applies on top of the SF2 default,
// not on top of zero.
{
  const g = resolveZoneGenerators({ [GEN.attackVolEnv]: 1200 }, {});
  assert.strictEqual(g[GEN.attackVolEnv], -10800);
}

// Negative preset offsets work for nominally unsigned generators too.
{
  const g = resolveZoneGenerators({ [GEN.initialAttenuation]: signed(-60) }, { [GEN.initialAttenuation]: 100 });
  assert.strictEqual(g[GEN.initialAttenuation], 40);
}

// Generators that are meaningless at preset level must be ignored there.
{
  const g = resolveZoneGenerators(
    { [GEN.overridingRootKey]: 72, [GEN.sampleModes]: 1, [GEN.exclusiveClass]: 3 },
    { [GEN.overridingRootKey]: 60, [GEN.sampleModes]: 0 },
  );
  assert.strictEqual(g[GEN.overridingRootKey], 60, "preset must not shift the root key");
  assert.strictEqual(g[GEN.sampleModes], 0, "preset must not enable looping");
}

// The summed value is clamped to the SF2 permitted range. Without this, a preset
// offset that drives initialAttenuation negative becomes a large gain boost instead
// of unity -- Touhou.sf2 does exactly this across 9059 zones.
{
  const g = resolveZoneGenerators({ [GEN.initialAttenuation]: signed(-500) }, { [GEN.initialAttenuation]: 81 });
  assert.strictEqual(g[GEN.initialAttenuation], 0, "attenuation must not go negative");
  assert.strictEqual(10 ** (-g[GEN.initialAttenuation] / 200), 1, "unity gain, not a boost");
}
{
  // Clamping applies to the absolute instrument value too, for malformed files.
  const g = resolveZoneGenerators({}, { [GEN.initialFilterFc]: 24132 });
  assert.strictEqual(g[GEN.initialFilterFc], 13500);
  const h = resolveZoneGenerators({}, { [GEN.releaseVolEnv]: signed(-16053) });
  assert.strictEqual(h[GEN.releaseVolEnv], -12000);
}
{
  // The overridingRootKey sentinel must survive clamping.
  const g = resolveZoneGenerators({}, {});
  assert.strictEqual(g[GEN.overridingRootKey], -1, "sentinel must not be clamped to 0");
}

// Table indices stay unsigned; only value generators get reinterpreted.
{
  const g = resolveZoneGenerators({}, { [GEN.sampleID]: 40000, [GEN.instrument]: 40000 });
  assert.strictEqual(g[GEN.sampleID], 40000);
  assert.strictEqual(g[GEN.instrument], 40000);
}

// Defaults table is not mutated across calls.
{
  resolveZoneGenerators({ [GEN.pan]: 100 }, {});
  assert.strictEqual(GEN_DEFAULTS[GEN.pan], 0);
}

// Store a negative value the way an SF2 file does: as raw unsigned bits.
function signed(value) {
  return value & 0xffff;
}

console.log("generator merge: all checks passed");

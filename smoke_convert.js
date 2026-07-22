const fs = require("node:fs/promises");
const path = require("node:path");
const { _test } = require("./extension-package/dist/extension.js");

async function main() {
  const sf2Path = process.argv[2];
  const outRoot = process.argv[3];
  if (!sf2Path || !outRoot) throw new Error("Usage: node smoke_convert.js <file.sf2> <out>");
  const sf2 = _test.parseSoundFont(await fs.readFile(sf2Path));
  const userLibrary = outRoot;
  const samplesDir = path.join(userLibrary, "Samples", "Imported", path.basename(sf2Path, ".sf2"));
  const presetsDir = path.join(userLibrary, "Sampler", "Imports", path.basename(sf2Path, ".sf2"));
  await fs.mkdir(samplesDir, { recursive: true });
  await fs.mkdir(presetsDir, { recursive: true });
  const samples = await _test.writeAiffSamples(sf2, samplesDir);
  const result = await _test.writeSamplerPresets(sf2, samples, presetsDir, samplesDir, userLibrary);
  console.log(JSON.stringify({
    sf2Name: sf2.name,
    sf2Samples: sf2.samples.length,
    sf2Presets: sf2.presets.length,
    ...result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

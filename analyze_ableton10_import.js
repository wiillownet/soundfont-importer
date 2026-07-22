const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node analyze_ableton10_import.js <Ableton 10 import folder>");
  process.exit(2);
}

function textBetween(source, start, end) {
  const a = source.indexOf(start);
  if (a < 0) return "";
  const b = source.indexOf(end, a + start.length);
  if (b < 0) return "";
  return source.slice(a + start.length, b);
}

function valueAfter(source, tag, from = 0) {
  const re = new RegExp(`<${tag} Value="([^"]*)"`);
  const match = source.slice(from).match(re);
  return match ? match[1] : "";
}

function numberAfter(source, tag, from = 0) {
  const value = valueAfter(source, tag, from);
  return value === "" ? null : Number(value);
}

function rangeIn(block, tag) {
  const inner = textBetween(block, `<${tag}>`, `</${tag}>`);
  return {
    min: numberAfter(inner, "Min"),
    max: numberAfter(inner, "Max"),
  };
}

function loopIn(block, tag) {
  const inner = textBetween(block, `<${tag}>`, `</${tag}>`);
  return {
    start: numberAfter(inner, "Start"),
    end: numberAfter(inner, "End"),
    mode: numberAfter(inner, "Mode"),
  };
}

const files = fs.readdirSync(folder).filter((name) => name.endsWith(".adv")).sort((a, b) => a.localeCompare(b));
const presets = [];
const sampleNames = new Set();
let totalZones = 0;
let maxZones = 0;
let maxPreset = "";
const loopModes = new Map();

for (const file of files) {
  const xml = zlib.gunzipSync(fs.readFileSync(path.join(folder, file))).toString("utf8");
  const zones = [];
  const matches = [...xml.matchAll(/<MultiSamplePart\b[\s\S]*?<\/MultiSamplePart>/g)];
  for (const match of matches) {
    const block = match[0];
    const sampleName = valueAfter(textBetween(block, "<FileRef>", "</FileRef>"), "Name");
    if (sampleName) sampleNames.add(sampleName);
    const sustain = loopIn(block, "SustainLoop");
    loopModes.set(sustain.mode, (loopModes.get(sustain.mode) || 0) + 1);
    zones.push({
      name: valueAfter(block, "Name"),
      key: rangeIn(block, "KeyRange"),
      velocity: rangeIn(block, "VelocityRange"),
      rootKey: numberAfter(block, "RootKey"),
      sampleStart: numberAfter(block, "SampleStart"),
      sampleEnd: numberAfter(block, "SampleEnd"),
      sustain,
      sampleName,
      defaultSampleRate: numberAfter(textBetween(block, "<SampleRef>", "</SampleRef>"), "DefaultSampleRate"),
    });
  }
  totalZones += zones.length;
  if (zones.length > maxZones) {
    maxZones = zones.length;
    maxPreset = file;
  }
  presets.push({
    file,
    name: path.basename(file, ".adv"),
    zones: zones.length,
    samples: new Set(zones.map((zone) => zone.sampleName).filter(Boolean)).size,
    keyMin: zones.length ? Math.min(...zones.map((zone) => zone.key.min)) : null,
    keyMax: zones.length ? Math.max(...zones.map((zone) => zone.key.max)) : null,
    roots: zones.map((zone) => zone.rootKey).filter((value) => value !== null),
  });
}

const histogram = new Map();
for (const preset of presets) histogram.set(preset.zones, (histogram.get(preset.zones) || 0) + 1);

console.log(JSON.stringify({
  folder,
  presetCount: presets.length,
  totalZones,
  uniqueSampleRefs: sampleNames.size,
  maxZones,
  maxPreset,
  zoneHistogram: Object.fromEntries([...histogram.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
  sustainLoopModes: Object.fromEntries([...loopModes.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
  firstTenPresets: presets.slice(0, 10),
  notablePresets: presets.filter((preset) => preset.zones >= 8).slice(0, 20),
}, null, 2));

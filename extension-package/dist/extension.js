"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const { execFile } = require("child_process");

class DataModelObject {
  constructor(handle, dataModel, objectRegistry) {
    this.handle = handle;
    this.dataModel = dataModel;
    this.objectRegistry = objectRegistry;
  }
}

function createAsync(dataModel, objectRegistry, klass, fn, ...args) {
  return new Promise((resolve, reject) => {
    dataModel.withinTransaction(() => {
      fn(...args, (handle) => resolve(objectRegistry.getObjectFromHandle(handle, klass)), reject);
    });
  });
}

class Device extends DataModelObject {
  static className = "Device";
  get name() {
    return this.dataModel.deviceGetName(this.handle);
  }
}

class Track extends DataModelObject {
  static className = "Track";
  get name() {
    return this.dataModel.trackGetName(this.handle);
  }
  get devices() {
    return this.dataModel.trackGetDevices(this.handle).map((handle) => this.objectRegistry.getObjectFromHandle(handle, Device));
  }
  insertDevice(deviceName, index) {
    return createAsync(this.dataModel, this.objectRegistry, Device, this.dataModel.trackInsertDevice, this.handle, deviceName, BigInt(index));
  }
}

class MidiTrack extends Track {
  static className = "MidiTrack";
}

class Sample extends DataModelObject {
  static className = "Sample";
  get filePath() {
    return this.dataModel.sampleGetFilePath(this.handle);
  }
}

class Simpler extends Device {
  static className = "Simpler";
  replaceSample(filePath) {
    return createAsync(this.dataModel, this.objectRegistry, Sample, this.dataModel.simplerReplaceSample, this.handle, filePath);
  }
}

const dataModelClasses = [MidiTrack, Track, Simpler, Device, Sample];

class ObjectRegistry {
  constructor(dataModel) {
    this.dataModel = dataModel;
    this.cache = new Map();
  }
  getOrCreateObjectFromHandle(handle) {
    const existing = this.cache.get(handle.id);
    if (existing) return existing;
    const klass = dataModelClasses.find((item) => this.dataModel.getObjectIsOfClass(handle, item.className));
    if (!klass) throw new Error("Unknown Live object type");
    const object = new klass(handle, this.dataModel, this);
    this.cache.set(handle.id, object);
    return object;
  }
  getObjectFromHandle(handle, klass) {
    const object = this.getOrCreateObjectFromHandle(handle);
    if (!(object instanceof klass)) throw new Error(`Expected ${klass.className}`);
    return object;
  }
}

function initialize(extensionHost) {
  const modules = extensionHost.initializeExtensionHost({ apiVersion: "1.0.0" });
  const registry = new ObjectRegistry(modules.dataModel);
  return {
    commands: modules.commands,
    dataModel: modules.dataModel,
    environment: modules.environment,
    resources: {
      importIntoProject(filePath) {
        return new Promise((resolve, reject) => modules.resources.importIntoProject(filePath, resolve, reject));
      },
    },
    ui: {
      registerContextMenuAction(scope, title, commandId) {
        return new Promise((resolve) => modules.ui.registerContextMenuAction(scope, title, commandId, (unregister) => resolve(unregister)));
      },
      showModalDialog(url, width, height) {
        return new Promise((resolve, reject) => modules.ui.showModalDialog(url, width, height, resolve, reject));
      },
      withinProgressDialog(text, options, callback) {
        const ac = new AbortController();
        const toProgress = (label, progress) => typeof progress === "number" ? { text: label, progress } : { text: label };
        return new Promise((resolve, reject) => {
          modules.ui.showProgressDialog(toProgress(text, options.progress), ({ update, close }) => {
            const updateAsync = (label, progress) => new Promise((done) => update(toProgress(label, progress), done));
            const closeAsync = () => new Promise((done) => close(done));
            callback(updateAsync, ac.signal).finally(closeAsync).then(resolve).catch(reject);
          }, () => ac.abort());
        });
      },
    },
    getObjectFromHandle: registry.getObjectFromHandle.bind(registry),
  };
}

function chooseDialogHtml(language) {
  const isDutch = String(language || "").toUpperCase().startsWith("NL");
  const labels = isDutch ? {
    title: "SoundFont Importer",
    dropIdle: "Sleep een SoundFont (.sf2) hierheen",
    dropReady: "Geselecteerd:",
    loading: "SoundFont wordt geladen...",
    loaded: "SoundFont geladen. Klik Import.",
    readError: "Live gaf het bestand wel door, maar de inhoud kon niet worden gelezen.",
    chooseError: "Sleep eerst een .sf2 bestand in het vak.",
    wrongFile: "Dit is geen .sf2 bestand.",
    liveError: "Kan niet met Live praten.",
    cancel: "Cancel",
    import: "Import",
  } : {
    title: "SoundFont Importer",
    dropIdle: "Drop a SoundFont (.sf2) here",
    dropReady: "Selected:",
    loading: "Loading SoundFont...",
    loaded: "SoundFont loaded. Click Import.",
    readError: "Live received the file, but could not read its contents.",
    chooseError: "Drop an .sf2 file into the box first.",
    wrongFile: "That is not an .sf2 file.",
    liveError: "Cannot talk to Live.",
    cancel: "Cancel",
    import: "Import",
  };
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(labels.title)}</title>
  <style>
    :root {
      color-scheme: dark light;
      --bg: #2f2f2f;
      --text: #eeeeec;
      --muted: #b8b8b2;
      --surface: #262626;
      --surface-hover: #303030;
      --surface-ready: #333129;
      --border: #676761;
      --field: #3b3b3b;
      --button-text: #fff;
      --primary: #ffd84a;
      --primary-border: #e0bd35;
      --primary-text: #1f1f1c;
      --accent: #ffd84a;
      --info: #ffd84a;
      --error: #ff9d9d;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #a5a5a5;
        --text: #20201e;
        --muted: #4f4f4f;
        --surface: #a9a9a9;
        --surface-hover: #b0b0b0;
        --surface-ready: #aaa38a;
        --border: #7d7d7d;
        --field: #adadad;
        --button-text: #1e1e1c;
        --primary: #ffd84a;
        --primary-border: #caa72f;
        --primary-text: #20201e;
        --accent: #7a5f00;
        --info: #5f4d00;
        --error: #b33131;
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: "Ableton Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; font-size: 13px; }
    body { padding: 16px; overflow: hidden; }
    .header { display: flex; align-items: baseline; gap: 8px; margin: 0 0 12px; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0; }
    .byline { color: var(--primary); font-size: 11px; font-style: italic; font-weight: 600; }
    .drop {
      display: grid;
      place-items: center;
      min-height: 112px;
      border: 1px dashed var(--border);
      border-radius: 3px;
      background: var(--surface);
      color: var(--text);
      text-align: center;
      padding: 14px;
      font-weight: 600;
      line-height: 1.35;
    }
    .drop:hover, .drop.dragging { border-color: var(--primary-border); background: var(--surface-hover); }
    .drop.ready { border-style: solid; border-color: var(--primary-border); background: var(--surface-ready); }
    .file-name { display: block; margin-top: 6px; color: var(--accent); font-weight: 600; word-break: break-word; }
    .actions { display: flex; gap: 8px; margin-top: 10px; }
    button { flex: 1; border: 1px solid var(--border); border-radius: 3px; padding: 9px 10px; background: var(--field); color: var(--button-text); cursor: pointer; font-weight: 500; }
    button.primary { background: var(--primary); border-color: var(--primary-border); color: var(--primary-text); }
    button:disabled { opacity: .45; cursor: default; filter: none; }
    button:hover { filter: brightness(1.08); }
    .status { min-height: 16px; margin-top: 8px; color: var(--error); }
  </style>
</head>
<body>
  <div class="form" id="form">
    <div class="header"><h1>${htmlEscape(labels.title)}</h1><div class="byline">by Nora Korra</div></div>
    <div class="drop" id="drop">${htmlEscape(labels.dropIdle)}</div>
    <div class="status" id="status"></div>
    <div class="actions">
      <button onclick="cancel()">${htmlEscape(labels.cancel)}</button>
      <button class="primary" id="importButton" onclick="start()" disabled>${htmlEscape(labels.import)}</button>
    </div>
  </div>
  <script>
    const labels = ${JSON.stringify(labels)};
    function post(payload) {
      const message = { method: "close_and_send", params: [JSON.stringify(payload)] };
      if (window.webkit?.messageHandlers?.live) window.webkit.messageHandlers.live.postMessage(message);
      else if (window.chrome?.webview) window.chrome.webview.postMessage(message);
      else setStatus(labels.liveError, true);
    }
    function setStatus(message, isError) {
      const status = document.getElementById("status");
      status.textContent = message || "";
      status.style.color = isError ? "var(--error)" : "var(--info)";
    }
    function setDropText(fileName) {
      const drop = document.getElementById("drop");
      if (fileName) {
        drop.classList.add("ready");
        drop.innerHTML = labels.dropReady + '<span class="file-name"></span>';
        drop.querySelector(".file-name").textContent = fileName;
      } else {
        drop.classList.remove("ready");
        drop.textContent = labels.dropIdle;
      }
    }
    function pickSf2(files) {
      const list = Array.from(files || []);
      return list.find((file) => String(file.name || "").toLowerCase().endsWith(".sf2")) || list[0] || null;
    }
    let selectedSf2 = null;
    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 32768;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
      }
      return btoa(binary);
    }
    async function capturePickedFile(file, missingMessage) {
      selectedSf2 = null;
      document.getElementById("importButton").disabled = true;
      if (file && file.name && String(file.name).toLowerCase().endsWith(".sf2")) {
        setDropText(file.name);
        setStatus(labels.loading, false);
        try {
          const base64 = arrayBufferToBase64(await file.arrayBuffer());
          selectedSf2 = { name: file.name, base64 };
          document.getElementById("importButton").disabled = false;
          setStatus(labels.loaded, false);
        } catch (error) {
          setDropText("");
          setStatus(labels.readError, true);
        }
        return;
      }
      setDropText("");
      setStatus(missingMessage || labels.wrongFile, true);
    }
    function start() {
      if (!selectedSf2) {
        setStatus(labels.chooseError, true);
        return;
      }
      post({ action: "import", sf2Path: selectedSf2.name, sf2Name: selectedSf2.name, sf2DataBase64: selectedSf2.base64 });
    }
    function cancel() { post({ action: "cancel" }); }
    const drop = document.getElementById("drop");
    const form = document.getElementById("form");
    form.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("dragging");
    });
    form.addEventListener("dragleave", () => drop.classList.remove("dragging"));
    form.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("dragging");
      const file = pickSf2(event.dataTransfer.files);
      if (file && String(file.name || "").toLowerCase().endsWith(".sf2")) {
        void capturePickedFile(file);
        return;
      }
      setStatus(labels.wrongFile, true);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") cancel();
      if (event.key === "Enter") start();
    });
  </script>
</body>
</html>`;
}

function errorDialogHtml(message) {
  const escaped = String(message).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  return `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>${dialogThemeCss()}</style></head><body><h1>SoundFont import failed</h1><p style="white-space:pre-wrap">${escaped}</p><button onclick="window.webkit?.messageHandlers?.live?.postMessage({method:'close_and_send',params:['ok']});window.chrome?.webview?.postMessage({method:'close_and_send',params:['ok']})">OK</button></body></html>`)}`;
}

async function showImportDialog(context) {
  const result = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(chooseDialogHtml(context.environment.language))}`, 440, 250).catch(() => "");
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    return parsed.action === "import" ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureInitialOutputFolders(environment) {
  const storageRoot = environment.storageDirectory || environment.tempDirectory;
  if (!storageRoot) return;
  const outputRoot = storageRoot;
  const browserRoot = path.join(outputRoot, "SoundFont Imports");
  const samplesRoot = path.join(outputRoot, "Samples");
  await fsp.mkdir(browserRoot, { recursive: true });
  await fsp.mkdir(samplesRoot, { recursive: true });
  await writeReadme(outputRoot);
  console.log(`[soundfont-importer] Output folders ready: ${browserRoot}`);
}

function dialogThemeCss() {
  return `
    :root {
      color-scheme: dark light;
      --bg: #2f2f2f;
      --text: #eeeeec;
      --muted: #b8b8b2;
      --path-bg: #262626;
      --border: #676761;
      --button-bg: #3b3b3b;
      --button-text: #fff;
      --primary: #ffd84a;
      --primary-border: #e0bd35;
      --primary-text: #20201e;
      --info: #ffd84a;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #a5a5a5;
        --text: #20201e;
        --muted: #4f4f4f;
        --path-bg: #a9a9a9;
        --border: #7d7d7d;
        --button-bg: #adadad;
        --button-text: #20201e;
        --primary: #ffd84a;
        --primary-border: #caa72f;
        --primary-text: #20201e;
        --info: #5f4d00;
      }
    }
    * { box-sizing: border-box; }
    body { margin:0; padding:18px; background:var(--bg); color:var(--text); font:13px "Ableton Sans",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif; }
    p { color:var(--text); line-height:1.35; }
    button { width:100%; margin-top:12px; border:1px solid var(--border); border-radius:3px; padding:9px 10px; background:var(--button-bg); color:var(--button-text); cursor:pointer; font-weight:500; }
    button.primary { background:var(--primary); border-color:var(--primary-border); color:var(--primary-text); }
    button:hover { filter:brightness(1.08); }
  `;
}

function successDialogHtml(result, language) {
  const isDutch = String(language || "").toUpperCase().startsWith("NL");
  const labels = isDutch ? {
    title: "SoundFont import klaar!",
    hint: "Voeg de map \"SoundFont Imports\" toe aan Ableton Places voor snelle toegang tot je geconverteerde presets!",
    outputFolder: "Output map:",
    ok: "Einde",
  } : {
    title: "SoundFont import complete!",
    hint: "Add the \"SoundFont Imports\" folder to Ableton Places for easy access to your converted presets!",
    outputFolder: "Output folder:",
    ok: "End",
  };
  const closeScript = `window.webkit?.messageHandlers?.live?.postMessage({method:'close_and_send',params:['ok']});window.chrome?.webview?.postMessage({method:'close_and_send',params:['ok']})`;
  const stats = htmlEscape(`${result.presetCount} presets, ${result.sampleCount} samples, ${result.zoneCount} zones`);
  const rootDir = htmlEscape(result.rootDir);
  return `data:text/html,${encodeURIComponent(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${dialogThemeCss()}
    body { min-height:100vh; overflow:hidden; padding:18px 18px 30px; display:flex; flex-direction:column; }
    h1 { font-size:18px; margin:0; }
    p { margin:0; color:var(--text); line-height:1.35; }
    .content { display:flex; flex-direction:column; gap:12px; }
    .content h1 { margin-bottom:32px; }
    .stats { font-weight:600; }
    .path { margin:0; padding:9px; background:var(--path-bg); border:1px solid var(--border); border-radius:3px; color:var(--text); word-break:break-all; line-height:1.25; }
    .hint { color:var(--muted); }
    .label { margin-bottom:-4px; }
    .buttons { display:block; margin-top:auto; padding-top:18px; }
    .buttons button { width:100%; margin-top:0; }
  </style>
</head>
<body>
  <div class="content">
    <h1>${htmlEscape(labels.title)}</h1>
    <p class="stats">${stats}</p>
    <p class="hint">${htmlEscape(labels.hint)}</p>
    <p class="hint label">${htmlEscape(labels.outputFolder)}</p>
    <div class="path">${rootDir}</div>
  </div>
  <div class="buttons">
    <button class="primary" onclick="${closeScript}">${htmlEscape(labels.ok)}</button>
  </div>
</body>
</html>`)}`;
}

async function importSf2ToTrack(context, track, importRequest) {
  let result = null;
  await context.ui.withinProgressDialog("Importing SF2 like Ableton 10...", { progress: 0 }, async (update, signal) => {
    signal.throwIfAborted?.();
    let sf2Path = String(importRequest?.sf2Path || "").trim();
    let sf2Buffer = null;
    if (importRequest?.sf2DataBase64) {
      await update("Loading SoundFont from drop...", 6);
      sf2Buffer = Buffer.from(String(importRequest.sf2DataBase64), "base64");
      if (!sf2Path || !sf2Path.toLowerCase().endsWith(".sf2")) sf2Path = importRequest.sf2Name || "SoundFont.sf2";
    } else {
      await update("Finding SoundFont...", 4);
      sf2Path = await resolveSf2Path(sf2Path);
    }
    await update("Reading SoundFont...", 8);
    const sf2 = parseSoundFont(sf2Buffer || await fsp.readFile(sf2Path));
    const storageRoot = context.environment.storageDirectory || context.environment.tempDirectory;
    if (!storageRoot) throw new Error("Live gaf geen storageDirectory of tempDirectory door aan deze extension.");
    const baseName = safeName(path.basename(sf2Path, path.extname(sf2Path)));
    const outputRoot = storageRoot;
    const browserRoot = path.join(outputRoot, "SoundFont Imports");
    const samplesDir = await nextAvailableDir(path.join(outputRoot, "Samples", baseName));
    const presetsDir = await nextAvailableDir(path.join(browserRoot, baseName));
    await fsp.mkdir(samplesDir, { recursive: true });
    await fsp.mkdir(presetsDir, { recursive: true });

    await update("Extracting AIFF samples...", 25);
    const exported = await writeAiffSamples(sf2, samplesDir);
    if (!exported.length) throw new Error("No supported 16-bit mono samples were found in this SF2.");

    await update("Writing Sampler presets...", 65);
    result = await writeSamplerPresets(sf2, exported, presetsDir, samplesDir, outputRoot);
    result.rootDir = browserRoot;
    result.internalRootDir = outputRoot;
    await writeImportReadme(outputRoot);
    console.log(`[soundfont-importer] Imported ${sf2Path}`);
    console.log(`[soundfont-importer] Presets: ${presetsDir}`);
    console.log(`[soundfont-importer] Samples: ${samplesDir}`);
    await update("Done", 100);
  });
  if (result) await context.ui.showModalDialog(successDialogHtml(result, context.environment.language), 520, 300).catch(() => {});
}

async function resolveSf2Path(inputPath) {
  let value = String(inputPath || "").trim();
  if (value.startsWith("file://")) value = decodeURIComponent(value.replace(/^file:\/\//, ""));
  if (value.startsWith("~/")) value = path.join(os.homedir(), value.slice(2));
  if (path.isAbsolute(value) && fs.existsSync(value)) return value;
  if (path.isAbsolute(value)) throw new Error(`SF2 file not found: ${value}`);
  const found = await findFileByName(value);
  if (found) return found;
  const spotlightFound = await findFileWithSpotlight(value);
  if (spotlightFound) return spotlightFound;
  const chosen = await chooseSf2WithMacDialog(value);
  if (chosen) return chosen;
  throw new Error(`Live only returned "${value}" and I could not find that file. Drop the .sf2 file into the dialog so Live passes the file contents directly.`);
}

async function findFileByName(fileName) {
  const wanted = path.basename(fileName).toLowerCase();
  if (!wanted.endsWith(".sf2")) return null;
  const normalizedWanted = normalizeFileName(wanted);
  const roots = commonUserSearchRoots();
  for (const root of roots) {
    const found = await findFileByNameInDir(root, wanted, normalizedWanted, isCloudStorageRoot(root) ? 6 : 5);
    if (found) return found;
  }
  return null;
}

async function findFileWithSpotlight(fileName) {
  if (process.platform !== "darwin") return null;
  const wanted = path.basename(fileName);
  const normalizedWanted = normalizeFileName(wanted);
  const queries = [
    `kMDItemFSName == "${escapeMdfindString(wanted)}"c`,
    escapeMdfindString(wanted),
  ];
  for (const query of queries) {
    const output = await execFileText("mdfind", [query], 5000).catch(() => "");
    for (const line of output.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate || !candidate.toLowerCase().endsWith(".sf2")) continue;
      if (path.basename(candidate).toLowerCase() === wanted.toLowerCase() || normalizeFileName(path.basename(candidate)) === normalizedWanted) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function commonUserSearchRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, "Documents", "SAMPLES", "Soundfonts"),
    path.join(home, "Documents", "SAMPLES"),
    path.join(home, "Documents", "Samples"),
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Music"),
  ];
  if (process.platform === "darwin") {
    roots.push(path.join(home, "Library", "CloudStorage"));
  } else if (process.platform === "win32") {
    roots.push(path.join(home, "OneDrive"));
  }
  return roots;
}

function isCloudStorageRoot(root) {
  return root.includes(`${path.sep}Library${path.sep}CloudStorage`) || path.basename(root).toLowerCase() === "onedrive";
}

async function chooseSf2WithMacDialog(fileName) {
  if (process.platform !== "darwin") return null;
  const prompt = `Live gaf alleen "${path.basename(fileName)}" terug. Kies het .sf2 bestand handmatig.`;
  const script = [
    `set chosenFile to choose file with prompt "${escapeAppleScriptString(prompt)}"`,
    "POSIX path of chosenFile",
  ].join("\n");
  const output = await execFileText("osascript", ["-e", script], 120000).catch(() => "");
  const chosen = output.trim();
  return chosen && chosen.toLowerCase().endsWith(".sf2") && fs.existsSync(chosen) ? chosen : null;
}

function execFileText(command, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(String(stdout || stderr || ""));
    });
  });
}

function escapeMdfindString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeAppleScriptString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeFileName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, "");
}

async function findFileByNameInDir(dir, wanted, normalizedWanted, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const candidate = entry.name.toLowerCase();
    if (candidate === wanted || normalizeFileName(candidate) === normalizedWanted) return path.join(dir, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const found = await findFileByNameInDir(path.join(dir, entry.name), wanted, normalizedWanted, depth - 1);
    if (found) return found;
  }
  return null;
}

function parseSoundFont(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "sfbk") {
    throw new Error("Not an SF2 SoundFont file.");
  }
  const chunks = readChunks(buffer, 12, buffer.readUInt32LE(4) + 8);
  const lists = new Map();
  for (const chunk of chunks) {
    if (chunk.id === "LIST") lists.set(chunk.type, chunk);
  }
  const info = parseInfo(lists.get("INFO")?.payload || Buffer.alloc(0));
  const sampleData = parseSdta(lists.get("sdta")?.payload);
  const pdta = parsePdta(lists.get("pdta")?.payload);
  const samples = parseSamples(pdta.shdr);
  const presets = buildPresets(pdta, samples);
  return { name: info.INAM || "", sampleData, samples, presets };
}

function readChunks(buffer, start, end) {
  const chunks = [];
  let offset = start;
  while (offset + 8 <= end) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    let payloadStart = offset + 8;
    const payloadEnd = payloadStart + size;
    let type = null;
    if (id === "LIST") {
      type = buffer.toString("ascii", payloadStart, payloadStart + 4);
      payloadStart += 4;
    }
    chunks.push({ id, type, payload: buffer.subarray(payloadStart, payloadEnd) });
    offset = payloadEnd + (size % 2);
  }
  return chunks;
}

function parseInfo(payload) {
  const info = {};
  for (const chunk of readChunks(payload, 0, payload.length)) {
    info[chunk.id] = chunk.payload.toString("latin1").replace(/\0+$/, "");
  }
  return info;
}

function parseSdta(payload) {
  if (!payload) throw new Error("SF2 has no sdta list.");
  const smpl = readChunks(payload, 0, payload.length).find((chunk) => chunk.id === "smpl");
  if (!smpl) throw new Error("SF2 has no smpl sample chunk.");
  return smpl.payload;
}

function parsePdta(payload) {
  if (!payload) throw new Error("SF2 has no pdta list.");
  const pdta = {};
  for (const chunk of readChunks(payload, 0, payload.length)) pdta[chunk.id] = chunk.payload;
  for (const name of ["phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr"]) {
    if (!pdta[name]) throw new Error(`SF2 is missing pdta/${name}.`);
  }
  return pdta;
}

function sfName(buffer) {
  return buffer.toString("latin1").split("\0", 1)[0].trim();
}

function parseSamples(buffer) {
  const samples = [];
  for (let offset = 0; offset + 46 <= buffer.length; offset += 46) {
    samples.push({
      name: sfName(buffer.subarray(offset, offset + 20)),
      start: buffer.readUInt32LE(offset + 20),
      end: buffer.readUInt32LE(offset + 24),
      loop_start: buffer.readUInt32LE(offset + 28),
      loop_end: buffer.readUInt32LE(offset + 32),
      sample_rate: buffer.readUInt32LE(offset + 36) || 44100,
      original_pitch: buffer.readUInt8(offset + 40),
      pitch_correction: buffer.readInt8(offset + 41),
      link: buffer.readUInt16LE(offset + 42),
      type: buffer.readUInt16LE(offset + 44),
    });
  }
  if (samples.at(-1)?.name === "EOS") samples.pop();
  return samples;
}

function records(buffer, size, parser) {
  const items = [];
  for (let offset = 0; offset + size <= buffer.length; offset += size) items.push(parser(buffer.subarray(offset, offset + size)));
  return items;
}

// SF2 2.04 generator enumerators (spec section 8.1.2). Only the generators this
// converter actually reads are named here.
const GEN = {
  initialFilterFc: 8,      // filter cutoff, absolute cents
  initialFilterQ: 9,       // filter resonance, centibels
  pan: 17,                 // -500 hard left .. +500 hard right, units of 0.1%
  delayVolEnv: 33,         // timecents
  attackVolEnv: 34,        // timecents
  holdVolEnv: 35,          // timecents
  decayVolEnv: 36,         // timecents
  sustainVolEnv: 37,       // centibels of attenuation below full
  releaseVolEnv: 38,       // timecents
  instrument: 41,          // index into INST
  keyRange: 43,            // packed lo/hi bytes
  velRange: 44,            // packed lo/hi bytes
  initialAttenuation: 48,  // centibels
  coarseTune: 51,          // semitones
  fineTune: 52,            // cents
  sampleID: 53,            // index into SHDR
  sampleModes: 54,         // bit 0 = loop, value 3 = loop until release
  scaleTuning: 56,         // 100 = normal, 0 = fixed pitch
  exclusiveClass: 57,      // voice-stealing group
  overridingRootKey: 58,   // MIDI note, 255/absent = use the sample's original pitch
};

// SF2 2.04 section 8.1.3 default generator values. These matter for the preset-level
// merge: a preset offset applies on top of the SF2 default when the instrument zone
// does not set the generator at all, not on top of zero.
const GEN_DEFAULTS = {
  [GEN.initialFilterFc]: 13500,   // ~19.9 kHz, i.e. effectively open
  [GEN.initialFilterQ]: 0,
  [GEN.pan]: 0,
  [GEN.delayVolEnv]: -12000,
  [GEN.attackVolEnv]: -12000,
  [GEN.holdVolEnv]: -12000,
  [GEN.decayVolEnv]: -12000,
  [GEN.sustainVolEnv]: 0,         // 0 cB of attenuation = full level
  [GEN.releaseVolEnv]: -12000,
  [GEN.initialAttenuation]: 0,
  [GEN.coarseTune]: 0,
  [GEN.fineTune]: 0,
  [GEN.sampleModes]: 0,
  [GEN.scaleTuning]: 100,
  [GEN.overridingRootKey]: -1,    // sentinel for "absent", distinct from any MIDI note
};

// Generators whose 16-bit amount is NOT a signed value: two packed byte ranges and
// two unsigned table indices. Every other generator is read as signed. The spec's
// nominally unsigned value generators (initialAttenuation, sustainVolEnv,
// scaleTuning, initialFilterQ) top out at 1440, so reinterpreting them as signed is
// the identity, while preset-level offsets for those same generators are genuinely
// allowed to be negative -- so signed is the correct reading at both levels.
const RAW_GENERATORS = new Set([GEN.instrument, GEN.keyRange, GEN.velRange, GEN.sampleID]);

// SF2 2.04 section 8.1.3 permitted ranges. The spec requires the summed preset +
// instrument value to be limited to these, and real soundfonts genuinely overflow
// them: Touhou.sf2 sums to initialAttenuation -419 cB across 9059 zones, which read
// literally is a 123x gain boost rather than the intended unity.
//
// overridingRootKey and sampleModes are deliberately absent: the first uses -1 as an
// "absent" sentinel that clamping to 0..127 would destroy, and the second is a
// bitfield that is instrument-level only, so it is never summed.
const GEN_RANGES = {
  [GEN.initialFilterFc]: [1500, 13500],
  [GEN.initialFilterQ]: [0, 960],
  [GEN.pan]: [-500, 500],
  [GEN.delayVolEnv]: [-12000, 5000],
  [GEN.attackVolEnv]: [-12000, 8000],
  [GEN.holdVolEnv]: [-12000, 5000],
  [GEN.decayVolEnv]: [-12000, 8000],
  [GEN.sustainVolEnv]: [0, 1440],
  [GEN.releaseVolEnv]: [-12000, 8000],
  [GEN.initialAttenuation]: [0, 1440],
  [GEN.coarseTune]: [-120, 120],
  [GEN.fineTune]: [-99, 99],
  [GEN.scaleTuning]: [0, 1200],
};

// Generators that carry no meaning in a preset zone (SF2 2.04 section 8.1.2). They
// must be ignored there rather than added as offsets.
const PRESET_INVALID_GENERATORS = new Set([
  GEN.sampleID,
  GEN.instrument,
  GEN.overridingRootKey,
  GEN.sampleModes,
  GEN.exclusiveClass,
]);

// Several generators are signed 16-bit stored in an unsigned field. Reinterpret the
// bits, matching _signed_amount in prototype/sf2_to_simpler_bank/sf2.py.
function signedAmount(amount) {
  return (amount & 0xffff) << 16 >> 16;
}

// SF2 2.04 section 9.4. Generator resolution uses two different rules that are easy
// to conflate, and the old code applied the wrong one at preset level:
//
//   Instrument level is ABSOLUTE. The instrument's global zone supplies defaults and
//   a zone's own generator replaces that value outright.
//
//   Preset level is ADDITIVE. The resolved preset value is an offset *added* to the
//   resolved instrument value; it never replaces it. A preset zone with fineTune=10
//   over an instrument zone with fineTune=-5 yields 5, not 10.
//
// Both `presetGens` and `instrumentGens` arrive already flattened against their own
// global zone by the caller, which is the absolute-override half of the rule.
//
// Two exceptions, both from the spec:
//   - keyRange and velRange intersect rather than add, and are handled by the caller.
//   - the generators in PRESET_INVALID_GENERATORS are ignored at preset level.
//
// Finally the summed value is limited to the generator's permitted range, which the
// spec requires and which malformed-but-common soundfonts rely on to stay sane.
function resolveZoneGenerators(presetGens, instrumentGens) {
  const resolved = { ...GEN_DEFAULTS };
  for (const [key, amount] of Object.entries(instrumentGens)) {
    const op = Number(key);
    resolved[op] = RAW_GENERATORS.has(op) ? amount : signedAmount(amount);
  }
  for (const [key, amount] of Object.entries(presetGens)) {
    const op = Number(key);
    if (RAW_GENERATORS.has(op) || PRESET_INVALID_GENERATORS.has(op)) continue;
    resolved[op] = (resolved[op] ?? 0) + signedAmount(amount);
  }
  for (const [op, [low, high]] of Object.entries(GEN_RANGES)) {
    if (resolved[op] !== undefined) resolved[op] = Math.min(high, Math.max(low, resolved[op]));
  }
  return resolved;
}

function buildPresets(pdta, samples) {
  const phdr = records(pdta.phdr, 38, (item) => ({ name: sfName(item.subarray(0, 20)), program: item.readUInt16LE(20), bank: item.readUInt16LE(22), bag_index: item.readUInt16LE(24) }));
  const pbag = records(pdta.pbag, 4, (item) => ({ gen_index: item.readUInt16LE(0) }));
  const pgen = records(pdta.pgen, 4, (item) => ({ op: item.readUInt16LE(0), amount: item.readUInt16LE(2) }));
  const inst = records(pdta.inst, 22, (item) => ({ name: sfName(item.subarray(0, 20)), bag_index: item.readUInt16LE(20) }));
  const ibag = records(pdta.ibag, 4, (item) => ({ gen_index: item.readUInt16LE(0) }));
  const igen = records(pdta.igen, 4, (item) => ({ op: item.readUInt16LE(0), amount: item.readUInt16LE(2) }));
  // A leading zone with no sampleID (instrument level) or no instrument (preset level)
  // is that layer's global zone: it supplies defaults that a real zone overrides
  // absolutely. Flattening it here is the absolute half of the SF2 merge rule;
  // resolveZoneGenerators applies the additive half across the two layers.
  const instruments = inst.slice(0, -1).map((instrument, index) => {
    const rawZones = zonesFromBags(ibag, igen, instrument.bag_index, inst[index + 1].bag_index);
    const globalGens = rawZones[0] && rawZones[0].gens[GEN.sampleID] === undefined ? rawZones[0].gens : {};
    const zones = rawZones
      .filter((zone) => zone.gens[GEN.sampleID] !== undefined)
      .map((zone) => ({ gens: { ...globalGens, ...zone.gens } }));
    return { name: instrument.name, zones };
  });
  return phdr.slice(0, -1).map((preset, index) => {
    const rawPresetZones = zonesFromBags(pbag, pgen, preset.bag_index, phdr[index + 1].bag_index);
    const presetGlobalGens = rawPresetZones[0] && rawPresetZones[0].gens[GEN.instrument] === undefined ? rawPresetZones[0].gens : {};
    const presetZones = rawPresetZones
      .filter((zone) => zone.gens[GEN.instrument] !== undefined)
      .map((zone) => ({ gens: { ...presetGlobalGens, ...zone.gens } }));
    const zones = [];
    for (const presetZone of presetZones) {
      const instrumentId = presetZone.gens[GEN.instrument];
      if (!instruments[instrumentId]) continue;
      for (const instrumentZone of instruments[instrumentId].zones) {
        if (instrumentZone.gens[GEN.sampleID] === undefined) continue;
        const sampleIndex = instrumentZone.gens[GEN.sampleID];
        const sample = samples[sampleIndex] || {};
        const gens = resolveZoneGenerators(presetZone.gens, instrumentZone.gens);
        const key = intersectRanges(rangeFromAmount(presetZone.gens[GEN.keyRange]), rangeFromAmount(instrumentZone.gens[GEN.keyRange]));
        const vel = intersectRanges(rangeFromAmount(presetZone.gens[GEN.velRange]), rangeFromAmount(instrumentZone.gens[GEN.velRange]));
        const overridingRoot = gens[GEN.overridingRootKey];
        const root = overridingRoot < 0 || overridingRoot === 255 ? sample.original_pitch || 60 : overridingRoot;
        zones.push({
          sample_index: sampleIndex,
          keyMin: key[0],
          keyMax: key[1],
          velocityMin: vel[0],
          velocityMax: vel[1],
          rootKey: root,
          loopEnabled: Boolean(gens[GEN.sampleModes] & 1),
          // The sample header's pitch_correction is a property of the recording and
          // adds to the fineTune generator rather than replacing it. (The Python
          // prototype substitutes instead, using pitch_correction only when fineTune
          // is absent -- that is a prototype bug, not the spec.)
          fineTune: gens[GEN.fineTune] + (sample.pitch_correction || 0),
          gens,
        });
      }
    }
    return { name: preset.name, program: preset.program, bank: preset.bank, zones };
  });
}

function zonesFromBags(bags, generators, startBag, endBag) {
  const zones = [];
  for (let bagIndex = startBag; bagIndex < endBag; bagIndex++) {
    const nextGen = bags[bagIndex + 1]?.gen_index ?? generators.length;
    const gens = {};
    for (const gen of generators.slice(bags[bagIndex].gen_index, nextGen)) gens[gen.op] = gen.amount;
    zones.push({ gens });
  }
  return zones;
}

function rangeFromAmount(amount) {
  if (amount === undefined) return [0, 127];
  return [amount & 255, amount >> 8 & 255];
}

function intersectRanges(...ranges) {
  const low = Math.max(0, ...ranges.map((range) => range[0]));
  const high = Math.min(127, ...ranges.map((range) => range[1]));
  return [low, Math.max(low, high)];
}

async function writeSamples(sf2, samplesDir) {
  const exported = [];
  for (let index = 0; index < sf2.samples.length; index++) {
    const sample = sf2.samples[index];
    if (sample.end <= sample.start) continue;
    const wavPath = path.join(samplesDir, `${String(index).padStart(4, "0")}_${safeName(sample.name)}.wav`);
    const pcm = sf2.sampleData.subarray(sample.start * 2, sample.end * 2);
    await fsp.writeFile(wavPath, Buffer.concat([wavHeader(pcm.length / 2, sample.sample_rate), pcm]));
    exported.push({
      index,
      name: sample.name,
      path: wavPath,
      sampleRate: sample.sample_rate,
      originalPitch: sample.original_pitch,
      loopStartFrames: Math.max(0, sample.loop_start - sample.start),
      loopEndFrames: Math.max(0, sample.loop_end - sample.start),
    });
  }
  return exported;
}

async function nextAvailableDir(basePath) {
  for (let index = 0; index < 1000; index++) {
    const candidate = index === 0 ? basePath : `${basePath}-${index}`;
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }
  return `${basePath}-${Date.now()}`;
}

async function writeAiffSamples(sf2, samplesDir) {
  const exported = [];
  const usedNames = new Set();
  for (let index = 0; index < sf2.samples.length; index++) {
    const sample = sf2.samples[index];
    if (sample.end <= sample.start) continue;
    const fileName = uniqueFileName(usedNames, `${safeName(sample.name || `Sample ${index}`)}.aif`);
    const aiffPath = path.join(samplesDir, fileName);
    const pcm = sf2.sampleData.subarray(sample.start * 2, sample.end * 2);
    const frameCount = pcm.length / 2;
    await fsp.writeFile(aiffPath, aiffBuffer(pcm, frameCount, sample.sample_rate));
    exported.push({
      index,
      name: sample.name || `Sample ${index}`,
      path: aiffPath,
      fileName,
      fileSize: 54 + pcm.length,
      sampleRate: sample.sample_rate,
      frameCount,
      originalPitch: sample.original_pitch,
      loopStartFrames: Math.max(0, sample.loop_start - sample.start),
      loopEndFrames: Math.max(0, sample.loop_end - sample.start),
    });
  }
  return exported;
}

async function writeSamplerPresets(sf2, exported, presetsDir, samplesDir, userLibrary) {
  const exportedByIndex = new Map(exported.map((sample) => [sample.index, sample]));
  const usedPresetNames = new Set();
  let presetCount = 0;
  let zoneCount = 0;
  for (const preset of sf2.presets) {
    const zones = (preset.zones || []).filter((zone) => exportedByIndex.has(zone.sample_index));
    if (!zones.length) continue;
    const fileName = uniqueFileName(usedPresetNames, `${safeName(preset.name || `Preset ${presetCount + 1}`)}.adv`);
    const xml = samplerPresetXml({
      presetName: preset.name || path.basename(fileName, ".adv"),
      zones,
      exportedByIndex,
      samplesDir,
      userLibrary,
    });
    await fsp.writeFile(path.join(presetsDir, fileName), zlib.gzipSync(Buffer.from(xml, "utf8"), { level: 9 }));
    presetCount++;
    zoneCount += zones.length;
  }
  return { presetCount, sampleCount: exported.length, zoneCount, presetsDir, samplesDir };
}

async function writeImportReadme(rootDir) {
  await writeReadme(rootDir);
}

async function writeReadme(rootDir) {
  const text = `--------------------------------------------------
SoundFont Importer by Nora Korra
Version 1.0.0
--------------------------------------------------

SoundFont Importer restores native .sf2 SoundFont importing in Ableton Live.

The extension converts SoundFonts into Ableton Live Sampler presets while
preserving instrument mappings, key zones and samples.

--------------------------------------------------
Requirements
--------------------------------------------------

- Ableton Live with Extensions support
- Ableton Sampler
- A legally obtained .sf2 SoundFont file

--------------------------------------------------
Installation
--------------------------------------------------

1. Download the latest .ablx file from the GitHub releases page:

   https://github.com/norakorra/soundfont-importer/releases/latest

2. Open Ableton Live.

3. Open:

   Settings → Extensions

4. Drag the .ablx file into the Extensions window, or click "Choose File".

5. Restart Ableton Live after installation.

--------------------------------------------------
Importing a SoundFont
--------------------------------------------------

1. Right-click a supported track, device, clip, scene or browser location.

2. Choose:

   Import SoundFont (.sf2)

3. Drag a .sf2 file into the importer window.

4. Click Import.

5. Wait for the conversion to finish.

--------------------------------------------------
Important: Add the output folder to Places
--------------------------------------------------

After a successful import, SoundFont Importer will display the folder where
the converted presets were saved.

The first time you use the extension, it is highly recommended to open that
folder and add it to "Places" in Ableton's browser.

Doing this means that all future SoundFont imports will automatically appear
in the same location, making them immediately accessible inside Ableton Live.

Recommended workflow:

1. Complete your first import.

2. Open the output path shown by the extension.

3. Open the generated folder.

4. Drag that folder into the "Places" section in Ableton.

5. All future imports will automatically appear there.

The actual output path is supplied dynamically by Ableton for the current
computer and is shown after importing. It is never tied to the developer's
username or home directory.

Platform-independent User Library examples:

macOS:
~/Music/Ableton/User Library/SoundFont Imports/

Windows:
C:\\Users\\<username>\\Music\\Ableton\\User Library\\SoundFont Imports\\

--------------------------------------------------
Notes
--------------------------------------------------

- The extension does not include any SoundFonts.
- Large SoundFonts may take time to convert.
- Compatibility can vary depending on the SoundFont.
- Keep the generated samples and presets together.
- Moving or deleting the generated files can break the presets.

--------------------------------------------------
Credits
--------------------------------------------------

SoundFont Importer by Nora Korra

Built using Ableton's Extensions SDK.

Copyright (c) 2026 Aaron Werinussa.

Released under the MIT License.
`;
  await fsp.writeFile(path.join(rootDir, "README.txt"), text, "utf8");
}

function uniqueFileName(usedNames, desired) {
  const ext = path.extname(desired);
  const stem = path.basename(desired, ext);
  let candidate = desired;
  let index = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${index}${ext}`;
    index++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function samplerPresetXml({ presetName, zones, exportedByIndex, samplesDir, userLibrary }) {
  const sampleParts = zones.map((zone, index) => multisamplePartXml({
    id: index,
    zone,
    sample: exportedByIndex.get(zone.sample_index),
    samplesDir,
    userLibrary,
  })).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="10.0_377" SchemaChangeCount="6" Creator="Ableton Live 10.1.43" Revision="0e617fc8048569557b05b35c5dcc68f74fed435a">
	<MultiSampler>
		<LomId Value="0" />
		<LomIdView Value="0" />
		<IsExpanded Value="true" />
		<On>
			<LomId Value="0" />
			<Manual Value="true" />
			<AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget>
			<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
		</On>
		<ParametersListWrapper LomId="0" />
		<LastSelectedTimeableIndex Value="0" />
		<LastSelectedClipEnvelopeIndex Value="0" />
		<LastPresetRef><Value /></LastPresetRef>
		<LockedScripts />
		<IsFolded Value="false" />
		<ShouldShowPresetName Value="true" />
		<UserName Value="${xmlEscape(presetName)}" />
		<Annotation Value="" />
		<SourceContext><Value /></SourceContext>
		<OverwriteProtectionNumber Value="${Math.floor(Math.random() * 100000)}" />
		<Player>
			<MultiSampleMap>
				<SampleParts>
${sampleParts}
				</SampleParts>
				<LoadInRam Value="false" />
				<LayerCrossfade Value="0" />
				<SourceContext />
			</MultiSampleMap>
			<Reverse><LomId Value="0" /><Manual Value="false" /><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds></Reverse>
			<Snap><LomId Value="0" /><Manual Value="false" /><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds></Snap>
			<InterpolationMode Value="1" />
			<UseConstPowCrossfade Value="true" />
		</Player>
		<Pitch><TransposeKey><LomId Value="0" /><Manual Value="0" /><MidiControllerRange><Min Value="-48" /><Max Value="48" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></TransposeKey><TransposeFine><LomId Value="0" /><Manual Value="0" /><MidiControllerRange><Min Value="-50" /><Max Value="50" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></TransposeFine><ScrollPosition Value="-1073741824" /></Pitch>
		<Filter><IsOn><LomId Value="0" /><Manual Value="false" /><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds></IsOn><Slot><Value /></Slot></Filter>
		<Volume><Volume><LomId Value="0" /><Manual Value="1" /><MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></Volume></Volume>
		<Envelope><AttackTime><LomId Value="0" /><Manual Value="1" /><MidiControllerRange><Min Value="0" /><Max Value="60000" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></AttackTime><DecayTime><LomId Value="0" /><Manual Value="60000" /><MidiControllerRange><Min Value="1" /><Max Value="60000" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></DecayTime><SustainLevel><LomId Value="0" /><Manual Value="1" /><MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></SustainLevel><ReleaseTime><LomId Value="0" /><Manual Value="50" /><MidiControllerRange><Min Value="1" /><Max Value="60000" /></MidiControllerRange><AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget><ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget></ReleaseTime></Envelope>
		<VoiceSettings><Voices Value="16" /><VoiceMode Value="0" /><Retrigger Value="true" /></VoiceSettings>
	</MultiSampler>
</Ableton>
`;
}

function multisamplePartXml({ id, zone, sample, samplesDir, userLibrary }) {
  const relativeParts = relativePathParts(userLibrary, samplesDir);
  const absoluteParts = samplesDir.split(path.sep).filter(Boolean);
  const loopStart = sample.loopStartFrames || 0;
  const loopEnd = Math.max(loopStart, sample.loopEndFrames || sample.frameCount);
  const loopMode = zone.loopEnabled && loopEnd > loopStart ? 1 : 0;
  return `					<MultiSamplePart Id="${id}" HasImportedSlicePoints="false" NeedsAnalysisData="false">
						<LomId Value="0" />
						<Name Value="${xmlEscape(sample.name)}" />
						<Selection Value="${id === 0 ? "true" : "false"}" />
						<IsActive Value="true" />
						<Solo Value="false" />
						<KeyRange><Min Value="${zone.keyMin}" /><Max Value="${zone.keyMax}" /><CrossfadeMin Value="${zone.keyMin}" /><CrossfadeMax Value="${zone.keyMax}" /></KeyRange>
						<VelocityRange><Min Value="${Math.max(1, zone.velocityMin)}" /><Max Value="${zone.velocityMax}" /><CrossfadeMin Value="${Math.max(1, zone.velocityMin)}" /><CrossfadeMax Value="${zone.velocityMax}" /></VelocityRange>
						<SelectorRange><Min Value="0" /><Max Value="127" /><CrossfadeMin Value="0" /><CrossfadeMax Value="127" /></SelectorRange>
						<RootKey Value="${zone.rootKey}" />
						<Detune Value="0" />
						<TuneScale Value="100" />
						<Panorama Value="0" />
						<Volume Value="1" />
						<Link Value="false" />
						<SampleStart Value="0" />
						<SampleEnd Value="${Math.max(0, sample.frameCount - 1)}" />
						<SustainLoop><Start Value="${loopStart}" /><End Value="${Math.max(0, loopEnd - 1)}" /><Mode Value="${loopMode}" /><Crossfade Value="0" /><Detune Value="0" /></SustainLoop>
						<ReleaseLoop><Start Value="0" /><End Value="${Math.max(0, sample.frameCount - 1)}" /><Mode Value="3" /><Crossfade Value="0" /><Detune Value="0" /></ReleaseLoop>
						<SampleRef>
							<FileRef>
								<HasRelativePath Value="true" />
								<RelativePathType Value="6" />
								<RelativePath>${relativeParts.map((part, index) => `<RelativePathElement Id="${index}" Dir="${xmlEscape(part)}" />`).join("")}</RelativePath>
								<Name Value="${xmlEscape(sample.fileName)}" />
								<Type Value="2" />
								<Data />
								<RefersToFolder Value="false" />
								<SearchHint><PathHint>${absoluteParts.map((part, index) => `<RelativePathElement Id="${index}" Dir="${xmlEscape(part)}" />`).join("")}</PathHint><FileSize Value="${sample.fileSize}" /><Crc Value="0" /></SearchHint>
								<LivePackName Value="" />
								<LivePackId Value="" />
							</FileRef>
							<LastModDate Value="${Math.floor(Date.now() / 1000)}" />
							<SourceContext />
							<SampleUsageHint Value="0" />
							<DefaultDuration Value="${sample.frameCount}" />
							<DefaultSampleRate Value="${sample.sampleRate}" />
						</SampleRef>
						<SlicingThreshold Value="100" />
						<SlicingBeatGrid Value="4" />
						<SlicingRegionCount Value="8" />
						<SlicingStyle Value="0" />
						<SlicingSensitivity Value="1" />
						<BeatSlices><BeatSlice Id="0" TimeInSeconds="0" Rank="0" NormalizedEnergy="0" /><BeatSlice Id="1" TimeInSeconds="0" Rank="0" NormalizedEnergy="0" /></BeatSlices>
						<UseDynamicBeatSlices Value="true" />
						<UseDynamicRegionSlices Value="true" />
					</MultiSamplePart>`;
}

function relativePathParts(from, to) {
  return path.relative(from, to).split(path.sep).filter(Boolean);
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function aiffBuffer(pcmLe, frameCount, sampleRate) {
  const pcmBe = Buffer.alloc(pcmLe.length);
  for (let offset = 0; offset + 1 < pcmLe.length; offset += 2) {
    pcmBe[offset] = pcmLe[offset + 1];
    pcmBe[offset + 1] = pcmLe[offset];
  }
  const formSize = 4 + 8 + 18 + 8 + 8 + pcmBe.length;
  const buffer = Buffer.alloc(54 + pcmBe.length);
  let o = 0;
  buffer.write("FORM", o); o += 4;
  buffer.writeUInt32BE(formSize, o); o += 4;
  buffer.write("AIFF", o); o += 4;
  buffer.write("COMM", o); o += 4;
  buffer.writeUInt32BE(18, o); o += 4;
  buffer.writeUInt16BE(1, o); o += 2;
  buffer.writeUInt32BE(frameCount, o); o += 4;
  buffer.writeUInt16BE(16, o); o += 2;
  writeExtended80(buffer, o, sampleRate || 44100); o += 10;
  buffer.write("SSND", o); o += 4;
  buffer.writeUInt32BE(8 + pcmBe.length, o); o += 4;
  buffer.writeUInt32BE(0, o); o += 4;
  buffer.writeUInt32BE(0, o); o += 4;
  pcmBe.copy(buffer, o);
  return buffer;
}

function writeExtended80(buffer, offset, value) {
  if (!value) {
    buffer.fill(0, offset, offset + 10);
    return;
  }
  const sign = value < 0 ? 0x8000 : 0;
  let number = Math.abs(value);
  let exponent = Math.floor(Math.log2(number));
  let fraction = number / Math.pow(2, exponent);
  const biased = exponent + 16383;
  let mantissa = BigInt(Math.floor(fraction * Math.pow(2, 63)));
  buffer.writeUInt16BE(sign | biased, offset);
  for (let i = 7; i >= 0; i--) {
    buffer[offset + 2 + i] = Number(mantissa & 0xffn);
    mantissa >>= 8n;
  }
}

function wavHeader(frameCount, sampleRate) {
  const dataBytes = frameCount * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate || 44100, 24);
  header.writeUInt32LE((sampleRate || 44100) * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

function buildManifest(sf2Path, sf2, exported) {
  return {
    format: "sf2-to-simpler-bank.v1",
    name: sf2.name || path.basename(sf2Path, path.extname(sf2Path)),
    source: sf2Path,
    samples: exported,
    presets: sf2.presets,
  };
}

function findFirstZone(manifest) {
  for (const preset of manifest.presets) {
    for (const zone of preset.zones || []) return zone;
  }
  return null;
}

function safeName(value) {
  return String(value || "sample").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 72) || "sample";
}

const importContextMenuScopes = [
  "AudioTrack",
  "MidiTrack",
  "AudioTrack.ArrangementSelection",
  "MidiTrack.ArrangementSelection",
  "AudioClip",
  "MidiClip",
  "ClipSlot",
  "ClipSlotSelection",
  "Scene",
  "Sample",
  "Simpler",
  "DrumRack",
];

function activate(extensionHost) {
  const context = initialize(extensionHost);
  console.log("SoundFont Importer activate() started.");
  void ensureInitialOutputFolders(context.environment).catch((error) => {
    console.error("[soundfont-importer] Failed to prepare output folders:", error);
  });
  context.commands.registerCommand("sf2importer.importSoundFont", () => {
    void (async () => {
      const importRequest = await showImportDialog(context);
      if (!importRequest) return;
      try {
        await importSf2ToTrack(context, null, importRequest);
      } catch (error) {
        console.error("[soundfont-importer] Import failed:", error);
        await context.ui.showModalDialog(errorDialogHtml(error?.message || String(error)), 420, 220).catch(() => {});
      }
    })();
  });
  for (const scope of importContextMenuScopes) {
    context.ui.registerContextMenuAction(scope, "Import SoundFont (.sf2)", "sf2importer.importSoundFont")
      .then(() => console.log(`SoundFont Importer registered ${scope} context action.`))
      .catch((error) => console.error(`SoundFont Importer failed to register ${scope} context action:`, error));
  }
  console.log("SoundFont Importer activate() finished.");
}

module.exports = { activate, _test: { parseSoundFont, writeAiffSamples, writeSamplerPresets, resolveZoneGenerators, signedAmount, GEN, GEN_DEFAULTS } };

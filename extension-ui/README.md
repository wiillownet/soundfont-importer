# Extension UI Notes

Target UI:

- One large drop target/button: "Choose SoundFont"
- Accepts `.sf2`
- Shows conversion progress: parse, extract samples, build bank, import into Live
- Shows result actions: reveal output folder, create rack/preset in Live

Pseudo-flow for the Ableton Extensions SDK:

```js
async function onChooseSoundFont(file) {
  setState({ phase: "converting", progress: 0 });
  const outputDir = await liveExtension.storage.createFolderFor(file.name);
  const manifest = await liveExtension.process.runBundledTool("sf2_to_simpler_bank", [
    file.path,
    outputDir,
  ]);

  setState({ phase: "importing", progress: 0.75 });
  await createSimplerBankFromManifest(JSON.parse(manifest), outputDir);
  setState({ phase: "done", progress: 1 });
}
```

The exact host API names need to be replaced with the current Ableton Extensions SDK names once the SDK is present in the workspace.

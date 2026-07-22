# ABLX Format Notes

Observed from `clipcolors-1.0.0.ablx`:

- `.ablx` is a ZIP archive.
- Minimal files:
  - `manifest.json`
  - `dist/extension.js`
- Example manifest:

```json
{
  "name": "clipcolors",
  "author": "ARPMAN",
  "entry": "dist/extension.js",
  "version": "1.0.0",
  "minimumApiVersion": "1.0.0"
}
```

The JavaScript entry exports an `activate(extensionHost)` function via CommonJS:

```js
module.exports = { activate };
```

The example uses:

- `extensionHost.initializeExtensionHost({ apiVersion: "1.0.0" })`
- `commands.registerCommand(...)`
- `ui.registerContextMenuAction(...)`
- `ui.showModalDialog(...)`
- Node built-ins like `fs`, `path`, and `os`

This means a first SF2 importer can be packaged without a special binary format. The remaining unknown is which file-picker/import APIs are available in the current SDK beyond modal dialogs and context-menu commands.

## File Picker Pattern

`DrumRack-1Shotulator-2.0.0.ablx` shows that modal-dialog HTML can use browser file inputs and read the native absolute path:

```html
<input type="file" id="folderInput" webkitdirectory>
```

```js
const file = event.target.files[0];
const absolutePath = file.path;
```

Drag/drop also exposes `event.dataTransfer.files[0].path`. The SF2 importer uses the same pattern with `accept=".sf2"`.

--------------------------------------------------
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
C:\Users\<username>\Music\Ableton\User Library\SoundFont Imports\

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

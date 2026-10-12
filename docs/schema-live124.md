# Sampler `.adv` schema: Live 12.4 vs the shipped Live 10 template

Phase 0 findings. Analysis only, no behaviour was changed.

## Method, and a deviation from the brief

The brief points at `reference/live124-sampler.adv` as schema ground truth. **That file is not in
this repository** — it is untracked, unstashed, absent from all of `git log --all`, and not covered
by `.gitignore`. It appears never to have been committed.

Rather than stop, the ground truth was rebuilt from the Ableton Live 12.4.3 installed on this
machine (`/Applications/Ableton Live 12 Suite.app`, `CFBundleShortVersionString` = `12.4.3`):

- **2628** `.adv` files scanned across the app bundle's Core Library and the user library.
- **110** contain a `<MultiSamplePart>`; **78** are `<MultiSampler>` (Sampler) presets.
- **380** zones total.
- Baseline reference used throughout: `Core Library/Defaults/Instruments/Sampler.adv` — Live's own
  default Sampler preset, i.e. exactly what Live 12.4 writes for an untouched device.
- Populated-filter reference: `Core Library/Devices/Instruments/Sampler/Bass/Saw Filtered Bass.adv`.

This is stronger evidence than a single hand-made file for anything the factory library exercises,
and weaker for anything it does not. Both cases are marked below.

Ableton's factory presets are **not** copied into this repo (they are Ableton's copyrighted
content). Regenerate locally with:

```sh
gunzip -c "/Applications/Ableton Live 12 Suite.app/Contents/App-Resources/Core Library/Defaults/Instruments/Sampler.adv" > /tmp/default-sampler.xml
```

## 1. The `<Ableton>` header

Shipped template:

```
<Ableton MajorVersion="5" MinorVersion="10.0_377" SchemaChangeCount="6" Creator="Ableton Live 10.1.43" Revision="0e617fc8048569557b05b35c5dcc68f74fed435a">
```

Live 12.4.3, identical across all 78 Sampler presets:

```
<Ableton MajorVersion="5" MinorVersion="12.0_12402" SchemaChangeCount="1" Creator="Ableton Live 12.4d1" Revision="42bc084cd8152e4fb737ef3fefd04b2bea5320e7">
```

`MajorVersion` is unchanged at `5`. `SchemaChangeCount` went **6 → 1**, which confirms it is a
per-`MinorVersion` counter, not monotonic — do not treat it as a version ordering.

**Does Live 12.4 accept the Live 10 header?** Almost certainly yes, and the header is not the
interesting risk. Evidence: the converter's current output uses the Live 10 header *together with*
the Live 10 `<FileRef>` layout (see §3), and per the brief that output already loads in Live with
key ranges, root keys, loop points and sample resolution all correct. That only happens if Live's
preset upgrade path is running and rewriting the old schema on load.

**Not verified by me:** I did not load a generated preset into Live 12.4. That check needs the GUI
and is still outstanding. Everything here is derived from files Live itself wrote.

## 2. Top-level `<MultiSampler>` children

| | |
|---|---|
| In template, **gone** in 12.4 | `Envelope`, `Volume`, `VoiceSettings` |
| In 12.4, absent from template | `AuxEnv`, `AuxLfos`, `BreakoutIsExpanded`, `Globals`, `KeyDst`, `Lfo`, `MidiCtrl`, `ModulationSourceCount`, `MpePitchBendUsesTuning`, `Pointee`, `RelVelDst`, `Shaper`, `SimplerSlicing`, `VelDst`, `ViewData`, `ViewSettings`, `VolumeAndPan` |

The three element names Phases 2–4 need to write are **exactly the three that no longer exist**:

- `<Volume>` → now `<VolumeAndPan><Volume>`
- `<Envelope>` → now nested at `<VolumeAndPan><Envelope>`
- `<VoiceSettings>` → now `<Globals>`

## 3. `<FileRef>` also changed (works today via upgrade)

Live 12.4 writes:

```xml
<RelativePathType Value="5" />
<RelativePath Value="Samples/Multisamples/Synths/Ob Saw/Ob Saw 1.aif" />
<Path Value="/absolute/path/Ob Saw 1.aif" />
<Type Value="2" />
<LivePackName Value="Core Library" />
<LivePackId Value="www.ableton.com/0" />
<OriginalFileSize Value="218632" />
<OriginalCrc Value="8" />
<SourceHint Value="" />
```

The template writes `RelativePathType="6"`, `RelativePath` as a **nested `<RelativePathElement>`
list**, plus `HasRelativePath`, `Name`, `Data`, `RefersToFolder` and `SearchHint` — none of which
exist in 12.4. Since samples resolve correctly today, this is the clearest proof the upgrade path
handles the whole Live 10 document. **Do not touch this in Phases 1–4**; it is on the "working
today, do not regress" list.

> **Superseded (2026-10-11).** The template was re-based on Live 12.4, `<FileRef>` included (see
> `docs/decisions.md`). The 12.4 form writes `RelativePathType 6` with a "/"-joined `RelativePath`
> including the file name, plus the absolute `Path`. Live 12.4.6 writes the same form for User
> Library samples. Also, the upgrade path does *not* handle the whole Live 10 document: it drops
> the device-level volume, envelope and voice values (see §5 and the decision).

## 4. Per-zone `<MultiSamplePart>` fields

Element order in 12.4 is unchanged from the template. The open element gains one attribute:
`InitUpdateAreSlicesFromOnsetsEditableAfterRead="false"`. Also `SlicingRegionCount` (template) is
`SlicingRegions` in 12.4, and `<SampleRef>` gains `SamplesToAutoWarp`.

Observed across 380 factory zones:

| Field | Observed | Distinct | Verdict |
|---|---|---|---|
| `Detune` | −31 … +31 | 23 | integer cents. **True bounds not determined** |
| `TuneScale` | 100 only | 1 | **Never exercised by factory content** |
| `Panorama` | 0 only | 1 | **Never exercised by factory content** |
| `Volume` | 0.4999999106 … 7.47796583 | 13 | **linear gain** — see §5 |
| `RootKey` | 18 … 108 | 49 | MIDI note, as already implemented |

### Loop `Mode` enum, as actually observed

| Mode | `SustainLoop` count | `ReleaseLoop` count |
|---|---|---|
| 0 | 98 | 21 |
| 1 | 188 | 1 |
| 2 | 56 | — |
| 3 | — | 320 |

`0` = off and `1` = forward loop, consistent with what the converter already emits. `2` occurs only
on sustain loops (ping-pong / back-and-forth). `3` is overwhelmingly the `ReleaseLoop` default and
is what the template already hardcodes — leave it alone.

## 5. Units: both resolved, and both are linear

This was the brief's explicit "determine, do not guess" question. Both are settled by arithmetic on
values Live wrote.

**Per-zone `Volume` is linear gain, not dB.** Round dB values land on non-round stored numbers:

| Stored | `20·log10` |
|---|---|
| `0.5011872053` | **−6.000 dB** |
| `1.04712999` | **+0.400 dB** |
| `1.58489347` | **+4.000 dB** |
| `7.47796583` | +17.476 dB |

So `Volume = 10^(dB/20)`. Note it exceeds 1 (boost is allowed), so do not clamp the Phase 2 result
to 1. For Phase 2, SF2 `initialAttenuation` in centibels → `gain = 10 ** (-cB / 200)` as the brief
states, which is correct **because the target field is linear**.

**`SustainLevel` is linear amplitude, not dB.** Its `Min` is `0.0003162277571`, which is exactly
−70.000 dB, with `Max` = 1. A dB-valued field would have `Min = -70`. So the brief's
`sustain_amplitude = 10 ** (-centibels / 200)` is the right conversion.

**Device-level `<VolumeAndPan><Volume>` is the opposite — it *is* dB**, range −36 … +36, default
**−12**. The template's `<Volume><Volume><Manual Value="1">` with `Min="0.0003162277571" Max="1"` is
the Live 10 *linear* field. This is a real unit collision: if that value were ever read under the
12.4 schema without conversion it would mean +1 dB, not unity. It is presumably handled by the
upgrade path today, but it is the single strongest argument for moving to the 12.4 template.

## 6. Device amp envelope — `<VolumeAndPan><Envelope>` in Live 12.4

Full parameter set with Live's own defaults and bounds:

| Param | Default | Min | Max |
|---|---|---|---|
| `AttackTime` | 0.1000000015 | 0.1000000015 | 20000 |
| `AttackLevel` | 0.0003162277571 | 0.0003162277571 | 1 |
| `AttackSlope` | 0 | −1 | 1 |
| `DecayTime` | 600 | 1 | 60000 |
| `DecayLevel` | 1 | 0.0003162277571 | 1 |
| `DecaySlope` | 1 | −1 | 1 |
| `SustainLevel` | 1 | 0.0003162277571 | 1 |
| `ReleaseTime` | 50 | 1 | 60000 |
| `ReleaseLevel` | 0.0003162277571 | 0.0003162277571 | 1 |
| `ReleaseSlope` | 1 | −1 | 1 |
| `LoopMode` | 0 | 0 | 4 |
| `LoopTime` | 100 | 0.200000003 | 20000 |
| `RepeatTime` | 3 | 0 | 14 |
| `TimeVelScale` | 0 | −100 | 100 |
| `FadeInTime` | 0.1000000015 | 0 | 2000 |
| `SustainMode` | 0 | 0 | 1 |
| `FadeOutTime` | 0.1000000015 | 0 | 2000 |

Times are **milliseconds**. Phase 3 must convert `2 ** (timecents/1200)` seconds → ms (×1000) and
clamp into these ranges.

The template's `<Envelope>` carries only `AttackTime`/`DecayTime`/`SustainLevel`/`ReleaseTime`, and
its `AttackTime` range (`0 … 60000`) does not match 12.4's (`0.1 … 20000`). The template's
hardcoded values (attack 1, decay 60000, sustain 1, release 50) all happen to fall inside the 12.4
ranges, so nothing is out of bounds today.

Live 12.4 has **no hold stage** — confirmed, there is no `HoldTime`. The brief's choice stands.

## 7. Filter

Live's own default Sampler preset has the filter **`IsOn` = true but wide open** (`Freq` = 22000).

Structure of a populated `<Slot>` (the current code emits `<Slot><Value /></Slot>`):

```xml
<Filter>
  <IsOn><LomId Value="0" /><Manual Value="true" />
    <AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget>
    <MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
  </IsOn>
  <Slot>
    <Value>
      <SimplerFilter Id="0">
        <LegacyType>...<Manual Value="0" /></LegacyType>
        <Type>...<Manual Value="0" /><Min Value="0" /><Max Value="4" /></Type>
        <CircuitLpHp>...<Manual Value="0" /><Min Value="0" /><Max Value="4" /></CircuitLpHp>
        <CircuitBpNoMo>...<Manual Value="0" /><Min Value="0" /><Max Value="1" /></CircuitBpNoMo>
        <Slope>...<Manual Value="true" /></Slope>
        <Freq>...<Manual Value="22000" /><Min Value="30" /><Max Value="22000" /></Freq>
        <LegacyQ>...<Manual Value="0.6999999881" /><Min Value="0.3000000119" /><Max Value="10" /></LegacyQ>
        <Res>...<Manual Value="0.09090908617" /><Min Value="0" /><Max Value="1.25" /></Res>
        <X>...<Manual Value="..." /><Min Value="0" /><Max Value="1" /></X>
        <Drive>...<Manual Value="0" /><Min Value="0" /><Max Value="24" /></Drive>
        <Envelope>... full filter envelope, same shape as §6 ...</Envelope>
        ... LFO / key / velocity modulation blocks ...
      </SimplerFilter>
    </Value>
  </Slot>
</Filter>
```

A populated `<Slot>` is ~10.8 KB of XML. **All 78 presets populate it — including the 8 whose
filter is off.** Live never writes the empty `<Slot><Value /></Slot>` that the template emits.

Bounds that matter for Phase 4:

- `Freq`: **30 … 22000 Hz**. Clamp `8.176 * 2 ** (cents/1200)` into this.
- `Type`: 0 … 4, default 0. Type `4` is the morph filter (seen in `Saw Filtered Bass` with
  `X = 0.85`). `0` is the default and the correct target for SF2's lowpass.
- `Slope`: boolean. SF2's filter is a 2-pole / 12 dB per octave, so this wants `false`;
  Live's default is `true` (24 dB).

### Phase 4 blocker: resonance has no dB field

The brief's `resonance_dB = centibels / 10` **has no field to write it to.** Live exposes:

- `Res` — normalized `0 … 1.25`, default `0.09090908617` (= exactly 1/11)
- `LegacyQ` — a Q factor, `0.3 … 10`, default `0.7`

Neither is dB. The mapping from SF2 `initialFilterQ` (centibels of resonant peak gain, 0–960 cB)
onto either field is **not determinable from the reference material**, and the factory library never
varies `Res` in a way that pins the curve. Per the brief's own instruction — "if a phase turns out
to be blocked by something in the `.adv` schema you cannot determine from the reference file, say so
and stop rather than guessing at field semantics" — this needs a decision before Phase 4 ships.
Cheapest defensible option is to map cutoff only and leave resonance at Live's default, which is
lossless relative to today (today writes no filter at all).

## 8. Unresolved

| Question | Status |
|---|---|
| `Detune` true bounds | **Resolved (2026-10-11):** integer cents, `-50 … 50`. A preset saved from Live 12.4 with the UI dragged to both ends stored `50` and `-50`. |
| `Panorama` bounds | **Resolved (2026-10-11):** `-1 … 1`, negative = left. Live's 50L and 50R stored `-1` and `1`, so `pan / 500` keeps SF2's sign. |
| `TuneScale` bounds | **Partly resolved (2026-10-11):** a percentage, `0` = fixed pitch (Live's 0 % stored `0`). Values above 100 untested; the converter clamps to 100. |
| Filter resonance mapping | Not mapped (decision 2026-08-22); cutoff and filter envelope are, see `docs/fidelity.md`. |
| Live 12.4 load test | **Done (2026-10-11):** the re-based template loads in Live 12.4.6 with all zones and samples resolved. |

The reference preset is `reference/live124-sampler.adv` (gitignored; saved by the repo owner from
Live 12.4.6). It also confirms §5 and §6: zone `Volume` -12 dB stored `0.2511886358`, envelope times
in ms (`200`, `1000`, `2000`), `SustainLevel` -10 dB stored `0.3162277639`, and filter `Freq` in Hz
(`1000`).

## 9. Recommendation on the template

The brief anticipated "switch the header if it causes a problem". The finding is larger than that:
the header is fine, but **three of the elements Phases 2–4 must write no longer exist in the 12.4
schema**, and one of them (`<Volume>`) changed units between linear and dB.

Two options:

1. **Keep the Live 10 template, keep the Live 10 header.** Continues to rely on the upgrade path,
   which demonstrably works today. Phases 2–4 write Live 10 field names and let Live convert. Least
   risk of regressing what works; per-zone `Detune`/`Panorama`/`Volume` are identical in both
   schemas anyway, so **Phase 2 is unaffected by this choice entirely.**
2. **Re-base the template on Live 12.4's default Sampler preset.** Native field names, no upgrade
   path, and the device `Volume` unit collision disappears. Costs a full retest of the parts that
   currently work — including the `<FileRef>` rewrite in §3, which is the riskiest part of the file.

Recommend **option 1 for Phases 1–3** and revisiting only if Phase 4's filter refuses to load.
Mixing the two is the one thing to avoid: do not write a 12.4 `<VolumeAndPan>` into a document
stamped with the Live 10 header.

Whichever is chosen, the header belongs in one named constant, per the brief.

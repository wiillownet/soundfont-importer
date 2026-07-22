import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any


GEN_INSTRUMENT = 41
GEN_KEY_RANGE = 43
GEN_VEL_RANGE = 44
GEN_COARSE_TUNE = 51
GEN_FINE_TUNE = 52
GEN_SAMPLE_ID = 53
GEN_SAMPLE_MODES = 54
GEN_OVERRIDING_ROOT_KEY = 58


@dataclass
class SoundFont:
    name: str
    sample_data: bytes
    samples: list[dict[str, Any]]
    presets: list[dict[str, Any]]

    @classmethod
    def from_file(cls, path: Path) -> "SoundFont":
        data = path.read_bytes()
        riff_type, chunks = _read_riff(data)
        if riff_type != b"sfbk":
            raise ValueError(f"{path} is not an SF2 SoundFont RIFF file")

        info = {}
        sample_data = b""
        pdta = {}
        for chunk_id, chunk_type, payload in chunks:
            if chunk_id != b"LIST":
                continue
            if chunk_type == b"INFO":
                info = _parse_info(payload)
            elif chunk_type == b"sdta":
                sample_data = _parse_sdta(payload)
            elif chunk_type == b"pdta":
                pdta = _parse_pdta(payload)

        samples = _parse_samples(pdta["shdr"])
        presets = _build_presets(pdta, samples)
        return cls(
            name=info.get("INAM", ""),
            sample_data=sample_data,
            samples=samples,
            presets=presets,
        )


def _read_riff(data: bytes) -> tuple[bytes, list[tuple[bytes, bytes | None, bytes]]]:
    if data[:4] != b"RIFF":
        raise ValueError("Missing RIFF header")
    size = struct.unpack_from("<I", data, 4)[0]
    riff_type = data[8:12]
    return riff_type, _read_chunks(data[12 : 8 + size])


def _read_chunks(data: bytes) -> list[tuple[bytes, bytes | None, bytes]]:
    chunks = []
    offset = 0
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        payload_start = offset + 8
        payload_end = payload_start + size
        payload = data[payload_start:payload_end]
        chunk_type = None
        if chunk_id == b"LIST":
            chunk_type = payload[:4]
            payload = payload[4:]
        chunks.append((chunk_id, chunk_type, payload))
        offset = payload_end + (size % 2)
    return chunks


def _parse_info(payload: bytes) -> dict[str, str]:
    fields = {}
    for chunk_id, _chunk_type, data in _read_chunks(payload):
        text = data.rstrip(b"\x00").decode("latin-1", errors="replace")
        fields[chunk_id.decode("ascii", errors="replace")] = text
    return fields


def _parse_sdta(payload: bytes) -> bytes:
    for chunk_id, _chunk_type, data in _read_chunks(payload):
        if chunk_id == b"smpl":
            return data
    raise ValueError("SF2 has no smpl sample-data chunk")


def _parse_pdta(payload: bytes) -> dict[str, bytes]:
    pdta = {}
    for chunk_id, _chunk_type, data in _read_chunks(payload):
        pdta[chunk_id.decode("ascii")] = data
    required = ("phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr")
    missing = [name for name in required if name not in pdta]
    if missing:
        raise ValueError(f"SF2 pdta chunk is missing: {', '.join(missing)}")
    return pdta


def _parse_samples(data: bytes) -> list[dict[str, Any]]:
    records = []
    for offset in range(0, len(data), 46):
        if offset + 46 > len(data):
            break
        name = _sf_name(data[offset : offset + 20])
        start, end, loop_start, loop_end, rate = struct.unpack_from("<IIIII", data, offset + 20)
        original_pitch = data[offset + 40]
        pitch_correction = struct.unpack_from("<b", data, offset + 41)[0]
        link, sample_type = struct.unpack_from("<HH", data, offset + 42)
        records.append(
            {
                "name": name,
                "start": start,
                "end": end,
                "loop_start": loop_start,
                "loop_end": loop_end,
                "sample_rate": rate,
                "original_pitch": original_pitch,
                "pitch_correction": pitch_correction,
                "link": link,
                "type": sample_type,
            }
        )
    return records[:-1] if records and records[-1]["name"] == "EOS" else records


def _build_presets(pdta: dict[str, bytes], samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    phdr = _records(pdta["phdr"], 38, _parse_phdr)
    pbag = _records(pdta["pbag"], 4, _parse_bag)
    pgen = _records(pdta["pgen"], 4, _parse_gen)
    inst = _records(pdta["inst"], 22, _parse_inst)
    ibag = _records(pdta["ibag"], 4, _parse_bag)
    igen = _records(pdta["igen"], 4, _parse_gen)

    instruments = []
    for instrument_index, instrument in enumerate(inst[:-1]):
        next_bag = inst[instrument_index + 1]["bag_index"]
        instruments.append(
            {
                "name": instrument["name"],
                "zones": _zones_from_bags(
                    ibag,
                    igen,
                    instrument["bag_index"],
                    next_bag,
                    zone_kind="instrument",
                    samples=samples,
                ),
            }
        )

    presets = []
    for preset_index, preset in enumerate(phdr[:-1]):
        next_bag = phdr[preset_index + 1]["bag_index"]
        preset_zones = _zones_from_bags(
            pbag,
            pgen,
            preset["bag_index"],
            next_bag,
            zone_kind="preset",
            samples=samples,
        )
        zones = []
        global_preset = _first_global_zone(preset_zones)
        for preset_zone in preset_zones:
            instrument_id = preset_zone["generators"].get(GEN_INSTRUMENT)
            if instrument_id is None or instrument_id >= len(instruments):
                continue
            for instrument_zone in instruments[instrument_id]["zones"]:
                if GEN_SAMPLE_ID not in instrument_zone["generators"]:
                    continue
                zones.append(_merge_zone(global_preset, preset_zone, instrument_zone, samples))
        presets.append(
            {
                "name": preset["name"],
                "program": preset["program"],
                "bank": preset["bank"],
                "zones": zones,
            }
        )
    return presets


def _zones_from_bags(
    bags: list[dict[str, int]],
    generators: list[dict[str, int]],
    start_bag: int,
    end_bag: int,
    zone_kind: str,
    samples: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    zones = []
    for bag_index in range(start_bag, end_bag):
        next_gen = bags[bag_index + 1]["gen_index"] if bag_index + 1 < len(bags) else len(generators)
        gen_items = generators[bags[bag_index]["gen_index"] : next_gen]
        zones.append(
            {
                "kind": zone_kind,
                "generators": {item["operator"]: item["amount"] for item in gen_items},
                "ranges": _ranges_from_generators(gen_items),
            }
        )
    return zones


def _first_global_zone(zones: list[dict[str, Any]]) -> dict[str, Any] | None:
    for zone in zones:
        gens = zone["generators"]
        if GEN_INSTRUMENT not in gens and GEN_SAMPLE_ID not in gens:
            return zone
    return None


def _merge_zone(
    global_preset: dict[str, Any] | None,
    preset_zone: dict[str, Any],
    instrument_zone: dict[str, Any],
    samples: list[dict[str, Any]],
) -> dict[str, Any]:
    sample_index = instrument_zone["generators"][GEN_SAMPLE_ID]
    sample = samples[sample_index] if sample_index < len(samples) else {}
    key_min, key_max = _intersect_ranges(
        (0, 127),
        global_preset["ranges"].get("key", (0, 127)) if global_preset else (0, 127),
        preset_zone["ranges"].get("key", (0, 127)),
        instrument_zone["ranges"].get("key", (0, 127)),
    )
    vel_min, vel_max = _intersect_ranges(
        (0, 127),
        global_preset["ranges"].get("velocity", (0, 127)) if global_preset else (0, 127),
        preset_zone["ranges"].get("velocity", (0, 127)),
        instrument_zone["ranges"].get("velocity", (0, 127)),
    )
    gens = {}
    for source in (global_preset, preset_zone, instrument_zone):
        if source:
            gens.update(source["generators"])

    root = gens.get(GEN_OVERRIDING_ROOT_KEY)
    if root in (None, 255):
        root = sample.get("original_pitch", 60)

    return {
        "sample_index": sample_index,
        "keyMin": key_min,
        "keyMax": key_max,
        "velocityMin": vel_min,
        "velocityMax": vel_max,
        "rootKey": root,
        "coarseTune": _signed_amount(gens.get(GEN_COARSE_TUNE, 0)),
        "fineTune": _signed_amount(gens.get(GEN_FINE_TUNE, sample.get("pitch_correction", 0))),
        "loopEnabled": bool(gens.get(GEN_SAMPLE_MODES, 0) & 1),
    }


def _ranges_from_generators(generators: list[dict[str, int]]) -> dict[str, tuple[int, int]]:
    ranges = {}
    for item in generators:
        if item["operator"] == GEN_KEY_RANGE:
            ranges["key"] = _range_amount(item["amount"])
        elif item["operator"] == GEN_VEL_RANGE:
            ranges["velocity"] = _range_amount(item["amount"])
    return ranges


def _intersect_ranges(*ranges: tuple[int, int]) -> tuple[int, int]:
    low = max(item[0] for item in ranges)
    high = min(item[1] for item in ranges)
    return low, max(low, high)


def _range_amount(amount: int) -> tuple[int, int]:
    return amount & 0xFF, (amount >> 8) & 0xFF


def _signed_amount(amount: int) -> int:
    return struct.unpack("<h", struct.pack("<H", amount & 0xFFFF))[0]


def _records(data: bytes, size: int, parser):
    return [parser(data[offset : offset + size]) for offset in range(0, len(data) - size + 1, size)]


def _parse_phdr(data: bytes) -> dict[str, Any]:
    program, bank, bag_index = struct.unpack_from("<HHH", data, 20)
    return {"name": _sf_name(data[:20]), "program": program, "bank": bank, "bag_index": bag_index}


def _parse_inst(data: bytes) -> dict[str, Any]:
    (bag_index,) = struct.unpack_from("<H", data, 20)
    return {"name": _sf_name(data[:20]), "bag_index": bag_index}


def _parse_bag(data: bytes) -> dict[str, int]:
    gen_index, mod_index = struct.unpack("<HH", data)
    return {"gen_index": gen_index, "mod_index": mod_index}


def _parse_gen(data: bytes) -> dict[str, int]:
    operator, amount = struct.unpack("<HH", data)
    return {"operator": operator, "amount": amount}


def _sf_name(data: bytes) -> str:
    return data.split(b"\x00", 1)[0].decode("latin-1", errors="replace").strip()

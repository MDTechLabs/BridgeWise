#!/usr/bin/env python3
"""Fail CI on Slither findings not explicitly recorded in the reviewed baseline."""

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path


def fail(message: str) -> None:
    print(f"Slither baseline error: {message}", file=sys.stderr)
    raise SystemExit(2)


def normalize_description(value: str) -> str:
    # Ignore line-number changes, but retain the finding's substantive description.
    value = re.sub(r":\d+(?:-\d+)?", ":#", value)
    value = re.sub(r"\bline\s+\d+\b", "line #", value, flags=re.IGNORECASE)
    return " ".join(value.split())


def finding_identity(detector: dict) -> dict:
    elements = detector.get("elements") or []
    source_element = next(
        (
            element
            for element in elements
            if (element.get("source_mapping") or {}).get("filename_relative")
        ),
        {},
    )
    mapping = source_element.get("source_mapping") or {}

    file_name = mapping.get("filename_relative")
    if not file_name:
        fail(f"finding has no relative source file: {detector.get('check', '<unknown>')}")

    file_name = Path(file_name).as_posix()
    if file_name.startswith("../") or file_name.startswith("/"):
        fail(f"finding source path is not repository-relative: {file_name}")

    contract = next(
        (
            element.get("name")
            for element in elements
            if element.get("type") == " contract"
            or element.get("type") == "contract"
        ),
        "",
    )
    function = next(
        (
            element.get("name")
            for element in elements
            if element.get("type") in {"function", "modifier"}
        ),
        "",
    )

    identity = {
        "detector": detector.get("check", ""),
        "file": file_name,
        "contract": contract,
        "function": function,
        "description": normalize_description(detector.get("description", "")),
    }
    encoded = json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    identity["fingerprint"] = hashlib.sha256(encoded).hexdigest()
    identity["impact"] = detector.get("impact", "Unknown")
    identity["confidence"] = detector.get("confidence", "Unknown")
    return identity


def read_json(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as file:
            value = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read valid JSON from {path}: {error}")

    if not isinstance(value, dict):
        fail(f"{path} must contain a JSON object")
    return value


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: check_slither_baseline.py REPORT.json BASELINE.json")

    report = read_json(sys.argv[1])
    baseline = read_json(sys.argv[2])

    if baseline.get("version") != 1:
        fail("baseline version must be 1")

    entries = baseline.get("findings")
    if not isinstance(entries, list):
        fail("baseline 'findings' must be a JSON array")

    approved: dict[str, dict] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            fail("each baseline finding must be a JSON object")

        fingerprint = entry.get("fingerprint")
        count = entry.get("count")
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
            fail("each entry needs a valid 64-character fingerprint")
        if fingerprint in approved:
            fail(f"duplicate baseline fingerprint: {fingerprint}")
        if not isinstance(count, int) or count < 1:
            fail(f"baseline entry {fingerprint} needs a positive integer count")

        for required in ("detector", "file", "reason", "reviewed_by", "reviewed_on"):
            if not isinstance(entry.get(required), str) or not entry[required].strip():
                fail(f"baseline entry {fingerprint} needs non-empty '{required}'")

        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["reviewed_on"]):
            fail(f"baseline entry {fingerprint} reviewed_on must use YYYY-MM-DD")

        approved[fingerprint] = entry

    detectors = (report.get("results") or {}).get("detectors")
    if not isinstance(detectors, list):
        fail("Slither report is missing results.detectors")

    actual: Counter[str] = Counter()
    identities: dict[str, dict] = {}
    for detector in detectors:
        if not isinstance(detector, dict):
            fail("Slither report contains a malformed detector result")
        identity = finding_identity(detector)
        fingerprint = identity["fingerprint"]
        actual[fingerprint] += 1
        identities[fingerprint] = identity

    unexpected = []
    for fingerprint, count in sorted(actual.items()):
        entry = approved.get(fingerprint)
        if entry is None:
            unexpected.append((fingerprint, count, identities[fingerprint]))
        elif entry["count"] != count:
            print(
                f"COUNT CHANGED {fingerprint}: approved {entry['count']}, found {count}",
                file=sys.stderr,
            )
            unexpected.append((fingerprint, count, identities[fingerprint]))

    stale = sorted(set(approved) - set(actual))

    if unexpected or stale:
        for fingerprint, count, identity in unexpected:
            print(
                "UNAPPROVED "
                f"fingerprint={fingerprint} count={count} "
                f"detector={identity['detector']} impact={identity['impact']} "
                f"confidence={identity['confidence']} file={identity['file']} "
                f"contract={identity['contract'] or '<unknown>'} "
                f"function={identity['function'] or '<unknown>'}",
                file=sys.stderr,
            )
            print(f"  description: {identity['description']}", file=sys.stderr)

        for fingerprint in stale:
            print(
                f"STALE baseline entry (remove or re-review): {fingerprint}",
                file=sys.stderr,
            )

        fail("review all findings; CI does not update the baseline automatically")

    print(f"Slither baseline passed: {len(actual)} reviewed finding group(s).")


if __name__ == "__main__":
    main()

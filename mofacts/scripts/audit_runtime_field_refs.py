#!/usr/bin/env python3
"""Scan runtime code for authored TDF field references missing from schemas.

This is intentionally regex-based rather than a full TypeScript parser so it can
catch references in TS, Svelte, HTML, Mongo projection strings, and comments that
document runtime field use. It is a conservative audit helper: review findings
before changing runtime behavior.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import DefaultDict, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]

SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".svelte", ".html"}
DEFAULT_SCAN_DIRS = ("client", "server", "common")

DEFAULT_EXCLUDED_PARTS = {
    ".meteor",
    "node_modules",
    "public",
}

DEFAULT_EXCLUDED_NAMES = {
    "fieldRegistry.ts",
    "fieldRegistrySections.ts",
    "deliverySettingsMigration.ts",
    "deliverySettings.test.ts",
    "test.ts",
    "svelteCardTester.html",
    "tdfSchema.json",
    "stimSchema.json",
}

# These are intentionally not authored TDF-schema fields.
KNOWN_NON_TDF_FIELDS: dict[str, set[str]] = {
    # Resolved at runtime from video session data, not authored under deliverySettings.
    "deliverySettings": {"isVideoSession", "videoUrl"},
    # Stimulus-file schema, package metadata, or system-managed publish metadata,
    # not tutor.setspec authoring fields.
    "setspec": {
        "clusters",
        "properties",
        "isPublished",
        "ispublished",
        "lessonLineageId",
        "lessonlineageid",
        "lineageId",
        "lineageid",
        "publishedAt",
        "publishedat",
        "version",
        "versionLabel",
        "versionlabel",
        "versionMajor",
        "versionmajor",
    },
}


@dataclass(frozen=True)
class Finding:
    section: str
    field: str
    file: str
    line: int
    evidence: str


def load_schema_properties(schema_path: Path) -> dict[str, set[str]]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    tutor = schema["properties"]["tutor"]["properties"]
    setspec = tutor["setspec"]["properties"]
    delivery_settings = tutor["deliverySettings"]["properties"]
    unit = tutor["unit"]["items"]["properties"]
    return {
        "setspec": set(setspec),
        "deliverySettings": set(delivery_settings),
        "unit": set(unit),
        "learningsession": set(unit["learningsession"]["properties"]),
        "assessmentsession": set(unit["assessmentsession"]["properties"]),
        "videosession": set(unit["videosession"]["properties"]),
    }


def iter_source_files(include_tests: bool) -> Iterable[Path]:
    for scan_dir in DEFAULT_SCAN_DIRS:
      base = REPO_ROOT / scan_dir
      for path in base.rglob("*"):
          if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
              continue
          parts = set(path.parts)
          if parts & DEFAULT_EXCLUDED_PARTS:
              continue
          if path.name in DEFAULT_EXCLUDED_NAMES:
              continue
          if not include_tests and path.name.endswith((".test.ts", ".spec.ts")):
              continue
          yield path


IDENT = r"([A-Za-z_][A-Za-z0-9_]*)"

DOT_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "setspec": (
        re.compile(rf"\bsetspec\s*\??\s*\.\s*{IDENT}"),
        re.compile(rf"\bsetSpec\s*\??\s*\.\s*{IDENT}"),
    ),
    "deliverySettings": (
        re.compile(rf"\bdeliverySettings\s*\??\s*\.\s*{IDENT}"),
    ),
    "unit": (
        re.compile(rf"\bcurTdfUnit\s*\??\s*\.\s*{IDENT}"),
        re.compile(rf"\bcurrentTdfUnit\s*\??\s*\.\s*{IDENT}"),
    ),
    "learningsession": (
        re.compile(rf"\blearningsession\s*\??\s*\.\s*{IDENT}"),
    ),
    "assessmentsession": (
        re.compile(rf"\bassessmentsession\s*\??\s*\.\s*{IDENT}"),
    ),
    "videosession": (
        re.compile(rf"\bvideosession\s*\??\s*\.\s*{IDENT}"),
    ),
}

STRING_PATH_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "setspec": (
        re.compile(rf"(?:content\.tdfs\.tutor\.|tutor\.)setspec\.{IDENT}"),
        re.compile(rf"\bsetspec\.{IDENT}"),
    ),
    "deliverySettings": (
        re.compile(rf"(?:unit\[\]|unit\.\d+|setspec\.unitTemplate\[\]|tutor)\.deliverySettings\.{IDENT}"),
        re.compile(rf"\bdeliverySettings\.{IDENT}"),
    ),
    "learningsession": (
        re.compile(rf"(?:unit\[\]|unit\.\d+)\.learningsession\.{IDENT}"),
    ),
    "assessmentsession": (
        re.compile(rf"(?:unit\[\]|unit\.\d+)\.assessmentsession\.{IDENT}"),
    ),
    "videosession": (
        re.compile(rf"(?:unit\[\]|unit\.\d+)\.videosession\.{IDENT}"),
    ),
}

DESTRUCTURING_PATTERNS: dict[str, re.Pattern[str]] = {
    "setspec": re.compile(r"\b(?:const|let|var)\s*{([^}]+)}\s*=\s*[^;]*\bsetspec\b"),
    "deliverySettings": re.compile(r"\b(?:const|let|var)\s*{([^}]+)}\s*=\s*[^;]*\bdeliverySettings\b"),
}


def clean_destructured_names(group: str) -> list[str]:
    names: list[str] = []
    for part in group.split(","):
        name = part.strip().split(":", 1)[0].split("=", 1)[0].strip()
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            names.append(name)
    return names


def scan_file(path: Path) -> list[Finding]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    relative = str(path.relative_to(REPO_ROOT))
    findings: list[Finding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for section, patterns in DOT_PATTERNS.items():
            for pattern in patterns:
                for match in pattern.finditer(line):
                    findings.append(Finding(section, match.group(1), relative, line_number, match.group(0).strip()))
        for section, patterns in STRING_PATH_PATTERNS.items():
            for pattern in patterns:
                for match in pattern.finditer(line):
                    findings.append(Finding(section, match.group(1), relative, line_number, match.group(0).strip()))
        for section, pattern in DESTRUCTURING_PATTERNS.items():
            for match in pattern.finditer(line):
                for field in clean_destructured_names(match.group(1)):
                    findings.append(Finding(section, field, relative, line_number, match.group(0).strip()))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schema", default="public/tdfSchema.json", help="Path to generated TDF schema")
    parser.add_argument("--include-tests", action="store_true", help="Include *.test.ts and *.spec.ts files")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    schema_props = load_schema_properties(REPO_ROOT / args.schema)
    findings: DefaultDict[str, dict[str, list[Finding]]] = defaultdict(lambda: defaultdict(list))
    for path in iter_source_files(args.include_tests):
        for finding in scan_file(path):
            findings[finding.section][finding.field].append(finding)

    missing: dict[str, dict[str, list[dict[str, object]]]] = {}
    for section, fields in findings.items():
        known = schema_props.get(section, set())
        for field, refs in sorted(fields.items()):
            if field in known:
                continue
            if field in KNOWN_NON_TDF_FIELDS.get(section, set()):
                continue
            missing.setdefault(section, {})[field] = [
                {
                    "file": ref.file,
                    "line": ref.line,
                    "evidence": ref.evidence,
                }
                for ref in refs[:10]
            ]

    if args.json:
        print(json.dumps(missing, indent=2, sort_keys=True))
    else:
        if not missing:
            print("No obvious runtime authored-field references missing from schema.")
        for section, fields in missing.items():
            print(f"\n{section} fields referenced outside schema:")
            for field, refs in fields.items():
                first = refs[0]
                print(f"  {field}: {first['file']}:{first['line']} ({len(refs)} refs)")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import datetime as dt
import json
import platform
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
UTC = dt.timezone.utc

CHECKS = [
    ("Strict library typecheck", "typecheck-library", "pnpm exec tsc -p tsconfig.lib.json"),
    ("Unit tests", "tests", "pnpm test"),
    ("Multi-entry library build", "build-library", "pnpm build:lib"),
    ("Distribution boundary audit", "boundaries-final", "pnpm verify:boundaries"),
    ("Package dry verification", "pack-dry", "pnpm verify:pack"),
    ("Clean-source library/site build", "clean-source-final", "pnpm verify:clean-source"),
    ("1001-node benchmark", "benchmark-final", "pnpm benchmark"),
    ("Astro type/content check", "site-check", "pnpm check:site"),
    ("Astro production build", "site-build-final", "pnpm build:site"),
    ("Playwright E2E", "e2e", "pnpm test:e2e"),
    ("Browser layout / console QA", "site-qa-final", "pnpm qa:site"),
    ("Browser screenshot capture", "capture-site-final", "pnpm capture:site"),
    ("ESLint", "lint", "pnpm lint"),
]


def now() -> str:
    return dt.datetime.now(UTC).isoformat()


def command_output(command: list[str]) -> str:
    try:
        return subprocess.check_output(command, cwd=ROOT, text=True, stderr=subprocess.STDOUT).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def source_fingerprint() -> dict:
    try:
        return json.loads(command_output(["node", "scripts/source-fingerprint.mjs"]))
    except (TypeError, ValueError):
        return {"algorithm": "sha256", "value": "unavailable", "fileCount": None}


def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def load_status(key: str, command: str) -> dict:
    marker = ARTIFACTS / f"{key}.status"
    metadata = load_json(ARTIFACTS / f"{key}.meta.json") or {}
    if not marker.exists():
        return {
            "key": key,
            "command": metadata.get("command", command),
            "status": "not-run",
            "exitCode": None,
            "startedAt": metadata.get("startedAt"),
            "finishedAt": metadata.get("finishedAt"),
            "durationMs": metadata.get("durationMs"),
            "fixture": metadata.get("fixture"),
            "log": str(ARTIFACTS / f"{key}.log") if (ARTIFACTS / f"{key}.log").exists() else None,
            "environment": metadata.get("environment"),
            "gitHead": metadata.get("gitHead"),
            "sourceFingerprint": metadata.get("sourceFingerprint"),
            "sourceFingerprintAlgorithm": metadata.get("sourceFingerprintAlgorithm"),
            "sourceFileCount": metadata.get("sourceFileCount"),
            "limitation": "No status marker was recorded.",
        }
    raw = marker.read_text(errors="replace").strip()
    exit_code = None
    if raw.startswith("{"):
        marker_metadata = load_json(marker) or {}
        exit_code = marker_metadata.get("exitCode")
        metadata = {**metadata, **marker_metadata}
    else:
        try:
            exit_code = int(raw.splitlines()[0])
        except (ValueError, IndexError):
            exit_code = None
    return {
        "key": key,
        "command": metadata.get("command", command),
        "status": "pass" if exit_code == 0 else f"fail ({exit_code})" if exit_code is not None else "unknown",
        "exitCode": exit_code,
        "startedAt": metadata.get("startedAt"),
        "finishedAt": metadata.get("finishedAt") or dt.datetime.fromtimestamp(marker.stat().st_mtime, UTC).isoformat(),
        "durationMs": metadata.get("durationMs"),
        "fixture": metadata.get("fixture"),
        "log": str(ARTIFACTS / f"{key}.log") if (ARTIFACTS / f"{key}.log").exists() else None,
        "environment": metadata.get("environment"),
        "gitHead": metadata.get("gitHead"),
        "sourceFingerprint": metadata.get("sourceFingerprint"),
        "sourceFingerprintAlgorithm": metadata.get("sourceFingerprintAlgorithm"),
        "sourceFileCount": metadata.get("sourceFileCount"),
        "limitation": metadata.get("limitation"),
    }


def bytes_label(value) -> str:
    return f"{value / 1024:.1f} KB" if isinstance(value, (int, float)) else "n/a"


package = load_json(ROOT / "package.json") or {}
manifest = load_json(ROOT / "dist/bundle-manifest.json") or {}
benchmark = load_json(ARTIFACTS / "benchmark.json") or {}
boundary = load_json(ARTIFACTS / "boundary-report.json") or {}
qa = load_json(ARTIFACTS / "site-qa.json") or {}
capture = load_json(ARTIFACTS / "screenshots/manifest.json") or {}
clean_source = load_json(ARTIFACTS / "clean-source.json") or {}

try:
    git_head = command_output(["git", "rev-parse", "HEAD"])
    git_status = command_output(["git", "status", "--short"])
except Exception:
    git_head = "unavailable"
    git_status = "unavailable"
current_source = source_fingerprint()
current_source_value = current_source.get("value", "unavailable")

environment = {
    "node": command_output(["node", "--version"]),
    "pnpm": command_output(["pnpm", "--version"]),
    "python": platform.python_version(),
    "platform": platform.platform(),
    "architecture": platform.machine(),
    "cwd": str(ROOT),
    "gitHead": git_head,
    "sourceFingerprint": current_source_value,
    "sourceFingerprintAlgorithm": current_source.get("algorithm", "sha256"),
    "sourceFileCount": current_source.get("fileCount"),
}

fixture_by_key = {
    "clean-source-final": {
        "sourceFiles": clean_source.get("sourceFileCount"),
        "steps": [step.get("name") for step in clean_source.get("steps", [])],
        "cleanStatus": clean_source.get("status"),
    },
    "benchmark-final": benchmark.get("fixtures"),
    "site-qa-final": {"cases": len(qa.get("pages", [])), "themes": sorted({item.get("theme") for item in qa.get("pages", [])}), "viewports": sorted({item.get("viewport", {}).get("width") for item in qa.get("pages", [])})},
    "capture-site-final": {"captures": len(capture.get("captures", [])), "manifest": "artifacts/screenshots/manifest.json"},
}
rows = []
for label, key, command in CHECKS:
    row = load_status(key, command) | {"label": label}
    if row.get("fixture") is None and fixture_by_key.get(key): row["fixture"] = fixture_by_key[key]
    recorded_head = row.get("gitHead")
    recorded_source = row.get("sourceFingerprint")
    if not recorded_head or not recorded_source:
        row["sourceState"] = "missing"
    else:
        mismatches = []
        if recorded_head != git_head:
            mismatches.append("git HEAD")
        if recorded_source != current_source_value:
            mismatches.append("source fingerprint")
        row["sourceState"] = f"stale ({', '.join(mismatches)})" if mismatches else "current"
    rows.append(row)
lines = [
    f"# Open MindMap v{package.get('version', 'unknown')} Verification Report",
    "",
    f"- Generated: {now()}",
    f"- Repository HEAD: `{git_head}`",
    "- Git commit, npm publish, and deployment were not performed by this workflow.",
    "",
    "## Environment",
    "",
    "```json",
    json.dumps(environment, indent=2),
    "```",
    "",
    "## Source identity",
    "",
    f"- Current Git HEAD: `{git_head}`",
    f"- Current source fingerprint: `{current_source_value}` ({current_source.get('fileCount', 'n/a')} files, {current_source.get('algorithm', 'sha256')})",
    "- A check is current only when its recorded Git HEAD and source fingerprint both match this report.",
]
source_identity_rows = [row for row in rows if row.get("sourceState") != "current"]
if source_identity_rows:
    lines.append("")
    lines.append("Recorded checks requiring attention:")
    for row in source_identity_rows:
        lines.append(f"- `{row['key']}`: **{row['sourceState']}**")
lines += [
    "",
    "## Command matrix",
    "",
    "| Check | Exact command | Status | Exit | Started | Finished | Duration | Source identity | Fixture / limitation |",
    "|---|---|---|---:|---|---|---:|---|---|",
]
for row in rows:
    detail = row.get("fixture") or row.get("limitation") or ""
    duration = f"{row['durationMs']} ms" if row.get("durationMs") is not None else "n/a"
    lines.append(
        f"| {row['label']} | `{row['command']}` | **{row['status']}** | "
        f"{row['exitCode'] if row['exitCode'] is not None else 'n/a'} | "
        f"{row.get('startedAt') or 'n/a'} | {row.get('finishedAt') or 'n/a'} | {duration} | {row.get('sourceState', 'n/a')} | "
        f"{json.dumps(detail, ensure_ascii=False) if isinstance(detail, (dict, list)) else detail} |"
    )

lines += ["", "### Recorded check metadata", "", "```json", json.dumps([
    {
        "key": row["key"],
        "command": row["command"],
        "environment": row.get("environment"),
        "fixture": row.get("fixture"),
        "startedAt": row.get("startedAt"),
        "finishedAt": row.get("finishedAt"),
        "durationMs": row.get("durationMs"),
        "exitCode": row.get("exitCode"),
        "gitHead": row.get("gitHead"),
        "sourceFingerprint": row.get("sourceFingerprint"),
        "sourceFingerprintAlgorithm": row.get("sourceFingerprintAlgorithm"),
        "sourceFileCount": row.get("sourceFileCount"),
        "sourceState": row.get("sourceState"),
        "limitation": row.get("limitation"),
        "log": row.get("log"),
    }
    for row in rows
], indent=2), "```"]

lines += ["", "## Benchmark fixtures and observations", "", "```json", json.dumps({
    "sampling": benchmark.get("sampling"),
    "fixtures": benchmark.get("fixtures"),
    "scenarios": benchmark.get("scenarios"),
    "observations": benchmark.get("observations"),
}, indent=2), "```", "", "Measurements are descriptive. No performance or bundle-size threshold is applied."]

lines += ["", "## Published entry graphs", "", "| Entry | ESM eager | ESM gzip | ESM lazy | CJS eager | CJS gzip | CJS lazy |", "|---|---:|---:|---:|---:|---:|---:|"]
for name, item in (manifest.get("entries") or {}).items():
    es = item.get("formats", {}).get("es", item)
    cjs = item.get("formats", {}).get("cjs", {})
    lines.append(f"| `{name}` | {bytes_label(es.get('raw'))} | {bytes_label(es.get('gzip'))} | {bytes_label(es.get('lazyRaw'))} | {bytes_label(cjs.get('raw'))} | {bytes_label(cjs.get('gzip'))} | {bytes_label(cjs.get('lazyRaw'))} |")
    if es.get("lazyFiles") or cjs.get("lazyFiles"):
        lines.append(f"|  | lazy ESM files: `{', '.join(es.get('lazyFiles', [])) or 'none'}` |  |  | lazy CJS files: `{', '.join(cjs.get('lazyFiles', [])) or 'none'}` |  |  |")

lines += ["", "## Boundary audit", ""]
if boundary:
    lines.append(f"- Overall: **{'pass' if boundary.get('passed') else 'fail'}**")
    for check in boundary.get("checks", []):
        lines.append(f"- {'pass' if check.get('passed') else 'fail'} {check.get('name')}")
    for failure in boundary.get("failures", []):
        lines.append(f"  - `{failure}`")
else:
    lines.append("- Boundary report was not available.")

lines += ["", "## Browser QA matrix", ""]
if qa:
    lines.append(f"- Overall: **{'pass' if qa.get('passed') else 'fail'}**")
    lines.append(f"- Cases: **{len(qa.get('pages', []))}**; failures: **{len(qa.get('failures', []))}**")
    for page in qa.get("pages", []):
        lines.append(
            f"- {page.get('name')}: theme={page.get('theme')}, reducedMotion={page.get('reducedMotion')}, "
            f"HTTP {page.get('status')}, missing={len(page.get('missing', []))}, "
            f"console/page errors={len(page.get('errors', []))}, network errors={len(page.get('networkErrors', []))}, "
            f"overflow={page.get('horizontalOverflow')}, focus={page.get('focus', {}).get('passed')}, "
            f"interaction={page.get('interaction', {}).get('passed')}"
        )
else:
    lines.append("- Browser QA output was not available.")

lines += ["", "## Screenshot evidence", ""]
if capture:
    lines.append(f"- Captures: **{len(capture.get('captures', []))}**")
    lines.append(f"- Base URL: `{capture.get('baseUrl', 'unknown')}`")
    for item in capture.get("captures", []):
        stable = item.get("stableState") or {}
        lines.append(f"- `{item.get('filename')}`: {item.get('page')} / {item.get('viewport', {}).get('width')}x{item.get('viewport', {}).get('height')} / {item.get('theme')} / reducedMotion={item.get('reducedMotion')} / runtimeTheme={stable.get('runtimeTheme', 'n/a')} / heroPaused={stable.get('heroPaused', 'n/a')} / HTTP {item.get('status')}")
else:
    lines.append("- Screenshot manifest was not available.")

limitations = []
for row in rows:
    if row["status"] == "not-run": limitations.append(f"{row['label']} was not run")
if any(row.get("sourceState", "missing").startswith("stale") for row in rows):
    limitations.append("One or more recorded checks have stale source identity metadata")
if any(row.get("sourceState") == "missing" for row in rows):
    limitations.append("One or more recorded checks have no source identity metadata")
if qa and qa.get("failures"): limitations.append("Browser QA contains failures; inspect artifacts/site-qa.json")
if capture and any(item.get("status", 500) >= 400 for item in capture.get("captures", [])): limitations.append("One or more screenshot pages returned HTTP errors")
limitations.append("Site dev/check/build scripts prepare the package distribution first; a library build failure blocks site checks")

lines += ["", "## Limitations", ""]
for limitation in limitations:
    lines.append(f"- {limitation}.")

lines += ["", "## Git status at report generation", "", "```text", git_status or "(clean working tree)", "```", ""]
lines.append("This report records evidence from the current checkout; unrun checks are not inferred as passing.")

ARTIFACTS.mkdir(parents=True, exist_ok=True)
(ARTIFACTS / "verification.md").write_text("\n".join(lines) + "\n")

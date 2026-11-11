#!/usr/bin/env python3
"""Materialize the audited full Northstar project without executing archive code."""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tempfile
import urllib.request
import zipfile

EXPECTED_SHA256 = "24460ecde99dad95f717f78190c86d716260d6d5069916bac4a8bda49261ab83"
EXPECTED_BYTES = 1_375_216
EXPECTED_FILES = 200
MIRRORS = (
    ("https://qu.ax/x/OVtWf.zip", {"Referer": "https://qu.ax/OVtWf"}),
    ("https://temp.sh/AMQHy/northstar-trading-desk-publicacao.zip", {}),
)


def download() -> bytes:
    errors: list[str] = []
    for url, extra_headers in MIRRORS:
        try:
            headers = {"User-Agent": "Mozilla/5.0", **extra_headers}
            method = "POST" if "temp.sh/" in url else "GET"
            request = urllib.request.Request(
                url, data=b"" if method == "POST" else None,
                headers=headers, method=method,
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = response.read()
            if len(payload) != EXPECTED_BYTES:
                raise ValueError(f"unexpected size: {len(payload)}")
            if hashlib.sha256(payload).hexdigest() != EXPECTED_SHA256:
                raise ValueError("SHA-256 mismatch")
            return payload
        except Exception as exc:  # try the independent mirror
            errors.append(f"{url}: {exc}")
    raise RuntimeError("Could not retrieve the verified archive:\n" + "\n".join(errors))


def safe_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    members = archive.infolist()
    if archive.testzip() is not None:
        raise ValueError("ZIP CRC validation failed")
    for member in members:
        path = PurePosixPath(member.filename)
        mode = member.external_attr >> 16
        if path.is_absolute() or ".." in path.parts or not path.parts:
            raise ValueError(f"unsafe path: {member.filename}")
        if stat.S_ISLNK(mode) or (mode and not stat.S_ISREG(mode) and not stat.S_ISDIR(mode)):
            raise ValueError(f"unsupported file type: {member.filename}")
    return members


def verify_extracted(root: Path) -> None:
    manifest = json.loads((root / "REPOSITORY_MANIFEST.json").read_text(encoding="utf-8"))
    assert manifest["hashAlgorithm"] == "SHA-256"
    assert manifest["manifestSelfExcluded"] is True
    expected: set[str] = set()
    for entry in manifest["files"]:
        relative = PurePosixPath(entry["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"unsafe manifest path: {relative}")
        expected.add(relative.as_posix())
        data = (root / Path(*relative.parts)).read_bytes()
        if len(data) != entry["bytes"]:
            raise ValueError(f"size mismatch: {relative}")
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"hash mismatch: {relative}")
    expected.add("REPOSITORY_MANIFEST.json")
    actual = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*") if path.is_file()
    }
    if actual != expected or len(actual) != EXPECTED_FILES:
        raise ValueError("extracted file set does not match the audited manifest")


def main() -> None:
    repository = Path(__file__).resolve().parents[1]
    target = repository / "northstar-full"
    if target.exists() and any(target.iterdir()):
        raise SystemExit(f"Refusing to overwrite non-empty directory: {target}")
    payload = download()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        members = safe_members(archive)
        with tempfile.TemporaryDirectory(dir=repository) as temporary:
            staging = Path(temporary) / "project"
            staging.mkdir()
            archive.extractall(staging, members)
            verify_extracted(staging)
            if target.exists():
                target.rmdir()
            os.replace(staging, target)
    print(f"Verified and extracted {EXPECTED_FILES} files to: {target}")
    print("No credentials are included. Keep live trading blocked; use paper/testnet only.")


if __name__ == "__main__":
    main()

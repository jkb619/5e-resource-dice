#!/usr/bin/env python3
"""Interactively bump the semantic version in module.json.

Prompts for Major / minor / patch, computes the new version, writes it back to
module.json (preserving formatting/indentation), and prints the result so it can
be confirmed before a release is cut.
"""

import json
import re
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / "module.json"


def parse_semver(version: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version.strip())
    if not match:
        print(f"ERROR: version '{version}' is not valid semver (expected X.Y.Z).")
        sys.exit(1)
    return tuple(int(p) for p in match.groups())  # type: ignore[return-value]


def bump(current: tuple[int, int, int], part: str) -> tuple[int, int, int]:
    major, minor, patch = current
    if part == "M":
        return major + 1, 0, 0
    if part == "m":
        return major, minor + 1, 0
    if part == "p":
        return major, minor, patch + 1
    raise ValueError(part)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    current_str = data.get("version", "0.0.0")
    current = parse_semver(current_str)

    print(f"Current version: {current_str}")
    print("Bump which part?")
    print("  M = major   ({0}.0.0)".format(current[0] + 1))
    print("  m = minor   ({0}.{1}.0)".format(current[0], current[1] + 1))
    print("  p = patch   ({0}.{1}.{2})".format(current[0], current[1], current[2] + 1))
    print("  (anything else cancels)")

    choice = input("Choice [M/m/p]: ").strip()
    if choice not in ("M", "m", "p"):
        print("No version change. Aborting.")
        sys.exit(1)

    new = bump(current, choice)
    new_str = "{0}.{1}.{2}".format(*new)

    confirm = input(f"Set version {current_str} -> {new_str}? [y/N] ").strip().lower()
    if confirm not in ("y", "yes"):
        print("No version change. Aborting.")
        sys.exit(1)

    # Rewrite only the version value to preserve the file's existing formatting.
    text = MANIFEST.read_text(encoding="utf-8")
    new_text, count = re.subn(
        r'("version"\s*:\s*")' + re.escape(current_str) + r'(")',
        r"\g<1>" + new_str + r"\g<2>",
        text,
        count=1,
    )
    if count != 1:
        print("ERROR: could not locate the version field to update.")
        sys.exit(1)

    MANIFEST.write_text(new_text, encoding="utf-8")
    print(f"Version updated to {new_str}.")


if __name__ == "__main__":
    main()

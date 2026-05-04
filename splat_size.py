"""
splat_size.py
─────────────
Fetches each .splat file listed in splats.json (HEAD request only, so it's fast),
reads the Content-Length, computes the vertex count, and writes a "vertexCount"
field back into splats.json.

Usage:
    python splat_size.py               # updates splats.json in-place
    python splat_size.py --dry-run     # just prints results, doesn't write

.splat row layout: 3×float32 position + 3×float32 scale + 4×uint8 rgba + 4×uint8 rot = 32 bytes
"""

import argparse
import json
import sys
from pathlib import Path
import urllib.request
import urllib.error
import urllib.parse

ROW_BYTES = 3 * 4 + 3 * 4 + 4 + 4  # 32 bytes per Gaussian


def get_content_length(url: str) -> int | None:
    """Return Content-Length of url via HEAD request, or None on failure."""
    req = urllib.request.Request(url, method="HEAD")
    req.add_header("User-Agent", "splat-size-script/1.0")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            cl = resp.headers.get("Content-Length")
            return int(cl) if cl else None
    except Exception as e:
        print(f"  ⚠  HEAD failed ({e}), trying GET range 0-0 …")
    # Fall back: GET with Range header to just fetch headers
    req2 = urllib.request.Request(url)
    req2.add_header("User-Agent", "splat-size-script/1.0")
    req2.add_header("Range", "bytes=0-0")
    try:
        with urllib.request.urlopen(req2, timeout=15) as resp:
            cr = resp.headers.get("Content-Range")  # "bytes 0-0/TOTAL"
            if cr:
                return int(cr.split("/")[-1])
    except Exception as e2:
        print(f"  ✗  Could not determine size: {e2}")
    return None


def size_label(vertex_count: int) -> str:
    """Return a human-readable size tier label."""
    if vertex_count < 100_000:
        return "Tiny"
    elif vertex_count < 300_000:
        return "Small"
    elif vertex_count < 600_000:
        return "Medium"
    elif vertex_count < 1_000_000:
        return "Large"
    elif vertex_count < 2_000_000:
        return "Huge"
    else:
        return "Gigantic"


def main():
    parser = argparse.ArgumentParser(description="Add vertexCount to splats.json")
    parser.add_argument("--dry-run", action="store_true", help="Print only, don't write")
    parser.add_argument(
        "--json",
        default="splats.json",
        help="Path to splats.json (default: splats.json)",
    )
    args = parser.parse_args()

    json_path = Path(args.json)
    if not json_path.exists():
        print(f"ERROR: {json_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        splats = json.load(f)

    changed = False
    for splat in splats:
        name = splat.get("name", "?")
        url = splat.get("base", "").rstrip("/") + "/" + splat.get("url", "")
        # Percent-encode any non-ASCII characters in the path portion
        parsed = urllib.parse.urlsplit(url)
        safe_path = urllib.parse.quote(parsed.path, safe="/:@!$&'()*+,;=")
        url = urllib.parse.urlunsplit(parsed._replace(path=safe_path))
        print(f"\n→ {name}")
        print(f"  URL: {url}")

        byte_size = get_content_length(url)
        if byte_size is None:
            print(f"  ✗  Skipping (could not get size)")
            continue

        vertex_count = byte_size // ROW_BYTES
        label = size_label(vertex_count)

        print(f"  Bytes      : {byte_size:,}")
        print(f"  Gaussians  : {vertex_count:,}")
        print(f"  Size label : {label}")

        if splat.get("vertexCount") != vertex_count:
            splat["vertexCount"] = vertex_count
            changed = True

    if args.dry_run:
        print("\n[dry-run] No changes written.")
    elif changed:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(splats, f, ensure_ascii=False, indent=4)
        print(f"\n✓ Updated {json_path}")
    else:
        print(f"\n✓ {json_path} already up-to-date, nothing written.")


if __name__ == "__main__":
    main()

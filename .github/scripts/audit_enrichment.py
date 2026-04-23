"""
audit_enrichment.py

Fetches the live enriched-tools.json from production and cross-checks it
against the canonical slug list in data/slugs.json.

Outputs GitHub Actions step outputs:
  missing_count  — number of slugs with no enriched entry
  missing_json   — JSON array of { slug, name, company } for missing tools
  total_slugs    — total number of slugs in the catalog
  enriched_url   — URL that was fetched (for issue body links)

Exit codes:
  0 — all good
  1 — one or more tools missing enriched content
  2 — could not fetch/parse production data (transient failure)
"""

import json
import os
import sys
import urllib.request
import urllib.error

PRODUCTION_URL = os.environ.get("PRODUCTION_URL", "https://ai.dosa.dev").rstrip("/")
ENRICHED_URL   = f"{PRODUCTION_URL}/data/enriched-tools.json"
SLUGS_PATH     = "data/slugs.json"
GITHUB_OUTPUT  = os.environ.get("GITHUB_OUTPUT", "")


def set_output(name: str, value: str) -> None:
    """Write a key=value pair to $GITHUB_OUTPUT (multiline-safe)."""
    if not GITHUB_OUTPUT:
        print(f"  [output] {name}={value}")
        return
    with open(GITHUB_OUTPUT, "a", encoding="utf-8") as f:
        # Use heredoc syntax for values that may contain newlines/quotes
        delimiter = "EOF_OUTPUT"
        f.write(f"{name}<<{delimiter}\n{value}\n{delimiter}\n")


def fetch_json(url: str) -> list:
    req = urllib.request.Request(url, headers={"User-Agent": "enrichment-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"ERROR: HTTP {e.code} fetching {url}")
        raise
    except urllib.error.URLError as e:
        print(f"ERROR: Network error fetching {url}: {e.reason}")
        raise
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON from {url}: {e}")
        raise


def main() -> None:
    # ── Load canonical slug catalog from repo ─────────────────────────────────
    try:
        with open(SLUGS_PATH, "r", encoding="utf-8") as f:
            slugs_catalog = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: {SLUGS_PATH} not found — is the repo checked out?")
        sys.exit(2)

    total = len(slugs_catalog)
    print(f"Loaded {total} slugs from {SLUGS_PATH}")

    # ── Fetch live enriched-tools.json from production ────────────────────────
    print(f"Fetching {ENRICHED_URL} ...")
    try:
        enriched = fetch_json(ENRICHED_URL)
    except Exception:
        # Transient failure — don't create spurious issues
        set_output("missing_count", "0")
        set_output("missing_json", "[]")
        set_output("total_slugs", str(total))
        set_output("enriched_url", ENRICHED_URL)
        print("WARNING: Could not reach production. Skipping issue creation.")
        sys.exit(2)

    enriched_slugs = {entry.get("slug") for entry in enriched if entry.get("slug")}
    print(f"Found {len(enriched_slugs)} enriched slugs on production")

    # ── Cross-check ───────────────────────────────────────────────────────────
    missing = [
        {"slug": t["slug"], "name": t.get("name", ""), "company": t.get("company", "")}
        for t in slugs_catalog
        if t.get("slug") and t["slug"] not in enriched_slugs
    ]

    # ── Report ────────────────────────────────────────────────────────────────
    print(f"\n✅ Enriched : {total - len(missing)} / {total}")
    print(f"❌ Missing  : {len(missing)} / {total}")

    if missing:
        print("\nMissing slugs:")
        for t in missing:
            print(f"  {t['slug']:<30} {t['name']:<28} {t['company']}")

    set_output("missing_count", str(len(missing)))
    set_output("missing_json", json.dumps(missing, ensure_ascii=False))
    set_output("total_slugs", str(total))
    set_output("enriched_url", ENRICHED_URL)

    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()

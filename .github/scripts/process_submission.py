"""
process_submission.py

Parses a GitHub issue form submission (via ISSUE_DATA env var) and:
  1. Injects a new row into README.md under the matching category table.
  2. Appends { companyName, toolName } to src/data/tools.json.
     - Duplicate guard: toolName must be unique (companyName may repeat).
"""

import json
import os
import sys


def load_issue_data() -> dict:
    raw = os.environ.get("ISSUE_DATA", "")
    if not raw:
        print("ERROR: ISSUE_DATA environment variable is empty.")
        sys.exit(1)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse ISSUE_DATA: {e}")
        sys.exit(1)


def update_readme(tool_name: str, company: str, url: str, category: str,
                  desc: str, github_url: str) -> None:
    if github_url and github_url.lower() not in ("", "none"):
        desc = f"{desc}; [GitHub]({github_url})"
    desc = desc.replace("\n", " ").replace("\r", "")

    new_row = f"| **[{tool_name}]({url})** | {company} | {desc} |"

    with open("README.md", "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find the section header that matches the category
    target_idx = next(
        (i for i, line in enumerate(lines)
         if line.startswith("## ") and category.lower() in line.lower()),
        -1,
    )

    if target_idx == -1:
        print(f"WARNING: No category header found matching '{category}' — skipping README update.")
        return

    # Walk forward to the last row of the category's table
    insert_idx = target_idx
    in_table = False
    for i in range(target_idx + 1, len(lines)):
        if lines[i].strip().startswith("|"):
            in_table = True
            insert_idx = i
        elif in_table and lines[i].strip() == "":
            insert_idx = i - 1
            break

    lines.insert(insert_idx + 1, new_row + "\n")

    with open("README.md", "w", encoding="utf-8") as f:
        f.writelines(lines)

    print(f"README updated — appended row: {new_row}")


def update_tools_json(company: str, tool_name: str) -> None:
    tools_path = "src/data/tools.json"

    with open(tools_path, "r", encoding="utf-8") as f:
        tools = json.load(f)

    # toolName must be unique; companyName is allowed to repeat
    if any(t.get("toolName", "").strip().lower() == tool_name.lower() for t in tools):
        print(f"SKIP: '{tool_name}' already exists in tools.json — no changes made.")
        return

    tools.append({"companyName": company, "toolName": tool_name})

    with open(tools_path, "w", encoding="utf-8") as f:
        json.dump(tools, f, indent=2, ensure_ascii=False)
        f.write("\n")  # trailing newline

    print(f"tools.json updated — appended: companyName='{company}', toolName='{tool_name}'")


def main() -> None:
    data = load_issue_data()

    tool_name  = data.get("tool-name", "").strip()
    company    = data.get("company", "").strip()
    url        = data.get("url", "").strip()
    category   = data.get("category", "").strip()
    desc       = data.get("description", "").strip()
    github_url = data.get("github", "").strip()

    if not tool_name or not url or not category:
        print("ERROR: Missing required fields (tool-name, url, category).")
        sys.exit(1)

    update_readme(tool_name, company, url, category, desc, github_url)
    update_tools_json(company, tool_name)


if __name__ == "__main__":
    main()

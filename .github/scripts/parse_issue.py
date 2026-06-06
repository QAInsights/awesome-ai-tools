"""
parse_issue.py

Reads ISSUE_BODY from env, parses ### section headings into structured fields,
and writes valid, jsonString, tool_name to $GITHUB_OUTPUT.
"""
import json
import os
import re

body = os.environ.get("ISSUE_BODY", "")

label_to_id = {
    "tool name":                   "tool-name",
    "company / author":            "company",
    "tool url":                    "url",
    "category":                    "category",
    "pricing":                     "pricing",
    "short description":           "description",
    "github url (if open source)": "github",
}

sections = re.split(r"^###\s+", body, flags=re.MULTILINE)
data = {}
for section in sections:
    lines = section.strip().splitlines()
    if not lines:
        continue
    heading = lines[0].strip().lower()
    value = "\n".join(lines[1:]).strip()
    field_id = label_to_id.get(heading)
    if field_id:
        data[field_id] = value

tool_name = data.get("tool-name", "").strip()
url       = data.get("url", "").strip()
category  = data.get("category", "").strip()
valid     = "true" if (tool_name and url and category) else "false"
json_str  = json.dumps(data)

print(f"Parsed fields: {list(data.keys())}")
print(f"Validation: valid={valid}, tool-name='{tool_name}', url='{url}', category='{category}'")

github_output = os.environ.get("GITHUB_OUTPUT", "")
if github_output:
    with open(github_output, "a") as f:
        f.write(f"jsonString<<DELIM\n{json_str}\nDELIM\n")
        f.write(f"valid={valid}\n")
        f.write(f"tool_name={tool_name}\n")

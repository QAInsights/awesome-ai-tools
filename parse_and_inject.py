import json
import os
import sys

try:
    data = json.loads(os.environ['ISSUE_DATA'])
except Exception as e:
    print("Failed to parse ISSUE_DATA environment variable.")
    print(e)
    sys.exit(1)

tool_name = data.get('tool-name', '').strip()
company = data.get('company', '').strip()
url = data.get('url', '').strip()
category = data.get('category', '').strip()
pricing = data.get('pricing', '').strip()
desc = data.get('description', '').strip()
github_url = data.get('github', '').strip()

if not tool_name or not url or not category:
    print("Missing required fields. Exiting.")
    sys.exit(0)

# Format description with github link if present
if github_url and github_url.lower() != 'none':
    desc = f"{desc}; [GitHub]({github_url})"

# Replace newlines in description
desc = desc.replace('\n', ' ').replace('\r', '')

new_row = f"| **[{tool_name}]({url})** | {company} | {desc} |"

# Read README
with open('README.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the target category block
target_idx = -1
for i, line in enumerate(lines):
    if line.startswith('## ') and category.lower() in line.lower():
        target_idx = i
        break

if target_idx == -1:
    print(f"Could not find category header matching: {category}")
    sys.exit(1)

# Find the end of the table for this category
insert_idx = target_idx
in_table = False
for i in range(target_idx + 1, len(lines)):
    if lines[i].strip().startswith('|'):
        in_table = True
        insert_idx = i
    elif in_table and lines[i].strip() == '':
        # we found the blank line right after the table
        insert_idx = i - 1
        break

lines.insert(insert_idx + 1, new_row + '\n')

with open('README.md', 'w', encoding='utf-8') as f:
    f.writelines(lines)
    
print("Successfully injected row: " + new_row)

import re

with open('compare.html', 'r') as f:
    content = f.read()

content = content.replace('<a href="help.html" class="filter-btn active flex items-center">Help &amp; Support</a>', '<a href="help.html" class="filter-btn flex items-center">Help &amp; Support</a>')

with open('compare.html', 'w') as f:
    f.write(content)

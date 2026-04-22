import re

with open('compare.html', 'r') as f:
    content = f.read()

# Replace the inner block <div class="max-w-[1400px] mx-auto w-full flex flex-col flex-1 min-h-0 p-8"> ... </div>
# with our compare logic
pattern = re.compile(r'<div class="max-w-\[1400px\] mx-auto w-full flex flex-col flex-1 min-h-0 p-8">.*?</main>', re.DOTALL)

compare_content = """<div class="max-w-7xl mx-auto py-12 px-6 w-full flex-1">
        <div class="mb-8 flex items-center justify-between">
            <div>
                <h1 class="text-3xl font-semibold text-white mb-2">Compare Tools</h1>
                <p class="text-[#a3a3a3]">See how your selected tools stack up against each other.</p>
            </div>
            <a href="/" class="text-[#a3a3a3] hover:text-white px-4 py-2 border border-[#333] rounded transition-colors">&larr; Back to registry</a>
        </div>

        <div id="compareGrid" class="flex flex-col md:flex-row gap-6 w-full">
            <!-- Populated via js/compare.js -->
        </div>
    </div>
</main>
<script type="module" src="./js/compare.js"></script>
"""

content = pattern.sub(compare_content, content)

with open('compare.html', 'w') as f:
    f.write(content)

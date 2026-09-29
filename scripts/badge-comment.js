/**
 * Builds the maker-badge comment posted on approved tool submission issues.
 *
 * Reads ISSUE_DATA (the parse step's jsonString, keys like "tool-name"),
 * resolves the tool's slug from data/slugs.json (already regenerated
 * upstream), and writes the comment body to the file named by argv[2].
 * Exits 0 without writing when no slug resolves so the caller can skip
 * the comment step.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { slugify } from '../js/parser.js';

export function buildBadgeComment({ name, slug }) {
    return `🎉 **${name}** has been approved and will appear at https://ai.dosa.dev/tools/${slug} once the PR merges.

Are you the maker? Add the Featured badge to your README - it links back to your tool page:

\`\`\`markdown
[![Featured on ai.dosa.dev](https://ai.dosa.dev/badge/featured.svg)](https://ai.dosa.dev/tools/${slug}?ref=badge)
\`\`\`

\`\`\`html
<a href="https://ai.dosa.dev/tools/${slug}?ref=badge" target="_blank" rel="noopener"><img src="https://ai.dosa.dev/badge/featured.svg" alt="Featured on ai.dosa.dev" width="212" height="44"></a>
\`\`\`

More formats and a preview: https://ai.dosa.dev/badge?tool=${slug}`;
}

export function resolveToolSlug(name, slugs) {
    const entry = slugs.find(t => (t.name ?? '').toLowerCase() === name.toLowerCase());
    return entry?.slug ?? slugify(name);
}

function main() {
    const outPath = process.argv[2];
    if (!outPath) {
        console.error('Usage: node scripts/badge-comment.js <output-file>');
        process.exit(1);
    }

    let issue;
    try {
        issue = JSON.parse(process.env.ISSUE_DATA ?? '{}');
    } catch {
        console.error('ISSUE_DATA is not valid JSON');
        process.exit(0);
    }
    const name = (issue['tool-name'] ?? issue.tool_name ?? '').trim();
    if (!name) {
        console.log('No tool name in ISSUE_DATA - skipping badge comment');
        process.exit(0);
    }

    let slugs = [];
    try {
        slugs = JSON.parse(readFileSync('data/slugs.json', 'utf8'));
    } catch { /* slug catalog optional */ }

    const slug = resolveToolSlug(name, slugs);
    if (!slug) {
        console.log(`No slug resolved for "${name}" - skipping badge comment`);
        process.exit(0);
    }

    writeFileSync(outPath, `${buildBadgeComment({ name, slug })}\n`);
    console.log(`Badge comment written to ${outPath} for ${name} (${slug})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

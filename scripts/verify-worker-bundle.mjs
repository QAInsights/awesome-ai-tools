import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverDir = join(root, 'dist', 'server');
const contentDir = join(root, 'src', 'content', 'blog');

async function listFiles(directory, extension) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(path, extension));
        } else if (entry.isFile() && path.endsWith(extension)) {
            files.push(path);
        }
    }
    return files;
}

try {
    const bundleFiles = await listFiles(serverDir, '.mjs');
    const bundleContents = await Promise.all(bundleFiles.map(file => readFile(file, 'utf8')));
    if (bundleContents.some(content => content.includes('typeof import.meta.glob'))) {
        throw new Error('Worker bundle still contains a runtime typeof import.meta.glob guard');
    }

    const contentFiles = (await listFiles(contentDir, '.mdx'))
        .filter(file => /today-in-ai-\d{4}-\d{2}-\d{2}\.mdx$/.test(file))
        .sort();
    const newestPost = contentFiles.at(-1);
    if (!newestPost) throw new Error('No dated Today in AI MDX posts were found');

    const newestName = newestPost.split('/').at(-1);
    if (!bundleContents.some(content => content.includes(newestName))) {
        throw new Error(`Worker bundle does not contain the newest Today in AI post: ${newestName}`);
    }

    console.log(`Worker bundle verified: ${newestName} is bundled and no runtime glob guard remains`);
} catch (error) {
    console.error(`Worker bundle verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}

import { serve } from "bun";

const PORT = 3000;

const ROOT = import.meta.dir;
const FAVICON_PATH = `${ROOT}/images/icons/favicon.ico`;

async function isRegularFile(path: string): Promise<boolean> {
    try {
        const stat = await Bun.file(path).stat();
        return stat.isFile();
    } catch {
        return false;
    }
}

async function resolveFile(pathname: string): Promise<Response> {
    const candidates = [
        `${ROOT}${pathname}`,
        `${ROOT}${pathname}.html`,
        `${ROOT}${pathname}/index.html`,
    ];

    for (const filePath of candidates) {
        if (await fileExists(filePath)) {
            return new Response(Bun.file(filePath));
        }
    }

    return new Response('Not Found', { status: 404 });
}

const server = serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        let pathname = url.pathname;

        if (pathname === '/') pathname = '/index.html';

        if (pathname === '/favicon.ico') {
            if (await fileExists(FAVICON_PATH)) return new Response(Bun.file(FAVICON_PATH));
            return new Response('Not Found', { status: 404 });
        }

        return resolveFile(pathname);
    },
});

console.log(`Server running at http://localhost:${server.port}`);

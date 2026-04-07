import { serve } from "bun";

const PORT = 3000;

const server = serve({
    port: PORT,
    fetch(request) {
        const url = new URL(request.url);
        const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
        const filePath = `.${pathname}`;
        
        try {
            const file = Bun.file(filePath);
            return new Response(file);
        } catch (e) {
            return new Response('Not Found', { status: 404 });
        }
    },
});

console.log(`Server running at http://localhost:${server.port}`);

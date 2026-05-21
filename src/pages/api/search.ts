export const prerender = false;

import { pipeline, env } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';

// Configure transformers cache for Vercel serverless functions (read-only filesystem except /tmp)
env.cacheDir = '/tmp';
env.allowLocalModels = false;

// Rate limiting map
const rateLimitMap = new Map();

// Caching the index and the extractor
let indexCache = null;
let extractorCache = null;

function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function GET({ request }) {
    // 1. Basic Rate Limiting (prevent scraping)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    let requests = rateLimitMap.get(ip) || [];
    requests = requests.filter(time => time > windowStart);
    requests.push(now);
    rateLimitMap.set(ip, requests);
    
    if (requests.length > 30) {
        return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // 2. Parse Query Params
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const priceFilter = url.searchParams.get('price'); // e.g., 'free', 'freemium'
    const categoryFilter = url.searchParams.get('category');
    
    if (!query) {
        return new Response(JSON.stringify({ error: "Missing 'q' parameter for search query." }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // 3. Load Vector Index
        if (!indexCache) {
            // First try reading from process.cwd() (local dev)
            let indexPath = path.join(process.cwd(), 'public', 'data', 'vector-index.json');
            if (!fs.existsSync(indexPath)) {
                // Try reading from sibling directory or vercel output
                indexPath = path.join(process.cwd(), 'data', 'vector-index.json');
            }
            // Let's just try to fetch it from the same origin to be safe across envs, or use import.
            // But fetch requires the server to be running.
            // Actually, we can use the relative path or fallback to fetch
            try {
                if (fs.existsSync(indexPath)) {
                    indexCache = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                } else {
                    const origin = url.origin;
                    const res = await fetch(`${origin}/data/vector-index.json`);
                    indexCache = await res.json();
                }
            } catch(e) {
                console.error("Could not load index directly:", e);
                const origin = url.origin;
                const res = await fetch(`${origin}/data/vector-index.json`);
                indexCache = await res.json();
            }
        }
        
        // 4. Load Model
        if (!extractorCache) {
            extractorCache = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
        }
        
        // 5. Compute Query Embedding
        const output = await extractorCache(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = Array.from(output.data);
        
        // 6. Calculate similarity and rank
        let results = indexCache.map(tool => {
            const similarity = cosineSimilarity(queryEmbedding, tool.embedding);
            return {
                ...tool,
                similarity
            };
        });
        
        // Remove embeddings from output
        results = results.map(({ embedding, ...rest }) => rest);
        
        // 7. Apply Filters
        if (priceFilter) {
            results = results.filter(t => t.pricing && t.pricing.toLowerCase() === priceFilter.toLowerCase());
        }
        if (categoryFilter) {
            // we don't have category in the index directly right now, let's check if it exists in tags
            results = results.filter(t => t.tags && t.tags.some(tag => tag.toLowerCase() === categoryFilter.toLowerCase()));
        }
        
        // 8. Sort and limit
        results.sort((a, b) => b.similarity - a.similarity);
        const topResults = results.slice(0, 3); // Return top 3
        
        return new Response(JSON.stringify({
            query,
            count: topResults.length,
            results: topResults
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (err) {
        console.error("Search API Error:", err);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

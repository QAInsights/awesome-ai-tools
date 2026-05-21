import { readFileSync, writeFileSync } from 'fs';
import { pipeline } from '@huggingface/transformers';
import path from 'path';

async function main() {
    const dataPath = path.join(process.cwd(), 'public', 'data', 'enriched-tools.json');
    const outPath = path.join(process.cwd(), 'public', 'data', 'vector-index.json');
    
    console.log(`Loading data from ${dataPath}...`);
    let data;
    try {
        data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    } catch (err) {
        console.error('Error loading enriched-tools.json', err);
        process.exit(1);
    }
    
    console.log('Loading embedding model...');
    // We use all-MiniLM-L6-v2 which is small and fast.
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    
    const index = [];
    
    for (const tool of data) {
        // Combine description, verdict, and bestFor as per requirements
        const textToEmbed = [
            tool.name,
            tool.description,
            tool.bestFor,
            tool.verdict
        ].filter(Boolean).join('. ');
        
        const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
        
        index.push({
            slug: tool.slug,
            name: tool.name,
            company: tool.company,
            pricing: tool.pricing,
            category: tool.category, // might not be in enriched-tools, let's see
            tags: tool.tags,
            description: tool.description,
            embedding: Array.from(output.data) // Convert Float32Array to regular array
        });
    }
    
    writeFileSync(outPath, JSON.stringify(index));
    console.log(`Saved vector index for ${index.length} tools to ${outPath}.`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

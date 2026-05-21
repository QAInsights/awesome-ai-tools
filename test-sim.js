import { pipeline } from '@huggingface/transformers';
import fs from 'fs';

function cosSim(a, b) {
    let d = 0, na = 0, nb = 0;
    for(let i=0;i<a.length;i++){ d += a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    return d / (Math.sqrt(na)*Math.sqrt(nb));
}

async function main() {
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    
    const query = "summarizing complex video content with a focus on educational value";
    const qEmbed = Array.from((await extractor(query, { pooling: 'mean', normalize: true })).data);
    
    const data = JSON.parse(fs.readFileSync('public/data/vector-index.json'));
    const results = data.map(t => {
        return { name: t.name, sim: cosSim(qEmbed, t.embedding) };
    });
    
    results.sort((a,b)=>b.sim-a.sim);
    console.log("Top 10:");
    results.slice(0,10).forEach(r => console.log(r.name, r.sim));
    console.log("Gemini:", results.find(r => r.name === 'Gemini'));
}
main();

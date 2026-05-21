import { pipeline } from '@huggingface/transformers';

async function main() {
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  const output = await extractor('Hello world', { pooling: 'mean', normalize: true });
  console.log(output.data.length);
  console.log(output.data.slice(0, 5));
}
main();

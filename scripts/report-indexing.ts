/**
 * Build-time indexing report: how many generated pages per type are
 * indexable vs noindexed by the guardrails in src/lib/indexing.ts.
 *
 * Run with Bun (needs TS import): bun scripts/report-indexing.ts
 */
import { formatIndexingReport, summarizeIndexing } from '../src/lib/indexing';

console.log(formatIndexingReport(summarizeIndexing()));

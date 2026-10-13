/**
 * One-off import of zap votes from the retired Upstash Redis backend into D1.
 *
 * Redis layout (Spring Boot backend): `votes:<toolId>` string counter and
 * `voters:<toolId>` set of voter ids. Output is an idempotent SQL file:
 * legacy counts are overwritten with the Redis totals, voters are inserted
 * with source='redis' for dedupe only, so re-running after cutover is safe.
 *
 * Usage:
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     bun scripts/migrate-upstash-zaps.ts [--out zaps-import.sql] [--report zaps-import-report.json]
 *   bunx wrangler d1 execute DB --remote --file zaps-import.sql
 */
import { writeFileSync } from 'node:fs';

export const TOOL_ID_ALIASES: Record<string, string> = {
    'cognition-windsurf': 'cognition-devin',
    'cognitionai-devin': 'cognition-devin',
};
const TOOL_ID_PATTERN = /^[a-z0-9-]{1,128}$/;
const ROWS_PER_STATEMENT = 200;

export interface ImportReport {
    keysByPrefix: Record<string, number>;
    skippedKeys: string[];
    aliasMerges: Record<string, string[]>;
    tools: number;
    totalVotes: number;
    totalVoters: number;
    countVoterMismatches: Array<{ toolId: string; count: number; voters: number }>;
    top: Array<{ toolId: string; count: number }>;
}

export function canonicalToolId(raw: string): string {
    const id = raw.toLowerCase().trim();
    return TOOL_ID_ALIASES[id] ?? id;
}

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function buildImport(
    counts: Map<string, string | null>,
    voters: Map<string, string[]>,
    importedAt: number,
    keysByPrefix: Record<string, number> = {},
): { sql: string; report: ImportReport } {
    const skippedKeys: string[] = [];
    const aliasMerges: Record<string, string[]> = {};
    const mergedCounts = new Map<string, number>();
    const mergedVoters = new Map<string, Set<string>>();

    const resolve = (rawId: string, key: string): string | null => {
        const id = canonicalToolId(rawId);
        if (!TOOL_ID_PATTERN.test(id)) {
            skippedKeys.push(key);
            return null;
        }
        if (id !== rawId) {
            const sources = (aliasMerges[id] ??= []);
            if (!sources.includes(key)) sources.push(key);
        }
        return id;
    };

    for (const [rawId, value] of counts) {
        const key = `votes:${rawId}`;
        const id = resolve(rawId, key);
        if (!id) continue;
        const n = Number(value);
        if (!Number.isSafeInteger(n) || n < 0) {
            skippedKeys.push(key);
            continue;
        }
        mergedCounts.set(id, (mergedCounts.get(id) ?? 0) + n);
    }

    for (const [rawId, members] of voters) {
        const id = resolve(rawId, `voters:${rawId}`);
        if (!id) continue;
        const set = mergedVoters.get(id) ?? new Set<string>();
        for (const member of members) {
            if (member) set.add(member);
        }
        mergedVoters.set(id, set);
    }

    const statements: string[] = [];
    const countRows = [...mergedCounts].sort(([a], [b]) => a.localeCompare(b));
    for (let i = 0; i < countRows.length; i += ROWS_PER_STATEMENT) {
        const values = countRows.slice(i, i + ROWS_PER_STATEMENT)
            .map(([id, n]) => `(${sqlString(id)}, ${n})`)
            .join(',\n    ');
        statements.push(`INSERT INTO zap_legacy_counts (tool_id, count) VALUES\n    ${values}\nON CONFLICT(tool_id) DO UPDATE SET count = excluded.count;`);
    }

    const voterRows: Array<[string, string]> = [];
    for (const [id, set] of [...mergedVoters].sort(([a], [b]) => a.localeCompare(b))) {
        for (const voter of [...set].sort()) voterRows.push([id, voter]);
    }
    for (let i = 0; i < voterRows.length; i += ROWS_PER_STATEMENT) {
        const values = voterRows.slice(i, i + ROWS_PER_STATEMENT)
            .map(([id, voter]) => `(${sqlString(id)}, ${sqlString(voter)}, ${importedAt}, 'redis')`)
            .join(',\n    ');
        statements.push(`INSERT OR IGNORE INTO zap_votes (tool_id, voter_id, created_at, source) VALUES\n    ${values};`);
    }

    const toolIds = new Set([...mergedCounts.keys(), ...mergedVoters.keys()]);
    const countVoterMismatches = [...toolIds]
        .map(toolId => ({ toolId, count: mergedCounts.get(toolId) ?? 0, voters: mergedVoters.get(toolId)?.size ?? 0 }))
        .filter(row => row.count !== row.voters)
        .sort((a, b) => a.toolId.localeCompare(b.toolId));

    return {
        sql: statements.join('\n\n') + '\n',
        report: {
            keysByPrefix,
            skippedKeys: skippedKeys.sort(),
            aliasMerges,
            tools: toolIds.size,
            totalVotes: [...mergedCounts.values()].reduce((sum, n) => sum + n, 0),
            totalVoters: voterRows.length,
            countVoterMismatches,
            top: countRows.map(([toolId, count]) => ({ toolId, count }))
                .sort((a, b) => b.count - a.count || a.toolId.localeCompare(b.toolId))
                .slice(0, 15),
        },
    };
}

type Command = Array<string | number>;

function upstashClient(baseUrl: string, token: string) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const url = baseUrl.replace(/\/+$/, '');

    async function call<T>(command: Command): Promise<T> {
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(command) });
        const body = await response.json() as { result?: T; error?: string };
        if (!response.ok || body.error) throw new Error(`Upstash ${command[0]} failed: ${response.status} ${body.error ?? ''}`);
        return body.result as T;
    }

    async function pipeline<T>(commands: Command[]): Promise<T[]> {
        const results: T[] = [];
        for (let i = 0; i < commands.length; i += 100) {
            const response = await fetch(`${url}/pipeline`, {
                method: 'POST',
                headers,
                body: JSON.stringify(commands.slice(i, i + 100)),
            });
            if (!response.ok) throw new Error(`Upstash pipeline failed: ${response.status}`);
            const body = await response.json() as Array<{ result?: T; error?: string }>;
            for (const item of body) {
                if (item.error) throw new Error(`Upstash pipeline command failed: ${item.error}`);
                results.push(item.result as T);
            }
        }
        return results;
    }

    async function scanAll(): Promise<string[]> {
        const keys = new Set<string>();
        let cursor = '0';
        do {
            const [next, batch] = await call<[string, string[]]>(['SCAN', cursor, 'COUNT', 1000]);
            for (const key of batch) keys.add(key);
            cursor = String(next);
        } while (cursor !== '0');
        return [...keys];
    }

    async function sscanAll(key: string): Promise<string[]> {
        const members = new Set<string>();
        let cursor = '0';
        do {
            const [next, batch] = await call<[string, string[]]>(['SSCAN', key, cursor, 'COUNT', 1000]);
            for (const member of batch) members.add(member);
            cursor = String(next);
        } while (cursor !== '0');
        return [...members];
    }

    return { call, pipeline, scanAll, sscanAll };
}

function argValue(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

async function main() {
    const baseUrl = process.env.UPSTASH_REDIS_REST_URL ?? '';
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
    if (!baseUrl || !token) throw new Error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    const outPath = argValue('--out', 'zaps-import.sql');
    const reportPath = argValue('--report', 'zaps-import-report.json');

    const redis = upstashClient(baseUrl, token);
    const dbsize = await redis.call<number>(['DBSIZE']);
    const keys = await redis.scanAll();
    const keysByPrefix: Record<string, number> = {};
    for (const key of keys) {
        const prefix = key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '(no prefix)';
        keysByPrefix[prefix] = (keysByPrefix[prefix] ?? 0) + 1;
    }

    const countKeys = keys.filter(key => key.startsWith('votes:')).sort();
    const voterKeys = keys.filter(key => key.startsWith('voters:')).sort();
    const countValues = await redis.pipeline<string | null>(countKeys.map(key => ['GET', key]));
    const counts = new Map(countKeys.map((key, i) => [key.slice('votes:'.length), countValues[i] ?? null]));
    const voters = new Map<string, string[]>();
    for (const key of voterKeys) voters.set(key.slice('voters:'.length), await redis.sscanAll(key));

    const { sql, report } = buildImport(counts, voters, Date.now(), keysByPrefix);
    writeFileSync(outPath, sql);
    writeFileSync(reportPath, JSON.stringify({ dbsize, scannedKeys: keys.length, ...report }, null, 2) + '\n');
    console.log(`DBSIZE ${dbsize}, scanned ${keys.length} keys`, keysByPrefix);
    console.log(`${report.tools} tools, ${report.totalVotes} votes, ${report.totalVoters} voter rows`);
    console.log(`${report.countVoterMismatches.length} tools where count != voters; ${report.skippedKeys.length} skipped keys`);
    console.log(`Wrote ${outPath} and ${reportPath}`);
}

if (import.meta.main) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}

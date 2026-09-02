import { getAnalyticsDataset } from './runtime-env';
import { runAnalyticsSql } from './analytics-query';

const DAY_MS = 86_400_000;

export const USER_ID_PATTERN = /^[a-z]+:[A-Za-z0-9_.-]{1,64}$/;

export interface UserZapRow {
    tool_id: string;
    timestamp: string;
}

export interface ZapDashboardTool {
    toolId: string;
    slug: string;
    name: string;
    company: string;
    category: string;
    zappedAt: string;
}

export interface ZapDashboard {
    tools: ZapDashboardTool[];
    total: number;
    last30Days: number;
    topCategory: string;
}

export function zapToolId(company: string, name: string): string {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${normalize(company)}-${normalize(name)}`;
}

export function buildUserZapsQuery(
    dataset: 'aat_events' | 'aat_events_staging',
    userId: string,
): string {
    if (!USER_ID_PATTERN.test(userId)) throw new Error('Invalid user id');
    return `SELECT blob5 AS tool_id, timestamp FROM ${dataset} WHERE blob1 = 'zap_cast' AND blob3 = '${userId}' AND timestamp >= NOW() - INTERVAL '90' DAY ORDER BY timestamp DESC LIMIT 500`;
}

export function buildZapDashboard(
    rows: UserZapRow[],
    tools: Array<{ slug: string; name: string; company: string; category: string }>,
    now = Date.now(),
): ZapDashboard {
    const toolsById = new Map(tools.map(tool => [zapToolId(tool.company, tool.name), tool]));
    const latestByToolId = new Map<string, UserZapRow>();

    for (const row of rows) {
        if (!row?.tool_id || !row?.timestamp) continue;
        const previous = latestByToolId.get(row.tool_id);
        if (!previous || Date.parse(row.timestamp) > Date.parse(previous.timestamp)) {
            latestByToolId.set(row.tool_id, row);
        }
    }

    const dashboardTools = Array.from(latestByToolId.entries())
        .map(([toolId, row]) => {
            const tool = toolsById.get(toolId);
            if (!tool) return null;
            return { toolId, ...tool, zappedAt: row.timestamp };
        })
        .filter((tool): tool is ZapDashboardTool => tool !== null)
        .sort((a, b) => Date.parse(b.zappedAt) - Date.parse(a.zappedAt));

    const cutoff = now - 30 * DAY_MS;
    const categoryCounts = new Map<string, number>();
    for (const tool of dashboardTools) {
        categoryCounts.set(tool.category, (categoryCounts.get(tool.category) ?? 0) + 1);
    }
    let topCategory = '';
    let topCategoryCount = 0;
    for (const [category, count] of categoryCounts) {
        if (count > topCategoryCount) {
            topCategory = category;
            topCategoryCount = count;
        }
    }

    return {
        tools: dashboardTools,
        total: dashboardTools.length,
        last30Days: dashboardTools.filter(tool => {
            const timestamp = Date.parse(tool.zappedAt);
            return timestamp >= cutoff && timestamp <= now;
        }).length,
        topCategory,
    };
}

export async function loadUserZaps(
    userId: string,
    tools: Array<{ slug: string; name: string; company: string; category: string }>,
): Promise<{ data: ZapDashboard; error: string }> {
    try {
        const rows = await runAnalyticsSql(buildUserZapsQuery(getAnalyticsDataset(), userId));
        return { data: buildZapDashboard(rows as UserZapRow[], tools), error: '' };
    } catch (error) {
        return {
            data: buildZapDashboard([], tools),
            error: error instanceof Error ? error.message : 'Analytics unavailable',
        };
    }
}

/**
 * Reach dashboard on /advertise. Renders the daily traffic chart, KPI deltas,
 * top-N breakdowns and the GitHub stars trend from the JSON embedded at build
 * time (public/data/site-stats.json), filtered by range and metric.
 */

const DAY_MS = 86_400_000;
const METRIC_LABELS = { visits: 'Visits', pageViews: 'Page views' };

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function formatCompact(value) {
    return Number.isFinite(value) ? compact.format(value) : '—';
}

export function formatDate(isoDate) {
    return shortDate.format(new Date(`${isoDate}T00:00:00Z`));
}

function addDays(isoDate, days) {
    return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Up to `days` consecutive points ending at `endDate`, zero-filling days from `firstDate` on that have no rows. */
export function seriesWindow(daily, days, endDate = daily.at(-1)?.date, firstDate = daily[0]?.date) {
    if (!endDate || !firstDate) return [];
    const byDate = new Map(daily.map(point => [point.date, point]));
    const points = [];
    for (let offset = days - 1; offset >= 0; offset--) {
        const date = addDays(endDate, -offset);
        if (date < firstDate) continue;
        const point = byDate.get(date);
        points.push({ date, visits: point?.visits ?? 0, pageViews: point?.pageViews ?? 0 });
    }
    return points;
}

export function percentChange(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
    return ((current - previous) / previous) * 100;
}

/**
 * Totals for the latest `days` and the period before it; `change` is null without a full previous period.
 * `coverage` is the collector's queried day span; without it the data's own first/last dates are used.
 */
export function summarizeRange(daily, days, metric, coverage) {
    const endDate = coverage?.to ?? daily.at(-1)?.date;
    const firstDate = coverage?.from ?? daily[0]?.date;
    const current = seriesWindow(daily, days, endDate, firstDate);
    const sum = points => points.reduce((total, point) => total + (point[metric] ?? 0), 0);
    const total = sum(current);
    const previousEnd = endDate ? addDays(endDate, -days) : undefined;
    const previous = previousEnd ? seriesWindow(daily, days, previousEnd, firstDate) : [];
    const hasPrevious = previous.length === days;
    return {
        total,
        average: current.length ? total / current.length : 0,
        previous: hasPrevious ? sum(previous) : null,
        change: hasPrevious ? percentChange(total, sum(previous)) : null,
        points: current,
    };
}

/**
 * SVG path data for a line and its filled area, scaled into a width x height box.
 * `zeroBaseline: false` fits the y-axis to the data, so slow-moving counts stay readable.
 */
/** Rows ranked by the selected metric, capped at `limit`. */
export function rankRows(rows, metric, limit = 10) {
    return [...(rows ?? [])]
        .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0) || String(a.label).localeCompare(String(b.label)))
        .slice(0, limit);
}

export function linePaths(values, width, height, { padding = 4, zeroBaseline = true } = {}) {
    if (!values.length) return { line: '', area: '', coords: [] };
    const max = Math.max(...values, ...(zeroBaseline ? [0] : []));
    const min = Math.min(...values, ...(zeroBaseline ? [0] : []));
    const span = max - min;
    const inner = height - padding * 2;
    const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
    const coords = values.map((value, index) => [
        values.length > 1 ? padding + index * step : width / 2,
        span ? height - padding - ((value - min) / span) * inner : height - padding - (zeroBaseline ? 0 : inner / 2),
    ]);
    const round = number => Math.round(number * 10) / 10;
    const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ');
    const area = `${line} L${round(coords.at(-1)[0])} ${height - padding} L${round(coords[0][0])} ${height - padding} Z`;
    return { line, area, coords };
}

/** GitHub history points within `days` of the latest snapshot. */
export function historyWindow(history, days) {
    const endDate = history.at(-1)?.date;
    if (!endDate) return [];
    const startDate = addDays(endDate, -(days - 1));
    return history.filter(point => point.date >= startDate);
}

function renderChart(svg, tooltip, points, valueOf, labelOf, options) {
    const width = 640;
    const height = 180;
    const { line, area, coords } = linePaths(points.map(valueOf), width, height, options);
    svg.querySelector('[data-line]').setAttribute('d', line);
    svg.querySelector('[data-area]').setAttribute('d', area);
    const marker = svg.querySelector('[data-marker]');
    marker.setAttribute('visibility', 'hidden');
    if (tooltip) tooltip.hidden = true;

    svg.onpointermove = event => {
        if (!coords.length) return;
        const box = svg.getBoundingClientRect();
        const x = ((event.clientX - box.left) / box.width) * width;
        let nearest = 0;
        coords.forEach(([cx], index) => {
            if (Math.abs(cx - x) < Math.abs(coords[nearest][0] - x)) nearest = index;
        });
        const [cx, cy] = coords[nearest];
        marker.setAttribute('cx', String(cx));
        marker.setAttribute('cy', String(cy));
        marker.setAttribute('visibility', 'visible');
        if (tooltip) {
            tooltip.textContent = labelOf(points[nearest]);
            tooltip.style.left = `${(cx / width) * 100}%`;
            tooltip.hidden = false;
        }
    };
    svg.onpointerleave = () => {
        marker.setAttribute('visibility', 'hidden');
        if (tooltip) tooltip.hidden = true;
    };
}

function renderBreakdown(list, allRows, metric) {
    const rows = rankRows(allRows, metric);
    list.replaceChildren();
    if (!rows?.length) {
        const empty = document.createElement('li');
        empty.className = 'text-[13px] text-ink-muted py-2';
        empty.textContent = 'No data for this range yet.';
        list.append(empty);
        return;
    }
    const max = Math.max(...rows.map(row => row[metric] ?? 0), 1);
    for (const row of rows) {
        const item = document.createElement('li');
        item.className = 'relative flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]';
        const bar = document.createElement('span');
        bar.className = 'absolute inset-y-0 left-0 rounded-sm bg-gold/10';
        bar.style.width = `${((row[metric] ?? 0) / max) * 100}%`;
        bar.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'relative truncate text-ink-secondary font-mono';
        label.textContent = row.label;
        label.title = row.label;
        const value = document.createElement('span');
        value.className = 'relative font-mono text-ink shrink-0';
        value.textContent = formatCompact(row[metric] ?? 0);
        value.title = (row[metric] ?? 0).toLocaleString('en');
        item.append(bar, label, value);
        list.append(item);
    }
}

function setPressed(buttons, attribute, value) {
    for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset[attribute] === value));
    }
}

export function initReachDashboard(root, data) {
    const state = { range: '30', metric: 'visits', breakdown: 'pages' };
    const daily = Array.isArray(data?.daily) ? data.daily : [];
    const history = Array.isArray(data?.history) ? data.history : [];
    const breakdowns = data?.breakdowns ?? {};
    const coverage = data?.coverage ?? undefined;
    const rangeButtons = root.querySelectorAll('[data-range]');
    const metricButtons = root.querySelectorAll('[data-metric]');
    const breakdownButtons = root.querySelectorAll('[data-breakdown]');
    const text = (selector, value) => {
        const element = root.querySelector(selector);
        if (element) element.textContent = value;
    };

    const render = () => {
        const days = Number(state.range);
        const metricLabel = METRIC_LABELS[state.metric];
        setPressed(rangeButtons, 'range', state.range);
        setPressed(metricButtons, 'metric', state.metric);
        setPressed(breakdownButtons, 'breakdown', state.breakdown);

        if (daily.length || coverage) {
            const summary = summarizeRange(daily, days, state.metric, coverage);
            text('[data-kpi-total-label]', `${metricLabel}, last ${days} days`);
            text('[data-kpi-total]', formatCompact(summary.total));
            text('[data-kpi-average]', formatCompact(Math.round(summary.average)));
            text('[data-kpi-change]', summary.change === null
                ? '—'
                : `${summary.change >= 0 ? '+' : ''}${summary.change.toFixed(1)}%`);
            const change = root.querySelector('[data-kpi-change]');
            change?.classList.toggle('text-emerald-400', (summary.change ?? 0) > 0);
            change?.classList.toggle('text-danger', (summary.change ?? 0) < 0);
            text('[data-kpi-change-label]', `vs previous ${days} days`);
            const first = summary.points[0];
            const last = summary.points.at(-1);
            text('[data-chart-range]', first && last ? `${formatDate(first.date)} – ${formatDate(last.date)} (UTC)` : '');
            renderChart(
                root.querySelector('[data-traffic-chart]'),
                root.querySelector('[data-traffic-tooltip]'),
                summary.points,
                point => point[state.metric],
                point => `${formatDate(point.date)}: ${point[state.metric].toLocaleString('en')} ${metricLabel.toLowerCase()}`,
            );
            const list = root.querySelector('[data-breakdown-list]');
            if (list) renderBreakdown(list, breakdowns[state.range]?.[state.breakdown], state.metric);
        }

        if (history.length > 1) {
            const points = historyWindow(history, days);
            const first = points[0];
            const last = points.at(-1);
            text('[data-stars-total]', last ? last.stars.toLocaleString('en') : '—');
            text('[data-stars-delta]', first && last ? `${last.stars - first.stars >= 0 ? '+' : ''}${last.stars - first.stars} since ${formatDate(first.date)}` : '');
            renderChart(
                root.querySelector('[data-stars-chart]'),
                root.querySelector('[data-stars-tooltip]'),
                points,
                point => point.stars,
                point => `${formatDate(point.date)}: ${point.stars} stars, ${point.forks} forks`,
                { zeroBaseline: false },
            );
        }
    };

    const bind = (buttons, key) => {
        for (const button of buttons) {
            button.addEventListener('click', () => {
                state[key] = button.dataset[key];
                render();
            });
        }
    };
    bind(rangeButtons, 'range');
    bind(metricButtons, 'metric');
    bind(breakdownButtons, 'breakdown');
    render();
}

if (typeof document !== 'undefined') {
    const root = document.getElementById('reach-dashboard');
    const source = document.getElementById('reach-dashboard-data');
    if (root && source) {
        try {
            initReachDashboard(root, JSON.parse(source.textContent || '{}'));
        } catch (error) {
            console.error('[Reach dashboard] Failed to render:', error);
        }
    }
}

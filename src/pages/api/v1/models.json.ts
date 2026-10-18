/**
 * Live & Cached LLM Token Pricing API - /api/v1/models.json
 *
 * Fetches and normalizes coding/reasoning LLM pricing from https://models.dev/api.json
 * with 3-layer resilience:
 *   1. Edge/Isolate memory cache + Cloudflare upstream fetch cache (6h TTL)
 *   2. CDN/Browser Cache-Control headers with stale-while-revalidate
 *   3. Built-in fallback snapshot if upstream is unreachable
 */
import type { APIRoute } from 'astro';
import { fetchModelsPricingCatalog } from '../../../lib/models-pricing';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const catalog = await fetchModelsPricingCatalog({ forceRefresh });

  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': forceRefresh
        ? 'no-store'
        : 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
    },
  });
};

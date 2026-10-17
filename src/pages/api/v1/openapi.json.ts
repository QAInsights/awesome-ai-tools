/**
 * OpenAPI description of the public catalog API - /api/v1/openapi.json
 *
 * Static and CORS-open so agents, MCP servers and API clients can import the
 * contract directly. Advertised from /llms.txt.
 */
import type { APIRoute } from 'astro';
import { buildOpenApiSpec } from '../../../lib/openapi-spec';

export const prerender = false;

export const GET: APIRoute = () => new Response(JSON.stringify(buildOpenApiSpec(), null, 2), {
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  },
});


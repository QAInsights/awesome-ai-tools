/**
 * OpenAPI 3.1 description of the public catalog API (/api/v1/tools).
 *
 * Built from the same limit constants the route enforces, so the published
 * contract cannot drift from runtime behaviour. Served at /api/v1/openapi.json
 * for coding agents, MCP servers and API clients.
 */
import { DEFAULT_LIMIT, MAX_LIMIT, MAX_OFFSET } from './tool-query';

const SITE = 'https://ai.dosa.dev';

const stringParam = (name: string, description: string) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'string' },
});

const intParam = (name: string, description: string, schema: Record<string, unknown>) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'integer', ...schema },
});

const catalogTool = {
  type: 'object',
  required: ['slug', 'name', 'category', 'detailUrl', 'markdownUrl'],
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    company: { type: 'string' },
    category: { type: 'string' },
    categorySlug: { type: 'string' },
    pricing: { type: 'string' },
    pricingDetail: { type: ['string', 'null'] },
    summary: { type: 'string' },
    bestFor: { type: ['string', 'null'] },
    notIdealFor: { type: ['string', 'null'] },
    verdict: { type: ['string', 'null'] },
    keyFeatures: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    officialUrl: { type: ['string', 'null'], format: 'uri' },
    detailUrl: { type: 'string', format: 'uri' },
    markdownUrl: { type: 'string', format: 'uri' },
    lastUpdated: { type: ['string', 'null'] },
  },
};

export function buildOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ai.dosa.dev Catalog API',
      version: '1.0.0',
      description: 'Read-only, CORS-enabled search over the curated catalog of AI coding tools. No authentication required.',
      license: { name: 'Attribution requested - link the tool detail page when citing' },
    },
    servers: [{ url: SITE }],
    paths: {
      '/api/v1/tools': {
        get: {
          operationId: 'searchTools',
          summary: 'Search and filter catalog tools, or fetch one tool by slug',
          parameters: [
            stringParam('slug', 'Return exactly one tool ({ tool }) instead of a list. 404 if unknown.'),
            stringParam('q', 'Free-text search over name, slug, company, tags, summary, best-for and key features. Exact slug/name matches rank first.'),
            stringParam('category', 'Category slug or name, e.g. "cli-agents". Names also match as a case-insensitive substring.'),
            stringParam('pricing', 'Pricing model: "free", "open-source", or an exact value such as "freemium".'),
            stringParam('tag', 'Filter to tools with a tag equal to or containing this value (case-insensitive).'),
            intParam('limit', 'Page size.', { default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT }),
            intParam('offset', 'Number of results to skip.', { default: 0, minimum: 0, maximum: MAX_OFFSET }),
          ],
          responses: {
            200: {
              description: 'A page of tools, or a single tool when `slug` is given.',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        type: 'object',
                        required: ['total', 'limit', 'offset', 'tools'],
                        properties: {
                          total: { type: 'integer' },
                          limit: { type: 'integer' },
                          offset: { type: 'integer' },
                          tools: { type: 'array', items: { $ref: '#/components/schemas/CatalogTool' } },
                        },
                      },
                      {
                        type: 'object',
                        required: ['tool'],
                        properties: { tool: { $ref: '#/components/schemas/CatalogTool' } },
                      },
                    ],
                  },
                },
              },
            },
            404: {
              description: 'Unknown slug.',
              content: {
                'application/json': {
                  schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas: { CatalogTool: catalogTool } },
  };
}

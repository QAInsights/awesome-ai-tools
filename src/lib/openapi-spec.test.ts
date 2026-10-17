import { describe, expect, test } from 'bun:test';
import { buildOpenApiSpec } from './openapi-spec';
import { DEFAULT_LIMIT, MAX_LIMIT, MAX_OFFSET } from './tool-query';

describe('openapi-spec', () => {
  const spec = buildOpenApiSpec();
  const params = spec.paths['/api/v1/tools'].get.parameters;
  const byName = (name: string) => params.find(p => p.name === name);

  test('is OpenAPI 3.1 and describes /api/v1/tools', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/api/v1/tools'].get.operationId).toBe('searchTools');
  });

  test('documents every query parameter the route reads', () => {
    expect(params.map(p => p.name).sort()).toEqual(
      ['category', 'limit', 'offset', 'pricing', 'q', 'slug', 'tag'],
    );
  });

  test('limit and offset bounds come from the enforced constants', () => {
    expect(byName('limit')?.schema).toMatchObject({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT });
    expect(byName('offset')?.schema).toMatchObject({ default: 0, minimum: 0, maximum: MAX_OFFSET });
  });

  test('response schema references a defined component', () => {
    expect(JSON.stringify(spec)).toContain('#/components/schemas/CatalogTool');
    expect(spec.components.schemas.CatalogTool.required).toContain('markdownUrl');
  });
});

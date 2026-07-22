import { CatalogHttpClient } from './catalog-http-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('CatalogHttpClient.getProductVariantIds', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the variant ids from GET /products/:id', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'prod-1',
        variants: [{ id: 'variant-1' }, { id: 'variant-2' }],
      }),
    ) as any;
    const client = new CatalogHttpClient();

    const result = await client.getProductVariantIds('prod-1', 'token-1');

    expect(result).toEqual(['variant-1', 'variant-2']);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3003/api/v1/products/prod-1',
      { method: 'GET', headers: { Authorization: 'Bearer token-1' } },
    );
  });

  it('returns null when the product does not exist (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, {})) as any;
    const client = new CatalogHttpClient();

    const result = await client.getProductVariantIds('missing', 'token-1');

    expect(result).toBeNull();
  });
});

import { CatalogHttpClient } from './catalog-http-client';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';

describe('CatalogHttpClient', () => {
  const OLD_ENV = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...OLD_ENV, CATALOG_SERVICE_URL: 'http://catalog.local/api/v1' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches the variant and repasses the bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ variantId: 'variant-1', sellerId: 'seller-1', price: '49.90' }),
    });
    global.fetch = fetchMock as any;
    const client = new CatalogHttpClient();

    const variant = await client.getVariant('variant-1', 'jwt-token');

    expect(fetchMock).toHaveBeenCalledWith('http://catalog.local/api/v1/variants/variant-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer jwt-token' },
    });
    expect(variant).toEqual({ variantId: 'variant-1', sellerId: 'seller-1', price: '49.90' });
  });

  it('returns null when the catalog responds 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    const client = new CatalogHttpClient();

    await expect(client.getVariant('missing', 'jwt-token')).resolves.toBeNull();
  });

  it('throws CatalogUnavailableException on a non-404 error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const client = new CatalogHttpClient();

    await expect(client.getVariant('variant-1', 'jwt-token')).rejects.toThrow(
      CatalogUnavailableException,
    );
  });

  it('throws CatalogUnavailableException when the network call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const client = new CatalogHttpClient();

    await expect(client.getVariant('variant-1', 'jwt-token')).rejects.toThrow(
      CatalogUnavailableException,
    );
  });

  it('coerces a numeric price to a string', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ variantId: 'variant-1', sellerId: 'seller-1', price: 10 }),
    }) as any;
    const client = new CatalogHttpClient();

    const variant = await client.getVariant('variant-1', 'jwt-token');

    expect(variant!.price).toBe('10');
  });
});

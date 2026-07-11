import { CatalogHttpClient } from './catalog-http-client';
import { CatalogUnavailableException } from '../../../core/exceptions/catalog-unavailable.exception';

function mockFetch(response: Partial<Response> & { status: number; ok: boolean; json?: () => Promise<unknown> }) {
  global.fetch = jest.fn().mockResolvedValue(response) as any;
}

describe('CatalogHttpClient', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, CATALOG_SERVICE_URL: 'http://catalog.test/api/v1' };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = OLD_ENV;
  });

  describe('getMySeller', () => {
    it('forwards the JWT and returns { id, status }', async () => {
      mockFetch({ status: 200, ok: true, json: async () => ({ id: 'seller-1', status: 'ACTIVE' }) });
      const client = new CatalogHttpClient();

      const result = await client.getMySeller('the-token');

      expect(global.fetch).toHaveBeenCalledWith('http://catalog.test/api/v1/sellers/me', {
        method: 'GET',
        headers: { Authorization: 'Bearer the-token' },
      });
      expect(result).toEqual({ id: 'seller-1', status: 'ACTIVE' });
    });

    it('returns null on 404 (user has no seller)', async () => {
      mockFetch({ status: 404, ok: false });
      const client = new CatalogHttpClient();

      expect(await client.getMySeller('t')).toBeNull();
    });

    it('throws CatalogUnavailable on a non-ok, non-404 response', async () => {
      mockFetch({ status: 500, ok: false });
      const client = new CatalogHttpClient();

      await expect(client.getMySeller('t')).rejects.toBeInstanceOf(CatalogUnavailableException);
    });

    it('throws CatalogUnavailable when fetch itself rejects (network down)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
      const client = new CatalogHttpClient();

      await expect(client.getMySeller('t')).rejects.toBeInstanceOf(CatalogUnavailableException);
    });
  });

  describe('getVariant', () => {
    it('returns { variantId, sellerId } on success', async () => {
      mockFetch({ status: 200, ok: true, json: async () => ({ variantId: 'v-1', sellerId: 'seller-1' }) });
      const client = new CatalogHttpClient();

      const result = await client.getVariant('v-1', 't');

      expect(global.fetch).toHaveBeenCalledWith('http://catalog.test/api/v1/variants/v-1', {
        method: 'GET',
        headers: { Authorization: 'Bearer t' },
      });
      expect(result).toEqual({ variantId: 'v-1', sellerId: 'seller-1' });
    });

    it('returns null on 404 (variant does not exist)', async () => {
      mockFetch({ status: 404, ok: false });
      const client = new CatalogHttpClient();

      expect(await client.getVariant('v-x', 't')).toBeNull();
    });
  });
});

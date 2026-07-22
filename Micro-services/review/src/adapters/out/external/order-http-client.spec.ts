import { OrderHttpClient } from './order-http-client';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('OrderHttpClient.verifyPurchase', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns eligible + sellerId on a 200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { eligible: true, sellerId: 'seller-1' })) as any;
    const client = new OrderHttpClient();

    const result = await client.verifyPurchase('token-1', 'order-1', 'prod-1');

    expect(result).toEqual({ eligible: true, sellerId: 'seller-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3006/api/v1/orders/order-1/verify-purchase?productId=prod-1',
      { method: 'GET', headers: { Authorization: 'Bearer token-1' } },
    );
  });

  it('treats a non-2xx response (e.g. 403/404) as not eligible, without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(404, {})) as any;
    const client = new OrderHttpClient();

    const result = await client.verifyPurchase('token-1', 'order-missing', 'prod-1');

    expect(result).toEqual({ eligible: false });
  });

  it('throws OrderServiceUnavailableException on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const client = new OrderHttpClient();

    await expect(client.verifyPurchase('token-1', 'order-1', 'prod-1')).rejects.toThrow(
      OrderServiceUnavailableException,
    );
  });
});

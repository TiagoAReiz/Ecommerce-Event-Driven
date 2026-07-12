import { createHmac } from 'node:crypto';
import { StubMercadoPagoGateway } from './stub-mercado-pago.gateway';

describe('StubMercadoPagoGateway', () => {
  const secret = 'test-secret';
  let gateway: StubMercadoPagoGateway;

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = secret;
    gateway = new StubMercadoPagoGateway();
  });

  it('createPreference derives a deterministic preferenceId + init_point from the orderId', async () => {
    const result = await gateway.createPreference({
      orderId: 'order-1',
      userId: 'user-1',
      totalAmount: '130.00',
      splits: [],
    });
    expect(result.preferenceId).toBe('mp-pref-order-1');
    expect(result.initPoint).toBe(gateway.buildInitPoint('mp-pref-order-1'));
    expect(result.initPoint).toContain('mp-pref-order-1');
  });

  it('buildInitPoint is stable for the same preferenceId', () => {
    expect(gateway.buildInitPoint('pref-x')).toBe(gateway.buildInitPoint('pref-x'));
  });

  it('verifyWebhookSignature accepts a correct HMAC and rejects a wrong one / missing sig', () => {
    const rawBody = JSON.stringify({ id: 'e1', orderId: 'order-1' });
    const good = createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(gateway.verifyWebhookSignature({ rawBody, signature: good })).toBe(true);
    expect(gateway.verifyWebhookSignature({ rawBody, signature: 'deadbeef' })).toBe(false);
    expect(gateway.verifyWebhookSignature({ rawBody, signature: undefined })).toBe(false);
  });

  it('refund returns a deterministic refundId', async () => {
    expect(await gateway.refund('mp-pay-1')).toEqual({ refundId: 'mp-refund-mp-pay-1' });
  });
});

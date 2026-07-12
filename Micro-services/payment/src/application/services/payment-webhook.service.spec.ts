import { PaymentWebhookService } from './payment-webhook.service';
import { InvalidWebhookSignatureException } from '../../core/exceptions/invalid-webhook-signature.exception';
import { MercadoPagoWebhookBody } from '../../core/interfaces/services/payment-webhook-service.interface';

function build() {
  const paymentRepository = {
    findByOrderId: jest.fn(),
    findSplitsBySellerIds: jest.fn(),
    createPaymentWithSplits: jest.fn(),
    confirmFromWebhook: jest.fn(),
    failFromWebhook: jest.fn(),
    refundOnCancel: jest.fn(),
  };
  const mercadoPago = {
    createPreference: jest.fn(),
    buildInitPoint: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    refund: jest.fn(),
  };
  const service = new PaymentWebhookService(paymentRepository as any, mercadoPago as any);
  return { service, paymentRepository, mercadoPago };
}

const approvedBody: MercadoPagoWebhookBody = {
  id: 'mp-evt-1',
  type: 'payment',
  data: { id: 'mp-pay-1' },
  orderId: 'order-1',
  status: 'approved',
  method: 'PIX',
};

describe('PaymentWebhookService.handleWebhook', () => {
  it('rejects an invalid signature with a domain exception (never touches the repo)', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    mercadoPago.verifyWebhookSignature.mockReturnValue(false);

    await expect(
      service.handleWebhook('{}', 'bad-sig', approvedBody),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureException);
    expect(paymentRepository.confirmFromWebhook).not.toHaveBeenCalled();
  });

  it('confirms an approved payment and reports "confirmed"', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    mercadoPago.verifyWebhookSignature.mockReturnValue(true);
    paymentRepository.confirmFromWebhook.mockResolvedValue({ published: true });

    const result = await service.handleWebhook('raw', 'sig', approvedBody);

    expect(result).toEqual({ status: 'confirmed' });
    expect(paymentRepository.confirmFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ mpEventId: 'mp-evt-1', orderId: 'order-1', mpPaymentId: 'mp-pay-1', method: 'PIX' }),
    );
  });

  it('reports "duplicate" when the repository de-duped the webhook (published=false)', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    mercadoPago.verifyWebhookSignature.mockReturnValue(true);
    paymentRepository.confirmFromWebhook.mockResolvedValue({ published: false });

    const result = await service.handleWebhook('raw', 'sig', approvedBody);
    expect(result).toEqual({ status: 'duplicate' });
  });

  it('fails a rejected payment and reports "failed"', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    mercadoPago.verifyWebhookSignature.mockReturnValue(true);
    paymentRepository.failFromWebhook.mockResolvedValue({ published: true });

    const result = await service.handleWebhook('raw', 'sig', { ...approvedBody, status: 'rejected' });

    expect(result).toEqual({ status: 'failed' });
    expect(paymentRepository.failFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it('defaults an unknown method to PIX', async () => {
    const { service, paymentRepository, mercadoPago } = build();
    mercadoPago.verifyWebhookSignature.mockReturnValue(true);
    paymentRepository.confirmFromWebhook.mockResolvedValue({ published: true });

    await service.handleWebhook('raw', 'sig', { ...approvedBody, method: 'WEIRD' as any });

    expect(paymentRepository.confirmFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PIX' }),
    );
  });
});

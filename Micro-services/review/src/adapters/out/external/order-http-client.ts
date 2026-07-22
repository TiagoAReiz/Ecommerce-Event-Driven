import { Injectable } from '@nestjs/common';
import { OrderServiceUnavailableException } from '../../../core/exceptions/order-service-unavailable.exception';
import { IOrderClient, PurchaseVerification } from '../../../core/interfaces/external/order-client.interface';

@Injectable()
export class OrderHttpClient implements IOrderClient {
  private readonly baseUrl = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3006/api/v1';

  async verifyPurchase(accessToken: string, orderId: string, productId: string): Promise<PurchaseVerification> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/orders/${orderId}/verify-purchase?productId=${encodeURIComponent(productId)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch {
      throw new OrderServiceUnavailableException();
    }

    if (!response.ok) {
      return { eligible: false };
    }

    return (await response.json()) as PurchaseVerification;
  }
}

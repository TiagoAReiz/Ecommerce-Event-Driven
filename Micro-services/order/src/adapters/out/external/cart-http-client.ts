import { Injectable } from '@nestjs/common';
import { CartUnavailableException } from '../../../core/exceptions/cart-unavailable.exception';
import { CartItemView, ICartClient } from '../../../core/interfaces/external/cart-client.interface';

interface CartItemResponse {
  variantId: string;
  quantity: number;
}

interface CartResponse {
  id: string;
  userId: string;
  items: CartItemResponse[];
}

@Injectable()
export class CartHttpClient implements ICartClient {
  private readonly baseUrl = process.env.CART_SERVICE_URL ?? 'http://localhost:3002/api/v1';

  async getCart(accessToken: string): Promise<CartItemView[]> {
    const response = await this.request('GET', '/cart', accessToken);
    if (!response.ok) throw new CartUnavailableException();

    const body = (await response.json()) as CartResponse;
    return body.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }));
  }

  async clearCart(accessToken: string): Promise<void> {
    const response = await this.request('DELETE', '/cart', accessToken);
    if (!response.ok && response.status !== 204) throw new CartUnavailableException();
  }

  private async request(method: string, path: string, accessToken: string): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new CartUnavailableException();
    }
  }
}

export const CART_CLIENT = Symbol('CART_CLIENT');

export interface CartItemView {
  variantId: string;
  quantity: number;
}

/**
 * Port para o cart-service. Toda chamada repassa o JWT do usuário atual (mesmo padrão de
 * cart -> catalog): a leitura do carrinho é sempre "em nome do usuário atual".
 */
export interface ICartClient {
  /** `GET /cart` (JWT). Carrinho vazio (sem itens) se o usuário não tiver carrinho ainda. */
  getCart(accessToken: string): Promise<CartItemView[]>;
  /**
   * `DELETE /cart` (JWT), chamada pós-checkout. Best-effort no lado do caller: uma falha aqui
   * não deve reverter o Order já criado (ver order.service.ts).
   */
  clearCart(accessToken: string): Promise<void>;
}

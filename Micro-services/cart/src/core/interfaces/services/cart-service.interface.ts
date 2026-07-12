import { Cart } from '../../entities/cart.entity';

export const CART_SERVICE = Symbol('CART_SERVICE');

export interface ICartService {
  /** Retorna o carrinho do usuário, criando um vazio se ainda não existir. */
  getOrCreateCart(userId: string): Promise<Cart>;

  /**
   * Adiciona um item ao carrinho. Busca preço/sellerId atuais no catalog-service
   * (chamada síncrona, repassando o JWT do usuário). Se a variant já estiver no
   * carrinho, soma a quantidade e atualiza o snapshot de preço.
   */
  addItem(userId: string, variantId: string, quantity: number, accessToken: string): Promise<Cart>;

  /** Atualiza a quantidade de um item; valida ownership (o item precisa pertencer ao carrinho do usuário). */
  updateItemQuantity(userId: string, itemId: string, quantity: number): Promise<Cart>;

  /** Remove um item do carrinho; valida ownership. */
  removeItem(userId: string, itemId: string): Promise<Cart>;

  /** Esvazia o carrinho do usuário (idempotente — no-op se já estiver vazio ou não existir). */
  clearCart(userId: string): Promise<void>;
}

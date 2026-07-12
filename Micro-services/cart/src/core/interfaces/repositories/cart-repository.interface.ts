import { Cart } from '../../entities/cart.entity';
import { CartItem } from '../../entities/cart-item.entity';
import { UpsertCartItemInput } from './inputs/cart-repository.inputs';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartItemWithOwner {
  item: CartItem;
  cartUserId: string;
}

export interface ICartRepository {
  /** Retorna `null` quando o usuário ainda não tem carrinho — usado pra checagens "existe?" (ex.: clearCart). */
  findByUserId(userId: string): Promise<Cart | null>;

  /**
   * Busca o carrinho do usuário ou cria um vazio, atomicamente (`upsert` na constraint
   * `userId @unique`). Evita a corrida find-then-create de duas primeiras requisições
   * concorrentes (ex.: SPA disparando `GET /cart` e `POST /cart/items` juntos).
   */
  findOrCreateByUserId(userId: string): Promise<Cart>;

  /**
   * Insere o item no carrinho; se já existir um item para a mesma variant
   * (constraint `@@unique([cartId, variantId])`), soma a quantidade e
   * atualiza o snapshot de preço em vez de duplicar a linha.
   */
  upsertItem(cartId: string, input: UpsertCartItemInput): Promise<void>;

  /** Busca o item junto com o userId dono do carrinho, pra checagem de ownership no service. */
  findItemById(itemId: string): Promise<CartItemWithOwner | null>;

  updateItemQuantity(itemId: string, quantity: number): Promise<void>;
  deleteItem(itemId: string): Promise<void>;

  /** Remove todos os itens do carrinho (mantém a linha Cart). No-op se o carrinho não tiver itens. */
  clearItems(cartId: string): Promise<void>;
}

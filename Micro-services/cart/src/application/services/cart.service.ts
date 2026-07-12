import { Inject, Injectable } from '@nestjs/common';
import { Cart } from '../../core/entities/cart.entity';
import { CartItemAccessDeniedException } from '../../core/exceptions/cart-item-access-denied.exception';
import { CartItemNotFoundException } from '../../core/exceptions/cart-item-not-found.exception';
import { InvalidQuantityException } from '../../core/exceptions/invalid-quantity.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import { ICartService } from '../../core/interfaces/services/cart-service.interface';
import { CART_REPOSITORY } from '../../core/interfaces/repositories/cart-repository.interface';
import type { ICartRepository } from '../../core/interfaces/repositories/cart-repository.interface';
import { CATALOG_CLIENT } from '../../core/interfaces/external/catalog-client.interface';
import type { ICatalogClient } from '../../core/interfaces/external/catalog-client.interface';

@Injectable()
export class CartService implements ICartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CATALOG_CLIENT) private readonly catalogClient: ICatalogClient,
  ) {}

  async getOrCreateCart(userId: string): Promise<Cart> {
    return this.cartRepository.findOrCreateByUserId(userId);
  }

  async addItem(userId: string, variantId: string, quantity: number, accessToken: string): Promise<Cart> {
    this.assertValidQuantity(quantity);

    const variant = await this.catalogClient.getVariant(variantId, accessToken);
    if (!variant) {
      throw new VariantNotFoundException();
    }

    const cart = await this.cartRepository.findOrCreateByUserId(userId);
    await this.cartRepository.upsertItem(cart.id, {
      variantId: variant.variantId,
      sellerId: variant.sellerId,
      quantity,
      unitPriceSnapshot: variant.price,
    });

    return this.cartRepository.findOrCreateByUserId(userId);
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number): Promise<Cart> {
    this.assertValidQuantity(quantity);
    await this.assertOwnedItem(userId, itemId);

    await this.cartRepository.updateItemQuantity(itemId, quantity);
    return this.cartRepository.findOrCreateByUserId(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    await this.assertOwnedItem(userId, itemId);

    await this.cartRepository.deleteItem(itemId);
    return this.cartRepository.findOrCreateByUserId(userId);
  }

  async clearCart(userId: string): Promise<void> {
    const cart = await this.cartRepository.findByUserId(userId);
    if (!cart) return;
    await this.cartRepository.clearItems(cart.id);
  }

  private async assertOwnedItem(userId: string, itemId: string): Promise<void> {
    const found = await this.cartRepository.findItemById(itemId);
    if (!found) {
      throw new CartItemNotFoundException();
    }
    if (found.cartUserId !== userId) {
      throw new CartItemAccessDeniedException();
    }
  }

  private assertValidQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new InvalidQuantityException();
    }
  }
}

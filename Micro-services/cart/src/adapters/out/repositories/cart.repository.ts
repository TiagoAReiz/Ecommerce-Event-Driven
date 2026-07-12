import { Injectable } from '@nestjs/common';
import { Cart as PrismaCart, CartItem as PrismaCartItem } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Cart } from '../../../core/entities/cart.entity';
import { CartItem } from '../../../core/entities/cart-item.entity';
import {
  CartItemWithOwner,
  ICartRepository,
  UpsertCartItemInput,
} from '../../../core/interfaces/repositories/cart-repository.interface';

type PrismaCartWithItems = PrismaCart & { items: PrismaCartItem[] };

@Injectable()
export class CartRepository implements ICartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Cart | null> {
    const row = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    return row ? this.toEntity(row) : null;
  }

  async findOrCreateByUserId(userId: string): Promise<Cart> {
    const row = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: true },
    });
    return this.toEntity(row);
  }

  async upsertItem(cartId: string, input: UpsertCartItemInput): Promise<void> {
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: input.variantId } },
      create: {
        cartId,
        variantId: input.variantId,
        sellerId: input.sellerId,
        quantity: input.quantity,
        unitPriceSnapshot: input.unitPriceSnapshot,
      },
      update: {
        quantity: { increment: input.quantity },
        sellerId: input.sellerId,
        unitPriceSnapshot: input.unitPriceSnapshot,
      },
    });
  }

  async findItemById(itemId: string): Promise<CartItemWithOwner | null> {
    const row = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });
    if (!row) return null;
    return {
      item: this.itemToEntity(row),
      cartUserId: row.cart.userId,
    };
  }

  async updateItemQuantity(itemId: string, quantity: number): Promise<void> {
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  async clearItems(cartId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
  }

  private toEntity(row: PrismaCartWithItems): Cart {
    return new Cart({
      id: row.id,
      userId: row.userId,
      items: row.items.map((item) => this.itemToEntity(item)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private itemToEntity(row: PrismaCartItem): CartItem {
    return new CartItem({
      id: row.id,
      cartId: row.cartId,
      variantId: row.variantId,
      sellerId: row.sellerId,
      quantity: row.quantity,
      unitPriceSnapshot: row.unitPriceSnapshot.toFixed(2),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

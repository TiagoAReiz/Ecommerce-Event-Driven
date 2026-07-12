import { Prisma } from '@prisma/client';
import { CartRepository } from './cart.repository';
import { Cart } from '../../../core/entities/cart.entity';
import { CartItem } from '../../../core/entities/cart-item.entity';

const cartRow = {
  id: 'cart-1',
  userId: 'user-1',
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
  items: [] as any[],
};

const itemRow = {
  id: 'item-1',
  cartId: 'cart-1',
  variantId: 'variant-1',
  sellerId: 'seller-1',
  quantity: 2,
  unitPriceSnapshot: new Prisma.Decimal('49.90'),
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

function buildRepo() {
  const prisma = {
    cart: { findUnique: jest.fn(), upsert: jest.fn() },
    cartItem: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;
  return { repo: new CartRepository(prisma), prisma };
}

describe('CartRepository', () => {
  it('maps a found cart with items on findByUserId', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cart.findUnique.mockResolvedValue({ ...cartRow, items: [itemRow] });

    const cart = await repo.findByUserId('user-1');

    expect(prisma.cart.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { items: true },
    });
    expect(cart).toBeInstanceOf(Cart);
    expect(cart!.items[0]).toBeInstanceOf(CartItem);
    expect(cart!.items[0].unitPriceSnapshot).toBe('49.90');
  });

  it('returns null when no cart exists for the user', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cart.findUnique.mockResolvedValue(null);

    await expect(repo.findByUserId('missing')).resolves.toBeNull();
  });

  it('atomically finds or creates a cart for a user via upsert', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cart.upsert.mockResolvedValue(cartRow);

    const cart = await repo.findOrCreateByUserId('user-1');

    expect(prisma.cart.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
      include: { items: true },
    });
    expect(cart.items).toEqual([]);
  });

  it('upserts an item by the cartId+variantId compound key', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cartItem.upsert.mockResolvedValue(itemRow);

    await repo.upsertItem('cart-1', {
      variantId: 'variant-1',
      sellerId: 'seller-1',
      quantity: 2,
      unitPriceSnapshot: '49.90',
    });

    expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_variantId: { cartId: 'cart-1', variantId: 'variant-1' } },
      create: {
        cartId: 'cart-1',
        variantId: 'variant-1',
        sellerId: 'seller-1',
        quantity: 2,
        unitPriceSnapshot: '49.90',
      },
      update: {
        quantity: { increment: 2 },
        sellerId: 'seller-1',
        unitPriceSnapshot: '49.90',
      },
    });
  });

  it('returns the item plus the owning cart userId on findItemById', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cartItem.findUnique.mockResolvedValue({ ...itemRow, cart: { userId: 'user-1' } });

    const found = await repo.findItemById('item-1');

    expect(prisma.cartItem.findUnique).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      include: { cart: true },
    });
    expect(found!.cartUserId).toBe('user-1');
    expect(found!.item).toBeInstanceOf(CartItem);
  });

  it('returns null when the item does not exist on findItemById', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cartItem.findUnique.mockResolvedValue(null);

    await expect(repo.findItemById('missing')).resolves.toBeNull();
  });

  it('updates the item quantity', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cartItem.update.mockResolvedValue(itemRow);

    await repo.updateItemQuantity('item-1', 5);

    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 5 },
    });
  });

  it('deletes a single item', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cartItem.delete.mockResolvedValue(itemRow);

    await repo.deleteItem('item-1');

    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('clears all items of a cart', async () => {
    const { repo, prisma } = buildRepo();
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 3 });

    await repo.clearItems('cart-1');

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
  });
});

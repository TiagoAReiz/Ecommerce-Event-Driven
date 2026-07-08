import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('cart-db schema', () => {
  let prisma: PrismaService;
  const createdCartIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { cartId: { in: createdCartIds } } });
    await prisma.cart.deleteMany({ where: { id: { in: createdCartIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a Cart with a CartItem', async () => {
    const cart = await prisma.cart.create({ data: { userId: randomUUID() } });
    createdCartIds.push(cart.id);

    const item = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: randomUUID(),
        sellerId: randomUUID(),
        quantity: 2,
        unitPriceSnapshot: '49.90',
      },
    });

    expect(item.quantity).toBe(2);
  });

  it('rejects a duplicate variant in the same cart', async () => {
    const cart = await prisma.cart.create({ data: { userId: randomUUID() } });
    createdCartIds.push(cart.id);

    const variantId = randomUUID();
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId,
        sellerId: randomUUID(),
        quantity: 1,
        unitPriceSnapshot: '10.00',
      },
    });

    await expect(
      prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId,
          sellerId: randomUUID(),
          quantity: 3,
          unitPriceSnapshot: '10.00',
        },
      }),
    ).rejects.toThrow();
  });
});

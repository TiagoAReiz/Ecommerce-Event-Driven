import { CartMapper } from './cart.mapper';
import { Cart } from '../../core/entities/cart.entity';
import { CartItem } from '../../core/entities/cart-item.entity';

describe('CartMapper', () => {
  it('maps a Cart entity (with items) to a CartResponseDto', () => {
    const item = new CartItem({
      id: 'item-1',
      cartId: 'cart-1',
      variantId: 'variant-1',
      sellerId: 'seller-1',
      quantity: 3,
      unitPriceSnapshot: '19.90',
      createdAt: new Date('2026-07-10T10:00:00Z'),
      updatedAt: new Date('2026-07-10T10:00:00Z'),
    });
    const cart = new Cart({
      id: 'cart-1',
      userId: 'user-1',
      items: [item],
      createdAt: new Date('2026-07-10T09:00:00Z'),
      updatedAt: new Date('2026-07-10T09:30:00Z'),
    });

    const dto = CartMapper.toResponse(cart);

    expect(dto).toEqual({
      id: 'cart-1',
      userId: 'user-1',
      items: [
        {
          id: 'item-1',
          variantId: 'variant-1',
          sellerId: 'seller-1',
          quantity: 3,
          unitPriceSnapshot: '19.90',
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      ],
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    });
  });

  it('maps an empty cart to an empty items array', () => {
    const cart = new Cart({
      id: 'cart-1',
      userId: 'user-1',
      items: [],
      createdAt: new Date('2026-07-10T09:00:00Z'),
      updatedAt: new Date('2026-07-10T09:00:00Z'),
    });

    const dto = CartMapper.toResponse(cart);

    expect(dto.items).toEqual([]);
  });
});

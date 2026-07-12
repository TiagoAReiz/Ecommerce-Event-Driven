import { Cart } from '../../core/entities/cart.entity';
import { CartItem } from '../../core/entities/cart-item.entity';
import { CartResponseDto } from '../../adapters/in/dtos/cart-response.dto';
import { CartItemResponseDto } from '../../adapters/in/dtos/cart-item-response.dto';

export class CartMapper {
  static toResponse(cart: Cart): CartResponseDto {
    return {
      id: cart.id,
      userId: cart.userId,
      items: cart.items.map((item) => CartMapper.itemToResponse(item)),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  static itemToResponse(item: CartItem): CartItemResponseDto {
    return {
      id: item.id,
      variantId: item.variantId,
      sellerId: item.sellerId,
      quantity: item.quantity,
      unitPriceSnapshot: item.unitPriceSnapshot,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

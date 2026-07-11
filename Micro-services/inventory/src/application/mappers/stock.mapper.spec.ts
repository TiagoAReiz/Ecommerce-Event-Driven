import { StockMapper } from './stock.mapper';
import { StockItem } from '../../core/entities/stock-item.entity';

function stockItem(): StockItem {
  return new StockItem({
    id: 'stock-1',
    variantId: 'v-1',
    sellerId: 'seller-1',
    quantity: 10,
    reservedQty: 3,
    createdAt: new Date('2026-07-11T09:00:00.000Z'),
    updatedAt: new Date('2026-07-11T09:30:00.000Z'),
  });
}

describe('StockMapper', () => {
  it('toAvailabilityResponse exposes available = quantity - reservedQty (public PDP shape)', () => {
    expect(StockMapper.toAvailabilityResponse(stockItem())).toEqual({
      variantId: 'v-1',
      available: 7,
      quantity: 10,
      reservedQty: 3,
    });
  });

  it('toItemResponse includes the owner and both totals', () => {
    const dto = StockMapper.toItemResponse(stockItem());
    expect(dto).toEqual({
      id: 'stock-1',
      variantId: 'v-1',
      sellerId: 'seller-1',
      quantity: 10,
      reservedQty: 3,
      available: 7,
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      updatedAt: new Date('2026-07-11T09:30:00.000Z'),
    });
  });
});

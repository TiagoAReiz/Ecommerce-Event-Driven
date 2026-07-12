import { StockItem } from '../../entities/stock-item.entity';

export const STOCK_ITEM_REPOSITORY = Symbol('STOCK_ITEM_REPOSITORY');

export interface CreateStockItemInput {
  variantId: string;
  sellerId: string;
  quantity: number;
}

export interface IStockItemRepository {
  findByVariantId(variantId: string): Promise<StockItem | null>;
  create(input: CreateStockItemInput): Promise<StockItem>;
  /** Ajusta a quantidade total (reposição/correção). Não mexe em `reservedQty`. */
  updateQuantity(variantId: string, quantity: number): Promise<StockItem>;
}

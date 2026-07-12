import { StockItem } from '../../entities/stock-item.entity';
import { CreateStockItemInput } from './inputs/stock-item-repository.inputs';

export const STOCK_ITEM_REPOSITORY = Symbol('STOCK_ITEM_REPOSITORY');

export interface IStockItemRepository {
  findByVariantId(variantId: string): Promise<StockItem | null>;
  create(input: CreateStockItemInput): Promise<StockItem>;
  /** Ajusta a quantidade total (reposição/correção). Não mexe em `reservedQty`. */
  updateQuantity(variantId: string, quantity: number): Promise<StockItem>;
}

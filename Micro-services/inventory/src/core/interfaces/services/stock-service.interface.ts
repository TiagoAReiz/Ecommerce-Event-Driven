import { StockItem } from '../../entities/stock-item.entity';

export const STOCK_SERVICE = Symbol('STOCK_SERVICE');

export interface InitStockInput {
  variantId: string;
  quantity: number;
}

export interface UpdateStockInput {
  quantity: number;
}

export interface IStockService {
  /** Público (PDP): retorna o StockItem para expor o disponível (`quantity - reservedQty`). */
  getByVariantId(variantId: string): Promise<StockItem>;
  /** Seller inicializa o StockItem de uma variant que ele possui. */
  initStock(accessToken: string, input: InitStockInput): Promise<StockItem>;
  /** Seller repõe/corrige a quantidade total de um StockItem que ele possui. */
  updateStock(accessToken: string, variantId: string, input: UpdateStockInput): Promise<StockItem>;
}

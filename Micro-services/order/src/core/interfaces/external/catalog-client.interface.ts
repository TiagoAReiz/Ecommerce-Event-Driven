export const CATALOG_CLIENT = Symbol('CATALOG_CLIENT');

/** Variant lida de `GET /api/v1/variants/:id` no catalog-service — dados atuais pro snapshot. */
export interface CatalogVariant {
  variantId: string;
  sellerId: string;
  title: string;
  sku: string;
  /** Decimal do catalog-service serializado como string, pra não perder precisão (nunca float). */
  price: string;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

/** Seller do usuário logado, lido de `GET /api/v1/sellers/me` no catalog-service. */
export interface CatalogSeller {
  /** `Seller.id` do catalog (não é o userId) — é o valor comparado com `SubOrder.sellerId`. */
  id: string;
  status: string;
}

/**
 * Port para o catalog-service. Toda chamada repassa o JWT do usuário atual (mesmo padrão de
 * cart/inventory): a autorização de ownership de seller vive no catalog, não localmente
 * (order não tem tabela Seller própria — schema congelado).
 */
export interface ICatalogClient {
  /** `GET /variants/:id` (público). `null` quando a variant não existe (404 do catalog). */
  getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null>;
  /** `GET /sellers/me` (JWT+ownership). `null` quando o usuário não tem seller (404 do catalog). */
  getMySeller(accessToken: string): Promise<CatalogSeller | null>;
  /**
   * `GET /products/:id` (público). Devolve os ids das variants do produto (usado por
   * `OrderService.verifyPurchase` pra cruzar com `OrderItem.variantId`). `null` quando o produto
   * não existe (404 do catalog).
   */
  getProductVariantIds(productId: string, accessToken: string): Promise<string[] | null>;
}

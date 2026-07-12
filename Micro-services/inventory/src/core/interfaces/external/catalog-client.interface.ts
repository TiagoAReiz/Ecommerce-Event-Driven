export const CATALOG_CLIENT = Symbol('CATALOG_CLIENT');

/** Seller do usuário logado, lido de `GET /api/v1/sellers/me` no catalog-service. */
export interface CatalogSeller {
  /** `Seller.id` do catalog (não é o userId). */
  id: string;
  status: string;
}

/** Variant lida de `GET /api/v1/variants/:id` no catalog-service — só o dono nos interessa aqui. */
export interface CatalogVariant {
  variantId: string;
  sellerId: string;
}

/**
 * Port para o catalog-service. Toda chamada repassa o JWT do usuário atual (mesmo padrão
 * de cart/order): a autorização de ownership de seller vive no catalog, não localmente
 * (inventory não tem tabela Seller própria — schema congelado).
 */
export interface ICatalogClient {
  /** `GET /sellers/me` (JWT+ownership). `null` quando o usuário não tem seller (404 do catalog). */
  getMySeller(accessToken: string): Promise<CatalogSeller | null>;
  /** `GET /variants/:id` (público). `null` quando a variant não existe (404 do catalog). */
  getVariant(variantId: string, accessToken: string): Promise<CatalogVariant | null>;
}

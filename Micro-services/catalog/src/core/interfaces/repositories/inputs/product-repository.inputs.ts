import { ProductStatus } from '../../../entities/product.entity';

// Forma de escrita pra criar um Product (id gerado no service). Distinta da entity Product, que
// carrega campos derivados do banco (createdAt/updatedAt) inexistentes no momento da criação.
export interface CreateProductInput {
  id: string;
  sellerId: string;
  categoryId: string;
  title: string;
  description: string;
}

export interface UpdateProductData {
  categoryId?: string;
  title?: string;
  description?: string;
  status?: ProductStatus;
}

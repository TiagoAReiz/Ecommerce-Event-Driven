export class UpdateProductDto {
  categoryId?: string;
  title?: string;
  description?: string;
  status?: 'ACTIVE' | 'PAUSED';
}

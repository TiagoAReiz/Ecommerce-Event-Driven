import { Category } from '../../entities/category.entity';

export const CATEGORY_SERVICE = Symbol('CATEGORY_SERVICE');

export interface ICategoryService {
  listCategories(): Promise<Category[]>;
}

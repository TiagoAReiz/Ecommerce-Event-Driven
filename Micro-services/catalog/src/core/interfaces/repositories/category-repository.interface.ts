import { Category } from '../../entities/category.entity';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
}

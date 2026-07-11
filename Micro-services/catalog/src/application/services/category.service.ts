import { Inject, Injectable } from '@nestjs/common';
import { Category } from '../../core/entities/category.entity';
import { CATEGORY_REPOSITORY } from '../../core/interfaces/repositories/category-repository.interface';
import type { ICategoryRepository } from '../../core/interfaces/repositories/category-repository.interface';
import type { ICategoryService } from '../../core/interfaces/services/category-service.interface';

@Injectable()
export class CategoryService implements ICategoryService {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository) {}

  async listCategories(): Promise<Category[]> {
    return this.categoryRepository.findAll();
  }
}

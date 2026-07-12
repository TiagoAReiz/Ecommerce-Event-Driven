import { Controller, Get, Inject } from '@nestjs/common';
import { CATEGORY_SERVICE } from '../../../core/interfaces/services/category-service.interface';
import type { ICategoryService } from '../../../core/interfaces/services/category-service.interface';
import { CategoryMapper } from '../../../application/mappers/category.mapper';
import type { CategoryResponseDto } from '../dtos/category-response.dto';

@Controller('categories')
export class CategoriesController {
  constructor(@Inject(CATEGORY_SERVICE) private readonly categoryService: ICategoryService) {}

  @Get()
  async list(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryService.listCategories();
    return categories.map((c) => CategoryMapper.toResponse(c));
  }
}

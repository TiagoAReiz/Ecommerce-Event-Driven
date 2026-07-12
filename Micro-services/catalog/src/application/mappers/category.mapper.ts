import { Category } from '../../core/entities/category.entity';
import { CategoryResponseDto } from '../../adapters/in/dtos/category-response.dto';

export class CategoryMapper {
  static toResponse(category: Category): CategoryResponseDto {
    return { id: category.id, name: category.name, slug: category.slug };
  }
}

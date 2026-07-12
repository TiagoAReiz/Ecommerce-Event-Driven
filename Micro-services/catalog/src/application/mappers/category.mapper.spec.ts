import { CategoryMapper } from './category.mapper';
import { Category } from '../../core/entities/category.entity';

describe('CategoryMapper', () => {
  it('maps a Category entity to the response shape', () => {
    const category = new Category({
      id: 'cat-1',
      name: 'Eletronicos',
      slug: 'eletronicos',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(CategoryMapper.toResponse(category)).toEqual({
      id: 'cat-1',
      name: 'Eletronicos',
      slug: 'eletronicos',
    });
  });
});

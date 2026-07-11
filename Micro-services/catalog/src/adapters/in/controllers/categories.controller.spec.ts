import { CategoriesController } from './categories.controller';
import { Category } from '../../../core/entities/category.entity';

describe('CategoriesController', () => {
  it('returns categories mapped to the response dto', async () => {
    const categoryService = {
      listCategories: jest
        .fn()
        .mockResolvedValue([
          new Category({
            id: 'cat-1',
            name: 'Eletronicos',
            slug: 'eletronicos',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ]),
    } as any;
    const controller = new CategoriesController(categoryService);

    const result = await controller.list();

    expect(categoryService.listCategories).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'cat-1', name: 'Eletronicos', slug: 'eletronicos' }]);
  });
});

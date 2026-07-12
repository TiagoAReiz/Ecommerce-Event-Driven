import { CategoryService } from './category.service';
import { Category } from '../../core/entities/category.entity';

describe('CategoryService', () => {
  it('lists all categories from the repository', async () => {
    const categoryRepository = {
      findAll: jest
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
    const service = new CategoryService(categoryRepository);

    const categories = await service.listCategories();

    expect(categoryRepository.findAll).toHaveBeenCalled();
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe('Eletronicos');
  });
});

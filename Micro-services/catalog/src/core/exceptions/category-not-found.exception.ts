import { DomainException } from './domain.exception';

export class CategoryNotFoundException extends DomainException {
  constructor() {
    super('Category not found');
  }
}

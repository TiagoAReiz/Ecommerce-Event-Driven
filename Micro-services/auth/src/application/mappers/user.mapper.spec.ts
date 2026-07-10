import { UserMapper } from './user.mapper';
import { User } from '../../core/entities/user.entity';

describe('UserMapper', () => {
  it('maps a User entity to the public response shape, dropping internal fields', () => {
    const user = new User({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = UserMapper.toResponse(user);

    expect(dto).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
    expect(dto).not.toHaveProperty('googleId');
  });
});

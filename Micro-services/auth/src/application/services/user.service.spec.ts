import { UserService } from './user.service';
import { User } from '../../core/entities/user.entity';
import { UserNotFoundException } from '../../core/exceptions/user-not-found.exception';

describe('UserService', () => {
  it('returns the user profile', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          googleId: 'g-1',
          email: 'a@b.com',
          name: 'Ana',
          avatarUrl: null,
          role: 'CUSTOMER',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    } as any;
    const service = new UserService(userRepository);

    const user = await service.getProfile('user-1');

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(user.email).toBe('a@b.com');
  });

  it('throws UserNotFoundException when the user does not exist', async () => {
    const userRepository = { findById: jest.fn().mockResolvedValue(null) } as any;
    const service = new UserService(userRepository);

    await expect(service.getProfile('missing')).rejects.toThrow(UserNotFoundException);
  });
});

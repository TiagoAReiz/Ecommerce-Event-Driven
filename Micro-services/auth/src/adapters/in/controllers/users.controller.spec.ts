import { UsersController } from './users.controller';
import { User } from '../../../core/entities/user.entity';
import { UserNotFoundException } from '../../../core/exceptions/user-not-found.exception';

describe('UsersController', () => {
  it('returns the authenticated user profile as a response dto', async () => {
    const userService = {
      getProfile: jest.fn().mockResolvedValue(
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
    const controller = new UsersController(userService);
    const request = { user: { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' } } as any;

    const result = await controller.me(request);

    expect(userService.getProfile).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
  });

  it('propagates UserNotFoundException (translated to 404 by the global filter)', async () => {
    const userService = {
      getProfile: jest.fn().mockRejectedValue(new UserNotFoundException()),
    } as any;
    const controller = new UsersController(userService);
    const request = { user: { sub: 'missing', email: 'x@y.com', role: 'CUSTOMER' } } as any;

    await expect(controller.me(request)).rejects.toThrow(UserNotFoundException);
  });
});

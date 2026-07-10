import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('returns the authenticated user profile', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'a@b.com',
          name: 'Ana',
          avatarUrl: null,
          role: 'CUSTOMER',
        }),
      },
    } as any;
    const controller = new UsersController(prisma);
    const request = { user: { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' } } as any;

    const result = await controller.me(request);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
  });

  it('throws NotFoundException when the user no longer exists', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const controller = new UsersController(prisma);
    const request = { user: { sub: 'missing', email: 'x@y.com', role: 'CUSTOMER' } } as any;

    await expect(controller.me(request)).rejects.toThrow(NotFoundException);
  });
});

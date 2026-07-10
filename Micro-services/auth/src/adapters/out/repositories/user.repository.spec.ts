import { Prisma } from '@prisma/client';
import { UserRepository } from './user.repository';
import { User } from '../../../core/entities/user.entity';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';

const row = {
  id: 'user-1',
  googleId: 'g-1',
  email: 'a@b.com',
  name: 'Ana',
  avatarUrl: null,
  role: 'CUSTOMER',
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

function buildRepo() {
  const tx = { user: { create: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  return { repo: new UserRepository(prisma), prisma, tx };
}

describe('UserRepository', () => {
  it('maps a found row to a User entity on findByGoogleId', async () => {
    const { repo, prisma } = buildRepo();
    prisma.user.findUnique.mockResolvedValue(row);

    const user = await repo.findByGoogleId('g-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { googleId: 'g-1' } });
    expect(user).toBeInstanceOf(User);
    expect(user!.email).toBe('a@b.com');
  });

  it('returns null when findById finds nothing', async () => {
    const { repo, prisma } = buildRepo();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(repo.findById('missing')).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'missing' } });
  });

  it('updates name/avatarUrl on updateProfile and maps the result', async () => {
    const { repo, prisma } = buildRepo();
    prisma.user.update.mockResolvedValue({ ...row, name: 'Novo Nome' });

    const user = await repo.updateProfile('user-1', { name: 'Novo Nome', avatarUrl: null });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Novo Nome', avatarUrl: null },
    });
    expect(user.name).toBe('Novo Nome');
  });

  it('creates user and outbox event inside the same transaction on createWithEvent', async () => {
    const { repo, prisma, tx } = buildRepo();
    tx.user.create.mockResolvedValue(row);
    tx.outboxEvent.create.mockResolvedValue({});

    const user = await repo.createWithEvent(
      { id: 'user-1', googleId: 'g-1', email: 'a@b.com', name: 'Ana', avatarUrl: null, role: 'CUSTOMER' },
      { aggregateType: 'User', aggregateId: 'user-1', eventType: 'UserRegistered', payload: { userId: 'user-1' } },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { id: 'user-1', googleId: 'g-1', email: 'a@b.com', name: 'Ana', avatarUrl: null, role: 'CUSTOMER' },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1' },
      },
    });
    expect(user).toBeInstanceOf(User);
  });

  it('translates P2002 into EmailAlreadyInUseException', async () => {
    const { repo, tx } = buildRepo();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      repo.createWithEvent(
        { id: 'u', googleId: 'g', email: 'dup@b.com', name: 'X', avatarUrl: null, role: 'CUSTOMER' },
        { aggregateType: 'User', aggregateId: 'u', eventType: 'UserRegistered', payload: {} },
      ),
    ).rejects.toThrow(EmailAlreadyInUseException);
  });
});

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
  const tx = {
    user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    outboxEvent: { create: jest.fn() },
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
  };
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

  describe('promoteToSellerWithInbox', () => {
    it('no-ops (DEDUPED) when the eventId was already processed', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue({ eventId: 'evt-1' });

      const result = await repo.promoteToSellerWithInbox('evt-1', 'SellerOnboarded', 'user-1');

      expect(result).toEqual({ outcome: 'DEDUPED' });
      expect(tx.user.findUnique).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).not.toHaveBeenCalled();
    });

    it('marks processed but does not promote when the user is unknown (USER_NOT_FOUND)', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue(null);

      const result = await repo.promoteToSellerWithInbox('evt-1', 'SellerOnboarded', 'ghost');

      expect(result).toEqual({ outcome: 'USER_NOT_FOUND' });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-1', eventType: 'SellerOnboarded' },
      });
    });

    it('is a no-op promotion (ALREADY_SELLER) when the user is already SELLER', async () => {
      const { repo, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ ...row, role: 'SELLER' });

      const result = await repo.promoteToSellerWithInbox('evt-1', 'SellerOnboarded', 'user-1');

      expect(result).toEqual({ outcome: 'ALREADY_SELLER' });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).toHaveBeenCalledTimes(1);
    });

    it('promotes to SELLER and writes UserRoleChanged + inbox in one tx (PROMOTED)', async () => {
      const { repo, prisma, tx } = buildRepo();
      tx.processedEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ ...row, role: 'CUSTOMER' });

      const result = await repo.promoteToSellerWithInbox('evt-1', 'SellerOnboarded', 'user-1');

      expect(result).toEqual({ outcome: 'PROMOTED', oldRole: 'CUSTOMER' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { role: 'SELLER' } });
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'User',
          aggregateId: 'user-1',
          eventType: 'UserRoleChanged',
          payload: { userId: 'user-1', oldRole: 'CUSTOMER', newRole: 'SELLER' },
        },
      });
      expect(tx.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-1', eventType: 'SellerOnboarded' },
      });
    });
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

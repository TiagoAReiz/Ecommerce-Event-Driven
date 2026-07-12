import { UserContactRepository } from './user-contact.repository';
import { UserContact } from '../../../core/entities/user-contact.entity';

function buildRepo() {
  const tx = {
    processedEvent: { findUnique: jest.fn(), create: jest.fn() },
    userContact: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    userContact: { findUnique: jest.fn() },
  } as any;
  return { repo: new UserContactRepository(prisma), prisma, tx };
}

describe('UserContactRepository', () => {
  it('findByUserId maps a row to a UserContact entity', async () => {
    const { repo, prisma } = buildRepo();
    prisma.userContact.findUnique.mockResolvedValue({ userId: 'user-1', email: 'a@b.com', name: 'Ana' });

    const contact = await repo.findByUserId('user-1');

    expect(prisma.userContact.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(contact).toBeInstanceOf(UserContact);
    expect(contact).toEqual(new UserContact({ userId: 'user-1', email: 'a@b.com', name: 'Ana' }));
  });

  it('findByUserId returns null when there is no contact yet', async () => {
    const { repo, prisma } = buildRepo();
    prisma.userContact.findUnique.mockResolvedValue(null);

    expect(await repo.findByUserId('user-1')).toBeNull();
  });

  it('upsertWithInbox dedupe-checks ProcessedEvent, upserts the contact and creates the inbox row atomically', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue(null);
    tx.userContact.upsert.mockResolvedValue({});
    tx.processedEvent.create.mockResolvedValue({});

    const processed = await repo.upsertWithInbox('evt-1', 'UserRegistered', {
      userId: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
    });

    expect(processed).toBe(true);
    expect(tx.processedEvent.findUnique).toHaveBeenCalledWith({ where: { eventId: 'evt-1' } });
    expect(tx.userContact.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', email: 'a@b.com', name: 'Ana' },
      update: { email: 'a@b.com', name: 'Ana' },
    });
    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'UserRegistered' },
    });
  });

  it('upsertWithInbox is a no-op when the eventId was already processed', async () => {
    const { repo, tx } = buildRepo();
    tx.processedEvent.findUnique.mockResolvedValue({ id: 'inbox-1', eventId: 'evt-1' });

    const processed = await repo.upsertWithInbox('evt-1', 'UserRegistered', {
      userId: 'user-1',
      email: 'a@b.com',
      name: 'Ana',
    });

    expect(processed).toBe(false);
    expect(tx.userContact.upsert).not.toHaveBeenCalled();
    expect(tx.processedEvent.create).not.toHaveBeenCalled();
  });
});

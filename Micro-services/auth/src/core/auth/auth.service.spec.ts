import { AuthService } from './auth.service';

function buildService() {
  const tx = {
    user: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  const googleOAuth = { buildAuthUrl: jest.fn(), exchangeCodeForProfile: jest.fn() } as any;
  const tokenService = { issueTokenPair: jest.fn(), verifyRefreshToken: jest.fn() } as any;
  const service = new AuthService(prisma, googleOAuth, tokenService);
  return { service, prisma, tx, googleOAuth, tokenService };
}

describe('AuthService', () => {
  it('creates a new user and writes the UserRegistered outbox event in the same transaction, for a first-time Google login', async () => {
    const { service, prisma, tx, googleOAuth, tokenService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
    });

    const result = await service.loginWithGoogleCode('code-1');

    expect(tx.user.create).toHaveBeenCalledWith({
      data: { googleId: 'g-1', email: 'a@b.com', name: 'Ana', avatarUrl: null },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'User',
        aggregateId: 'user-1',
        eventType: 'UserRegistered',
        payload: { userId: 'user-1', email: 'a@b.com', name: 'Ana', role: 'CUSTOMER' },
      },
    });
    expect(result.accessToken).toBe('at');
    expect(result.user.id).toBe('user-1');
  });

  it('updates an existing user without writing an outbox event, for a repeat Google login', async () => {
    const { service, prisma, tx, googleOAuth, tokenService } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Old Name',
      avatarUrl: null,
      role: 'CUSTOMER',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'New Name',
      avatarUrl: 'pic',
      role: 'CUSTOMER',
    });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'New Name',
      avatarUrl: 'pic',
    });

    const result = await service.loginWithGoogleCode('code-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name', avatarUrl: 'pic' },
    });
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(result.user.name).toBe('New Name');
  });

  it('issues a new access token for a valid refresh token', async () => {
    const { service, prisma, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CUSTOMER' });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' });

    const result = await service.refreshAccessToken('valid-refresh');

    expect(result).toEqual({ accessToken: 'new-at' });
  });

  it('propagates the rejection for an invalid refresh token', async () => {
    const { service, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockRejectedValue(new Error('invalid token'));

    await expect(service.refreshAccessToken('bad-token')).rejects.toThrow('invalid token');
  });
});

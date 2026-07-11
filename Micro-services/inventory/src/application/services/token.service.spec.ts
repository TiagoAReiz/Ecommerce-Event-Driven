import { TokenService } from './token.service';

describe('TokenService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_ACCESS_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('verifies the access token against the shared HS256 secret and returns the payload', async () => {
    const payload = { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' };
    const jwtService = { verifyAsync: jest.fn().mockResolvedValue(payload) } as any;
    const service = new TokenService(jwtService);

    const result = await service.verifyAccessToken('the-token');

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('the-token', { secret: 'test-secret' });
    expect(result).toEqual(payload);
  });

  it('propagates verification errors (invalid/expired token)', async () => {
    const jwtService = { verifyAsync: jest.fn().mockRejectedValue(new Error('jwt expired')) } as any;
    const service = new TokenService(jwtService);

    await expect(service.verifyAccessToken('bad')).rejects.toThrow('jwt expired');
  });
});

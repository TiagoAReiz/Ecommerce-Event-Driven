import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_ACCESS_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('verifies a token signed with the shared access secret', async () => {
    const jwtService = new JwtService();
    const token = await jwtService.signAsync(
      { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' },
      { secret: 'test-secret' },
    );
    const service = new TokenService(jwtService);

    const payload = await service.verifyAccessToken(token);

    expect(payload).toEqual(
      expect.objectContaining({ sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' }),
    );
  });

  it('rejects a token signed with a different secret', async () => {
    const jwtService = new JwtService();
    const token = await jwtService.signAsync({ sub: 'user-1' }, { secret: 'wrong-secret' });
    const service = new TokenService(jwtService);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });
});

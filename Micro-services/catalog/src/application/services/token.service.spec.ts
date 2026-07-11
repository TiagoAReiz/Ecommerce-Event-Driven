import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService (validate-only)', () => {
  let tokenService: TokenService;
  let jwtService: JwtService;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  });

  beforeEach(() => {
    jwtService = new JwtService();
    tokenService = new TokenService(jwtService);
  });

  it('verifies an access token signed with the shared secret', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' },
      { secret: 'test-access-secret' },
    );

    const decoded = await tokenService.verifyAccessToken(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.role).toBe('CUSTOMER');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' },
      { secret: 'wrong-secret' },
    );

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects a malformed token', async () => {
    await expect(tokenService.verifyAccessToken('not-a-jwt')).rejects.toThrow();
  });
});

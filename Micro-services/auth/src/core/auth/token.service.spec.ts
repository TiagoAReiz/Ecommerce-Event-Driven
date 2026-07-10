import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  beforeEach(() => {
    tokenService = new TokenService(new JwtService());
  });

  it('issues an access token that verifies back to the same payload', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    const decoded = await tokenService.verifyAccessToken(accessToken);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.role).toBe('CUSTOMER');
  });

  it('issues a refresh token that verifies back to the same subject', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    const decoded = await tokenService.verifyRefreshToken(refreshToken);

    expect(decoded.sub).toBe('user-1');
  });

  it('rejects an access token verified with the wrong secret', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    process.env.JWT_ACCESS_SECRET = 'a-different-secret';

    await expect(tokenService.verifyAccessToken(accessToken)).rejects.toThrow();

    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  });

  it('rejects a refresh token verified as an access token', async () => {
    const { refreshToken } = await tokenService.issueTokenPair({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    await expect(tokenService.verifyAccessToken(refreshToken)).rejects.toThrow();
  });
});

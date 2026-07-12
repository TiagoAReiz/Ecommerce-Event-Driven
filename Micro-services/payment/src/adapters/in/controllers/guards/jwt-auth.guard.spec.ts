import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWith(headers: Record<string, string | undefined>) {
  const request: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    request,
  } as any;
}

describe('JwtAuthGuard', () => {
  it('rejects a request without a bearer token', async () => {
    const tokenService = { verifyAccessToken: jest.fn() };
    const guard = new JwtAuthGuard(tokenService as any);
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token', async () => {
    const tokenService = { verifyAccessToken: jest.fn().mockRejectedValue(new Error('bad')) };
    const guard = new JwtAuthGuard(tokenService as any);
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer x' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the decoded payload to request.user on success', async () => {
    const payload = { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' };
    const tokenService = { verifyAccessToken: jest.fn().mockResolvedValue(payload) };
    const guard = new JwtAuthGuard(tokenService as any);
    const ctx = contextWith({ authorization: 'Bearer good' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.request.user).toEqual(payload);
  });
});

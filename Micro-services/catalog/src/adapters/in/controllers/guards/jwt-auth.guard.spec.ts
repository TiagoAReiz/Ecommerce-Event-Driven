import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ITokenService } from '../../../../core/interfaces/services/token-service.interface';

function mockContext(headers: Record<string, string>): ExecutionContext {
  const request: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows the request and attaches the decoded payload when the token is valid', async () => {
    const tokenService = {
      verifyAccessToken: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' }),
    } as unknown as ITokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({ authorization: 'Bearer valid-token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(context.switchToHttp().getRequest().user).toEqual({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'CUSTOMER',
    });
  });

  it('rejects when there is no Authorization header', async () => {
    const tokenService = { verifyAccessToken: jest.fn() } as unknown as ITokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a header that is not a Bearer token', async () => {
    const tokenService = { verifyAccessToken: jest.fn() } as unknown as ITokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the token fails verification', async () => {
    const tokenService = {
      verifyAccessToken: jest.fn().mockRejectedValue(new Error('bad token')),
    } as unknown as ITokenService;
    const guard = new JwtAuthGuard(tokenService);
    const context = mockContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});

import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';

function buildController() {
  const authService = {
    buildGoogleAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/mock'),
    loginWithGoogleCode: jest.fn(),
    refreshAccessToken: jest.fn(),
  } as any;
  return { controller: new AuthController(authService), authService };
}

describe('AuthController', () => {
  it('redirects to the Google consent URL and sets a state cookie', () => {
    const { controller, authService } = buildController();
    const res = { redirect: jest.fn(), cookie: jest.fn() } as any;

    controller.redirectToGoogle(res);

    expect(authService.buildGoogleAuthUrl).toHaveBeenCalledWith(expect.any(String));
    expect(res.cookie).toHaveBeenCalledWith(
      'oauth_state',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/mock');
  });

  it('sets the same state value passed to buildGoogleAuthUrl as the cookie value', () => {
    const { controller, authService } = buildController();
    const res = { redirect: jest.fn(), cookie: jest.fn() } as any;

    controller.redirectToGoogle(res);

    const stateArg = authService.buildGoogleAuthUrl.mock.calls[0][0];
    const cookieValueArg = res.cookie.mock.calls[0][1];
    expect(cookieValueArg).toBe(stateArg);
  });

  it('logs the user in when the callback state matches the cookie', async () => {
    const { controller, authService } = buildController();
    authService.loginWithGoogleCode.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} });
    const req = { cookies: { oauth_state: 'state-123' } } as any;
    const res = { clearCookie: jest.fn() } as any;

    const result = await controller.googleCallback('auth-code', 'state-123', req, res);

    expect(authService.loginWithGoogleCode).toHaveBeenCalledWith('auth-code');
    expect(res.clearCookie).toHaveBeenCalledWith('oauth_state');
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', user: {} });
  });

  it('rejects the callback when the state does not match the cookie', async () => {
    const { controller, authService } = buildController();
    const req = { cookies: { oauth_state: 'state-123' } } as any;
    const res = { clearCookie: jest.fn() } as any;

    await expect(controller.googleCallback('auth-code', 'wrong-state', req, res)).rejects.toThrow(
      BadRequestException,
    );
    expect(authService.loginWithGoogleCode).not.toHaveBeenCalled();
  });

  it('rejects the callback when there is no state cookie', async () => {
    const { controller, authService } = buildController();
    const req = { cookies: {} } as any;
    const res = { clearCookie: jest.fn() } as any;

    await expect(controller.googleCallback('auth-code', 'state-123', req, res)).rejects.toThrow(
      BadRequestException,
    );
    expect(authService.loginWithGoogleCode).not.toHaveBeenCalled();
  });

  it('rejects a refresh call with no refreshToken', async () => {
    const { controller } = buildController();

    await expect(controller.refresh({} as any)).rejects.toThrow(BadRequestException);
  });

  it('returns a new access token for a valid refreshToken', async () => {
    const { controller, authService } = buildController();
    authService.refreshAccessToken.mockResolvedValue({ accessToken: 'new-at' });

    const result = await controller.refresh({ refreshToken: 'rt' });

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('rt');
    expect(result).toEqual({ accessToken: 'new-at' });
  });
});

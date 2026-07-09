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
  it('redirects to the Google consent URL', () => {
    const { controller, authService } = buildController();
    const res = { redirect: jest.fn() } as any;

    controller.redirectToGoogle(res);

    expect(authService.buildGoogleAuthUrl).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/mock');
  });

  it('logs the user in with the code returned by Google', async () => {
    const { controller, authService } = buildController();
    authService.loginWithGoogleCode.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} });

    const result = await controller.googleCallback('auth-code');

    expect(authService.loginWithGoogleCode).toHaveBeenCalledWith('auth-code');
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', user: {} });
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

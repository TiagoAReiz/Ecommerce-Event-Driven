import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthService } from './google-oauth.service';

jest.mock('google-auth-library');

describe('GoogleOAuthService', () => {
  let generateAuthUrl: jest.Mock;
  let getToken: jest.Mock;
  let verifyIdToken: jest.Mock;
  let service: GoogleOAuthService;

  beforeEach(() => {
    generateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    getToken = jest.fn();
    verifyIdToken = jest.fn();

    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
      generateAuthUrl,
      getToken,
      verifyIdToken,
    }));

    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';

    service = new GoogleOAuthService();
  });

  it('builds the Google consent URL with the requested scopes and state', () => {
    const url = service.buildAuthUrl('state-123');

    expect(generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state: 'state-123',
    });
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
  });

  it('exchanges a code for a normalized Google profile', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'id-token-value' } });
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'user@example.com',
        name: 'User Name',
        picture: 'https://example.com/avatar.png',
      }),
    });

    const profile = await service.exchangeCodeForProfile('auth-code');

    expect(getToken).toHaveBeenCalledWith('auth-code');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token-value',
      audience: 'client-id',
    });
    expect(profile).toEqual({
      googleId: 'google-sub-1',
      email: 'user@example.com',
      name: 'User Name',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('throws when Google does not return an id_token', async () => {
    getToken.mockResolvedValue({ tokens: {} });

    await expect(service.exchangeCodeForProfile('auth-code')).rejects.toThrow(
      'Google did not return an id_token',
    );
  });

  it('throws when the id_token payload is missing required claims', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'id-token-value' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'user@example.com' }) });

    await expect(service.exchangeCodeForProfile('auth-code')).rejects.toThrow(
      'Google id_token payload is missing required claims',
    );
  });
});

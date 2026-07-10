import { AuthService } from './auth.service';
import { User } from '../../core/entities/user.entity';
import { GoogleAuthenticationFailedException } from '../../core/exceptions/google-authentication-failed.exception';
import { InvalidRefreshTokenException } from '../../core/exceptions/invalid-refresh-token.exception';

function makeUser(overrides: Partial<User> = {}): User {
  return new User({
    id: 'user-1',
    googleId: 'g-1',
    email: 'a@b.com',
    name: 'Ana',
    avatarUrl: null,
    role: 'CUSTOMER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function buildService() {
  const userRepository = {
    findByGoogleId: jest.fn(),
    findById: jest.fn(),
    updateProfile: jest.fn(),
    createWithEvent: jest.fn(),
  } as any;
  const googleOAuth = { buildAuthUrl: jest.fn(), exchangeCodeForProfile: jest.fn() } as any;
  const tokenService = { issueTokenPair: jest.fn(), verifyRefreshToken: jest.fn() } as any;
  const service = new AuthService(userRepository, googleOAuth, tokenService);
  return { service, userRepository, googleOAuth, tokenService };
}

describe('AuthService', () => {
  it('creates a new user with a service-generated id and a matching UserRegistered event', async () => {
    const { service, userRepository, googleOAuth, tokenService } = buildService();
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: null,
    });
    userRepository.findByGoogleId.mockResolvedValue(null);
    userRepository.createWithEvent.mockImplementation(async (input: any) => makeUser({ id: input.id }));
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

    const result = await service.loginWithGoogleCode('code-1');

    const [userInput, eventInput] = userRepository.createWithEvent.mock.calls[0];
    expect(userInput.role).toBe('CUSTOMER');
    expect(eventInput.eventType).toBe('UserRegistered');
    // id gerado no service amarra usuário e evento
    expect(eventInput.aggregateId).toBe(userInput.id);
    expect(eventInput.payload).toEqual({
      userId: userInput.id,
      email: 'a@b.com',
      name: 'Ana',
      role: 'CUSTOMER',
    });
    expect(result.accessToken).toBe('at');
    expect(result.user.id).toBe(userInput.id);
  });

  it('updates an existing user without creating an event', async () => {
    const { service, userRepository, googleOAuth, tokenService } = buildService();
    googleOAuth.exchangeCodeForProfile.mockResolvedValue({
      googleId: 'g-1',
      email: 'a@b.com',
      name: 'Novo Nome',
      avatarUrl: 'pic',
    });
    userRepository.findByGoogleId.mockResolvedValue(makeUser());
    userRepository.updateProfile.mockResolvedValue(makeUser({ name: 'Novo Nome' }));
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });

    const result = await service.loginWithGoogleCode('code-1');

    expect(userRepository.updateProfile).toHaveBeenCalledWith('user-1', {
      name: 'Novo Nome',
      avatarUrl: 'pic',
    });
    expect(userRepository.createWithEvent).not.toHaveBeenCalled();
    expect(result.user.name).toBe('Novo Nome');
  });

  it('throws GoogleAuthenticationFailedException when the code exchange fails', async () => {
    const { service, googleOAuth } = buildService();
    googleOAuth.exchangeCodeForProfile.mockRejectedValue(new Error('invalid_grant'));

    await expect(service.loginWithGoogleCode('bad-code')).rejects.toThrow(
      GoogleAuthenticationFailedException,
    );
  });

  it('issues a new access token for a valid refresh token', async () => {
    const { service, userRepository, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'user-1' });
    userRepository.findById.mockResolvedValue(makeUser());
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' });

    await expect(service.refreshAccessToken('valid')).resolves.toEqual({ accessToken: 'new-at' });
  });

  it('throws InvalidRefreshTokenException when verification fails', async () => {
    const { service, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockRejectedValue(new Error('jwt expired'));

    await expect(service.refreshAccessToken('expired')).rejects.toThrow(InvalidRefreshTokenException);
  });

  it('throws InvalidRefreshTokenException when the user no longer exists', async () => {
    const { service, userRepository, tokenService } = buildService();
    tokenService.verifyRefreshToken.mockResolvedValue({ sub: 'deleted' });
    userRepository.findById.mockResolvedValue(null);

    await expect(service.refreshAccessToken('orphan')).rejects.toThrow(InvalidRefreshTokenException);
  });
});

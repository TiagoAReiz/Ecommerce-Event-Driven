import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User, UserRole } from '../../core/entities/user.entity';
import { GoogleAuthenticationFailedException } from '../../core/exceptions/google-authentication-failed.exception';
import { InvalidRefreshTokenException } from '../../core/exceptions/invalid-refresh-token.exception';
import type { IAuthService, LoginResult } from '../../core/interfaces/services/auth-service.interface';
import { TOKEN_SERVICE } from '../../core/interfaces/services/token-service.interface';
import type { ITokenService } from '../../core/interfaces/services/token-service.interface';
import { USER_REPOSITORY } from '../../core/interfaces/repositories/user-repository.interface';
import type { IUserRepository } from '../../core/interfaces/repositories/user-repository.interface';
import { GOOGLE_OAUTH_SERVICE } from '../../core/interfaces/external/google-oauth.interface';
import type {
  GoogleProfile,
  IGoogleOAuthService,
} from '../../core/interfaces/external/google-oauth.interface';

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(GOOGLE_OAUTH_SERVICE) private readonly googleOAuth: IGoogleOAuthService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService,
  ) {}

  buildGoogleAuthUrl(state: string): string {
    return this.googleOAuth.buildAuthUrl(state);
  }

  async loginWithGoogleCode(code: string): Promise<LoginResult> {
    let profile: GoogleProfile;
    try {
      profile = await this.googleOAuth.exchangeCodeForProfile(code);
    } catch {
      throw new GoogleAuthenticationFailedException();
    }

    const user = await this.upsertUser(profile);
    const tokens = await this.tokenService.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    let sub: string;
    try {
      ({ sub } = await this.tokenService.verifyRefreshToken(refreshToken));
    } catch {
      throw new InvalidRefreshTokenException();
    }

    const user = await this.userRepository.findById(sub);
    if (!user) {
      // usuário deletado: mesmo 401 de token inválido (não vazar existência)
      throw new InvalidRefreshTokenException();
    }

    const { accessToken } = await this.tokenService.issueTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }

  private async upsertUser(profile: GoogleProfile): Promise<User> {
    const existing = await this.userRepository.findByGoogleId(profile.googleId);
    if (existing) {
      return this.userRepository.updateProfile(existing.id, {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
    }

    // Regra de negócio explícita no service: id gerado aqui (permite montar o evento
    // antes da persistência) e novo usuário nasce CUSTOMER.
    const id = randomUUID();
    const role: UserRole = 'CUSTOMER';

    return this.userRepository.createWithEvent(
      {
        id,
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        role,
      },
      {
        aggregateType: 'User',
        aggregateId: id,
        eventType: 'UserRegistered',
        payload: { userId: id, email: profile.email, name: profile.name, role },
      },
    );
  }
}

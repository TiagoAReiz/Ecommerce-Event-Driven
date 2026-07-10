import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../core/entities/user.entity';
import { UserNotFoundException } from '../../core/exceptions/user-not-found.exception';
import type { IUserService } from '../../core/interfaces/services/user-service.interface';
import { USER_REPOSITORY } from '../../core/interfaces/repositories/user-repository.interface';
import type { IUserRepository } from '../../core/interfaces/repositories/user-repository.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }
    return user;
  }
}

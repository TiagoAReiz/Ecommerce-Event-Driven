import { User } from '../../entities/user.entity';

export const USER_SERVICE = Symbol('USER_SERVICE');

export interface IUserService {
  getProfile(userId: string): Promise<User>;
}

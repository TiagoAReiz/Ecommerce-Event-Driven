export type UserRole = 'CUSTOMER' | 'SELLER' | 'ADMIN';

export interface UserProps {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  readonly id: string;
  readonly googleId: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.googleId = props.googleId;
    this.email = props.email;
    this.name = props.name;
    this.avatarUrl = props.avatarUrl;
    this.role = props.role;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}

export interface UserContactProps {
  userId: string;
  email: string;
  name: string;
}

export class UserContact {
  readonly userId: string;
  readonly email: string;
  readonly name: string;

  constructor(props: UserContactProps) {
    this.userId = props.userId;
    this.email = props.email;
    this.name = props.name;
  }
}

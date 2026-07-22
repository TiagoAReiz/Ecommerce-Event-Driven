export interface SellerProfileProps {
  sellerId: string;
  userId: string;
}

export class SellerProfile {
  readonly sellerId: string;
  readonly userId: string;

  constructor(props: SellerProfileProps) {
    this.sellerId = props.sellerId;
    this.userId = props.userId;
  }
}

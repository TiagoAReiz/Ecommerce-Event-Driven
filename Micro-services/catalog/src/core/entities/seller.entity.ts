export type SellerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface SellerProps {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  document: string;
  mpCollectorId: string;
  status: SellerStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Seller {
  readonly id: string;
  readonly userId: string;
  readonly storeName: string;
  readonly slug: string;
  readonly document: string;
  readonly mpCollectorId: string;
  readonly status: SellerStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SellerProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.storeName = props.storeName;
    this.slug = props.slug;
    this.document = props.document;
    this.mpCollectorId = props.mpCollectorId;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}

// Read-model local, alimentado pelo evento `SellerOnboarded` (catalog-events). `userId` é aditivo
// nesta fase: sem ele não há como autorizar `GET /payments/splits` por ownership (JWT `userId` ->
// splits do seller), já que nada mais no payment-db mapeia usuário -> seller.
export interface SellerPaymentProfileProps {
  sellerId: string;
  userId: string;
  mpCollectorId: string;
}

export class SellerPaymentProfile {
  readonly sellerId: string;
  readonly userId: string;
  readonly mpCollectorId: string;

  constructor(props: SellerPaymentProfileProps) {
    this.sellerId = props.sellerId;
    this.userId = props.userId;
    this.mpCollectorId = props.mpCollectorId;
  }
}

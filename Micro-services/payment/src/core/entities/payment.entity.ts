export type PaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REFUNDED';
export type PaymentSplitStatus = 'PENDING' | 'SETTLED' | 'FAILED';

// Valores monetários carregados como string fixed-2 no domínio (mesma convenção MONEY do resto do
// projeto: Decimal do Prisma -> `.toFixed(2)`, nunca `Number`, pra não perder precisão nem zeros).
export interface PaymentSplitProps {
  id: string;
  paymentId: string;
  subOrderId: string;
  sellerId: string;
  mpCollectorId: string;
  amount: string;
  platformFeeAmount: string;
  status: PaymentSplitStatus;
}

export class PaymentSplit {
  readonly id: string;
  readonly paymentId: string;
  readonly subOrderId: string;
  readonly sellerId: string;
  readonly mpCollectorId: string;
  readonly amount: string;
  readonly platformFeeAmount: string;
  readonly status: PaymentSplitStatus;

  constructor(props: PaymentSplitProps) {
    this.id = props.id;
    this.paymentId = props.paymentId;
    this.subOrderId = props.subOrderId;
    this.sellerId = props.sellerId;
    this.mpCollectorId = props.mpCollectorId;
    this.amount = props.amount;
    this.platformFeeAmount = props.platformFeeAmount;
    this.status = props.status;
  }
}

export interface PaymentProps {
  id: string;
  orderId: string;
  userId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  totalAmount: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  splits: PaymentSplit[];
  createdAt: Date;
  updatedAt: Date;
}

export class Payment {
  readonly id: string;
  readonly orderId: string;
  readonly userId: string;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly totalAmount: string;
  readonly mpPaymentId: string | null;
  readonly mpPreferenceId: string | null;
  readonly splits: PaymentSplit[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.userId = props.userId;
    this.method = props.method;
    this.status = props.status;
    this.totalAmount = props.totalAmount;
    this.mpPaymentId = props.mpPaymentId;
    this.mpPreferenceId = props.mpPreferenceId;
    this.splits = props.splits;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}

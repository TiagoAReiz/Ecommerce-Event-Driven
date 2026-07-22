export type NotificationType =
  | 'ORDER_CREATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'SHIPMENT_DISPATCHED'
  | 'SHIPMENT_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'REVIEW_RECEIVED';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationProps {
  id: string;
  userId: string;
  type: NotificationType;
  recipientEmail: string;
  subject: string;
  status: NotificationStatus;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Notification {
  readonly id: string;
  readonly userId: string;
  readonly type: NotificationType;
  readonly recipientEmail: string;
  readonly subject: string;
  readonly status: NotificationStatus;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: NotificationProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.type = props.type;
    this.recipientEmail = props.recipientEmail;
    this.subject = props.subject;
    this.status = props.status;
    this.sentAt = props.sentAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}

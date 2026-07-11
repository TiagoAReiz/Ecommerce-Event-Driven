export class NotificationResponseDto {
  id!: string;
  type!: string;
  recipientEmail!: string;
  subject!: string;
  status!: string;
  sentAt!: string | null;
  createdAt!: string;
}

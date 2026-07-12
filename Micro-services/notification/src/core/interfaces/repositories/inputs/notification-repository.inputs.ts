import { NotificationType } from '../../../entities/notification.entity';

// Forma de escrita pra gravar uma Notification PENDING (via inbox, antes do envio de e-mail).
export interface CreatePendingNotificationInput {
  userId: string;
  type: NotificationType;
  recipientEmail: string;
  subject: string;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

// Port pro envio de e-mail. Implementação real (SMTP) fora de escopo deste MVP — ver
// adapters/out/external/stub-email-sender.service.ts para o stub determinístico usado hoje.
export interface IEmailSender {
  send(input: SendEmailInput): Promise<void>;
}

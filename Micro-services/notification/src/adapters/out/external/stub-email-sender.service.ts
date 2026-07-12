import { Injectable, Logger } from '@nestjs/common';
import { IEmailSender, SendEmailInput } from '../../../core/interfaces/external/email-sender.interface';

// STUB determinístico: NÃO integra SMTP real. "Envia" logando a mensagem e resolvendo com
// sucesso sempre — não há aleatoriedade nem chamada de rede. Trocar por um adapter real (ex.:
// nodemailer/SES/SendGrid) é um drop-in atrás do mesmo port `IEmailSender`, sem tocar em
// application/ nem core/.
@Injectable()
export class StubEmailSenderService implements IEmailSender {
  private readonly logger = new Logger(StubEmailSenderService.name);

  async send(input: SendEmailInput): Promise<void> {
    this.logger.log(`[STUB EMAIL] to=${input.to} subject="${input.subject}" body="${input.body}"`);
    return Promise.resolve();
  }
}

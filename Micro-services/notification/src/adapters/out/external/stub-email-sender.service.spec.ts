import { StubEmailSenderService } from './stub-email-sender.service';

describe('StubEmailSenderService', () => {
  it('resolves without throwing and never performs a real network call', async () => {
    const sender = new StubEmailSenderService();

    await expect(
      sender.send({ to: 'a@b.com', subject: 'Seu pedido foi criado', body: 'corpo' }),
    ).resolves.toBeUndefined();
  });

  it('is deterministic: sending twice with the same input never throws', async () => {
    const sender = new StubEmailSenderService();
    const input = { to: 'a@b.com', subject: 'x', body: 'y' };

    await sender.send(input);
    await expect(sender.send(input)).resolves.toBeUndefined();
  });
});

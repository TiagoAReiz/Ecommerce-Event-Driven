import { NotificationQueryService } from './notification-query.service';

function buildService() {
  const notificationRepository = { listByUser: jest.fn() } as any;
  const service = new NotificationQueryService(notificationRepository);
  return { service, notificationRepository };
}

describe('NotificationQueryService', () => {
  it('forwards valid page/limit to the repository', async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.listByUser.mockResolvedValue({ items: [], total: 0, page: 3, limit: 10 });

    await service.listByUser('user-1', 3, 10);

    expect(notificationRepository.listByUser).toHaveBeenCalledWith('user-1', 3, 10);
  });

  it('defaults page to 1 when missing/invalid', async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.listByUser.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await service.listByUser('user-1', NaN, 10);

    expect(notificationRepository.listByUser).toHaveBeenCalledWith('user-1', 1, 10);
  });

  it('defaults limit to 20 when missing/invalid', async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.listByUser.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await service.listByUser('user-1', 1, NaN);

    expect(notificationRepository.listByUser).toHaveBeenCalledWith('user-1', 1, 20);
  });

  it('rejects a non-positive page/limit by falling back to defaults', async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.listByUser.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await service.listByUser('user-1', -1, 0);

    expect(notificationRepository.listByUser).toHaveBeenCalledWith('user-1', 1, 20);
  });

  it('caps limit at 100', async () => {
    const { service, notificationRepository } = buildService();
    notificationRepository.listByUser.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 });

    await service.listByUser('user-1', 1, 500);

    expect(notificationRepository.listByUser).toHaveBeenCalledWith('user-1', 1, 100);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestNotificationPermission, sendNotification } from '../src/lib/notifications';

describe('Notifications Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Notification.permission = 'default';
  });

  it('should request permission', async () => {
    const result = await requestNotificationPermission();
    expect(result).toBe('granted');
    expect(global.Notification.requestPermission).toHaveBeenCalled();
  });

  it('should send notification when permission is granted', () => {
    global.Notification.permission = 'granted';
    sendNotification('Test Title');
    expect(global.Notification).toHaveBeenCalledWith('Test Title', expect.objectContaining({
      icon: '/icons/app-logo.png'
    }));
  });

  it('should not send notification when permission is denied', () => {
    global.Notification.permission = 'denied';
    sendNotification('Test Title');
    expect(global.Notification).not.toHaveBeenCalled();
  });
});

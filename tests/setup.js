import { vi } from 'vitest';

if (!global.Notification) {
  global.Notification = vi.fn();
  global.Notification.permission = 'default';
  global.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
}

if (!global.AudioContext && !global.webkitAudioContext) {
  global.AudioContext = vi.fn().mockImplementation(() => ({
    createOscillator: vi.fn().mockReturnValue({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }),
    createGain: vi.fn().mockReturnValue({
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      }
    }),
    destination: {},
    currentTime: 0
  }));
}

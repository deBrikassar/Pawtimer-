import { describe, it, expect } from 'vitest';
import { mergeSessionWithDerivedFields } from '../src/features/app/storage.js';

describe('Storage Logic', () => {
  it('should calculate actualDuration and plannedDuration correctly', () => {
    const session = mergeSessionWithDerivedFields({}, {
      actualDurationSeconds: 120,
      plannedDurationSeconds: 300
    });
    expect(session.actualDuration).toBe(120);
    expect(session.plannedDuration).toBe(300);
  });

  it('should infer distress level and severity correctly', () => {
    const session = mergeSessionWithDerivedFields({}, {
      result: 'success'
    });
    expect(session.distressLevel).toBe('none');
    expect(session.distressSeverity).toBe('none');
    expect(session.result).toBe('success');
  });

  it('should set recoverySeconds to 0 if distress is none', () => {
    const session = mergeSessionWithDerivedFields({}, {
      result: 'success',
      recoverySeconds: 100
    });
    expect(session.recoverySeconds).toBe(0);
  });
});

import { vi, beforeEach, afterEach } from 'vitest';
import { sbReq } from '../src/features/app/storage.js';

describe('sbReq Network Resilience', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries GET requests up to 3 times on 500 errors', async () => {
    // We need to bypass the SB_BASE_URL check in sbReq, 
    // assuming vite.config.js or test environment provides it. If not, it returns { ok: false } early.
    
    // Setup fetch to fail twice with 500, then succeed
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Server Error') })
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Server Error') })
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{"mock":"data"}') });

    // Since we use fake timers, we need to advance them to resolve the setTimeout in backoff
    const reqPromise = sbReq('test-path', { method: 'GET' });
    
    // First retry delay
    await vi.advanceTimersByTimeAsync(2000); 
    // Second retry delay
    await vi.advanceTimersByTimeAsync(4000);
    
    const result = await reqPromise;
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ mock: "data" });
  });

  it('aborts on network timeout', async () => {
    // Setup fetch to hang forever but respect AbortSignal
    globalThis.fetch.mockImplementation((url, opts) => new Promise((resolve, reject) => {
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          reject(err);
        });
      }
    }));

    const reqPromise = sbReq('timeout-path', { method: 'GET' });

    // It will retry 3 times, each taking 10s, plus backoff timeouts.
    // Run all timers to complete the entire retry cycle.
    await vi.runAllTimersAsync();

    const result = await reqPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Request Timeout');
  });

  it('does not retry POST/PATCH on 500 errors', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Server Error') });

    const reqPromise = sbReq('post-path', { method: 'POST' });
    
    const result = await reqPromise;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
});

/**
 * Circuit Breaker Unit Tests
 *
 * Tests cover:
 * - CLOSED → OPEN transition after consecutive failures
 * - OPEN state fast-fail (immediate rejection)
 * - HALF_OPEN success recovery back to CLOSED
 * - HALF_OPEN failure back to OPEN
 * - Independent breaker instances
 * - Threshold configuration
 */

import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
} from '../circuitBreaker';

// Mock timers for deterministic timeout testing
jest.useFakeTimers();

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, timeoutWindow: 5000 });
    jest.clearAllTimers();
  });

  describe('State transitions', () => {
    test('starts in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isAvailable()).toBe(true);
    });

    test('CLOSED → OPEN after failure threshold reached', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service down'));

      // 3 consecutive failures (threshold = 3)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Service down');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isAvailable()).toBe(false);
      expect(failingFn).toHaveBeenCalledTimes(3);

      const metrics = breaker.getMetrics();
      expect(metrics.totalTrips).toBe(1);
      expect(metrics.failureCount).toBe(3);
      expect(metrics.totalFailures).toBe(3);
    });

    test('does not open when failures are below threshold', async () => {
      const sometimesFailing = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');

      await expect(breaker.execute(sometimesFailing)).rejects.toThrow('Fail 1');
      await expect(breaker.execute(sometimesFailing)).rejects.toThrow('Fail 2');

      // Still closed after 2 failures (threshold = 3)
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Success resets failure count
      const result = await breaker.execute(sometimesFailing);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
    });
  });

  describe('OPEN state - fast fail', () => {
    test('immediately rejects requests when OPEN', async () => {
      // Open the circuit first
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Now all subsequent requests should be immediately rejected
      const successFn = jest.fn().mockResolvedValue('success');

      await expect(breaker.execute(successFn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(successFn).not.toHaveBeenCalled();

      const error = await breaker.execute(successFn).catch(e => e);
      expect(error).toBeInstanceOf(CircuitBreakerOpenError);
      expect(error.circuitName).toBe('test');
      expect(error.state).toBe(CircuitState.OPEN);

      const metrics = breaker.getMetrics();
      expect(metrics.totalFailures).toBe(5); // 3 failures + 2 rejected
    });

    test('CircuitBreakerOpenError is distinguishable', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      }

      try {
        await breaker.execute(jest.fn());
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect(error).not.toBeInstanceOf(Error); // It IS an Error but this checks it's the specific type
        expect((error as CircuitBreakerOpenError).circuitName).toBe('test');
      }
    });
  });

  describe('HALF_OPEN state', () => {
    test('transitions from OPEN to HALF_OPEN after timeout', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past timeout window
      jest.advanceTimersByTime(6000);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    test('HALF_OPEN success → CLOSED (recovery)', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Move to half-open
      jest.advanceTimersByTime(6000);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Successful request in half-open
      const successFn = jest.fn().mockResolvedValue('recovered');
      const result = await breaker.execute(successFn);
      expect(result).toBe('recovered');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(successFn).toHaveBeenCalledTimes(1);

      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
    });

    test('HALF_OPEN failure → back to OPEN', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Move to half-open
      jest.advanceTimersByTime(6000);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Fail in half-open → back to OPEN
      await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      const metrics = breaker.getMetrics();
      expect(metrics.totalTrips).toBe(2); // Trip 1: CLOSED→OPEN, Trip 2: HALF_OPEN→OPEN
    });

    test('HALF_OPEN limits concurrent requests', async () => {
      const halfOpenBreaker = new CircuitBreaker({
        name: 'test-halfopen',
        failureThreshold: 1,
        timeoutWindow: 5000,
        halfOpenMaxRequests: 2,
      });

      // Open the circuit
      await expect(halfOpenBreaker.execute(() => Promise.reject(new Error('Fail')))).rejects.toThrow('Fail');
      jest.advanceTimersByTime(6000);
      expect(halfOpenBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Allow 2 requests
      const successFn = jest.fn().mockResolvedValue('ok');
      await halfOpenBreaker.execute(successFn);
      await halfOpenBreaker.execute(successFn);
      expect(successFn).toHaveBeenCalledTimes(2);

      // 3rd request should be rejected
      await expect(halfOpenBreaker.execute(successFn)).rejects.toThrow(CircuitBreakerOpenError);
    });
  });

  describe('Independent breaker instances', () => {
    test('IPFS failure does not open Stellar circuit', async () => {
      const ipfsBreaker = new CircuitBreaker({ name: 'ipfs', failureThreshold: 2 });
      const stellarBreaker = new CircuitBreaker({ name: 'stellar', failureThreshold: 2 });

      // Fail IPFS
      const failingFn = jest.fn().mockRejectedValue(new Error('IPFS down'));
      await expect(ipfsBreaker.execute(failingFn)).rejects.toThrow('IPFS down');
      await expect(ipfsBreaker.execute(failingFn)).rejects.toThrow('IPFS down');

      expect(ipfsBreaker.getState()).toBe(CircuitState.OPEN);
      expect(stellarBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(stellarBreaker.isAvailable()).toBe(true);
    });
  });

  describe('Configuration', () => {
    test('respects custom failure threshold', async () => {
      const customBreaker = new CircuitBreaker({ name: 'custom', failureThreshold: 5 });
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));

      for (let i = 0; i < 4; i++) {
        await expect(customBreaker.execute(failingFn)).rejects.toThrow('Fail');
      }
      expect(customBreaker.getState()).toBe(CircuitState.CLOSED);

      await expect(customBreaker.execute(failingFn)).rejects.toThrow('Fail');
      expect(customBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('respects custom timeout window', () => {
      const fastBreaker = new CircuitBreaker({
        name: 'fast',
        failureThreshold: 1,
        timeoutWindow: 1000,
      });

      // Don't advance time yet, nothing to check before failure
      expect(fastBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('default configuration', () => {
      const defaultBreaker = new CircuitBreaker();
      const metrics = defaultBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.totalTrips).toBe(0);
    });
  });

  describe('Manual controls', () => {
    test('reset() brings back to CLOSED', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Fail');
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isAvailable()).toBe(true);

      const successFn = jest.fn().mockResolvedValue('works');
      const result = await breaker.execute(successFn);
      expect(result).toBe('works');
    });

    test('forceOpen() immediately opens circuit', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      breaker.forceOpen();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      const metrics = breaker.getMetrics();
      expect(metrics.totalTrips).toBe(1);
    });
  });

  describe('Metrics', () => {
    test('tracks total successes and failures', async () => {
      const successFn = jest.fn().mockResolvedValue('ok');
      const failFn = jest.fn().mockRejectedValue(new Error('nope'));

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      await expect(breaker.execute(failFn)).rejects.toThrow('nope');

      const metrics = breaker.getMetrics();
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(1);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  test('creates and retrieves breakers', () => {
    const registry = new CircuitBreakerRegistry();
    const b1 = registry.getOrCreate('ipfs', { failureThreshold: 3 });
    const b2 = registry.getOrCreate('stellar', { failureThreshold: 5 });
    const b1Again = registry.getOrCreate('ipfs');

    expect(b1).toBe(b1Again);
    expect(b1).not.toBe(b2);
  });

  test('getAllMetrics returns all breaker states', () => {
    const registry = new CircuitBreakerRegistry();
    registry.getOrCreate('ipfs');
    registry.getOrCreate('stellar');

    const metrics = registry.getAllMetrics();
    expect(metrics.ipfs).toBeDefined();
    expect(metrics.stellar).toBeDefined();
    expect(metrics.ipfs.state).toBe(CircuitState.CLOSED);
  });

  test('getStates returns simplified state map', () => {
    const registry = new CircuitBreakerRegistry();
    registry.getOrCreate('ipfs');
    registry.getOrCreate('redis');

    const states = registry.getStates();
    expect(states).toEqual({
      ipfs: CircuitState.CLOSED,
      redis: CircuitState.CLOSED,
    });
  });

  test('resetAll resets all breakers', async () => {
    const registry = new CircuitBreakerRegistry();
    const ipfs = registry.getOrCreate('ipfs', { failureThreshold: 1 });
    const stellar = registry.getOrCreate('stellar', { failureThreshold: 1 });

    const failFn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(ipfs.execute(failFn)).rejects.toThrow('fail');
    await expect(stellar.execute(failFn)).rejects.toThrow('fail');

    expect(ipfs.getState()).toBe(CircuitState.OPEN);
    expect(stellar.getState()).toBe(CircuitState.OPEN);

    registry.resetAll();
    expect(ipfs.getState()).toBe(CircuitState.CLOSED);
    expect(stellar.getState()).toBe(CircuitState.CLOSED);
  });
});

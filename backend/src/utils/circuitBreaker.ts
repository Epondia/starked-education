/**
 * Circuit Breaker Pattern Implementation
 *
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing, requests are immediately rejected
 * - HALF_OPEN: Testing recovery, limited requests allowed through
 *
 * Used to protect against cascading failures when external services
 * (IPFS, Stellar Horizon, Redis, etc.) become unavailable or slow.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms the circuit stays open before transitioning to HALF_OPEN (default: 30000) */
  timeoutWindow?: number;
  /** Maximum number of requests allowed in HALF_OPEN state (default: 3) */
  halfOpenMaxRequests?: number;
  /** Name of the circuit breaker for metrics/reporting */
  name?: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalTrips: number;
  totalFailures: number;
  totalSuccesses: number;
  halfOpenRequests: number;
}

/**
 * Custom error thrown when circuit is OPEN and a request is rejected
 */
export class CircuitBreakerOpenError extends Error {
  public readonly circuitName: string;
  public readonly state: CircuitState;

  constructor(circuitName: string, state: CircuitState = CircuitState.OPEN) {
    super(`Circuit breaker [${circuitName}] is ${state}. Request rejected to protect the system.`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
    this.state = state;
  }
}

export class CircuitBreaker {
  public readonly name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalTrips: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private halfOpenRequests: number = 0;
  private halfOpenMaxRequests: number;
  private failureThreshold: number;
  private timeoutWindow: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.name = config.name || 'default';
    this.failureThreshold = config.failureThreshold ?? 5;
    this.timeoutWindow = config.timeoutWindow ?? 30000;
    this.halfOpenMaxRequests = config.halfOpenMaxRequests ?? 3;
  }

  /**
   * Execute a function with circuit breaker protection.
   * If circuit is OPEN, throws CircuitBreakerOpenError immediately.
   * If circuit is HALF_OPEN, allows limited requests through.
   * If circuit is CLOSED, passes request through normally.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws CircuitBreakerOpenError if circuit is OPEN
   * @throws The original error if the function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state before executing
    this.transitionState();

    if (this.state === CircuitState.OPEN) {
      this.totalFailures++;
      throw new CircuitBreakerOpenError(this.name, this.state);
    }

    // In HALF_OPEN, limit concurrent requests
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.halfOpenMaxRequests) {
        this.totalFailures++;
        throw new CircuitBreakerOpenError(this.name, this.state);
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.state === CircuitState.HALF_OPEN && this.halfOpenRequests > 0) {
        this.halfOpenRequests--;
      }
    }
  }

  /**
   * Transition circuit state based on current conditions
   */
  private transitionState(): void {
    switch (this.state) {
      case CircuitState.OPEN:
        // Check if timeout has elapsed to transition to HALF_OPEN
        if (this.lastFailureTime && this.timeoutWindow > 0) {
          const elapsed = Date.now() - this.lastFailureTime;
          if (elapsed >= this.timeoutWindow) {
            this.state = CircuitState.HALF_OPEN;
            this.halfOpenRequests = 0;
          }
        }
        break;

      case CircuitState.HALF_OPEN:
        // If too many failures in half-open, go back to OPEN
        // (handled in onFailure)
        break;

      case CircuitState.CLOSED:
        // Check if we should transition to OPEN
        if (this.failureCount >= this.failureThreshold) {
          this.state = CircuitState.OPEN;
          this.totalTrips++;
          this.lastFailureTime = Date.now();
        }
        break;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Success in HALF_OPEN transitions back to CLOSED
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
    }

    // Reset consecutive failures after successful execution window
    if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  /**
   * Handle execution failure
   */
  private onFailure(): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in HALF_OPEN transitions back to OPEN
      this.state = CircuitState.OPEN;
      this.totalTrips++;
    }

    if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.totalTrips++;
    }
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequests = 0;
  }

  /**
   * Manually force the circuit to OPEN state
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
    this.totalTrips++;
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    this.transitionState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalTrips: this.totalTrips,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      halfOpenRequests: this.halfOpenRequests,
    };
  }

  /**
   * Get current circuit state (triggers state transition first)
   */
  getState(): CircuitState {
    this.transitionState();
    return this.state;
  }

  /**
   * Check if circuit is accepting requests
   */
  isAvailable(): boolean {
    this.transitionState();
    return this.state !== CircuitState.OPEN;
  }
}

/**
 * Registry to manage multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ ...config, name }));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker metrics for health reporting
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    this.breakers.forEach((breaker, name) => {
      metrics[name] = breaker.getMetrics();
    });
    return metrics;
  }

  /**
   * Get simplified state map: { name: state }
   */
  getStates(): Record<string, string> {
    const states: Record<string, string> = {};
    this.breakers.forEach((breaker, name) => {
      states[name] = breaker.getState();
    });
    return states;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.reset());
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }
}

// Create singleton registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export default CircuitBreaker;

'use strict';

const BASE_URL = 'https://api.tessie.com';
const DEFAULT_TIMEOUT_MS = 20000;
// Tessie may hold the connection open for up to ~90s while the vehicle
// wakes up and executes a command, so commands get a much longer budget.
const COMMAND_TIMEOUT_MS = 100000;

class TessieClient {
  constructor({ token, retryAttempts = 3 }) {
    this.token = token;
    this.retryAttempts = Math.max(1, Math.min(3, retryAttempts));
  }

  async getVehicles() {
    return this.request('GET', '/vehicles');
  }

  async getVehicleState(vin) {
    return this.request('GET', `/${encodeURIComponent(vin)}/state`);
  }

  async wake(vin) {
    return this.request('POST', `/${encodeURIComponent(vin)}/wake`, {}, {
      checkResult: true,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
  }

  async command(vin, commandPath, params = {}) {
    // Tessie already retries a command against the vehicle itself (e.g.
    // while it wakes up) when given max_attempts/wait_for_completion, so we
    // let it own that retry instead of re-issuing the whole HTTP request
    // from here too.
    return this.request('POST', `/${encodeURIComponent(vin)}/command/${commandPath}`, {
      ...params,
      wait_for_completion: true,
      max_attempts: this.retryAttempts,
    }, {
      checkResult: true,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
  }

  async request(method, path, params = {}, { checkResult = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const url = new URL(`${BASE_URL}${path}`);
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });

        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
          },
        });

        const text = await response.text();
        let body = {};
        if (text) {
          try {
            body = JSON.parse(text);
          } catch (parseError) {
            body = text;
          }
        }

        if (!response.ok) {
          const message = typeof body === 'string' ? body : JSON.stringify(body);
          const error = new Error(`Tessie HTTP ${response.status}: ${message}`);
          // Retrying a bad request or bad token never helps; only transient
          // server-side/rate-limit errors are worth another attempt.
          error.retryable = response.status >= 500 || response.status === 429;
          throw error;
        }

        // Command/wake endpoints return HTTP 200 even when the command
        // itself failed (e.g. vehicle unreachable) — the real outcome lives
        // in the response body, so that must be checked too.
        if (checkResult && body && typeof body === 'object' && body.result === false) {
          const error = new Error(`Tessie command failed${body.reason ? `: ${body.reason}` : ''}`);
          error.retryable = false;
          throw error;
        }

        return body;
      } catch (error) {
        lastError = error;
        const retryable = error.retryable !== false;
        if (attempt < this.retryAttempts && retryable) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        } else {
          break;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }
}

module.exports = TessieClient;

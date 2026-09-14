'use strict';

const BASE_URL = 'https://api.tessie.com';

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
    return this.request('POST', `/${encodeURIComponent(vin)}/wake`);
  }

  async command(vin, commandPath, params = {}) {
    return this.request('POST', `/${encodeURIComponent(vin)}/command/${commandPath}`, params);
  }

  async request(method, path, params = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        const url = new URL(`${BASE_URL}${path}`);
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        });

        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Tessie HTTP ${response.status}: ${text}`);
        }

        return response.json();
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
      }
    }

    throw lastError;
  }
}

module.exports = TessieClient;

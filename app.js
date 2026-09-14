'use strict';

const Homey = require('homey');
const TessieClient = require('./lib/tessie-client');

class TessieApp extends Homey.App {
  async onInit() {
    this.log('Tessie app initialized');
    this.registerFlowCards();
  }

  getAccessToken() {
    return this.homey.settings.get('tessie_access_token') || '';
  }

  getPollingIntervalSeconds() {
    return Number(this.homey.settings.get('poll_interval_seconds') || 60);
  }

  getRetryAttempts() {
    const attempts = Number(this.homey.settings.get('retry_attempts') || 3);
    return Math.max(1, Math.min(3, attempts));
  }

  getTessieClient() {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Missing Tessie access token. Set it in app settings.');
    }
    return new TessieClient({
      token,
      retryAttempts: this.getRetryAttempts(),
    });
  }

  registerFlowCards() {
    const actionMap = {
      wake_vehicle: (device) => device.commandWake(),
      lock_vehicle: (device) => device.commandLock(),
      unlock_vehicle: (device) => device.commandUnlock(),
      toggle_lock: (device) => device.commandToggleLock(),
      open_frunk: (device) => device.commandFrunk(),
      open_trunk: (device) => device.commandTrunk(),
      close_trunk: (device) => device.commandCloseTrunk(),
      toggle_trunk: (device) => device.commandToggleTrunk(),
      open_charge_port: (device) => device.commandOpenChargePort(),
      close_charge_port: (device) => device.commandCloseChargePort(),
      toggle_charge_port: (device) => device.commandToggleChargePort(),
      vent_windows: (device) => device.commandVentWindows(),
      close_windows: (device) => device.commandCloseWindows(),
      toggle_windows: (device) => device.commandToggleWindows(),
      start_climate: (device) => device.commandStartClimate(),
      stop_climate: (device) => device.commandStopClimate(),
      start_charging: (device) => device.commandStartCharging(),
      stop_charging: (device) => device.commandStopCharging(),
      set_cabin_temp: (device, args) => device.commandSetTemperature(args.temperature),
      set_seat_heating: (device, args) => device.commandSeatHeating(args.seat, args.level),
      set_seat_cooling: (device, args) => device.commandSeatCooling(args.seat, args.level),
      start_wheel_heater: (device) => device.commandWheelHeaterStart(),
      stop_wheel_heater: (device) => device.commandWheelHeaterStop(),
    };

    for (const [cardId, handler] of Object.entries(actionMap)) {
      this.homey.flow.getActionCard(cardId).registerRunListener(async (args) => handler(args.device, args));
    }
  }
}

module.exports = TessieApp;

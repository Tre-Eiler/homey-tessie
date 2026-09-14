'use strict';

const Homey = require('homey');

class TeslaVehicleDevice extends Homey.Device {
  async onInit() {
    this.vin = this.getStoreValue('vin') || this.getSetting('vin') || this.getData().id;
    this.pollTimer = null;
    this.latestState = null;
    this.geofenceStates = new Map();

    await this.ensureCapabilities();

    this.registerCapabilityListener('climate_active', async (active) => {
      if (active) return this.commandStartClimate();
      return this.commandStopClimate();
    });

    this.registerCapabilityListener('charging_active', async (active) => {
      if (active) return this.commandStartCharging();
      return this.commandStopCharging();
    });

    this.registerCapabilityListener('target_temperature', async (temperature) => {
      return this.commandSetTemperature(temperature);
    });

    this.registerCapabilityListener('button_lock', async () => this.commandLock());
    this.registerCapabilityListener('button_unlock', async () => this.commandUnlock());
    this.registerCapabilityListener('button_toggle_lock', async () => this.commandToggleLock());
    this.registerCapabilityListener('button_open_trunk', async () => this.commandTrunk());
    this.registerCapabilityListener('button_close_trunk', async () => this.commandCloseTrunk());
    this.registerCapabilityListener('button_toggle_trunk', async () => this.commandToggleTrunk());
    this.registerCapabilityListener('button_open_frunk', async () => this.commandFrunk());
    this.registerCapabilityListener('button_vent_windows', async () => this.commandVentWindows());
    this.registerCapabilityListener('button_close_windows', async () => this.commandCloseWindows());
    this.registerCapabilityListener('button_toggle_windows', async () => this.commandToggleWindows());
    this.registerCapabilityListener('button_open_charge_port', async () => this.commandOpenChargePort());
    this.registerCapabilityListener('button_close_charge_port', async () => this.commandCloseChargePort());
    this.registerCapabilityListener('button_toggle_charge_port', async () => this.commandToggleChargePort());
    this.registerCapabilityListener('button_start_charging', async () => this.commandStartCharging());
    this.registerCapabilityListener('button_stop_charging', async () => this.commandStopCharging());

    await this.syncState().catch(this.error);
    this.startPolling();
  }

  async onDeleted() {
    if (this.pollTimer) {
      this.homey.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async ensureCapabilities() {
    const requiredCapabilities = [
      'button_open_trunk',
      'button_close_trunk',
      'button_toggle_trunk',
      'button_open_frunk',
      'button_lock',
      'button_unlock',
      'button_toggle_lock',
      'button_vent_windows',
      'button_close_windows',
      'button_toggle_windows',
      'button_open_charge_port',
      'button_close_charge_port',
      'button_toggle_charge_port',
      'button_start_charging',
      'button_stop_charging',
      'measure_temperature',
    ];

    for (const capabilityId of requiredCapabilities) {
      if (!this.hasCapability(capabilityId)) {
        await this.addCapability(capabilityId);
      }
    }

    if (this.hasCapability('locked')) {
      await this.removeCapability('locked');
    }
  }

  startPolling() {
    const seconds = this.homey.app.getPollingIntervalSeconds();
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);

    this.pollTimer = this.homey.setInterval(async () => {
      await this.syncState().catch(this.error);
    }, Math.max(15, seconds) * 1000);
  }

  getClient() {
    return this.homey.app.getTessieClient();
  }

  async syncState() {
    const client = this.getClient();
    const state = await client.getVehicleState(this.vin);
    this.latestState = state;

    await this.setAvailable();

    if (state.charge_rate != null) {
      await this.setCapabilityValue('measure_power', state.charge_rate).catch(this.error);
    }
    if (state.climate_state?.is_climate_on != null) {
      await this.setCapabilityValue('climate_active', state.climate_state.is_climate_on).catch(this.error);
    }
    if (state.charge_state?.charging_state != null) {
      const active = ['Charging', 'Starting'].includes(state.charge_state.charging_state);
      await this.setCapabilityValue('charging_active', active).catch(this.error);
    }
    if (state.climate_state?.driver_temp_setting != null) {
      await this.setCapabilityValue('target_temperature', state.climate_state.driver_temp_setting).catch(this.error);
    }
    if (state.climate_state?.inside_temp != null) {
      await this.setCapabilityValue('measure_temperature', state.climate_state.inside_temp).catch(this.error);
    }

    await this.evaluateGeofences(state.drive_state);
  }

  async commandWake() { return this.getClient().wake(this.vin); }
  async commandLock() { return this.getClient().command(this.vin, 'lock'); }
  async commandUnlock() { return this.getClient().command(this.vin, 'unlock'); }
  async commandToggleLock() {
    await this.refreshState();
    return this.getVehicleState().locked ? this.commandUnlock() : this.commandLock();
  }
  async commandFrunk() { return this.getClient().command(this.vin, 'activate_front_trunk'); }
  async commandTrunk() {
    await this.refreshStateForTrunk();
    if (this.isTrunkOpen()) return true;
    return this.getClient().command(this.vin, 'activate_rear_trunk');
  }
  async commandCloseTrunk() {
    await this.refreshStateForTrunk();
    if (!this.isTrunkOpen()) return true;
    return this.getClient().command(this.vin, 'activate_rear_trunk');
  }
  async commandToggleTrunk() {
    await this.refreshStateForTrunk();
    return this.getClient().command(this.vin, 'activate_rear_trunk');
  }
  async commandOpenChargePort() { return this.getClient().command(this.vin, 'open_charge_port'); }
  async commandCloseChargePort() { return this.getClient().command(this.vin, 'close_charge_port'); }
  async commandToggleChargePort() {
    await this.refreshState();
    return this.isChargePortOpen() ? this.commandCloseChargePort() : this.commandOpenChargePort();
  }
  async commandVentWindows() { return this.getClient().command(this.vin, 'vent_windows'); }
  async commandCloseWindows() { return this.getClient().command(this.vin, 'close_windows'); }
  async commandToggleWindows() {
    await this.refreshState();
    return this.isAnyWindowOpen() ? this.commandCloseWindows() : this.commandVentWindows();
  }
  async commandStartClimate() { return this.getClient().command(this.vin, 'start_climate'); }
  async commandStopClimate() { return this.getClient().command(this.vin, 'stop_climate'); }
  async commandStartCharging() { return this.getClient().command(this.vin, 'start_charging'); }
  async commandStopCharging() { return this.getClient().command(this.vin, 'stop_charging'); }
  async commandSetTemperature(tempC) { return this.getClient().command(this.vin, 'set_temperatures', { temperature: tempC }); }

  async commandSeatHeating(seat, level) { return this.getClient().command(this.vin, 'set_seat_heat', { seat, level }); }
  async commandSeatCooling(seat, level) { return this.getClient().command(this.vin, 'set_seat_cool', { seat, level }); }
  async commandWheelHeaterStart() { return this.getClient().command(this.vin, 'start_steering_wheel_heater'); }
  async commandWheelHeaterStop() { return this.getClient().command(this.vin, 'stop_steering_wheel_heater'); }

  getVehicleState() {
    return this.latestState?.vehicle_state || {};
  }

  getDriveState() {
    return this.latestState?.drive_state || {};
  }

  getChargeState() {
    return this.latestState?.charge_state || {};
  }

  isPluggedIn() {
    const cable = this.getChargeState().conn_charge_cable;
    return Boolean(cable && cable !== '<invalid>' && cable !== 'None');
  }

  isCharging() {
    return ['Charging', 'Starting'].includes(this.getChargeState().charging_state);
  }

  isUserPresent() {
    return Boolean(this.getVehicleState().is_user_present);
  }

  isTrunkOpen() {
    const rearTrunk = this.getVehicleState().rt;
    return rearTrunk === true || Number(rearTrunk) > 0;
  }

  isFrunkOpen() {
    const frontTrunk = this.getVehicleState().ft;
    return frontTrunk === true || Number(frontTrunk) > 0;
  }

  isChargePortOpen() {
    const chargeState = this.getChargeState();
    if (typeof chargeState.charge_port_door_open === 'boolean') {
      return chargeState.charge_port_door_open;
    }
    return chargeState.charge_port_latch === 'Disengaged';
  }

  isAnyWindowOpen() {
    return ['fd_window', 'fp_window', 'rd_window', 'rp_window']
      .some((key) => Number(this.getVehicleState()[key]) > 0);
  }

  isDoorOpen(door) {
    const stateKey = {
      driver_front: 'df',
      passenger_front: 'pf',
      driver_rear: 'dr',
      passenger_rear: 'pr',
    }[door];
    return stateKey ? Number(this.getVehicleState()[stateKey]) > 0 : false;
  }

  isWindowOpen(window) {
    const stateKey = {
      driver_front: 'fd_window',
      passenger_front: 'fp_window',
      driver_rear: 'rd_window',
      passenger_rear: 'rp_window',
    }[window];
    return stateKey ? Number(this.getVehicleState()[stateKey]) > 0 : false;
  }

  async refreshState() {
    const state = await this.getClient().getVehicleState(this.vin);
    this.latestState = state;
  }

  async refreshStateForTrunk() {
    return this.refreshState();
  }

  async evaluateGeofences(driveState) {
    if (!Number.isFinite(driveState?.latitude) || !Number.isFinite(driveState?.longitude)) return;

    const geofences = await this.driver.getConfiguredGeofences().catch((error) => {
      this.error(error);
      return [];
    });

    for (const geofence of geofences) {
      const key = `${geofence.latitude}:${geofence.longitude}:${geofence.radius_feet}`;
      const distanceFeet = this.distanceInFeet(
        driveState.latitude,
        driveState.longitude,
        geofence.latitude,
        geofence.longitude,
      );
      const inside = distanceFeet <= geofence.radius_feet;
      const wasInside = this.geofenceStates.get(key);
      this.geofenceStates.set(key, inside);

      if (wasInside === false && inside) {
        await this.driver.triggerEnteredGeofence(this, {
          latitude: driveState.latitude,
          longitude: driveState.longitude,
          distance_feet: Math.round(distanceFeet),
        }, geofence);
      }
    }
  }

  distanceInFeet(latitudeA, longitudeA, latitudeB, longitudeB) {
    const radians = (value) => value * Math.PI / 180;
    const earthRadiusMeters = 6371000;
    const latitudeDelta = radians(latitudeB - latitudeA);
    const longitudeDelta = radians(longitudeB - longitudeA);
    const a = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 3.28084;
  }
}

module.exports = TeslaVehicleDevice;

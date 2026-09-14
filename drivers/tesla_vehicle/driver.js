'use strict';

const Homey = require('homey');

class TeslaVehicleDriver extends Homey.Driver {
  async onInit() {
    this.enteredGeofenceTrigger = this.homey.flow.getDeviceTriggerCard('entered_geofence');
    this.enteredGeofenceTrigger.registerRunListener(async (args, state) => (
      Number(args.latitude) === Number(state.latitude)
      && Number(args.longitude) === Number(state.longitude)
      && Number(args.radius_feet) === Number(state.radius_feet)
    ));

    const conditions = {
      gear_is: (device, args) => device.getDriveState().shift_state === args.gear,
      is_plugged_in: (device) => device.isPluggedIn(),
      is_charging: (device) => device.isCharging(),
      is_user_present: (device) => device.isUserPresent(),
      is_within_radius: (device, args) => this.isWithinRadius(device, args),
      lock_is: (device, args) => device.getVehicleState().locked === (args.state === 'locked'),
      door_is: (device, args) => device.isDoorOpen(args.door) === (args.state === 'open'),
      window_is: (device, args) => device.isWindowOpen(args.window) === (args.state === 'open'),
      trunk_is: (device, args) => device.isTrunkOpen() === (args.state === 'open'),
      frunk_is: (device, args) => device.isFrunkOpen() === (args.state === 'open'),
      charge_port_is: (device, args) => device.isChargePortOpen() === (args.state === 'open'),
    };

    for (const [cardId, listener] of Object.entries(conditions)) {
      this.homey.flow.getConditionCard(cardId).registerRunListener(async (args) => listener(args.device, args));
    }
  }

  async onPairListDevices() {
    const client = this.homey.app.getTessieClient();
    const response = await client.getVehicles();
    const vehicles = this.normalizeVehicles(response);

    return vehicles.map((vehicle) => ({
      name: this.getVehicleName(vehicle),
      data: { id: vehicle.vin },
      icon: '/icon.svg',
      settings: {
        vin: vehicle.vin,
      },
      store: {
        vin: vehicle.vin,
      },
    }));
  }

  normalizeVehicles(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) return response.results;
    if (Array.isArray(response?.vehicles)) return response.vehicles;
    if (Array.isArray(response?.data)) return response.data;
    return [];
  }

  getVehicleName(vehicle) {
    const preferred =
      vehicle?.display_name ||
      vehicle?.name ||
      vehicle?.vehicle_name ||
      vehicle?.last_state?.display_name ||
      vehicle?.last_state?.vehicle_state?.vehicle_name ||
      vehicle?.state?.vehicle_state?.vehicle_name;

    if (preferred && String(preferred).trim()) {
      return String(preferred).trim();
    }

    return vehicle?.vin || 'Tesla';
  }

  async getConfiguredGeofences() {
    const values = await this.enteredGeofenceTrigger.getArgumentValues();
    const uniqueGeofences = new Map();

    for (const args of values) {
      const latitude = Number(args.latitude);
      const longitude = Number(args.longitude);
      const radiusFeet = Number(args.radius_feet);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusFeet) || radiusFeet <= 0) continue;
      uniqueGeofences.set(`${latitude}:${longitude}:${radiusFeet}`, {
        latitude,
        longitude,
        radius_feet: radiusFeet,
      });
    }

    return [...uniqueGeofences.values()];
  }

  async triggerEnteredGeofence(device, tokens, geofence) {
    await this.enteredGeofenceTrigger.trigger(device, tokens, geofence);
  }

  isWithinRadius(device, args) {
    const driveState = device.getDriveState();
    const latitude = Number(args.latitude);
    const longitude = Number(args.longitude);
    const radiusFeet = Number(args.radius_feet);
    if (!Number.isFinite(driveState.latitude) || !Number.isFinite(driveState.longitude)) return false;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusFeet)) return false;

    return device.distanceInFeet(driveState.latitude, driveState.longitude, latitude, longitude) <= radiusFeet;
  }

  async onRepair(session, device) {
    session.setHandler('login', async ({ username }) => {
      if (!username || !username.trim()) {
        throw new Error('Token is required');
      }
      await this.homey.settings.set('tessie_access_token', username.trim());
      await device.syncState();
      return true;
    });
  }
}

module.exports = TeslaVehicleDriver;

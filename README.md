# Tessie for Tesla (Homey)

Homey SDK v3 app scaffold for controlling Tesla vehicles via Tessie.

## Current Scope (v1)

- One Tesla vehicle per Homey device
- Pairing lists all vehicles from Tessie
- App-wide access token
- 60 second polling interval (configurable)
- Retries Tessie commands up to 3 times (configurable)
- Repair flow to update access token

## Features

- Climate control: start/stop, set cabin temperature
- Seat climate: heating and cooling levels via Flow actions
- Steering wheel heater start/stop via Flow actions
- Charge control: start/stop charging and open charge port
- Lock/unlock
- Frunk and trunk actions

## App Settings Keys

- `tessie_access_token` (string)
- `poll_interval_seconds` (number, default 60)
- `retry_attempts` (number, 1-3, default 3)

## Notes

- Tessie token is shared app-wide for all paired vehicles.
- Rear-left seat option in docs may vary by endpoint naming; update if needed during live test.

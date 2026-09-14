# Tessie for Tesla (Homey)

A [Homey](https://homey.app/) app (SDK v3) that lets Homey control and monitor Tesla
vehicles through the [Tessie](https://tessie.com/) API, instead of talking to Tesla's
own API directly.

## Why this exists

Tesla's own vehicle API requires OAuth app registration, key pairs, and frequent
re-authentication, which makes it painful to integrate directly into a home automation
hub. [Tessie](https://tessie.com/) already handles that complexity and exposes a
simple token-authenticated REST API. This app is a thin bridge: it reads/writes vehicle
state through Tessie and surfaces it to Homey as a device, with capabilities, Flow
cards, and conditions so a Tesla can participate in the same automations as any other
Homey device (e.g. "if I arrive home, unlock the car and start climate", "notify me if
a door is left open").

This is an unofficial, personal integration — not affiliated with Tesla, Tessie, or
Athom (Homey).

## How it works

```
Homey Flow / Device UI
        │
        ▼
  app.js (App)              — holds the app-wide Tessie access token & settings
        │
        ▼
  lib/tessie-client.js       — thin fetch wrapper around the Tessie REST API
        │                       (GET /vehicles, GET /:vin/state, POST /:vin/command/*)
        ▼
  https://api.tessie.com     — Tessie's cloud service, which talks to Tesla on our behalf
        │
        ▼
     Your Tesla
```

- `app.js` — app-wide settings (access token, poll interval, retry attempts) and Flow
  action-card registration.
- `lib/tessie-client.js` — minimal HTTP client for the Tessie API (auth header +
  retries).
- `drivers/tesla_vehicle/driver.js` — pairing (lists vehicles from Tessie), repair flow
  (update token), Flow condition cards, and geofence trigger logic.
- `drivers/tesla_vehicle/device.js` — one Homey device per vehicle: capability
  listeners (lock, trunk, frunk, windows, charge port, climate, charging), polling
  loop, and state parsing.
- `.homeycompose/` — Homey Compose source files (capabilities, Flow action
  definitions) that get compiled into the top-level `app.json`.
- `settings/index.html` — the app-wide settings page (access token, polling interval,
  retry attempts).

## Current scope (v1)

- One Tesla vehicle per Homey device; pairing lists every vehicle on the Tessie
  account.
- A single, app-wide Tessie access token (not per-device).
- Configurable polling interval (default 60s) and command retry attempts (1–3).
- Repair flow to update the access token if it's revoked/expired.

## Features

- **Climate**: start/stop climate, set cabin target temperature.
- **Seat climate**: heating/cooling levels via Flow actions.
- **Steering wheel heater**: start/stop via Flow actions.
- **Charging**: start/stop charging, open/close/toggle charge port.
- **Locks**: lock/unlock/toggle.
- **Frunk / trunk**: open/close/toggle (with a safety check so "close" doesn't
  re-trigger an already-closed trunk).
- **Windows**: vent/close/toggle.
- **Status conditions**: gear, plugged in, charging, user present, lock/door/window/
  trunk/frunk/charge-port state, within-radius-of-point.
- **Geofencing**: a "entered geofence" trigger evaluated from live drive-state
  polling (latitude/longitude/radius in feet).

## Setup

1. Install the app on your Homey.
2. Open the app's **Settings** page and paste your Tessie access token (find it at
   [my.tessie.com](https://my.tessie.com/) → Settings → API).
3. Optionally adjust the poll interval (seconds) and retry attempts (1–3).
4. Add a device — pairing will list every vehicle visible to that Tessie account.
5. If the token is ever revoked or rotated, use the device's **Repair** flow to
   update it without re-pairing.

## Security notes

- The Tessie access token is stored using Homey's built-in encrypted app-settings
  store (`homey.settings`) — it is never written into the repo, logs, or Flow card
  history.
- The token field in the settings UI is a masked (`type="password"`) input.
- This repo does not contain any tokens, keys, or credentials. If you fork/clone
  this, do not commit your own token — it only ever belongs in Homey's settings
  storage at runtime.

## Development

This is a standard [Homey SDK v3](https://apps.developer.homey.app/) app.

```bash
npm install -g homey        # Homey CLI, if you don't have it
homey app run                # run against a Homey on your network
homey app validate            # validate app.json / compose structure
```

Capabilities and Flow action cards are authored under `.homeycompose/` and compiled
into the top-level `app.json` by the Homey CLI — edit the compose sources, not
`app.json` directly (it's generated).

## Known limitations / notes

- Rear-left seat capability naming may vary by Tessie endpoint version — verify
  against a live vehicle during testing.
- Requires an active internet connection (both Homey ↔ Tessie and Tessie ↔ Tesla).
- Command reliability depends on Tessie/Tesla waking the vehicle; retries are
  configurable but not unlimited.

## License

No license file yet — all rights reserved by default until one is added.

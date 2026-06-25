# Raspberry Pi Setup

This project is intended to run cleanly on a Raspberry Pi with Node.js and SQLite.

## Recommended Runtime

- Raspberry Pi OS
- Node.js 20 LTS or newer
- SQLite 3

## First Install

Clone the GitHub repo on the Raspberry Pi:

```bash
git clone https://github.com/arjan-io/roster-calculator.git
cd roster-calculator
```

Run the setup script:

```bash
npm run setup
```

The setup script will:

- install SQLite and build tools through `apt-get`
- install Node dependencies
- create the `data` and `uploads` folders
- create `.env` if it does not exist
- initialize the SQLite database

## Start The App

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

If you are opening it from another device on the same network, use the Pi's IP address:

```text
http://RASPBERRY_PI_IP:3000
```

## Production-ish Start

For a simple always-on setup, use:

```bash
npm start
```

Later we can add a `systemd` service so the app starts automatically when the Pi boots.

## Database

By default the SQLite database lives here:

```text
data/roster-calculator.sqlite
```

Backups can be as simple as copying that file while the app is stopped.

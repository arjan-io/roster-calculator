# Roster Calculator

Web-based replacement for the existing Excel pay and statistics calculator.

## Stack

- Node.js
- Express
- SQLite
- Plain HTML/CSS/JavaScript

The app is structured with routers and services:

- `src/routes` handles web/API endpoints.
- `src/services` contains database and business logic.
- `src/parsers` converts source files into one standard flight-row format.
- `src/db/schema.sql` defines the database.

## First Import Sources

- Airline export CSV: preferred monthly employer export.
- SafeLog CSV: daily/full-history import source.

Both are normalized into the same internal flight shape before being inserted.

## Local Setup

```bash
npm install
npm run db:init
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Docker / Oracle Cloud

The app can run in Docker on a Raspberry Pi, Oracle Cloud VM, or any normal Linux server.

```bash
mkdir -p data uploads
docker compose up -d --build
```

Then open:

```text
http://SERVER_IP:8081
```

The SQLite database is stored in `./data`, which is mounted into the container. Keep that folder backed up and on persistent storage.

Docker exposes this app on host port `8081` by default so it can run alongside LOHC Flows on `8080`. Change `ROSTER_PORT` in `.env` if needed.

For Oracle Cloud notes, including firewall and backup steps, see `ORACLE_CLOUD.md`.

## Docker Behind Nginx

The app is ready to run behind Nginx on a root subdomain such as:

```text
https://pay.arjanhes.nl/
```

The container still listens on `0.0.0.0:3000` internally. In Docker Compose the service is named `roster`, so Nginx can proxy to:

```text
http://roster:3000/
```

No base path setting is needed for a dedicated subdomain. Static files use root paths such as `/app.js` and `/styles.css`, and API calls use `/api/...`, which work correctly from `pay.arjanhes.nl`.

Recommended Nginx location:

```nginx
server {
    listen 443 ssl http2;
    server_name pay.arjanhes.nl;

    client_max_body_size 25m;

    location / {
        proxy_pass http://roster:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Health check endpoint:

```text
https://pay.arjanhes.nl/api/health
```

SQLite is stored in `/app/data/roster-calculator.sqlite` inside the container and persisted to `./data` on the host through Docker Compose. Keep `./data` backed up.

## Import Design

The importer uses:

- an internal database id for each flight
- a readable display code, for example `20260529-AMS-SPU-0859`
- a source fingerprint for duplicate detection

This avoids relying on date-only or route-only identifiers, because one date can contain multiple flights.

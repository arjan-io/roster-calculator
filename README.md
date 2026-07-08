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
http://localhost:8082
```

## Import Design

The importer uses:

- an internal database id for each flight
- a readable display code, for example `20260529-AMS-SPU-0859`
- a source fingerprint for duplicate detection

This avoids relying on date-only or route-only identifiers, because one date can contain multiple flights.

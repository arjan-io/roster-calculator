# Import Format Analysis

This note captures the first pass over the sample roster and SafeLog files.

## Preferred Stack

- Backend: Node.js
- Database: SQLite for the first version, with a possible MySQL migration later
- Database access: plain SQL or a light wrapper
- Frontend: HTML, CSS, and simple JavaScript first

SQLite is enough for a single-user pay/statistics app and keeps backups simple: the database is one file.

## Source Files Reviewed

- `Airline-export as CSV.csv`
- `Airline-roster report as csv.csv`
- `Airline-roster report as html.html`
- `Airline-roster report as pdf.pdf`
- `Airline-roster report as txt.txt`
- `Airline-roster report as xlsx.xlsx`
- `Safelog.csv`

## Findings

### Airline Export CSV

This is the cleanest employer roster format seen so far.

Columns:

- `Date`
- `Flight`
- `DepPlace`
- `DepTime`
- `ArrPlace`
- `ArrTime`
- `ACType`
- `Reg`
- `FltTime`
- `PicName`
- takeoff/landing/operated-as fields

The sample covers May 2026 and contains 20 flight rows. Several dates contain two or four flights, so one flight row cannot be identified by date alone.

### Airline Roster Report CSV

This contains the same useful data, but it is a report export rather than a clean data export.

It includes title/header rows, repeated column names such as `Airport` and `Time`, and the pilot identity row. It is still parseable, but the parser must use column positions instead of relying only on header names.

### Airline TXT/PDF/HTML/XLSX

These appear to be presentation/report versions of the same data.

Use them only when the CSV export is unavailable. The PDF and TXT are readable but lossy. The HTML is heavily styled. The XLSX is parseable, but the useful rows are spaced out because of report formatting.

### SafeLog CSV

This is a full logbook export.

Columns include:

- `Date`
- `Aircraft Type`
- `Aircraft Registration`
- `Name of PIC`
- `Holder's Operating Capacity`
- `Departure`
- `Departure Time`
- `Arrival`
- `Arrival Time`
- `Total Flight Time`
- takeoff/landing columns
- single-engine, multi-engine, simulator, instrument, PF, and PNF time columns

The sample contains 4,902 rows from 2008-07-05 through 2026-06-25.

SafeLog is likely best handled as a full-history import source:

- Find the latest already imported SafeLog date.
- Import rows after that date.
- Also allow a small overlap window, for example the last 7 to 31 days, so corrections in SafeLog can be detected.

There were two exact duplicate flight pairs in the sample on 2025-09-30. The importer should detect duplicates and show them in the preview rather than blindly inserting both.

## Canonical Flight Row

All import formats should be normalized into one internal shape:

- `flight_date`
- `flight_number`
- `departure_airport`
- `departure_time`
- `departure_time_zone`
- `arrival_airport`
- `arrival_time`
- `arrival_time_zone`
- `aircraft_type`
- `aircraft_registration`
- `flight_time_minutes`
- `pic_name`
- `operating_capacity`
- `pf_minutes`
- `pnf_minutes`
- `source_format`
- `source_file_name`
- `source_row_number`
- `source_fingerprint`

The app can then calculate sector value, route pair, statistics, and payment from this canonical row.

## Flight Identity

Do not use only `yyyymmddXXXYYY` as the unique key. It is useful as a display code, but it can collide when the same route is flown more than once in a day.

Recommended approach:

- `id`: internal database primary key
- `display_code`: readable code, such as `20260529-AMS-SPU-0859`
- `source_fingerprint`: hash of normalized source fields for duplicate detection

For roster imports, the fingerprint should include:

- date
- flight number if present
- departure airport
- departure time
- arrival airport
- arrival time
- aircraft registration if present

For SafeLog imports, the fingerprint should include:

- date
- departure
- departure time
- arrival
- arrival time
- aircraft registration
- total flight time
- operating capacity

This gives stable duplicate detection without making the user-facing code too clever.

## Import Flow

1. Upload file.
2. Detect source format.
3. Parse into canonical rows.
4. Validate fields:
   - date can be parsed
   - times can be parsed
   - departure and arrival are present
   - airport codes or names can be mapped
   - duplicate rows are identified
5. Show preview.
6. Commit import batch.
7. Store original source row data for audit/debugging.

## Manual Input Screens

Besides sectors and duties, the app will need screens for:

- Payment details / salary scales
- One-off payments
- Deductions
- Claims
- Misc duty types
- Misc duties
- Airports and airport aliases
- Leave and day-off entries
- Import history
- Settings, such as sector distance bands and pay period defaults

## Open Questions

- Should SafeLog be treated as the authoritative flight source, with employer roster reports used only for monthly cross-checking?
- Are employer roster reports always one month at a time?
- Are non-flight duties present in any employer export, or are they always manually entered?
- Should airport names from old SafeLog rows be mapped manually once, then remembered?
- Should imported flights be editable, or should corrections always come from re-importing source files?

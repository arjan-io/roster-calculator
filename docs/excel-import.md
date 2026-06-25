# Excel Import

Use this script to seed supporting data from the old Excel calculator.

It imports:

- airports and airport aliases
- duty types
- miscellaneous duties
- salary scales
- one-off payments
- deductions
- claims

It does not import flight history. Flights should come from SafeLog or the airline CSV importer.

## Usage

Copy the Excel file onto the Raspberry Pi, then run:

```bash
npm install
npm run excel:import -- "/path/to/Pay calculator 5.1.xlsm" --replace
```

`--replace` clears the Excel-owned supporting tables before importing them again. It does not delete flights.

After import, restart the server and check the Airports page.

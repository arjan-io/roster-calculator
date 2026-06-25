CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_format TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER,
  flight_date TEXT NOT NULL,
  flight_number TEXT,
  departure_airport TEXT NOT NULL,
  departure_time TEXT,
  departure_time_zone TEXT,
  arrival_airport TEXT NOT NULL,
  arrival_time TEXT,
  arrival_time_zone TEXT,
  aircraft_type TEXT,
  aircraft_registration TEXT,
  flight_time_minutes INTEGER,
  pic_name TEXT,
  operating_capacity TEXT,
  pf_minutes INTEGER,
  pnf_minutes INTEGER,
  display_code TEXT NOT NULL,
  source_format TEXT NOT NULL,
  source_file_name TEXT,
  source_row_number INTEGER,
  source_fingerprint TEXT NOT NULL UNIQUE,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_batch_id) REFERENCES import_batches(id)
);

CREATE TABLE IF NOT EXISTS airports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS airport_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  airport_id INTEGER NOT NULL,
  alias TEXT NOT NULL UNIQUE,
  FOREIGN KEY (airport_id) REFERENCES airports(id)
);

CREATE TABLE IF NOT EXISTS duty_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sector_value REAL NOT NULL DEFAULT 0,
  is_paid INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS misc_duties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  duty_date TEXT NOT NULL,
  duty_type_id INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (duty_type_id) REFERENCES duty_types(id)
);

CREATE TABLE IF NOT EXISTS salary_scales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date TEXT NOT NULL UNIQUE,
  basic_salary REAL NOT NULL,
  sector_rate REAL NOT NULL DEFAULT 0,
  ulv_rate REAL NOT NULL DEFAULT 0,
  palv_rate REAL NOT NULL DEFAULT 0,
  ddo_rate REAL NOT NULL DEFAULT 0,
  snc_rate REAL NOT NULL DEFAULT 0,
  loyalty_amount REAL NOT NULL DEFAULT 0,
  travel_amount REAL NOT NULL DEFAULT 0,
  wfly_amount REAL NOT NULL DEFAULT 0,
  pension_amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS one_off_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_month INTEGER NOT NULL,
  payment_year INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_number TEXT,
  subject TEXT NOT NULL,
  submitted_on TEXT,
  processed_on TEXT,
  status TEXT,
  amount REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_on TEXT
);

CREATE TABLE IF NOT EXISTS leave_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_date TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  notes TEXT
);

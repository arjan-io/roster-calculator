let pendingImport = null;

const importForm = document.querySelector("#import-form");
const commitButton = document.querySelector("#commit-button");
const previewStatus = document.querySelector("#preview-status");
const previewBody = document.querySelector("#preview-body");
const flightsBody = document.querySelector("#flights-body");
const airportForm = document.querySelector("#airport-form");
const airportStatus = document.querySelector("#airport-status");
const airportsBody = document.querySelector("#airports-body");
const viewButtons = document.querySelectorAll("[data-view-button]");
const views = document.querySelectorAll("[data-view]");

for (const button of viewButtons) {
  button.addEventListener("click", () => {
    showView(button.dataset.viewButton);
  });
}

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(importForm);
  previewStatus.textContent = "Reading file...";
  commitButton.disabled = true;

  const response = await fetch("/api/imports/preview", {
    method: "POST",
    body: formData
  });
  const result = await response.json();

  if (!response.ok) {
    previewStatus.textContent = result.error || "Could not read file.";
    pendingImport = null;
    renderPreview([]);
    return;
  }

  pendingImport = result;
  const duplicateCount = result.flights.filter((flight) => flight.duplicate).length;
  previewStatus.textContent = formatImportStatus(result.rowCount, duplicateCount, result.skippedBeforeCutoff);
  commitButton.disabled = result.flights.length === 0;
  renderPreview(result.flights);
});

commitButton.addEventListener("click", async () => {
  if (!pendingImport) {
    return;
  }

  const response = await fetch("/api/imports/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previewToken: pendingImport.previewToken
    })
  });
  const result = await response.json();

  if (!response.ok) {
    previewStatus.textContent = result.error || "Import failed.";
    return;
  }

  previewStatus.textContent = `${result.insertedCount} inserted, ${result.duplicateCount} duplicates skipped, ${result.skippedBeforeCutoff || 0} before cutoff skipped.`;
  commitButton.disabled = true;
  pendingImport = null;
  await loadDashboard();
});

airportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(airportForm));
  airportStatus.textContent = "Saving airport...";

  const response = await fetch("/api/airports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    airportStatus.textContent = result.error || "Could not save airport.";
    return;
  }

  airportStatus.textContent = `${result.code} saved.`;
  airportForm.reset();
  await loadAirports();
});

function renderPreview(flights) {
  previewBody.innerHTML = "";
  for (const flight of flights.slice(0, 100)) {
    previewBody.append(row([
      flight.flightDate,
      flight.flightNumber || "-",
      `${flight.departureAirport} -> ${flight.arrivalAirport}`,
      `${flight.departureTime || "-"} - ${flight.arrivalTime || "-"}`,
      flight.aircraftType || "-",
      flight.aircraftRegistration || "-",
      flight.duplicate ? "Duplicate" : "New"
    ], flight.duplicate));
  }
}

async function loadDashboard() {
  const [summaryResponse, flightsResponse] = await Promise.all([
    fetch("/api/flights/summary"),
    fetch("/api/flights?limit=50")
  ]);

  const summary = await summaryResponse.json();
  const flights = await flightsResponse.json();

  document.querySelector("#total-flights").textContent = summary.totalFlights || 0;
  document.querySelector("#date-range").textContent =
    summary.firstDate && summary.lastDate ? `${summary.firstDate} - ${summary.lastDate}` : "-";
  document.querySelector("#total-time").textContent = minutesToDuration(summary.totalMinutes || 0);

  flightsBody.innerHTML = "";
  for (const flight of flights) {
    flightsBody.append(row([
      flight.flightDate,
      flight.flightNumber || "-",
      `${flight.departureAirport} -> ${flight.arrivalAirport}`,
      `${flight.departureTime || "-"} - ${flight.arrivalTime || "-"}`,
      flight.aircraftType || "-",
      flight.aircraftRegistration || "-",
      flight.sourceFormat
    ]));
  }
}

async function loadAirports() {
  const response = await fetch("/api/airports");
  const airports = await response.json();

  airportsBody.innerHTML = "";
  for (const airport of airports) {
    airportsBody.append(row([
      airport.code,
      airport.name || "-",
      Number(airport.latitude).toFixed(6),
      Number(airport.longitude).toFixed(6)
    ]));
  }
}

function row(values, duplicate = false) {
  const tr = document.createElement("tr");
  if (duplicate) {
    tr.classList.add("duplicate");
  }

  for (const value of values) {
    const td = document.createElement("td");
    td.textContent = value || "";
    tr.append(td);
  }

  return tr;
}

function minutesToDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

function formatImportStatus(rowCount, duplicateCount, skippedBeforeCutoff = 0) {
  const parts = [`${rowCount} importable rows found`, `${duplicateCount} duplicates`];

  if (skippedBeforeCutoff) {
    parts.push(`${skippedBeforeCutoff} before 2011-06-01 skipped`);
  }

  return `${parts.join(", ")}.`;
}

function showView(viewName) {
  for (const button of viewButtons) {
    button.classList.toggle("active", button.dataset.viewButton === viewName);
  }

  for (const view of views) {
    view.classList.toggle("active", view.dataset.view === viewName);
  }
}

loadDashboard();
loadAirports();

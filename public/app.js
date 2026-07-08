let pendingImport = null;
let airports = [];
let duties = [];
let paymentPeriods = [];
let dutyTypes = [];
let oneOffPayments = [];
let deductions = [];
let paymentCalculation = null;
let dutyFilter = "all";
let activeFlightFilter = restoreFlightDateFilter();
let statistics = null;
let baseStations = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

for (const button of $$("[data-page-button]")) {
  button.addEventListener("click", () => showPage(button.dataset.pageButton));
}
for (const button of $$("[data-panel-button]")) {
  button.addEventListener("click", () => showPanel(button.closest(".page"), button.dataset.panelButton));
}

$("#import-form").addEventListener("submit", previewImport);
$("#commit-button").addEventListener("click", commitImport);
$("#airport-form").addEventListener("submit", saveAirport);
$("#duty-form").addEventListener("submit", saveDuty);
$("#payment-period-form").addEventListener("submit", savePaymentPeriod);
$("#one-off-form").addEventListener("submit", saveOneOffPayment);
$("#duty-type-form").addEventListener("submit", saveDutyType);
$("#deduction-form").addEventListener("submit", saveDeduction);
$("#base-station-form").addEventListener("submit", saveBaseStation);
$("#statistics-filter-form").addEventListener("change", loadStatistics);
$("#payment-calculation-form").addEventListener("submit", calculatePayment);
$("#previous-payment-month").addEventListener("click", () => movePaymentMonth(-1));
$("#next-payment-month").addEventListener("click", () => movePaymentMonth(1));
$("#add-component").addEventListener("click", () => addComponentColumn({}, { focus: true }));
$("#clear-flight-filter").addEventListener("click", async () => {
  activeFlightFilter = null;
  sessionStorage.removeItem("flightDateFilter");
  await loadFlights();
});
$("#paid-toggle").addEventListener("click", () => {
  const paid = $("#duty-form [name='paid']").value !== "1";
  setPaidToggle(paid);
});
$("#duty-type-paid-toggle").addEventListener("click", () => {
  const paid = $("#duty-type-form [name='isPaid']").value !== "1";
  setDutyTypePaidToggle(paid);
});
for (const button of $$("[data-duty-filter]")) {
  button.addEventListener("click", () => {
    dutyFilter = button.dataset.dutyFilter;
    $$("[data-duty-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderDuties();
  });
}
$("[data-cancel='airport']").addEventListener("click", resetAirportForm);
$("[data-cancel='duty']").addEventListener("click", resetDutyForm);
$("[data-cancel='payment']").addEventListener("click", resetPaymentForm);
$("[data-cancel='one-off']").addEventListener("click", resetOneOffForm);
$("[data-cancel='duty-type']").addEventListener("click", resetDutyTypeForm);
$("[data-cancel='deduction']").addEventListener("click", resetDeductionForm);
$("[data-cancel='base-station']").addEventListener("click", resetBaseStationForm);

$("#airport-form [name='lidoCoordinate']").addEventListener("blur", (event) => {
  event.target.value = formatCoordinate(event.target.value);
});

$("#flights-body").addEventListener("click", handleFlightAction);
$("#airports-body").addEventListener("click", handleAirportAction);
$("#duties-body").addEventListener("click", handleDutyAction);
$("#payment-periods-body").addEventListener("click", handlePaymentAction);
$("#one-offs-body").addEventListener("click", handleOneOffAction);
$("#duty-types-body").addEventListener("click", handleDutyTypeAction);
$("#deductions-body").addEventListener("click", handleDeductionAction);
$("#base-stations-body").addEventListener("click", handleBaseStationAction);
$("#statistics-sector-days-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-flight-date]");
  if (!button) return;
  const date = button.dataset.flightDate;
  activeFlightFilter = { date, label: date };
  sessionStorage.setItem("flightDateFilter", date);
  showPage("roster");
  showPanel($("[data-page='roster']"), "flights");
  await loadFlights(activeFlightFilter);
});
$("#component-editor").addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-component]");
  if (!removeButton) return;

  const column = removeButton.closest(".component-column");
  const componentName = $("[name='componentName']", column).value.trim() || "this component";
  if (confirm(`Remove ${componentName} from this payment period?`)) {
    column.remove();
  }
});
$("#component-editor").addEventListener("change", (event) => {
  if (event.target.name === "calculationType") {
    updateComponentColumn(event.target.closest(".component-column"));
  }
});

async function previewImport(event) {
  event.preventDefault();
  const status = $("#preview-status");
  const formData = new FormData(event.target);
  pendingImport = null;
  renderPreview([]);
  setImportBusy(true, "Checking roster and duplicates...");

  try {
    const response = await fetch("/api/imports/preview", {
      method: "POST",
      body: formData
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not read file.");
    }

    pendingImport = result;
    const duplicateCount = result.flights.filter((flight) => flight.duplicate).length;
    status.textContent = formatImportStatus(result.rowCount, duplicateCount, result.skippedBeforeCutoff);
    renderPreview(result.flights);
  } catch (error) {
    status.textContent = error.message;
    renderPreview([]);
  } finally {
    setImportBusy(false);
  }
}

async function commitImport() {
  if (!pendingImport) return;
  const status = $("#preview-status");
  setImportBusy(true, "Saving new flights...");

  try {
    const response = await api("/api/imports/commit", {
      method: "POST",
      body: JSON.stringify({ previewToken: pendingImport.previewToken })
    });
    status.textContent =
      `${response.insertedCount} inserted, ${response.duplicateCount} duplicates skipped, ${response.skippedBeforeCutoff || 0} before cutoff skipped.`;
    pendingImport = null;
    $("#import-form").reset();
    renderPreview([]);
    await loadAll();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    setImportBusy(false);
  }
}

function setImportBusy(isBusy, message = "Working...") {
  $("#roster-file").disabled = isBusy;
  $("#preview-button").disabled = isBusy;
  $("#commit-button").disabled = isBusy || !pendingImport;
  $("#import-loading").classList.toggle("hidden", !isBusy);
  $("#import-loading-text").textContent = message;
  $("#import-form").setAttribute("aria-busy", String(isBusy));
}

async function saveAirport(event) {
  event.preventDefault();
  const form = event.target;
  const payload = Object.fromEntries(new FormData(form));
  const url = payload.id ? `/api/airports/${payload.id}` : "/api/airports";
  try {
    const result = await api(url, { method: payload.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#airport-status").textContent = `${result.iata} saved.`;
    resetAirportForm();
    await Promise.all([loadAirports(), loadIssues(), loadDashboard()]);
  } catch (error) {
    $("#airport-status").textContent = error.message;
  }
}

async function saveDuty(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  const url = payload.id ? `/api/duties/${payload.id}` : "/api/duties";
  try {
    await api(url, { method: payload.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#duty-status").textContent = "Duty saved.";
    resetDutyForm();
    await loadDuties();
  } catch (error) {
    $("#duty-status").textContent = error.message;
  }
}

async function savePaymentPeriod(event) {
  event.preventDefault();
  const form = event.target;
  const fields = Object.fromEntries(new FormData(form));
  const components = $$(".component-column", $("#component-editor")).map((row) => ({
    code: $("[name='componentCode']", row).value,
    name: $("[name='componentName']", row).value,
    calculationType: $("[name='calculationType']", row).value,
    ratio: $("[name='ratio']", row).value,
    amount: $("[name='amount']", row).value,
    paymentTreatment: $("[name='paymentTreatment']", row).value
  }));
  try {
    await api(fields.id ? `/api/payments/periods/${fields.id}` : "/api/payments/periods", {
      method: fields.id ? "PUT" : "POST",
      body: JSON.stringify({ ...fields, components })
    });
    $("#payment-status").textContent = "Payment period saved.";
    await loadPaymentPeriods();
    await resetPaymentForm();
  } catch (error) {
    $("#payment-status").textContent = error.message;
  }
}

async function saveOneOffPayment(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  const url = payload.id ? `/api/payments/one-offs/${payload.id}` : "/api/payments/one-offs";
  try {
    await api(url, { method: payload.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#one-off-status").textContent = "One-off payment saved.";
    resetOneOffForm();
    await loadOneOffPayments();
  } catch (error) {
    $("#one-off-status").textContent = error.message;
  }
}

async function saveDutyType(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  const url = payload.id ? `/api/duties/types/${payload.id}` : "/api/duties/types";
  try {
    await api(url, { method: payload.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#duty-type-status").textContent = "Duty type saved.";
    resetDutyTypeForm();
    await loadDuties();
  } catch (error) {
    $("#duty-type-status").textContent = error.message;
  }
}

async function saveDeduction(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  const url = payload.id ? `/api/payments/deductions/${payload.id}` : "/api/payments/deductions";
  try {
    await api(url, { method: payload.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#deduction-status").textContent = "Deduction saved.";
    resetDeductionForm();
    await loadDeductions();
  } catch (error) {
    $("#deduction-status").textContent = error.message;
  }
}

async function saveBaseStation(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  const url = payload.id ? `/api/statistics/base-stations/${payload.id}` : "/api/statistics/base-stations";
  try {
    await api(url, { method: payload.id ? "PUT" : "POST", body: JSON.stringify(payload) });
    $("#base-station-status").textContent = "Base period saved.";
    resetBaseStationForm();
    await Promise.all([loadBaseStations(), loadStatistics()]);
  } catch (error) {
    $("#base-station-status").textContent = error.message;
  }
}

async function handleFlightAction(event) {
  const button = event.target.closest("[data-action='delete-flight']");
  if (!button) return;
  if (!confirm("Delete this flight and keep it excluded from future imports?")) return;

  await api(`/api/flights/${button.dataset.id}`, { method: "DELETE" });
  await Promise.all([loadDashboard(), loadIssues(), loadStatistics()]);
}

async function handleBaseStationAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const base = baseStations.find((item) => item.id === Number(button.dataset.id));
  if (button.dataset.action === "edit") {
    fillForm($("#base-station-form"), base);
    $("[data-cancel='base-station']").classList.remove("hidden");
  }
  if (button.dataset.action === "delete" && confirm(`Delete the ${base.iata} base period?`)) {
    await api(`/api/statistics/base-stations/${base.id}`, { method: "DELETE" });
    await Promise.all([loadBaseStations(), loadStatistics()]);
  }
}

async function handleAirportAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const airport = airports.find((item) => item.id === Number(button.dataset.id));
  if (button.dataset.action === "edit") {
    fillForm($("#airport-form"), {
      id: airport.id, iata: airport.iata, icao: airport.icao || "",
      name: airport.name || "", lidoCoordinate: airport.coordinateText || ""
    });
    $("[data-cancel='airport']").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (button.dataset.action === "delete" && confirm(`Delete ${airport.iata}?`)) {
    try {
      const result = await api(`/api/airports/${airport.id}`, { method: "DELETE" });
      $("#airport-status").textContent = result.affectedFlights
        ? `${result.iata} deleted. ${result.affectedFlights} flight${result.affectedFlights === 1 ? "" : "s"} added to Issues.`
        : `${result.iata} deleted.`;
      await Promise.all([loadAirports(), loadIssues(), loadStatistics()]);
    } catch (error) {
      $("#airport-status").textContent = error.message;
    }
  }
}

async function handleDutyAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const duty = duties.find((item) => item.id === Number(button.dataset.id));
  if (button.dataset.action === "mark-paid") {
    await api(`/api/duties/${duty.id}/paid`, { method: "PATCH" });
    await loadDuties();
    return;
  }
  if (button.dataset.action === "edit") {
    fillForm($("#duty-form"), duty);
    setPaidToggle(Boolean(duty.paid));
    $("[data-cancel='duty']").classList.remove("hidden");
  }
  if (button.dataset.action === "delete" && confirm("Delete this duty?")) {
    await api(`/api/duties/${duty.id}`, { method: "DELETE" });
    await loadDuties();
  }
}

async function handleOneOffAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = oneOffPayments.find((payment) => payment.id === Number(button.dataset.id));
  if (button.dataset.action === "edit") {
    fillForm($("#one-off-form"), {
      ...item,
      month: `${item.paymentYear}-${String(item.paymentMonth).padStart(2, "0")}`
    });
    $("[data-cancel='one-off']").classList.remove("hidden");
  }
  if (button.dataset.action === "delete" && confirm("Delete this one-off payment?")) {
    await api(`/api/payments/one-offs/${item.id}`, { method: "DELETE" });
    await loadOneOffPayments();
  }
}

async function handleDutyTypeAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = dutyTypes.find((type) => type.id === Number(button.dataset.id));
  if (button.dataset.action === "edit") {
    fillForm($("#duty-type-form"), item);
    setDutyTypePaidToggle(Boolean(item.isPaid));
    $("[data-cancel='duty-type']").classList.remove("hidden");
  }
  if (button.dataset.action === "delete" && confirm("Delete this duty type?")) {
    try {
      await api(`/api/duties/types/${item.id}`, { method: "DELETE" });
      await loadDuties();
    } catch (error) {
      $("#duty-type-status").textContent = error.message;
    }
  }
}

async function handleDeductionAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = deductions.find((deduction) => deduction.id === Number(button.dataset.id));
  if (button.dataset.action === "edit") {
    fillForm($("#deduction-form"), item);
    $("[data-cancel='deduction']").classList.remove("hidden");
  }
  if (button.dataset.action === "delete" && confirm("Delete this deduction?")) {
    await api(`/api/payments/deductions/${item.id}`, { method: "DELETE" });
    await loadDeductions();
  }
}

async function handlePaymentAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const period = paymentPeriods.find((item) => item.id === Number(button.dataset.id));
  if (button.dataset.action === "edit") {
    fillForm($("#payment-period-form"), period);
    renderComponentEditor(period.components);
    $("[data-cancel='payment']").classList.remove("hidden");
  }
  if (button.dataset.action === "delete" && confirm("Delete this payment period?")) {
    await api(`/api/payments/periods/${period.id}`, { method: "DELETE" });
    await loadPaymentPeriods();
    await resetPaymentForm();
  }
}

async function loadDashboard() {
  const summary = await api("/api/flights/summary");
  $("#total-flights").textContent = summary.totalFlights || 0;
  $("#date-range").textContent = summary.firstDate && summary.lastDate ? `${summary.firstDate} - ${summary.lastDate}` : "-";
  $("#total-time").textContent = minutesToDuration(summary.totalMinutes || 0);
  await loadFlights(activeFlightFilter);
}

async function loadFlights(filter = null) {
  const parameters = new URLSearchParams({ limit: filter ? "1000" : "50" });
  if (filter?.flightFilter) parameters.set("issue", filter.flightFilter);
  if (filter?.airport) parameters.set("airport", filter.airport);
  if (filter?.date) parameters.set("date", filter.date);
  const flights = await api(`/api/flights?${parameters}`);

  $("#flights-heading").textContent = filter ? `Affected flights: ${filter.label}` : "Recent flights";
  $("#clear-flight-filter").classList.toggle("hidden", !filter);
  $("#flights-body").replaceChildren(...flights.map(flightRow));
}

async function loadAirports() {
  airports = await api("/api/airports");
  $("#airports-body").replaceChildren(...airports.map((airport) => actionRow([
    airport.iata, airport.icao || "-", airport.name || "-", airport.coordinateText || "-"
  ], airport.id)));
}

async function loadDuties() {
  const [types, items] = await Promise.all([api("/api/duties/types"), api("/api/duties")]);
  duties = items;
  dutyTypes = types;
  const select = $("#duty-form [name='dutyTypeId']");
  const selected = select.value;
  select.replaceChildren(new Option("Select duty", ""), ...types.map((type) => new Option(type.name, type.id)));
  select.value = selected;
  renderDuties();
  $("#duty-types-body").replaceChildren(...dutyTypes.map((type) => actionRow([
    type.code,
    type.name,
    type.sectorValue,
    taxTreatmentLabel(type.taxTreatment),
    type.paymentComponentCode || "-",
    type.paymentMultiplier,
    type.isPaid ? "Yes" : "No"
  ], type.id)));
  populateDutyComponentSelect();
}

async function loadPaymentPeriods() {
  paymentPeriods = (await api("/api/payments/periods"))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const definitions = new Map();
  for (const period of [...paymentPeriods].reverse()) {
    for (const component of period.components) {
      if (!definitions.has(component.code)) definitions.set(component.code, component.name);
    }
  }

  const header = tableHeader([
    "Effective from", "Basic salary", "Normaal tax", "Bijzonder tax",
    ...definitions.values(), "Actions", ""
  ]);
  $("#payment-periods-head").replaceChildren(header);
  populateDutyComponentSelect();
  $("#payment-periods-body").replaceChildren(...paymentPeriods.map((period) => {
    const byCode = new Map(period.components.map((component) => [component.code, component]));
    const values = [
      period.effectiveDate,
      money(period.basicSalary),
      `${formatNumber(period.normalTaxRate)}%`,
      `${formatNumber(period.specialTaxRate)}%`
    ];
    for (const code of definitions.keys()) {
      const component = byCode.get(code);
      values.push(component ? formatPaymentComponent(component) : "-");
    }
    return actionRow(values, period.id);
  }));
}

async function loadOneOffPayments() {
  oneOffPayments = await api("/api/payments/one-offs");
  $("#one-offs-body").replaceChildren(...oneOffPayments.map((item) => actionRow([
    `${item.paymentYear}-${String(item.paymentMonth).padStart(2, "0")}`,
    item.description,
    taxTreatmentLabel(item.taxTreatment),
    money(item.amount)
  ], item.id)));
}

async function loadDeductions() {
  deductions = await api("/api/payments/deductions");
  $("#deductions-body").replaceChildren(...deductions.map((item) => actionRow([
    item.startMonth,
    item.endMonth || "Ongoing",
    item.description,
    item.paymentStage === "gross" ? "Gross" : "Net",
    item.calculationType === "normal_percentage" ? "% of Normaal" : "Fixed",
    item.calculationType === "normal_percentage" ? `${item.amount}%` : money(item.amount)
  ], item.id)));
}

async function loadStatistics() {
  const year = $("#statistics-year").value;
  const monthInput = $("#statistics-month");
  monthInput.disabled = !year;
  if (!year) monthInput.value = "";
  const month = monthInput.value;
  const query = new URLSearchParams();
  if (year) query.set("year", year);
  if (month) query.set("month", month);

  const queryString = query.toString();
  statistics = await api(`/api/statistics${queryString ? `?${queryString}` : ""}`);
  populateStatisticsYears(statistics.availableYears, year);
  renderStatistics();
}

async function loadBaseStations() {
  baseStations = await api("/api/statistics/base-stations");
  $("#base-stations-body").replaceChildren(...baseStations.map((base) => actionRow([
    base.iata,
    base.startDate,
    base.endDate || "Ongoing"
  ], base.id)));
}

function populateStatisticsYears(years, selected) {
  const select = $("#statistics-year");
  select.replaceChildren(
    new Option("All years", ""),
    ...years.map((year) => new Option(String(year), String(year)))
  );
  select.value = selected;
}

function renderStatistics() {
  const data = statistics;
  const selectedMonth = $("#statistics-month option:checked")?.textContent;
  const periodLabel = data.filter.year
    ? `${selectedMonth && data.filter.month ? `${selectedMonth} ` : ""}${data.filter.year}`
    : "All recorded activity";
  $("#statistics-status").textContent = periodLabel;

  const overview = data.overview;
  renderSummary($("#statistics-summary"), [
    ["Flights", formatNumber(overview.flights)],
    ["Flight time", minutesToDuration(overview.flightMinutes)],
    ["Distance", `${formatNumber(overview.distanceNm)} nm`],
    ["Airports", formatNumber(overview.airports)],
    ["Working days", formatNumber(overview.workingDays)],
    ["Avg. sectors / flight day", formatNumber(overview.averageSectorsPerFlightDay)]
  ]);

  $("#statistics-weekdays-body").replaceChildren(...data.weekdays.map((row) =>
    tableRow([row.label, row.count])
  ));
  renderWeekdayChart(data.weekdays);
  const sectorDays = data.sectorsPerDay.reduce((total, row) => total + row.days, 0);
  $("#statistics-sector-days-body").replaceChildren(...data.sectorsPerDay.map((row) =>
    sectorDayRow(row, sectorDays)
  ));
  renderSectorPie(data.sectorsPerDay);

  $("#statistics-period-note").textContent = data.filter.year
    ? `Monthly totals for ${data.filter.year}.`
    : "Year totals across the full history.";
  $("#statistics-period-body").replaceChildren(...data.periods.map((row) => tableRow([
    row.period,
    row.flights,
    minutesToDuration(row.flightMinutes),
    `${formatNumber(row.distanceNm)} nm`,
    row.miscDuties,
    row.workingDays
  ])));

  $("#statistics-routes-body").replaceChildren(...data.routes.map((row) => tableRow([
    row.route,
    row.flights,
    minutesToDuration(row.flightMinutes)
  ])));
  $("#statistics-destinations-body").replaceChildren(...data.destinations.map((row) => tableRow([
    row.name ? `${row.airport} - ${row.name}` : row.airport,
    row.visits
  ])));

  const sectors = data.pay.sectors;
  renderSummary($("#statistics-pay-summary"), [
    ["Short sectors", sectors.short],
    ["Medium sectors", sectors.medium],
    ["Long sectors", sectors.long],
    ["Extra-long sectors", sectors.extraLong],
    ["Distance unavailable", sectors.unknown]
  ]);
  $("#statistics-pay-duties-body").replaceChildren(...data.pay.duties.map((row) => tableRow([
    row.name,
    taxTreatmentLabel(row.taxTreatment),
    row.includedInPay ? "Yes" : "No",
    row.logged,
    row.confirmedPaid
  ])));
}

function renderSummary(container, items) {
  container.replaceChildren(...items.map(([label, value]) => {
    const item = document.createElement("div");
    const caption = document.createElement("span");
    const strong = document.createElement("strong");
    caption.textContent = label;
    strong.textContent = value;
    item.append(caption, strong);
    return item;
  }));
}

function sectorDayRow(row, totalDays) {
  const tr = tableRow([
    row.sectors,
    row.days,
    totalDays ? `${formatNumber(row.days / totalDays * 100)}%` : "-"
  ]);
  const dates = document.createElement("td");
  const values = String(row.datesToCheck || "").split(", ").filter(Boolean);
  values.forEach((date, index) => {
    if (index) dates.append(document.createTextNode(", "));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-action date-filter-button";
    button.dataset.flightDate = date;
    button.textContent = date;
    dates.append(button);
  });
  tr.append(dates);
  return tr;
}

function renderWeekdayChart(rows) {
  const container = $("#statistics-weekday-chart");
  const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const byDay = new Map(rows.map((row) => [row.label, row]));
  const orderedRows = weekdayOrder.map((label) => byDay.get(label) || { label, count: 0 });
  const maximum = Math.max(...orderedRows.map((row) => row.count), 1);
  container.replaceChildren(...orderedRows.map((row) => {
    const item = document.createElement("div");
    item.className = "bar-chart-row";
    const label = document.createElement("span");
    label.textContent = row.label.slice(0, 3);
    const track = document.createElement("div");
    track.className = "bar-chart-track";
    const bar = document.createElement("div");
    bar.className = "bar-chart-value";
    bar.style.height = `${row.count / maximum * 100}%`;
    const value = document.createElement("strong");
    value.textContent = row.count;
    track.append(bar);
    item.append(label, track, value);
    return item;
  }));
}

function renderSectorPie(rows) {
  const colors = ["#08766c", "#d99b21", "#326da8", "#c5523b", "#76558f", "#4f5964", "#6f8f3d"];
  const total = rows.reduce((sum, row) => sum + row.days, 0);
  let position = 0;
  const stops = rows.flatMap((row, index) => {
    const start = position;
    position += total ? row.days / total * 100 : 0;
    const gap = Math.min(0.3, (position - start) / 6);
    return [
      `#ffffff ${start}% ${start + gap}%`,
      `${colors[index % colors.length]} ${start + gap}% ${position - gap}%`,
      `#ffffff ${position - gap}% ${position}%`
    ];
  });
  const pie = $("#statistics-sector-pie");
  pie.style.background = stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--line)";
  pie.setAttribute("aria-label", rows.map((row) => `${row.sectors} flights: ${row.days} days`).join(", "));

  $("#statistics-sector-legend").replaceChildren(...rows.map((row, index) => {
    const item = document.createElement("div");
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = colors[index % colors.length];
    const label = document.createElement("span");
    label.textContent = `${row.sectors} flight${row.sectors === 1 ? "" : "s"}: ${row.days} day${row.days === 1 ? "" : "s"}`;
    item.append(swatch, label);
    return item;
  }));
}

async function loadIssues() {
  const issues = await api("/api/issues");
  $("#issue-count").textContent = issues.length;
  const list = $("#issues-list");
  if (!issues.length) {
    list.innerHTML = '<div class="empty-view"><h3>No issues found</h3><p>All referenced airports and coordinates are present.</p></div>';
    return;
  }
  list.replaceChildren(...issues.map((issue) => {
    const button = document.createElement("button");
    button.className = "issue-row";
    button.innerHTML = `<strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.detail)}</span>`;
    button.addEventListener("click", () => {
      const rosterTarget = ["flights", "duties"].includes(issue.target);
      const page = rosterTarget ? "roster" : "data";
      showPage(page);
      showPanel($(`[data-page='${page}']`), issue.target);
      if (issue.flightFilter) {
        activeFlightFilter = issue;
        loadFlights(issue);
      }
    });
    return button;
  }));
}

async function calculatePayment(event) {
  event?.preventDefault();
  const month = $("#calculation-month").value;
  if (!month) return;

  try {
    paymentCalculation = await api(`/api/payments/calculate?month=${encodeURIComponent(month)}`);
    renderPaymentCalculation();
  } catch (error) {
    paymentCalculation = null;
    $("#payment-calculation-status").textContent = error.message;
    $("#sector-breakdown-body").replaceChildren();
    $("#duty-breakdown-body").replaceChildren();
    $("#payment-calculation-body").replaceChildren();
    $("#estimated-payable").textContent = "-";
  }
}

async function movePaymentMonth(offset) {
  const input = $("#calculation-month");
  if (!input.value) return;
  const [year, month] = input.value.split("-").map(Number);
  const nextMonth = new Date(year, month - 1 + offset, 1);
  input.value = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
  await calculatePayment();
}

function renderPaymentCalculation() {
  const calculation = paymentCalculation;
  $("#payment-calculation-status").textContent =
    "Estimate for checking expected payslip items, including calculated tax deductions.";
  $("#calculation-roster-month").textContent = calculation.rosterMonth;
  $("#calculation-rate-date").textContent = calculation.paymentPeriod.effectiveDate;

  $("#sector-breakdown-body").replaceChildren(...calculation.sectorBreakdown.map((line) =>
    tableRow([
      line.label,
      line.count,
      formatNumber(line.weight),
      formatNumber(line.nominal),
      money(line.amount)
    ])
  ));
  $("#duty-breakdown-body").replaceChildren(...calculation.dutyBreakdown.map((line) =>
    tableRow([
      line.name,
      line.quantity,
      line.rateSource,
      line.normal ? money(line.normal) : "",
      line.special ? money(line.special) : line.net ? `${money(line.net)} net` : ""
    ])
  ));

  const rows = [];
  for (const line of calculation.earnings) {
    rows.push(paymentLineRow(line.label, line.normal, line.special));
  }
  rows.push(paymentLineRow(
    "Gross pay",
    calculation.totals.normal,
    calculation.totals.special,
    "payment-total"
  ));

  for (const line of calculation.grossDeductions) {
    rows.push(paymentLineRow(line.label, line.amount, 0));
  }
  rows.push(paymentLineRow(
    "Taxable basis",
    calculation.totals.taxableNormal,
    calculation.totals.taxableSpecial,
    "payment-subtotal"
  ));
  rows.push(paymentLineRow(
    `Loonheffing (${formatNumber(calculation.paymentPeriod.normalTaxRate)}% / ${formatNumber(calculation.paymentPeriod.specialTaxRate)}%)`,
    -calculation.totals.normalTax,
    -calculation.totals.specialTax,
    "tax-deduction"
  ));
  rows.push(paymentLineRow(
    "Net after tax",
    calculation.totals.taxableNormal - calculation.totals.normalTax,
    calculation.totals.taxableSpecial - calculation.totals.specialTax,
    "payment-total"
  ));

  for (const line of calculation.netAdjustments) {
    rows.push(paymentLineRow(line.label, line.amount, 0, "net-adjustment"));
  }
  $("#payment-calculation-body").replaceChildren(...rows);
  updateEstimatedPayable();
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-NL", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function paymentLineRow(label, normal, special, className = "") {
  const tr = document.createElement("tr");
  if (className) tr.className = className;
  const description = document.createElement("td");
  description.textContent = label;
  const normalCell = document.createElement("td");
  normalCell.textContent = normal ? money(normal) : "";
  const specialCell = document.createElement("td");
  specialCell.textContent = special ? money(special) : "";
  tr.append(description, normalCell, specialCell);
  return tr;
}

function updateEstimatedPayable() {
  if (!paymentCalculation) return;
  $("#estimated-payable").textContent = money(paymentCalculation.totals.payable);
}

function populateDutyComponentSelect() {
  const select = $("#duty-component-select");
  const selected = select.value;
  const components = new Map();
  for (const period of paymentPeriods) {
    for (const component of period.components) {
      if (!components.has(component.code)) components.set(component.code, component.name);
    }
  }
  select.replaceChildren(
    new Option("Use sector value", ""),
    ...[...components].map(([code, name]) => new Option(name, code))
  );
  select.value = selected;
}

function taxTreatmentLabel(value) {
  if (value === "special") return "Bijzonder";
  if (value === "none" || value === "net") return "Net / not taxable";
  return "Normaal";
}

function renderDuties() {
  const filtered = duties.filter((duty) =>
    dutyFilter === "all" ||
    (dutyFilter === "paid" && duty.paid) ||
    (dutyFilter === "unpaid" && !duty.paid)
  );
  $("#duties-body").replaceChildren(...filtered.map(dutyRow));
}

function flightRow(flight) {
  const tr = tableRow([
    flight.flightDate,
    `${flight.departureAirport || "(blank)"} -> ${flight.arrivalAirport || "(blank)"}`,
    `${flight.departureTime || "-"} - ${flight.arrivalTime || "-"}`,
    flight.aircraftType || "-",
    flight.aircraftRegistration || "-",
    flight.distanceNm == null ? "Missing airport" : `${Math.round(flight.distanceNm)} nm`,
    flight.sourceFormat
  ]);
  tr.append(iconCell("&times;", "Delete flight", "delete-flight", flight.id, true));
  return tr;
}

function dutyRow(duty) {
  const tr = tableRow([duty.dutyDate, duty.dutyName]);
  const paidCell = document.createElement("td");
  if (duty.paid) {
    paidCell.innerHTML = '<span class="paid-status"><span aria-hidden="true">&#10003;</span> Yes</span>';
  } else {
    paidCell.innerHTML = `<span>No</span> <button class="text-action" data-action="mark-paid" data-id="${duty.id}">Mark as paid</button>`;
  }
  tr.append(paidCell, iconCell("&#9998;", "Edit", "edit", duty.id), iconCell("&times;", "Delete", "delete", duty.id, true));
  return tr;
}

function renderPreview(flights) {
  $("#preview-table").classList.toggle("hidden", flights.length === 0);
  $("#preview-body").replaceChildren(...flights.slice(0, 100).map((flight) => tableRow([
    flight.flightDate, `${flight.departureAirport} -> ${flight.arrivalAirport}`,
    `${flight.departureTime || "-"} - ${flight.arrivalTime || "-"}`,
    flight.aircraftType || "-", flight.aircraftRegistration || "-", flight.duplicate ? "Duplicate" : "New"
  ], flight.duplicate)));
}

function renderComponentEditor(components = []) {
  $("#component-editor").replaceChildren();
  for (const component of components) addComponentColumn(component);
}

function addComponentColumn(component = {}, options = {}) {
  const row = document.createElement("div");
  row.className = "component-column";
  row.innerHTML = `
    <input name="componentCode" type="hidden" value="${escapeHtml(component.code || "")}">
    <input name="componentName" placeholder="Component name" value="${escapeHtml(component.name || "")}" required>
    <select name="calculationType">
      <option value="ratio" ${component.calculationType !== "fixed" ? "selected" : ""}>Ratio of basic salary</option>
      <option value="fixed" ${component.calculationType === "fixed" ? "selected" : ""}>Fixed amount</option>
    </select>
    <select name="paymentTreatment">
      <option value="normal" ${component.paymentTreatment === "normal" || !component.paymentTreatment ? "selected" : ""}>Normaal</option>
      <option value="special" ${component.paymentTreatment === "special" ? "selected" : ""}>Bijzonder</option>
      <option value="net_reimbursement" ${component.paymentTreatment === "net_reimbursement" ? "selected" : ""}>Net reimbursement</option>
      <option value="gross_deduction" ${component.paymentTreatment === "gross_deduction" ? "selected" : ""}>Gross deduction</option>
    </select>
    <input name="ratio" type="number" step="0.000001" placeholder="Ratio" value="${component.ratio ?? ""}">
    <input name="amount" type="number" step="0.01" placeholder="Amount" value="${component.amount ?? ""}">
    <button class="icon-button danger" type="button" data-remove-component title="Remove component">&times;</button>
  `;
  $("#component-editor").append(row);
  updateComponentColumn(row);
  if (options.focus) {
    row.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
    $("[name='componentName']", row).focus();
  }
}

function updateComponentColumn(column) {
  const isRatio = $("[name='calculationType']", column).value === "ratio";
  $("[name='ratio']", column).classList.toggle("hidden", !isRatio);
  $("[name='amount']", column).classList.toggle("hidden", isRatio);
}

async function resetPaymentForm() {
  $("#payment-period-form").reset();
  $("#payment-period-form [name='id']").value = "";
  $("[data-cancel='payment']").classList.add("hidden");
  const defaults = await api("/api/payments/periods/defaults");
  $("#payment-period-form [name='basicSalary']").value = defaults.basicSalary || "";
  $("#payment-period-form [name='normalTaxRate']").value = defaults.normalTaxRate ?? 43.31;
  $("#payment-period-form [name='specialTaxRate']").value = defaults.specialTaxRate ?? 49.5;
  renderComponentEditor(defaults.components);
}

function resetOneOffForm() {
  $("#one-off-form").reset();
  $("#one-off-form [name='id']").value = "";
  $("[data-cancel='one-off']").classList.add("hidden");
}

function resetDutyTypeForm() {
  $("#duty-type-form").reset();
  $("#duty-type-form [name='id']").value = "";
  setDutyTypePaidToggle(true);
  $("[data-cancel='duty-type']").classList.add("hidden");
}

function resetDeductionForm() {
  $("#deduction-form").reset();
  $("#deduction-form [name='id']").value = "";
  $("[data-cancel='deduction']").classList.add("hidden");
}
function resetBaseStationForm() {
  $("#base-station-form").reset();
  $("#base-station-form [name='id']").value = "";
  $("[data-cancel='base-station']").classList.add("hidden");
}

function resetAirportForm() {
  $("#airport-form").reset();
  $("#airport-form [name='id']").value = "";
  $("[data-cancel='airport']").classList.add("hidden");
}
function resetDutyForm() {
  $("#duty-form").reset();
  $("#duty-form [name='id']").value = "";
  setPaidToggle(false);
  $("[data-cancel='duty']").classList.add("hidden");
}
function setPaidToggle(paid) {
  const toggle = $("#paid-toggle");
  toggle.textContent = paid ? "Yes" : "No";
  toggle.setAttribute("aria-pressed", String(paid));
  toggle.classList.toggle("active", paid);
  $("#duty-form [name='paid']").value = paid ? "1" : "0";
}
function setDutyTypePaidToggle(paid) {
  const toggle = $("#duty-type-paid-toggle");
  toggle.textContent = paid ? "Yes" : "No";
  toggle.setAttribute("aria-pressed", String(paid));
  toggle.classList.toggle("active", paid);
  $("#duty-type-form [name='isPaid']").value = paid ? "1" : "0";
}

function fillForm(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input) input.value = value ?? "";
  }
}
function actionRow(values, id) {
  const tr = tableRow(values);
  tr.append(iconCell("&#9998;", "Edit", "edit", id), iconCell("&times;", "Delete", "delete", id, true));
  return tr;
}
function iconCell(symbol, title, action, id, danger = false) {
  const td = document.createElement("td");
  td.className = "action-cell";
  td.innerHTML = `<button class="icon-button ${danger ? "danger" : ""}" data-action="${action}" data-id="${id}" title="${title}" aria-label="${title}">${symbol}</button>`;
  return td;
}
function tableHeader(values) {
  const tr = document.createElement("tr");
  for (const value of values) {
    const th = document.createElement("th");
    th.textContent = value;
    tr.append(th);
  }
  return tr;
}
function tableRow(values, duplicate = false) {
  const tr = document.createElement("tr");
  if (duplicate) tr.classList.add("duplicate");
  for (const value of values) {
    const td = document.createElement("td");
    td.textContent = value ?? "";
    tr.append(td);
  }
  return tr;
}
function showPage(name) {
  $$("[data-page-button]").forEach((button) => button.classList.toggle("active", button.dataset.pageButton === name));
  $$("[data-page]").forEach((page) => page.classList.toggle("active", page.dataset.page === name));
  history.replaceState(null, "", `#${name}`);
}
function showPanel(page, name) {
  $$("[data-panel-button]", page).forEach((button) => button.classList.toggle("active", button.dataset.panelButton === name));
  $$("[data-panel]", page).forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}
function formatCoordinate(value) {
  const compact = String(value || "").toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^([NS])(\d{1,2})(\d{2}(?:\.\d+)?)([EW])(\d{1,3})(\d{2}(?:\.\d+)?)$/);
  if (!match) return String(value || "").toUpperCase();
  return `${match[1]} ${match[2].padStart(2, "0")} ${match[3]} ${match[4]} ${match[5].padStart(3, "0")} ${match[6]}`;
}
function minutesToDuration(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
function formatImportStatus(rows, duplicates, skipped = 0) {
  const parts = [`${rows} importable rows found`, `${duplicates} duplicates`];
  if (skipped) parts.push(`${skipped} before 2011-06-01 skipped`);
  return `${parts.join(", ")}.`;
}
function formatPaymentComponent(component) {
  if (component.calculationType === "ratio") {
    return new Intl.NumberFormat("en-NL", { style: "percent", maximumFractionDigits: 4 }).format(component.ratio || 0);
  }
  return money(component.amount);
}
function money(value) {
  return new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function restoreFlightDateFilter() {
  const date = sessionStorage.getItem("flightDateFilter");
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? { date, label: date } : null;
}

const initialPage = location.hash.slice(1);
if (initialPage && $("[data-page='" + initialPage + "']")) showPage(initialPage);
await loadAll();
await resetPaymentForm();
const now = new Date();
$("#calculation-month").value =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
await calculatePayment();

async function loadAll() {
  await Promise.all([
    loadDashboard(),
    loadAirports(),
    loadDuties(),
    loadPaymentPeriods(),
    loadOneOffPayments(),
    loadDeductions(),
    loadStatistics(),
    loadBaseStations(),
    loadIssues()
  ]);
}

let pendingImport = null;
let airports = [];
let duties = [];
let paymentPeriods = [];
let dutyFilter = "all";

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
$("#add-component").addEventListener("click", () => addComponentRow());
$("#paid-toggle").addEventListener("click", () => {
  const paid = $("#duty-form [name='paid']").value !== "1";
  setPaidToggle(paid);
});
for (const button of $("[data-duty-filter]")) {
  button.addEventListener("click", () => {
    dutyFilter = button.dataset.dutyFilter;
    $("[data-duty-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderDuties();
  });
}
$("[data-cancel='airport']").addEventListener("click", resetAirportForm);
$("[data-cancel='duty']").addEventListener("click", resetDutyForm);
$("[data-cancel='payment']").addEventListener("click", resetPaymentForm);

$("#airport-form [name='lidoCoordinate']").addEventListener("blur", (event) => {
  event.target.value = formatCoordinate(event.target.value);
});

$("#airports-body").addEventListener("click", handleAirportAction);
$("#duties-body").addEventListener("click", handleDutyAction);
$("#payment-periods-body").addEventListener("click", handlePaymentAction);
$("#component-editor").addEventListener("click", (event) => {
  if (event.target.closest("[data-remove-component]")) {
    event.target.closest(".component-row").remove();
  }
});

async function previewImport(event) {
  event.preventDefault();
  const status = $("#preview-status");
  status.textContent = "Reading file...";
  $("#commit-button").disabled = true;
  const response = await fetch("/api/imports/preview", { method: "POST", body: new FormData(event.target) });
  const result = await response.json();

  if (!response.ok) {
    status.textContent = result.error || "Could not read file.";
    pendingImport = null;
    renderPreview([]);
    return;
  }

  pendingImport = result;
  const duplicateCount = result.flights.filter((flight) => flight.duplicate).length;
  status.textContent = formatImportStatus(result.rowCount, duplicateCount, result.skippedBeforeCutoff);
  $("#commit-button").disabled = result.flights.length === 0;
  renderPreview(result.flights);
}

async function commitImport() {
  if (!pendingImport) return;
  const response = await api("/api/imports/commit", {
    method: "POST",
    body: JSON.stringify({ previewToken: pendingImport.previewToken })
  });
  $("#preview-status").textContent =
    `${response.insertedCount} inserted, ${response.duplicateCount} duplicates skipped, ${response.skippedBeforeCutoff || 0} before cutoff skipped.`;
  pendingImport = null;
  $("#commit-button").disabled = true;
  await loadAll();
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
  const components = $$(".component-row", $("#component-editor")).map((row) => ({
    code: $("[name='componentCode']", row).value,
    name: $("[name='componentName']", row).value,
    calculationType: $("[name='calculationType']", row).value,
    ratio: $("[name='ratio']", row).value,
    amount: $("[name='amount']", row).value
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
      await api(`/api/airports/${airport.id}`, { method: "DELETE" });
      await Promise.all([loadAirports(), loadIssues()]);
    } catch (error) {
      $("#airport-status").textContent = error.message;
    }
  }
}

async function handleDutyAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const duty = duties.find((item) => item.id === Number(button.dataset.id));
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
  const [summary, flights] = await Promise.all([api("/api/flights/summary"), api("/api/flights?limit=50")]);
  $("#total-flights").textContent = summary.totalFlights || 0;
  $("#date-range").textContent = summary.firstDate && summary.lastDate ? `${summary.firstDate} - ${summary.lastDate}` : "-";
  $("#total-time").textContent = minutesToDuration(summary.totalMinutes || 0);
  $("#flights-body").replaceChildren(...flights.map((flight) => tableRow([
    flight.flightDate, flight.flightNumber || "-", `${flight.departureAirport} -> ${flight.arrivalAirport}`,
    `${flight.departureTime || "-"} - ${flight.arrivalTime || "-"}`,
    flight.aircraftType || "-", flight.aircraftRegistration || "-",
    flight.distanceNm == null ? "Missing airport" : `${Math.round(flight.distanceNm)} nm`,
    flight.sourceFormat
  ])));
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
  const select = $("#duty-form [name='dutyTypeId']");
  const selected = select.value;
  select.replaceChildren(new Option("Select duty", ""), ...types.map((type) => new Option(type.name, type.id)));
  select.value = selected;
  renderDuties();
}

async function loadPaymentPeriods() {
  paymentPeriods = await api("/api/payments/periods");
  $("#payment-periods-body").replaceChildren(...paymentPeriods.map((period) => actionRow([
    period.effectiveDate,
    money(period.basicSalary),
    period.components.map((item) =>
      item.calculationType === "ratio" ? `${item.name}: ${item.ratio}` : `${item.name}: ${money(item.amount)}`
    ).join(", ")
  ], period.id)));
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
    });
    return button;
  }));
}

function renderDuties() {
  const filtered = duties.filter((duty) =>
    dutyFilter === "all" ||
    (dutyFilter === "paid" && duty.paid) ||
    (dutyFilter === "unpaid" && !duty.paid)
  );
  $("#duties-body").replaceChildren(...filtered.map((duty) =>
    actionRow([duty.dutyDate, duty.dutyName, duty.paid ? "Yes" : "No"], duty.id)
  ));
}

function renderPreview(flights) {
  $("#preview-table").classList.toggle("hidden", flights.length === 0);
  $("#preview-body").replaceChildren(...flights.slice(0, 100).map((flight) => tableRow([
    flight.flightDate, flight.flightNumber || "-", `${flight.departureAirport} -> ${flight.arrivalAirport}`,
    `${flight.departureTime || "-"} - ${flight.arrivalTime || "-"}`,
    flight.aircraftType || "-", flight.aircraftRegistration || "-", flight.duplicate ? "Duplicate" : "New"
  ], flight.duplicate)));
}

function renderComponentEditor(components = []) {
  $("#component-editor").replaceChildren();
  for (const component of components) addComponentRow(component);
}

function addComponentRow(component = {}) {
  const row = document.createElement("div");
  row.className = "component-row";
  row.innerHTML = `
    <input name="componentCode" type="hidden" value="${escapeHtml(component.code || "")}">
    <input name="componentName" placeholder="Component name" value="${escapeHtml(component.name || "")}" required>
    <select name="calculationType">
      <option value="ratio" ${component.calculationType !== "fixed" ? "selected" : ""}>Ratio of basic salary</option>
      <option value="fixed" ${component.calculationType === "fixed" ? "selected" : ""}>Fixed amount</option>
    </select>
    <input name="ratio" type="number" step="0.000001" placeholder="Ratio" value="${component.ratio ?? ""}">
    <input name="amount" type="number" step="0.01" placeholder="Amount" value="${component.amount ?? ""}">
    <button class="icon-button danger" type="button" data-remove-component title="Remove component">&times;</button>
  `;
  $("#component-editor").append(row);
}

async function resetPaymentForm() {
  $("#payment-period-form").reset();
  $("#payment-period-form [name='id']").value = "";
  $("[data-cancel='payment']").classList.add("hidden");
  const defaults = await api("/api/payments/periods/defaults");
  $("#payment-period-form [name='basicSalary']").value = defaults.basicSalary || "";
  renderComponentEditor(defaults.components);
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
function money(value) {
  return new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

const initialPage = location.hash.slice(1);
if (initialPage && $("[data-page='" + initialPage + "']")) showPage(initialPage);
await loadAll();
await resetPaymentForm();

async function loadAll() {
  await Promise.all([loadDashboard(), loadAirports(), loadDuties(), loadPaymentPeriods(), loadIssues()]);
}

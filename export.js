// Builds a formatted .xlsx workbook that opens cleanly in Google Sheets and Excel.
const ExcelJS = require("exceljs");

const BRAND = "FF1F2A37";
const LEAD_FILL = "FFFEF3C7";
const CUSTOMER_FILL = "FFDCFCE7";
const MONEY = '"$"#,##0.00';

const servicesTotal = c => (c.services ?? []).reduce((s, x) => s + (parseFloat(x.price) || 0), 0);
const serviceNames = c => (c.services ?? []).map(s => s.type).filter(Boolean).join(", ");
// Spreadsheets have no time zones: store the local wall-clock time as-is,
// otherwise a 2:00 PM meeting in Toronto would show as 6:00 PM.
function toDate(v) {
  if (!v) return null;
  const d = new Date(v.length === 10 ? v + "T00:00" : v);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
}

function styleSheet(ws, columns) {
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.style ?? {} }));
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle" };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

function zebra(ws) {
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    if (i % 2 === 0) row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
    });
  });
}

const DATE_TIME = { numFmt: "yyyy-mm-dd hh:mm" };
const DATE = { numFmt: "yyyy-mm-dd" };

const contactColumns = (priceLabel) => [
  { header: "Name", key: "name", width: 22 },
  { header: "Phone", key: "phone", width: 16 },
  { header: "Email", key: "email", width: 24 },
  { header: "Address", key: "address", width: 42 },
  { header: "City", key: "city", width: 15 },
  { header: "Province", key: "province", width: 9 },
  { header: "Postal code", key: "postalCode", width: 12 },
  { header: "Services", key: "services", width: 30 },
  { header: priceLabel, key: "total", width: 14, style: { numFmt: MONEY } },
  { header: "Next service due", key: "nextService", width: 18, style: DATE },
  { header: "Next meeting", key: "nextMeeting", width: 18, style: DATE_TIME },
  { header: "Meeting reason", key: "meetingReason", width: 24 },
  { header: "Tags", key: "tags", width: 18 },
  { header: "Extra notes", key: "notes", width: 40 },
];

const contactRow = c => ({
  name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode,
  services: serviceNames(c), total: servicesTotal(c),
  nextService: toDate(c.nextServiceDate), nextMeeting: toDate(c.nextMeetingDate), meetingReason: c.nextMeetingReason,
  tags: (c.tags ?? []).join(", "), notes: c.notes,
});

async function buildWorkbook(data, stats) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Simple CRM";
  wb.created = new Date();
  const contacts = data.contacts ?? [];
  const leads = contacts.filter(c => c.kind === "lead").sort((a, b) => a.name.localeCompare(b.name));
  const customers = contacts.filter(c => c.kind === "customer").sort((a, b) => a.name.localeCompare(b.name));

  // --- Summary ---
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: BRAND } } });
  sum.columns = [{ width: 34 }, { width: 20 }];
  sum.addRow(["Simple CRM export"]).font = { bold: true, size: 16 };
  sum.addRow([`Exported ${new Date().toLocaleString("en-CA")}`]).font = { color: { argb: "FF66727F" } };
  sum.addRow([]);
  const rows = [
    ["Customers", stats.customers],
    ["Leads", stats.leads],
    ["Leads not contacted yet", stats.notContacted],
    ["New leads this month", stats.leadsThisMonth],
    ["New customers this month", stats.customersThisMonth],
    ["Monthly revenue (customers)", stats.revenue, MONEY],
    ["Potential monthly revenue (all)", stats.potential, MONEY],
  ];
  for (const [label, value, fmt] of rows) {
    const r = sum.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    if (fmt) r.getCell(2).numFmt = fmt;
  }

  // --- Customers & Leads ---
  const cust = wb.addWorksheet("Customers", { properties: { tabColor: { argb: "FF15803D" } } });
  styleSheet(cust, [...contactColumns("Service price"), { header: "Customer since", key: "since", width: 15, style: DATE }]);
  customers.forEach(c => cust.addRow({ ...contactRow(c), since: toDate(c.becameCustomerAt) }));
  zebra(cust);

  const lead = wb.addWorksheet("Leads", { properties: { tabColor: { argb: "FFB45309" } } });
  styleSheet(lead, [...contactColumns("Quote amount"),
    { header: "Lead source", key: "source", width: 16 },
    { header: "Contacted", key: "contacted", width: 11 },
    { header: "Added", key: "added", width: 13, style: DATE }]);
  leads.forEach(c => {
    const row = lead.addRow({ ...contactRow(c), source: c.leadSource, contacted: c.contacted ? "Yes" : "No", added: toDate(c.createdAt) });
    if (!c.contacted) row.getCell("contacted").font = { bold: true, color: { argb: "FFC62828" } };
  });
  zebra(lead);

  // --- One row per service ---
  const svc = wb.addWorksheet("Services");
  styleSheet(svc, [
    { header: "Name", key: "name", width: 22 },
    { header: "Type", key: "kind", width: 11 },
    { header: "City", key: "city", width: 15 },
    { header: "Service", key: "service", width: 20 },
    { header: "Price / quote", key: "price", width: 14, style: { numFmt: MONEY } },
    { header: "Next service due", key: "nextService", width: 18, style: DATE },
  ]);
  for (const c of [...customers, ...leads]) {
    for (const s of c.services ?? []) {
      const row = svc.addRow({ name: c.name, kind: c.kind === "lead" ? "Lead" : "Customer", city: c.city,
        service: s.type, price: parseFloat(s.price) || 0, nextService: toDate(c.nextServiceDate) });
      row.getCell("kind").fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.kind === "lead" ? LEAD_FILL : CUSTOMER_FILL } };
    }
  }

  // --- Activity log ---
  const act = wb.addWorksheet("Activity log");
  styleSheet(act, [
    { header: "Date", key: "date", width: 18, style: DATE_TIME },
    { header: "Name", key: "name", width: 22 },
    { header: "Type", key: "type", width: 12 },
    { header: "Details", key: "text", width: 60 },
  ]);
  contacts.flatMap(c => (c.activities ?? []).map(a => ({ date: toDate(a.date), name: c.name, type: a.type, text: a.text })))
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
    .forEach(r => act.addRow(r));
  zebra(act);

  return wb;
}

module.exports = { buildWorkbook };

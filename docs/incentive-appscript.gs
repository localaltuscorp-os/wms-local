/******************************************************************************
 * ALTUS — Sheet-based Incentives web app (SINGLE deployment for ALL schemes)
 *
 * One spreadsheet, one script, one URL. Import these 3 tabs into ONE
 * spreadsheet, paste this script, then:
 *   Deploy ▸ New deployment ▸ Web app
 *     • Execute as:    Me
 *     • Who has access: Anyone        ← required, or the app's sync times out
 * Copy the /exec URL → that's INCENTIVE_SHEETS_WEBAPP_URL for the app.
 *
 * Endpoint:  GET  ?action=getLeads   → JSON:
 *   {
 *     qualifiedLeads:   [{date, invite, employee, participant, prospect}],
 *     participantLeads: [{date, invite, employee, participant, prospect}],
 *     psSold:           [{scheme, date, month, employee, participant, prospect, amount}]
 *   }
 *
 * Per-scheme columns (data rows start where noted):
 *   10 Qualified Leads — QL: Date=M, status=L("Yes"), Employee=R, Participant=Q,
 *                            Prospect=C+" "+D
 *   10 Referrals       — QL: Date=O, status=N("Done"), Employee=R, Participant=Q,
 *                            Prospect=C+" "+D
 *   PS Sold in 30 Days — match QL prospect LAST NAME to Billing E within 30 days
 *                            of the QL qualified date (M). Date=Billing C,
 *                            Employee=QL R, Participant=QL Q, Prospect=QL C+" "+D
 *   PS Sold via Social — Zoom Social(O)="Yes" & Zoom last name (E) matches Billing
 *                            last name (G). Date=Billing C, Employee=fixed,
 *                            Participant=Zoom P, Prospect=Billing F+" "+G
 *
 * >>> SET the two AMOUNTS, and VERIFY every column letter below. <<<
 *****************************************************************************/

var CFG = {
  sheets: { qualifiedLeads: 'Qualified Leads', billing: 'Billing', zoom: 'Zoom' },

  // Fixed incentive paid per match (₹).
  amounts: { ps_sold_30d: 250, ps_sold_social: 1000 },

  // ── Qualified Leads tab (data starts row 5) ───────────────────────────────
  ql: {
    firstRow:      5,
    dateQualified: 'M',   // M5:M — date for the qualified-lead scheme + 30-day window
    dateReferral:  'O',   // O5:O — date for the referral scheme
    qualified:     'L',   // status cell = "Yes"  → qualified
    referral:      'N',   // status cell = "Done" → referral
    employee:      'R',   // R5:R — the earner
    participant:   'Q',   // Q5:Q — Participant Name + grouping key
    prospectFirst: 'C',   // Prospect Name = C + " " + D
    prospectLast:  'D',
  },

  // ── Billing tab (data starts row 2) ──  *** VERIFY column letters ***
  billing: {
    firstRow:    2,
    date:        'C',   // C2:C — billing date (= "Date" shown on PS entries)
    name30:      'E',   // last name matched to the QL prospect (30-day scheme)
    socialFirst: 'F',   // social Prospect Name = F + " " + G
    socialLast:  'G',   // last name matched to the Zoom person + 2nd half of prospect
  },

  // ── Zoom tab (data starts row 2) ──  *** VERIFY column letters ***
  zoom: {
    firstRow:    2,
    last:        'E',   // last name matched to Billing G
    participant: 'P',   // P2:P — Participant Name
    social:      'O',   // "Yes" => sold through social media
  },

  socialEmployee: 'Rohan Choudhary',  // default PS-Sold-Social earner
};

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'getLeads';
    if (action !== 'getLeads') return _json({ error: 'Unknown action: ' + action });
    return _json({
      qualifiedLeads:   _leads('qualified'),
      participantLeads: _leads('referral'),
      psSold:           [].concat(_psSold30(), _psSoldSocial()),
    });
  } catch (err) {
    return _json({ error: String((err && err.message) || err) });
  }
}

/* ───────────────────────────── helpers ──────────────────────────────────── */
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _col(L) { var n = 0; L = String(L).toUpperCase(); for (var i = 0; i < L.length; i++) n = n * 26 + (L.charCodeAt(i) - 64); return n - 1; }
function _grid(name) { var sh = SpreadsheetApp.getActive().getSheetByName(name); if (!sh) throw new Error('Sheet not found: ' + name); return sh.getDataRange().getValues(); }
function _date(v) { if (v instanceof Date) return v; var p = new Date(v); return isNaN(p) ? null : p; }
function _mmm(v) { var d = _date(v); return d ? Utilities.formatDate(d, 'Asia/Kolkata', 'MMM-yy') : ''; }
function _last(s) { var p = String(s == null ? '' : s).trim().toLowerCase().split(/\s+/); return p.length ? p[p.length - 1] : ''; }
function _join(a, b) { return (String(a == null ? '' : a).trim() + ' ' + String(b == null ? '' : b).trim()).trim(); }

/* ───────────────── 10 Qualified Leads / 10 Referrals ─────────────────────── */
function _leads(kind) {
  var g = _grid(CFG.sheets.qualifiedLeads), c = CFG.ql, out = [];
  var statusCol = kind === 'qualified' ? c.qualified : c.referral;
  var dateCol   = kind === 'qualified' ? c.dateQualified : c.dateReferral;
  var want      = kind === 'qualified' ? 'yes' : 'done';
  for (var i = c.firstRow - 1; i < g.length; i++) {
    var row = g[i]; if (!row) continue;
    if (String(row[_col(statusCol)] || '').toLowerCase().trim() !== want) continue;
    out.push({
      date:        row[_col(dateCol)],
      invite:      want,
      employee:    row[_col(c.employee)],
      participant: row[_col(c.participant)],
      prospect:    _join(row[_col(c.prospectFirst)], row[_col(c.prospectLast)]),
    });
  }
  return out;
}

/* ─────── PS Sold in 30 Days (Qualified Leads × Billing, last-name match) ──── */
function _psSold30() {
  var ql = _grid(CFG.sheets.qualifiedLeads), bg = _grid(CFG.sheets.billing);
  var q = CFG.ql, b = CFG.billing, out = [], seen = {};
  // billing last name -> [billing dates]
  var bills = {};
  for (var j = b.firstRow - 1; j < bg.length; j++) {
    var br = bg[j]; if (!br) continue;
    var last = _last(br[_col(b.name30)]); if (!last) continue;
    var d = _date(br[_col(b.date)]); if (!d) continue;
    (bills[last] = bills[last] || []).push(d);
  }
  for (var i = q.firstRow - 1; i < ql.length; i++) {
    var r = ql[i]; if (!r) continue;
    var employee = String(r[_col(q.employee)] || '').trim(); if (!employee) continue;
    var prospect = _join(r[_col(q.prospectFirst)], r[_col(q.prospectLast)]);
    var pl = _last(prospect); if (!pl) continue;
    var lead = _date(r[_col(q.dateQualified)]); if (!lead) continue;
    var dates = bills[pl] || [], soldDate = null;
    for (var k = 0; k < dates.length; k++) {
      var diff = (dates[k] - lead) / 86400000; // days
      if (diff >= 0 && diff <= 30) { soldDate = dates[k]; break; }
    }
    if (!soldDate) continue;
    var key = pl + '|' + _mmm(soldDate) + '|' + employee.toLowerCase(); if (seen[key]) continue; seen[key] = 1;
    out.push({
      scheme: 'ps_sold_30d', date: soldDate, month: _mmm(soldDate),
      employee: employee, participant: String(r[_col(q.participant)] || '').trim(),
      prospect: prospect, amount: CFG.amounts.ps_sold_30d,
    });
  }
  return out;
}

/* ─────── PS Sold through Social Media (Zoom × Billing, last-name match) ───── */
function _psSoldSocial() {
  var zg = _grid(CFG.sheets.zoom), bg = _grid(CFG.sheets.billing);
  var z = CFG.zoom, b = CFG.billing, out = [], seen = {};
  // billing last name -> {date, name}
  var byLast = {};
  for (var j = b.firstRow - 1; j < bg.length; j++) {
    var br = bg[j]; if (!br) continue;
    var last = _last(br[_col(b.socialLast)]); if (!last) continue;
    if (!byLast[last]) byLast[last] = { date: _date(br[_col(b.date)]), name: _join(br[_col(b.socialFirst)], br[_col(b.socialLast)]) };
  }
  for (var i = z.firstRow - 1; i < zg.length; i++) {
    var r = zg[i]; if (!r) continue;
    if (String(r[_col(z.social)] || '').trim().toUpperCase() !== 'YES') continue;
    var last = String(r[_col(z.last)] || '').trim().toLowerCase(); if (!last) continue;
    var hit = byLast[last]; if (!hit) continue;
    if (seen[last]) continue; seen[last] = 1;
    out.push({
      scheme: 'ps_sold_social', date: hit.date, month: _mmm(hit.date),
      employee: CFG.socialEmployee, participant: String(r[_col(z.participant)] || '').trim(),
      prospect: hit.name, amount: CFG.amounts.ps_sold_social,
    });
  }
  return out;
}

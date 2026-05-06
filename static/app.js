// SwyfTech Discovery — frontend logic
// Pure vanilla JS. No build step, no framework.

const TEXT_FIELDS = [
  "company", "contact", "role", "contact_email", "contact_phone",
  "pain_points", "tech_stack", "top_priority", "decision_makers",
  "budget", "extra_notes",
];

const CHIP_FIELDS = ["industry", "headcount", "current_it", "timeline"];

const HISTORY_KEY_OLD = "wolfden.discovery.history";
const HISTORY_KEY = "swyftech.discovery.history";
const HISTORY_LIMIT = 50;
const LOGO_KEY = "swyftech.discovery.logo";
const SETTINGS_KEY = "swyftech.discovery.settings";

const state = {
  industry: null,
  headcount: null,
  current_it: null,
  timeline: null,
  locations: 1,
  meeting_id: null,
  meta: "",
  config: { sender_location: "", sender_name: "", model: "" },
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));


// ---- formatting helpers --------------------------------------------------

function fmtDate(d) {
  return (d || new Date()).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtMeta() {
  const date = fmtDate();
  if (state.config.sender_location) {
    return `${date} · ${state.config.sender_location}`;
  }
  return date;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}


// ---- form state read/write ----------------------------------------------

function getNotes() {
  const n = {};
  TEXT_FIELDS.forEach((f) => {
    n[f] = $(f).value.trim();
  });
  CHIP_FIELDS.forEach((f) => {
    n[f] = state[f] || "";
  });
  n.locations = state.locations;
  n.meta = state.meta;
  n.industry_other = $("industry_other").value.trim();
  if (n.industry === "Other" && n.industry_other) n.industry = n.industry_other;
  return n;
}

function setNotes(n) {
  TEXT_FIELDS.forEach((f) => {
    $(f).value = n[f] || "";
  });
  CHIP_FIELDS.forEach((f) => {
    state[f] = n[f] || null;
    $$(`[data-field="${f}"] .chip`).forEach((c) => {
      c.classList.toggle("on", c.dataset.value === state[f]);
    });
  });
  state.locations = Number(n.locations) || 1;
  $("locations").textContent = state.locations;
  state.meta = n.meta || fmtMeta();
  $("meta").textContent = state.meta;
  const otherBox = $("industry_other");
  if (state.industry === "Other" && n.industry_other) {
    otherBox.value = n.industry_other;
    otherBox.style.display = "";
  } else {
    otherBox.value = "";
    otherBox.style.display = "none";
  }
  updateScore();
}

function clearForm() {
  TEXT_FIELDS.forEach((f) => ($(f).value = ""));
  CHIP_FIELDS.forEach((f) => {
    state[f] = null;
    $$(`[data-field="${f}"] .chip.on`).forEach((c) => c.classList.remove("on"));
  });
  state.locations = 1;
  $("locations").textContent = "1";
  $("industry_other").value = "";
  $("industry_other").style.display = "none";
  state.meeting_id = null;
  updateScore();
  state.meta = fmtMeta();
  $("meta").textContent = state.meta;
  window.scrollTo({ top: 0, behavior: "smooth" });
}


// ---- chip & stepper interactions ----------------------------------------

$$(".chips").forEach((group) => {
  const field = group.dataset.field;
  group.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip || !group.contains(chip)) return;
    const wasOn = chip.classList.contains("on");
    group.querySelectorAll(".chip.on").forEach((c) => c.classList.remove("on"));
    if (!wasOn) {
      chip.classList.add("on");
      state[field] = chip.dataset.value;
    } else {
      state[field] = null;
    }
    if (field === "industry") {
      const box = $("industry_other");
      const show = state.industry === "Other";
      box.style.display = show ? "" : "none";
      if (show) box.focus();
      else box.value = "";
    }
    updateScore();
  });
});

$$(".step").forEach((b) => {
  b.addEventListener("click", () => {
    const delta = parseInt(b.dataset.step, 10);
    state.locations = Math.max(1, state.locations + delta);
    $("locations").textContent = state.locations;
  });
});


// ---- history (localStorage) ---------------------------------------------

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeHistory(arr) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_LIMIT)));
  } catch (e) {
    console.warn("Could not write history", e);
  }
}

function saveCurrent() {
  const notes = getNotes();
  if (!notes.company) {
    toast("Add a company name first");
    return;
  }
  const history = loadHistory();
  if (state.meeting_id) {
    const idx = history.findIndex((h) => h.id === state.meeting_id);
    if (idx >= 0) {
      history[idx] = { ...history[idx], notes, updated: Date.now() };
    } else {
      // record was deleted elsewhere; create fresh
      state.meeting_id = "m_" + Date.now();
      history.unshift({
        id: state.meeting_id,
        notes,
        created: Date.now(),
        updated: Date.now(),
      });
    }
  } else {
    state.meeting_id = "m_" + Date.now();
    history.unshift({
      id: state.meeting_id,
      notes,
      created: Date.now(),
      updated: Date.now(),
    });
  }
  writeHistory(history);
  toast("Saved");
}

function openHistory() {
  const list = $("historyList");
  const history = loadHistory();
  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">No saved meetings yet</div>';
  } else {
    list.innerHTML = history
      .map((h) => `
        <div class="history-item" data-id="${h.id}">
          <span class="history-company">${escapeHtml(h.notes.company || "(unnamed)")}</span>
          <span class="history-meta">${fmtDate(new Date(h.updated))}</span>
        </div>
      `)
      .join("");
    list.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", () => {
        const h = history.find((x) => x.id === item.dataset.id);
        if (h) {
          setNotes(h.notes);
          state.meeting_id = h.id;
          closeModal("historyModal");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
  }
  $("historyModal").classList.remove("hidden");
}


// ---- modals --------------------------------------------------------------

function closeModal(id) {
  $(id).classList.add("hidden");
}

$$(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.add("hidden");
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $$(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
  }
});


// ---- draft email ---------------------------------------------------------

let inFlightController = null;

async function draftEmail() {
  const notes = getNotes();
  if (!notes.company) {
    toast("Add a company name first");
    return;
  }

  $("modal").classList.remove("hidden");
  $("draftStatus").classList.remove("error");
  $("draftStatus").textContent = "Drafting via Ollama…";
  $("draftText").value = "";
  $("draftBtn").disabled = true;
  $("regenBtn").disabled = true;

  if (inFlightController) inFlightController.abort();
  inFlightController = new AbortController();

  try {
    const settings = loadSettings();
    const payload = Object.assign({}, notes, {
      _ollama_url:   settings.ollama_url   || undefined,
      _ollama_model: settings.ollama_model || undefined,
      _sender_name:  settings.sender_name  || undefined,
      _sender_title: settings.sender_title || undefined,
      _sender_email: settings.sender_email || undefined,
      _sender_phone: settings.sender_phone || undefined,
      _msp_name:     settings.msp_name     || undefined,
    });
    const resp = await fetch("/api/draft-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: inFlightController.signal,
    });
    const data = await resp.json();
    if (resp.ok) {
      $("draftText").value = data.draft;
      $("draftStatus").textContent =
        `Draft from ${data.model}. Edit before sending.`;
    } else {
      $("draftStatus").classList.add("error");
      $("draftStatus").textContent = data.error || "Draft failed";
    }
  } catch (e) {
    if (e.name === "AbortError") return;
    $("draftStatus").classList.add("error");
    $("draftStatus").textContent = "Network error: " + e.message;
  } finally {
    $("draftBtn").disabled = false;
    $("regenBtn").disabled = false;
  }
}


// ---- toast ---------------------------------------------------------------

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  // Force reflow so re-adding the class re-triggers the transition
  t.offsetHeight;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}


// ---- wire up buttons ----------------------------------------------------

$("saveBtn").addEventListener("click", saveCurrent);
$("draftBtn").addEventListener("click", draftEmail);

$("newBtn").addEventListener("click", () => {
  // Only confirm if there's anything to lose
  const hasContent =
    TEXT_FIELDS.some((f) => $(f).value.trim()) ||
    CHIP_FIELDS.some((f) => state[f]) ||
    state.locations !== 1;
  if (!hasContent || confirm("Start a new meeting? Unsaved changes will be lost.")) {
    clearForm();
  }
});

$("historyBtn").addEventListener("click", openHistory);
$("modalClose").addEventListener("click", () => closeModal("modal"));
$("historyClose").addEventListener("click", () => closeModal("historyModal"));

$("copyBtn").addEventListener("click", async () => {
  const text = $("draftText").value;
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    // fallback: select the textarea
    $("draftText").select();
    document.execCommand("copy");
    toast("Copied");
  }
});

$("mailBtn").addEventListener("click", () => {
  const notes = getNotes();
  const to = notes.contact_email || "";
  const subject = `Following up — ${notes.company || ""}`;
  const body = $("draftText").value;
  window.location.href =
    `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
});

$("regenBtn").addEventListener("click", draftEmail);


// ---- lead score ---------------------------------------------------------

const SCORE_TIMELINE  = { "ASAP": 3, "30 days": 2, "60–90 days": 1, "Exploring": 0 };
const SCORE_CURRENT_IT = { "No one": 2, "Break-fix vendor": 2, "Another MSP": 1, "Internal hire": 1 };
const SCORE_HEADCOUNT  = { "1–10": 0, "11–25": 1, "26–50": 1, "51–100": 2, "100+": 2 };

function calcScore() {
  let s = 0;
  s += SCORE_TIMELINE[state.timeline]    ?? 0;
  s += SCORE_CURRENT_IT[state.current_it] ?? 0;
  s += SCORE_HEADCOUNT[state.headcount]   ?? 0;
  if ($("pain_points").value.trim())  s += 1;
  if ($("budget").value.trim())       s += 1;
  if ($("top_priority").value.trim()) s += 1;
  return s;
}

function updateScore() {
  const el = $("leadScore");
  const hasAny = state.timeline || state.current_it || state.headcount ||
                 $("pain_points").value.trim() || $("budget").value.trim() ||
                 $("top_priority").value.trim();
  if (!hasAny) {
    el.textContent = "–";
    el.className = "lead-score lead-score--empty";
    el.title = "Lead score — fill in the form to see a score";
    return;
  }
  const score = calcScore();
  el.textContent = score;
  el.className = "lead-score " + (score >= 7 ? "lead-score--high" : score >= 4 ? "lead-score--mid" : "lead-score--low");
  el.title = [
    `Lead score: ${score}/10`,
    `Timeline:   ${SCORE_TIMELINE[state.timeline]    ?? 0}/3`,
    `Current IT: ${SCORE_CURRENT_IT[state.current_it] ?? 0}/2`,
    `Headcount:  ${SCORE_HEADCOUNT[state.headcount]   ?? 0}/2`,
    `Engagement: ${($("pain_points").value.trim()?1:0) + ($("budget").value.trim()?1:0) + ($("top_priority").value.trim()?1:0)}/3`,
  ].join("\n");
}

["pain_points", "budget", "top_priority"].forEach((id) =>
  $(id).addEventListener("input", updateScore)
);


// ---- logo ---------------------------------------------------------------

function setLogo(dataUrl) {
  const img = $("logoImg");
  img.src = dataUrl;
  img.style.display = "";
  $("logoPlaceholder").style.display = "none";
}

$("logoInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    localStorage.setItem(LOGO_KEY, ev.target.result);
    setLogo(ev.target.result);
    toast("Logo saved");
  };
  reader.readAsDataURL(file);
});


// ---- settings -----------------------------------------------------------

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}

function applySettings(s) {
  if (s.msp_name) {
    $("brandMark").textContent = s.msp_name;
    document.title = `${s.msp_name} discovery`;
  }
  if (s.sender_location) state.config.sender_location = s.sender_location;
  if (s.sender_name)     state.config.sender_name     = s.sender_name;
  if (s.ollama_model)    state.config.model            = s.ollama_model;
  state.meta = fmtMeta();
  $("meta").textContent = state.meta;
  if (s.ollama_model) $("modelFootnote").textContent = `Drafts via ${s.ollama_model}`;
}

function openSettings() {
  const s = loadSettings();
  $("settingsOllamaUrl").value      = s.ollama_url      || "";
  $("settingsOllamaModel").value    = s.ollama_model    || "";
  $("settingsSenderName").value     = s.sender_name     || "";
  $("settingsSenderTitle").value    = s.sender_title    || "";
  $("settingsSenderEmail").value    = s.sender_email    || "";
  $("settingsSenderPhone").value    = s.sender_phone    || "";
  $("settingsSenderLocation").value = s.sender_location || "";
  $("settingsMspName").value        = s.msp_name        || "";
  $("settingsModal").classList.remove("hidden");
}

function saveSettings() {
  const s = {
    ollama_url:      $("settingsOllamaUrl").value.trim(),
    ollama_model:    $("settingsOllamaModel").value.trim(),
    sender_name:     $("settingsSenderName").value.trim(),
    sender_title:    $("settingsSenderTitle").value.trim(),
    sender_email:    $("settingsSenderEmail").value.trim(),
    sender_phone:    $("settingsSenderPhone").value.trim(),
    sender_location: $("settingsSenderLocation").value.trim(),
    msp_name:        $("settingsMspName").value.trim(),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  applySettings(s);
  closeModal("settingsModal");
  toast("Settings saved");
}

$("settingsBtn").addEventListener("click", openSettings);
$("settingsSave").addEventListener("click", saveSettings);
$("settingsClose").addEventListener("click", () => closeModal("settingsModal"));


// ---- PDF export ---------------------------------------------------------

function buildPrintDoc(notes, score) {
  const s = loadSettings();
  const logo = localStorage.getItem(LOGO_KEY);
  const mspName = s.msp_name || document.title.replace(" discovery", "") || "SwyfTech";

  function row(label, value) {
    if (!value) return "";
    return `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`;
  }

  function section(title, rows) {
    const content = rows.filter(Boolean).join("");
    if (!content) return "";
    return `
      <div class="section">
        <h2>${escapeHtml(title)}</h2>
        <table>${content}</table>
      </div>`;
  }

  const scoreClass = score === null ? "score-empty" : score >= 7 ? "score-high" : score >= 4 ? "score-mid" : "score-low";
  const scoreLabel = score === null ? "–" : `${score}/10`;

  const locStr = notes.locations > 1 ? `${notes.locations} locations` : "1 location";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(notes.company || "Discovery notes")} — ${escapeHtml(mspName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12pt;
    color: #111;
    background: #fff;
    padding: 0;
  }
  .page { max-width: 720px; margin: 0 auto; padding: 48px 48px 64px; }

  /* header */
  .doc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 28px;
    padding-bottom: 18px;
    border-bottom: 2px solid #111;
    gap: 16px;
  }
  .doc-header-left { display: flex; align-items: center; gap: 14px; }
  .doc-logo { max-height: 44px; max-width: 140px; object-fit: contain; }
  .doc-msp { font-size: 11pt; font-weight: 600; color: #444; }
  .doc-date { font-size: 10pt; color: #666; margin-top: 3px; }
  .score-badge {
    font-size: 11pt;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .score-empty { background: #eee; color: #888; }
  .score-low   { background: #fee2e2; color: #991b1b; }
  .score-mid   { background: #fef3c7; color: #92400e; }
  .score-high  { background: #dcfce7; color: #166534; }

  /* company block */
  .company-block { margin-bottom: 24px; }
  .company-name { font-size: 22pt; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
  .company-meta { font-size: 10pt; color: #555; margin-top: 6px; }
  .company-meta span + span::before { content: " · "; }

  /* sections */
  .section { margin-bottom: 20px; break-inside: avoid; }
  h2 {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #777;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e5e5e5;
  }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; vertical-align: top; font-size: 11pt; line-height: 1.45; }
  td.label {
    width: 32%;
    font-size: 10pt;
    color: #666;
    padding-right: 12px;
    padding-top: 6px;
  }
  td:not(.label) { white-space: pre-wrap; }

  /* footer */
  .doc-footer {
    margin-top: 40px;
    padding-top: 14px;
    border-top: 1px solid #ddd;
    font-size: 9pt;
    color: #aaa;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    body { padding: 0; }
    .page { padding: 24px 32px 32px; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="doc-header">
    <div class="doc-header-left">
      ${logo ? `<img class="doc-logo" src="${logo}" alt="Logo"/>` : ""}
      <div>
        <div class="doc-msp">${escapeHtml(mspName)}</div>
        <div class="doc-date">${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
      </div>
    </div>
    <div class="score-badge ${scoreClass}">Lead score ${scoreLabel}</div>
  </div>

  <div class="company-block">
    <div class="company-name">${escapeHtml(notes.company || "Unnamed company")}</div>
    <div class="company-meta">
      ${notes.contact    ? `<span>${escapeHtml(notes.contact)}${notes.role ? `, ${notes.role}` : ""}</span>` : ""}
      ${notes.contact_email ? `<span>${escapeHtml(notes.contact_email)}</span>` : ""}
      ${notes.contact_phone ? `<span>${escapeHtml(notes.contact_phone)}</span>` : ""}
    </div>
  </div>

  ${section("Business profile", [
    row("Industry",  notes.industry),
    row("Headcount", notes.headcount),
    row("Locations", locStr),
  ])}

  ${section("Current IT", [
    row("Who handles it", notes.current_it),
    row("Pain points",    notes.pain_points),
    row("Tech stack",     notes.tech_stack),
  ])}

  ${section("Priorities & decision", [
    row("Timeline",        notes.timeline),
    row("Top priority",    notes.top_priority),
    row("Decision-makers", notes.decision_makers),
    row("Budget signal",   notes.budget),
  ])}

  ${notes.extra_notes ? section("Other notes", [row("Notes", notes.extra_notes)]) : ""}

  <div class="doc-footer">
    <span>${escapeHtml(mspName)} — Discovery notes</span>
    <span>Confidential</span>
  </div>
</div>
<script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`;
}

$("exportBtn").addEventListener("click", () => {
  const notes = getNotes();
  const score = (state.timeline || state.current_it || state.headcount ||
                 notes.pain_points || notes.budget || notes.top_priority)
    ? calcScore() : null;
  const win = window.open("", "_blank");
  if (!win) { toast("Allow pop-ups to export PDF"); return; }
  win.document.write(buildPrintDoc(notes, score));
  win.document.close();
});


// ---- init ---------------------------------------------------------------

// Migrate history from old brand key
(function () {
  if (!localStorage.getItem(HISTORY_KEY) && localStorage.getItem(HISTORY_KEY_OLD)) {
    localStorage.setItem(HISTORY_KEY, localStorage.getItem(HISTORY_KEY_OLD));
  }
})();

// Restore logo
const _savedLogo = localStorage.getItem(LOGO_KEY);
if (_savedLogo) setLogo(_savedLogo);

state.meta = fmtMeta();
$("meta").textContent = state.meta;

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    state.config = cfg || {};
    if (cfg.msp_name) {
      $("brandMark").textContent = cfg.msp_name;
      document.title = `${cfg.msp_name} discovery`;
    }
    state.meta = fmtMeta();
    $("meta").textContent = state.meta;
    if (cfg.model) {
      $("modelFootnote").textContent = `Drafts via ${cfg.model}`;
    }
    // Local settings override server config
    applySettings(loadSettings());
  })
  .catch(() => {
    applySettings(loadSettings());
  });

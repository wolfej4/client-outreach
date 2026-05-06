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
  signals: [],
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
  n.signals = state.signals.slice();
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
  state.signals = Array.isArray(n.signals) ? n.signals : [];
  renderSignalLog();
  updateSuggestions();
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
  state.signals = [];
  renderSignalLog();
  updateSuggestions();
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


// ---- proposal & ROI assist ----------------------------------------------

const SOLUTIONS = [
  {
    id: "backup",    label: "Backup & Disaster Recovery",    short: "Backup & DR",
    desc: "Automated daily backups, tested recovery procedures, and offsite replication.",
    keywords: ["backup", "data loss", "lost", "restore", "recovery", "ransomware", "files", "deleted", "wiped"],
    signalLabels: ["Data loss worry"],
    price: 8,
  },
  {
    id: "monitoring", label: "Proactive Monitoring & Alerting", short: "Monitoring",
    desc: "24/7 monitoring of endpoints, servers, and network with automated alerting.",
    keywords: ["downtime", "outage", "slow", "crash", "unreliable", "offline", "performance", "speed", "freezes"],
    signalLabels: ["Downtime complaints"],
    price: 6,
  },
  {
    id: "security",  label: "Security & EDR",                 short: "Security & EDR",
    desc: "Endpoint detection and response, threat hunting, and security awareness training.",
    keywords: ["security", "hack", "hacked", "ransomware", "phishing", "breach", "cyber", "virus", "malware", "attack"],
    signalLabels: ["Cybersecurity concern"],
    price: 10,
  },
  {
    id: "helpdesk",  label: "Managed Helpdesk",               short: "Helpdesk",
    desc: "Unlimited helpdesk support with SLA-backed response times for all users.",
    keywords: ["support", "helpdesk", "no one", "response", "ticket", "fix", "can't get help", "nobody"],
    signalLabels: ["Complained about current provider"],
    price: 15,
  },
  {
    id: "compliance", label: "Compliance & Policy Management", short: "Compliance",
    desc: "HIPAA, PCI-DSS, and regulatory policy documentation and ongoing management.",
    keywords: ["compliance", "hipaa", "pci", "gdpr", "audit", "regulation", "policy", "regulated"],
    signalLabels: ["Compliance pressure"],
    price: 5,
  },
  {
    id: "identity",  label: "Identity & Access Management",   short: "IAM",
    desc: "MFA enforcement, SSO, password management, and periodic access reviews.",
    keywords: ["password", "mfa", "access", "login", "account", "credential", "sharing password", "permissions"],
    signalLabels: [],
    price: 4,
  },
  {
    id: "email",     label: "Email Security",                  short: "Email Security",
    desc: "Advanced anti-phishing, spam filtering, and email encryption.",
    keywords: ["email", "spam", "phishing emails", "outlook", "gmail", "exchange", "inbox"],
    signalLabels: [],
    price: 4,
  },
];

const HEADCOUNT_USERS = { "1–10": 8, "11–25": 18, "26–50": 38, "51–100": 75, "100+": 100 };

// Working state for the proposal modal (not persisted per meeting)
const proposalState = { selected: {}, prices: {} };

function getRecommendedIds() {
  const text = [$("pain_points").value, $("tech_stack").value, $("extra_notes").value]
    .join(" ").toLowerCase();
  const activeSignals = new Set(state.signals.map((s) => s.label));
  return new Set(
    SOLUTIONS
      .filter((sol) =>
        sol.keywords.some((kw) => text.includes(kw)) ||
        sol.signalLabels.some((sl) => activeSignals.has(sl))
      )
      .map((sol) => sol.id)
  );
}

function updateSuggestions() {
  const recommended = getRecommendedIds();
  const el = $("painSuggestions");
  if (recommended.size === 0) { el.innerHTML = ""; return; }
  const tags = SOLUTIONS
    .filter((s) => recommended.has(s.id))
    .map((s) => `<button class="suggestion-tag" data-id="${s.id}">${escapeHtml(s.short)}</button>`)
    .join("");
  el.innerHTML = `<span class="suggestion-label">Suggested</span>${tags}<button class="suggestion-open" id="viewProposalLink">View proposal →</button>`;
  el.querySelectorAll(".suggestion-tag").forEach((btn) => {
    btn.addEventListener("click", () => openProposal([btn.dataset.id]));
  });
  $("viewProposalLink").addEventListener("click", () => openProposal());
}

["pain_points", "tech_stack", "extra_notes"].forEach((id) =>
  $(id).addEventListener("input", updateSuggestions)
);

function openProposal(preselectIds = []) {
  const recommended = getRecommendedIds();
  preselectIds.forEach((id) => recommended.add(id));

  SOLUTIONS.forEach((sol) => {
    // Only set default selection the first time the modal opens
    if (!(sol.id in proposalState.selected)) {
      proposalState.selected[sol.id] = recommended.has(sol.id);
    } else if (preselectIds.includes(sol.id)) {
      proposalState.selected[sol.id] = true;
    }
    if (!(sol.id in proposalState.prices)) proposalState.prices[sol.id] = sol.price;
  });

  $("proposalUsers").value = HEADCOUNT_USERS[state.headcount] || 10;
  renderServiceRows();
  refreshProposalTotals();
  generateProposalText();
  $("proposalModal").classList.remove("hidden");
}

function renderServiceRows() {
  const users = Number($("proposalUsers").value) || 0;
  $("proposalServices").innerHTML = SOLUTIONS.map((sol) => {
    const on = proposalState.selected[sol.id];
    const lineTotal = on ? `$${((proposalState.prices[sol.id] || 0) * users).toLocaleString()}/mo` : "—";
    return `<div class="proposal-service-row">
      <input type="checkbox" id="ps_${sol.id}" class="proposal-check" data-id="${sol.id}" ${on ? "checked" : ""}/>
      <label for="ps_${sol.id}" class="proposal-service-name${on ? "" : " muted"}">${escapeHtml(sol.label)}</label>
      <div class="proposal-price-wrap">
        $<input type="number" class="proposal-price-input" data-id="${sol.id}"
               value="${proposalState.prices[sol.id]}" min="0" max="999"/>
        <span>/user</span>
      </div>
      <span class="proposal-service-line-total${on ? " active" : ""}" id="pst_${sol.id}">${lineTotal}</span>
    </div>`;
  }).join("");

  $("proposalServices").querySelectorAll(".proposal-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      proposalState.selected[cb.dataset.id] = cb.checked;
      document.querySelector(`label[for="ps_${cb.dataset.id}"]`).classList.toggle("muted", !cb.checked);
      refreshProposalTotals();
      generateProposalText();
    });
  });

  $("proposalServices").querySelectorAll(".proposal-price-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      proposalState.prices[inp.dataset.id] = Number(inp.value) || 0;
      refreshProposalTotals();
      generateProposalText();
    });
  });
}

function refreshProposalTotals() {
  const users = Number($("proposalUsers").value) || 0;
  let total = 0;
  SOLUTIONS.forEach((sol) => {
    const on = proposalState.selected[sol.id];
    const mo = on ? (proposalState.prices[sol.id] || 0) * users : 0;
    if (on) total += mo;
    const el = $(`pst_${sol.id}`);
    if (el) {
      el.className = `proposal-service-line-total${on ? " active" : ""}`;
      el.textContent = on ? `$${mo.toLocaleString()}/mo` : "—";
    }
  });
  if (total === 0) {
    $("proposalTotal").textContent = "—";
  } else {
    const perUser = users > 0 ? Math.round(total / users) : 0;
    $("proposalTotal").textContent = `$${total.toLocaleString()}/mo · $${perUser}/user`;
  }
}

function generateProposalText() {
  const s = loadSettings();
  const notes = getNotes();
  const users = Number($("proposalUsers").value) || 0;
  const msp = s.msp_name || "SwyfTech";
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const selected = SOLUTIONS.filter((sol) => proposalState.selected[sol.id]);
  const total = selected.reduce((sum, sol) => sum + (proposalState.prices[sol.id] || 0) * users, 0);
  const perUser = users > 0 && total > 0 ? Math.round(total / users) : 0;
  const hr = "─".repeat(48);

  const serviceBlock = selected.length
    ? selected.map((sol) => {
        const mo = (proposalState.prices[sol.id] || 0) * users;
        return `${sol.label}\n  ${sol.desc}\n  $${proposalState.prices[sol.id]}/user × ${users} users = $${mo.toLocaleString()}/mo`;
      }).join("\n\n")
    : "(No services selected)";

  const lines = [
    "MANAGED SERVICES PROPOSAL",
    `${msp}  ·  ${date}`,
    "",
    `Prepared for:  ${notes.company || "[Company]"}`,
    notes.contact ? `Contact:       ${notes.contact}${notes.role ? `, ${notes.role}` : ""}` : null,
    notes.contact_email ? `Email:         ${notes.contact_email}` : null,
    "",
    hr,
    "PROPOSED SERVICES",
    hr,
    "",
    serviceBlock,
    "",
    hr,
    "INVESTMENT SUMMARY",
    hr,
    "",
    `Monthly estimate:  $${total.toLocaleString()}/mo`,
    perUser ? `Per user:          $${perUser}/user/mo` : null,
    total ? `Annual estimate:   $${(total * 12).toLocaleString()}/year` : null,
    "",
    `This is a preliminary estimate for ${users} user${users !== 1 ? "s" : ""}.`,
    "Final pricing confirmed after a full environment assessment.",
    "",
    hr,
    "",
    s.sender_name  || null,
    [s.sender_title, msp].filter(Boolean).join(" · ") || null,
    s.sender_email || null,
    s.sender_phone || null,
  ].filter((l) => l !== null).join("\n");

  $("proposalText").value = lines;
}

$("proposalUsers").addEventListener("input", () => { refreshProposalTotals(); generateProposalText(); });
$("proposalBtn").addEventListener("click", () => openProposal());
$("proposalClose").addEventListener("click", () => closeModal("proposalModal"));
$("proposalRegen").addEventListener("click", generateProposalText);

$("proposalCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("proposalText").value);
    toast("Copied");
  } catch {
    $("proposalText").select();
    document.execCommand("copy");
    toast("Copied");
  }
});

$("proposalPDF").addEventListener("click", () => {
  const s = loadSettings();
  const msp = s.msp_name || "SwyfTech";
  const logo = localStorage.getItem(LOGO_KEY);
  const text = $("proposalText").value;
  const title = text.split("\n").find((l) => l.startsWith("Prepared for:"))?.replace("Prepared for:", "").trim() || "Proposal";
  const win = window.open("", "_blank");
  if (!win) { toast("Allow pop-ups to export PDF"); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${escapeHtml(title)} — ${escapeHtml(msp)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12pt; color: #111; margin: 0; }
  .page { max-width: 680px; margin: 0 auto; padding: 48px 48px 64px; }
  .doc-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; padding-bottom:18px; border-bottom:2px solid #111; }
  .doc-logo { max-height:40px; max-width:120px; object-fit:contain; }
  .doc-msp { font-size:11pt; font-weight:600; color:#444; }
  .doc-date { font-size:10pt; color:#888; margin-top:3px; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 11pt; line-height: 1.65; margin: 0; }
  @media print { .page { padding: 24px 32px 32px; } }
</style></head><body><div class="page">
<div class="doc-header">
  <div style="display:flex;align-items:center;gap:14px">
    ${logo ? `<img class="doc-logo" src="${logo}" alt="Logo"/>` : ""}
    <div><div class="doc-msp">${escapeHtml(msp)}</div>
    <div class="doc-date">${new Date().toLocaleDateString(undefined, {year:"numeric",month:"long",day:"numeric"})}</div></div>
  </div>
  <div style="font-size:10pt;color:#888;font-style:italic">Confidential</div>
</div>
<pre>${escapeHtml(text)}</pre>
</div><script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
});


// ---- conversation signals -----------------------------------------------

const QUICK_TAPS = [
  { label: "Cybersecurity concern",    category: "concern"   },
  { label: "Data loss worry",          category: "concern"   },
  { label: "Downtime complaints",      category: "concern"   },
  { label: "Compliance pressure",      category: "concern"   },
  { label: "Asked about pricing",      category: "interest"  },
  { label: "Mentioned growth plans",   category: "interest"  },
  { label: "Expressed urgency",        category: "interest"  },
  { label: "Asked for next steps",     category: "interest"  },
  { label: "Complained about current provider", category: "interest" },
];

const OBJECTIONS = [
  "Too expensive",
  "Locked in contract",
  "Happy with current IT",
  "Not the right time",
  "Need to involve others",
  "DIY / internal hire",
];

function addSignal(label, category) {
  state.signals.push({ ts: Date.now(), label, category });
  renderSignalLog();
  updateSuggestions();
}

function removeSignal(idx) {
  state.signals.splice(idx, 1);
  renderSignalLog();
}

function renderSignalLog() {
  const log = $("signalLog");
  if (state.signals.length === 0) {
    log.innerHTML = "";
    return;
  }
  log.innerHTML = [...state.signals].reverse().map((sig, ri) => {
    const i = state.signals.length - 1 - ri;
    const t = new Date(sig.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `<div class="signal-entry signal-entry--${sig.category}">
      <span class="signal-dot"></span>
      <span class="signal-label">${escapeHtml(sig.label)}</span>
      <span class="signal-time">${t}</span>
      <button class="signal-del" data-idx="${i}" aria-label="Remove">✕</button>
    </div>`;
  }).join("");
  log.querySelectorAll(".signal-del").forEach((btn) => {
    btn.addEventListener("click", () => removeSignal(Number(btn.dataset.idx)));
  });
}

// Build tap buttons
(function buildTapButtons() {
  const quickEl = $("quickTaps");
  QUICK_TAPS.forEach(({ label, category }) => {
    const btn = document.createElement("button");
    btn.className = `signal-tap signal-tap--${category}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      addSignal(label, category);
      btn.style.transform = "scale(0.93)";
      setTimeout(() => (btn.style.transform = ""), 120);
    });
    quickEl.appendChild(btn);
  });

  const objEl = $("objectionTaps");
  OBJECTIONS.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "signal-tap signal-tap--objection";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      addSignal(label, "objection");
      btn.style.transform = "scale(0.93)";
      setTimeout(() => (btn.style.transform = ""), 120);
    });
    objEl.appendChild(btn);
  });
})();

// Custom note input
$("signalCustom").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const val = $("signalCustom").value.trim();
  if (!val) return;
  addSignal(val, "custom");
  $("signalCustom").value = "";
});


// ---- insights -----------------------------------------------------------

function openInsights() {
  const history = loadHistory();
  const body = $("insightsBody");

  if (history.length === 0) {
    body.innerHTML = '<div class="insights-empty">No saved meetings yet — save a few meetings to see trends.</div>';
    $("insightsModal").classList.remove("hidden");
    return;
  }

  // Aggregate signals across all saved meetings
  const counts = {};
  let meetingsWithSignals = 0;

  history.forEach((h) => {
    const sigs = Array.isArray(h.notes.signals) ? h.notes.signals : [];
    if (sigs.length) meetingsWithSignals++;
    sigs.forEach((sig) => {
      const key = sig.label;
      if (!counts[key]) counts[key] = { count: 0, category: sig.category };
      counts[key].count++;
    });
  });

  const groups = {
    objection: { title: "Objections raised",  items: [] },
    concern:   { title: "Concerns mentioned", items: [] },
    interest:  { title: "Engagement signals", items: [] },
    custom:    { title: "Custom notes",        items: [] },
  };

  Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([label, { count, category }]) => {
      const cat = groups[category] ? category : "custom";
      groups[cat].items.push({ label, count });
    });

  const maxCount = Math.max(1, ...Object.values(counts).map((v) => v.count));

  function renderGroup(cat) {
    const g = groups[cat];
    if (!g.items.length) return "";
    const rows = g.items.map(({ label, count }) => {
      const pct = Math.round((count / maxCount) * 100);
      return `<div class="insights-row">
        <span class="insights-row-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <div class="insights-bar-track">
          <div class="insights-bar-fill insights-bar-fill--${cat}" style="width:${pct}%"></div>
        </div>
        <span class="insights-row-count">${count}×</span>
      </div>`;
    }).join("");
    return `<div>
      <div class="insights-group-title insights-group-title--${cat}">${escapeHtml(g.title)}</div>
      ${rows}
    </div>`;
  }

  const hasAny = Object.values(groups).some((g) => g.items.length);

  body.innerHTML = `
    <p class="insights-meta">${meetingsWithSignals} of ${history.length} saved meeting${history.length !== 1 ? "s" : ""} have signals</p>
    ${hasAny
      ? `<div class="insights-groups">
          ${renderGroup("objection")}
          ${renderGroup("concern")}
          ${renderGroup("interest")}
          ${renderGroup("custom")}
        </div>`
      : '<div class="insights-empty">No signals logged yet — tap the buttons during meetings.</div>'
    }`;

  $("insightsModal").classList.remove("hidden");
}

$("insightsBtn").addEventListener("click", openInsights);
$("insightsClose").addEventListener("click", () => closeModal("insightsModal"));


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

  ${Array.isArray(notes.signals) && notes.signals.length ? `
  <div class="section">
    <h2>Conversation signals</h2>
    <table>${notes.signals.map((sig) => `
      <tr>
        <td class="label" style="color:${sig.category==="objection"?"#991B1B":sig.category==="concern"?"#92400E":sig.category==="interest"?"#166534":"#777"}">
          ${escapeHtml(sig.category)}
        </td>
        <td>${escapeHtml(sig.label)}<span style="color:#aaa;font-size:10pt;margin-left:10px">${new Date(sig.ts).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</span></td>
      </tr>`).join("")}
    </table>
  </div>` : ""}

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

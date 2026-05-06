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
}

function clearForm() {
  TEXT_FIELDS.forEach((f) => ($(f).value = ""));
  CHIP_FIELDS.forEach((f) => {
    state[f] = null;
    $$(`[data-field="${f}"] .chip.on`).forEach((c) => c.classList.remove("on"));
  });
  state.locations = 1;
  $("locations").textContent = "1";
  state.meeting_id = null;
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

$("exportBtn").addEventListener("click", () => {
  const notes = getNotes();
  document.title = notes.company
    ? `${notes.company} — SwyfTech discovery`
    : "SwyfTech discovery";
  window.print();
  setTimeout(() => {
    const s = loadSettings();
    document.title = `${s.msp_name || "SwyfTech"} discovery`;
  }, 1000);
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

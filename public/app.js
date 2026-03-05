const API = "";

let selectedPerson = null;
let lastRadio = null;
let peopleCache = [];
let assignmentsCache = [];
let expectedCache = []; // ✅ radios esperadas
let filterSelectedOnly = false;

const el = (id) => document.getElementById(id);

const personBox = el("personBox");
const radioBox = el("radioBox");
const msg = el("msg");
const assignmentsBody = el("assignmentsBody");
const missingList = el("missingList");

const sExpected = el("sExpected");
const sAssigned = el("sAssigned");
const sMissing = el("sMissing");
const sPeople = el("sPeople");

const scanInput = el("scanInput");
const scanModePill = el("scanMode");

const btnScanPerson = el("btnScanPerson");
const btnScanRadio = el("btnScanRadio");
const btnScanInventory = el("btnScanInventory");
const btnManualPerson = el("btnManualPerson");
const btnManualRadio = el("btnManualRadio");

const expectedText = el("expectedText");
const btnImportExpected = el("btnImportExpected");
const importMsg = el("importMsg");

// Buscador persona
const searchPersonInput = el("searchPersonInput");
const btnSearchPerson = el("btnSearchPerson");
const btnClearSearch = el("btnClearSearch");
const searchResults = el("searchResults");

// Filtro asignaciones
const toggleFilterSelected = el("toggleFilterSelected");
const filterInfo = el("filterInfo");

// Admin
const btnDeleteSelectedPerson = el("btnDeleteSelectedPerson");
const deleteRadioInput = el("deleteRadioInput");
const btnDeleteRadio = el("btnDeleteRadio");

// ✅ Radios esperadas UI
const expectedBody = el("expectedBody");
const expectedSearchInput = el("expectedSearchInput");
const btnClearExpectedSearch = el("btnClearExpectedSearch");
const expectedCount = el("expectedCount");

// Modal radio ya asignada
const actionModal = el("actionModal");
const modalText = el("modalText");
const btnModalClose = el("btnModalClose");
const btnModalUnassign = el("btnModalUnassign");
const btnModalReassign = el("btnModalReassign");
const btnModalCancel = el("btnModalCancel");

let scanMode = null; // "person" | "radio_assign" | "radio_inventory"
let modalRadioCode = null;

// ✅ Tema + QR
const btnToggleTheme = el("btnToggleTheme");
const btnScanQr = el("btnScanQr");

const qrModal = el("qrModal");
const btnQrClose = el("btnQrClose");
const btnQrStart = el("btnQrStart");
const btnQrStop = el("btnQrStop");
const qrVideo = el("qrVideo");
const qrMsg = el("qrMsg");

function setMessage(text, kind = "") {
  msg.className = "msg " + (kind || "");
  msg.textContent = text || "";
}

function setPersonBox() {
  if (!selectedPerson) {
    personBox.textContent = "Ninguna";
    personBox.classList.add("muted");
  } else {
    personBox.textContent = `${selectedPerson.name} — ${selectedPerson.rut}`;
    personBox.classList.remove("muted");
  }
  renderAssignmentsFromCache();
}

function setRadioBox() {
  if (!lastRadio) {
    radioBox.textContent = "Ninguna";
    radioBox.classList.add("muted");
  } else {
    radioBox.textContent = String(lastRadio);
    radioBox.classList.remove("muted");
  }
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.payload = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeRut(rut) {
  const s = String(rut || "").trim().replace(/\s+/g, "").replaceAll("'", "-");
  const m = s.match(/^([0-9]{7,8})[-]([0-9Kk])$/);
  if (!m) return s;
  return `${m[1]}-${String(m[2]).toUpperCase()}`;
}

function formatLocalDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(d);
}

function normalizeRadioCode(raw) {
  let s = String(raw ?? "");
  s = s.replace(/\u0000/g, "");
  s = s.replace(/\r?\n/g, " ");
  s = s.trim();
  s = s.replace(/^(\s*(S\/N|SN|SERIAL|SERIE|S\.N)\s*[:=]?\s*)/i, "");
  s = s.replace(/[^a-z0-9]/gi, "");
  s = s.toUpperCase();
  return s;
}

function extractRutFromScan(raw) {
  const text0 = String(raw || "").trim();
  if (!text0) return null;

  const m0 = text0.match(/([0-9]{7,8})\s*[-']\s*([0-9Kk])/);
  if (m0) return `${m0[1]}-${String(m0[2]).toUpperCase()}`;

  let t = text0;
  t = t.replaceAll("Ñ", ":");
  t = t.replaceAll("--", "//");
  t = t.replaceAll("_", "?");
  t = t.replaceAll("¿", "=");
  t = t.replaceAll("'", "-");

  const qIdx = t.indexOf("?");
  if (qIdx >= 0) {
    const base = t.slice(0, qIdx + 1);
    const qs = t.slice(qIdx + 1).replaceAll("/", "&");
    t = base + qs;
  }

  const m = t.match(/RUN[^0-9Kk]*([0-9]{7,8})[^0-9Kk]*([0-9Kk])/i);
  if (m) return `${m[1]}-${String(m[2]).toUpperCase()}`;
  return null;
}

// --------------------
// Tema claro / oscuro
// --------------------
function applyTheme(mode) {
  if (mode === "light") document.body.classList.add("light");
  else document.body.classList.remove("light");
  localStorage.setItem("theme", mode);
}

(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) return applyTheme(saved);

  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(prefersLight ? "light" : "dark");
})();

btnToggleTheme?.addEventListener("click", () => {
  const isLight = document.body.classList.contains("light");
  applyTheme(isLight ? "dark" : "light");
});

// ---------- Modal radio ya asignada ----------
function openActionModal(radioCode, assignedInfo) {
  modalRadioCode = radioCode;

  const current = selectedPerson ? `${selectedPerson.name} (${selectedPerson.rut})` : "(no hay persona seleccionada)";
  modalText.textContent =
    `La radio ${assignedInfo.radio_code} ya está asignada a:\n` +
    `${assignedInfo.name} (${assignedInfo.rut})\n` +
    `Fecha: ${formatLocalDate(assignedInfo.assigned_at)}\n\n` +
    `Persona actual seleccionada: ${current}\n\n` +
    `¿Qué quieres hacer?`;

  btnModalReassign.disabled = !selectedPerson;
  actionModal.classList.remove("hidden");
}

function closeActionModal() {
  actionModal.classList.add("hidden");
  modalRadioCode = null;
}

btnModalClose.addEventListener("click", closeActionModal);
btnModalCancel.addEventListener("click", closeActionModal);

btnModalUnassign.addEventListener("click", async () => {
  if (!modalRadioCode) return;
  try {
    await api("/api/unassign", { method: "POST", body: JSON.stringify({ radioCode: modalRadioCode }) });
    setMessage(`Desasignada: radio ${modalRadioCode} quedó libre.`, "ok");
    await refreshAll();
  } catch (e) {
    setMessage(e.message, "bad");
  } finally {
    closeActionModal();
    scanInput.focus();
  }
});

btnModalReassign.addEventListener("click", async () => {
  if (!modalRadioCode || !selectedPerson) return;
  try {
    await api("/api/reassign", { method: "POST", body: JSON.stringify({ radioCode: modalRadioCode, newRut: selectedPerson.rut }) });
    setMessage(`Radio ${modalRadioCode} reasignada a ${selectedPerson.name}.`, "ok");
    await refreshAll();
  } catch (e) {
    setMessage(e.message, "bad");
  } finally {
    closeActionModal();
    scanInput.focus();
  }
});

// ---------- Refresh ----------
async function refreshAll() {
  const [summary, assignments, missing, people, expected] = await Promise.all([
    api("/api/summary"),
    api("/api/assignments"),
    api("/api/radios/missing"),
    api("/api/people/list"),
    api("/api/radios/expected")
  ]);

  peopleCache = people;
  assignmentsCache = assignments;
  expectedCache = expected;

  sExpected.textContent = summary.expected;
  sAssigned.textContent = summary.assigned;
  sMissing.textContent = summary.missing;
  sPeople.textContent = summary.people;

  renderExpectedFromCache();
  renderAssignmentsFromCache();

  missingList.innerHTML = missing.length
    ? missing.map(code => `<span class="chip">${escapeHtml(code)}</span>`).join("")
    : `<span class="muted">No faltan radios 🎉</span>`;
}

// ---------- Radios esperadas (Estado + Persona) ----------
function getExpectedFiltered() {
  const q = (expectedSearchInput.value || "").trim().toLowerCase();
  if (!q) return expectedCache;
  return expectedCache.filter(c => String(c).toLowerCase().includes(q));
}

function buildAssignmentMap() {
  const map = new Map();
  for (const a of assignmentsCache) map.set(a.radio_code, a);
  return map;
}

function renderExpectedFromCache() {
  const list = getExpectedFiltered();
  expectedCount.textContent = `Mostrando ${list.length} de ${expectedCache.length} radios esperadas.`;

  if (!list.length) {
    expectedBody.innerHTML = `<tr><td class="muted" colspan="3">Sin radios</td></tr>`;
    return;
  }

  const aMap = buildAssignmentMap();

  expectedBody.innerHTML = list.map(code => {
    const a = aMap.get(code);

    if (a) {
      return `
        <tr>
          <td>${escapeHtml(code)}</td>
          <td>
            <span class="okTag">Asignada</span><br>
            <span class="muted small">${escapeHtml(a.name)} (${escapeHtml(a.rut)})</span>
          </td>
          <td>
            <button class="danger expectedDeleteBtn" data-code="${escapeHtml(code)}">Eliminar</button>
          </td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${escapeHtml(code)}</td>
        <td><span class="muted">Libre</span></td>
        <td>
          <button class="danger expectedDeleteBtn" data-code="${escapeHtml(code)}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join("");

  expectedBody.querySelectorAll(".expectedDeleteBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-code");
      const ok = window.confirm(
        `¿Eliminar la radio "${code}" de las esperadas?\nSi está asignada, también se desasignará.`
      );
      if (!ok) return;

      try {
        await api("/api/radios/expected/delete", {
          method: "POST",
          body: JSON.stringify({ radioCode: code })
        });
        setMessage(`Radio ${code} eliminada de esperadas.`, "ok");
        await refreshAll();
      } catch (e) {
        setMessage(e.message, "bad");
      } finally {
        scanInput.focus();
      }
    });
  });
}

expectedSearchInput.addEventListener("input", () => renderExpectedFromCache());
btnClearExpectedSearch.addEventListener("click", () => {
  expectedSearchInput.value = "";
  renderExpectedFromCache();
  scanInput.focus();
});

// ---------- Asignaciones ----------
function peopleOptionsHtml(selectedRut) {
  if (!peopleCache.length) return `<option value="">(sin personas)</option>`;
  return peopleCache.map(p => {
    const sel = p.rut === selectedRut ? "selected" : "";
    return `<option value="${escapeHtml(p.rut)}" ${sel}>${escapeHtml(`${p.name} — ${p.rut}`)}</option>`;
  }).join("");
}

function getFilteredAssignments() {
  if (!filterSelectedOnly) return assignmentsCache;
  if (!selectedPerson) return [];
  return assignmentsCache.filter(a => a.rut === selectedPerson.rut);
}

function updateFilterInfo(list) {
  if (!filterSelectedOnly) { filterInfo.textContent = ""; return; }
  if (!selectedPerson) { filterInfo.textContent = "Filtro activo, pero no hay persona seleccionada (0 filas)."; return; }
  filterInfo.textContent = `Filtro activo: mostrando ${list.length} radios de ${selectedPerson.name} (${selectedPerson.rut}).`;
}

function renderAssignmentsFromCache() {
  const list = getFilteredAssignments();
  updateFilterInfo(list);

  assignmentsBody.innerHTML = list.map(r => `
    <tr>
      <td>${escapeHtml(r.radio_code)}</td>
      <td>${escapeHtml(r.rut)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(formatLocalDate(r.assigned_at))}</td>
      <td>
        <div class="selectRow">
          <button class="danger unassignBtn" data-radio="${escapeHtml(r.radio_code)}">Desasignar</button>
        </div>
      </td>
      <td>
        <div class="selectRow">
          <select data-radio="${escapeHtml(r.radio_code)}" class="reassignSelect">
            ${peopleOptionsHtml(r.rut)}
          </select>
          <button class="secondary reassignBtn" data-radio="${escapeHtml(r.radio_code)}">Reasignar</button>
        </div>
      </td>
    </tr>
  `).join("");

  assignmentsBody.querySelectorAll(".unassignBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const radio = btn.getAttribute("data-radio");
      if (!window.confirm(`¿Desasignar la radio ${radio}? Quedará libre.`)) return;
      try {
        await api("/api/unassign", { method: "POST", body: JSON.stringify({ radioCode: radio }) });
        setMessage(`Desasignada: radio ${radio} quedó libre.`, "ok");
        await refreshAll();
      } catch (e) {
        setMessage(e.message, "bad");
      } finally {
        scanInput.focus();
      }
    });
  });

  assignmentsBody.querySelectorAll(".reassignBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const radio = btn.getAttribute("data-radio");
      const sel = assignmentsBody.querySelector(`select.reassignSelect[data-radio="${CSS.escape(radio)}"]`);
      const newRut = sel?.value;
      if (!newRut) return setMessage("Selecciona una persona destino.", "bad");

      try {
        await api("/api/reassign", { method: "POST", body: JSON.stringify({ radioCode: radio, newRut }) });
        const p = peopleCache.find(x => x.rut === newRut);
        setMessage(`Radio ${radio} reasignada a ${p?.name || newRut}.`, "ok");
        await refreshAll();
      } catch (e) {
        setMessage(e.message, "bad");
      } finally {
        scanInput.focus();
      }
    });
  });
}

// ---------- Persona ----------
async function selectPersonByRut(rut) {
  const r = normalizeRut(rut);

  try {
    const p = await api(`/api/people/get?rut=${encodeURIComponent(r)}`);
    selectedPerson = { rut: p.rut, name: p.name };
    setPersonBox();
    setMessage(`Persona seleccionada: ${p.name} (${p.rut})`, "ok");
    return;
  } catch {}

  const name = prompt(`Nombre para ${r} (solo la primera vez):`);
  if (!name) return setMessage("Cancelado. No se guardó persona.", "bad");

  const person = await api("/api/people/upsert", { method: "POST", body: JSON.stringify({ rut: r, name: name.trim() }) });
  selectedPerson = { rut: person.rut, name: person.name };
  setPersonBox();
  setMessage(`Persona creada: ${person.name} (${person.rut})`, "ok");
  await refreshAll();
}

// ---------- Radios ----------
async function addRadioToInventory(radioCode) {
  const code = normalizeRadioCode(radioCode);
  if (!code) return;

  lastRadio = code;
  setRadioBox();

  try {
    const r = await api("/api/radios/expected/add", {
      method: "POST",
      body: JSON.stringify({ radioCode: code })
    });
    setMessage(r.added ? `Inventario: agregada radio ${code}.` : `Inventario: radio ${code} ya existía.`, "ok");
    await refreshAll();
  } catch (e) {
    setMessage(e.message, "bad");
  }
}

async function assignRadioToSelectedPerson(radioCode) {
  if (!selectedPerson) {
    setMessage("No hay persona seleccionada. Usa “Modo Inventario” para solo agregar radios.", "bad");
    return;
  }

  const code = normalizeRadioCode(radioCode);
  if (!code) return;

  lastRadio = code;
  setRadioBox();

  try {
    await api("/api/assign", {
      method: "POST",
      body: JSON.stringify({ rut: selectedPerson.rut, radioCode: code })
    });
    setMessage(`Asignada radio ${code} a ${selectedPerson.name}`, "ok");
    await refreshAll();
  } catch (e) {
    if (e.status === 409 && e.payload?.alreadyAssigned) {
      openActionModal(code, e.payload.alreadyAssigned);
      return;
    }
    setMessage(e.message, "bad");
  }
}

// ---------- Modos ----------
btnScanPerson.addEventListener("click", () => {
  scanMode = "person";
  scanModePill.textContent = "Modo: Carnet";
  scanInput.value = "";
  scanInput.focus();
  setMessage("Listo: escanea el carnet ahora.", "ok");
});

btnScanRadio.addEventListener("click", () => {
  scanMode = "radio_assign";
  scanModePill.textContent = "Modo: Radio (Asignar)";
  scanInput.value = "";
  scanInput.focus();
  setMessage("Listo: escanea radios para ASIGNAR (requiere persona).", "ok");
});

btnScanInventory.addEventListener("click", () => {
  scanMode = "radio_inventory";
  scanModePill.textContent = "Modo: Inventario";
  scanInput.value = "";
  scanInput.focus();
  setMessage("Listo: escanea radios para AGREGAR al inventario (sin persona).", "ok");
});

scanInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const text = scanInput.value.trim();
  if (!text) return;

  try {
    if (scanMode === "person") {
      const rut = extractRutFromScan(text);
      if (!rut) setMessage("No pude extraer el RUT del carnet.", "bad");
      else await selectPersonByRut(rut);
    } else if (scanMode === "radio_assign") {
      await assignRadioToSelectedPerson(text);
    } else if (scanMode === "radio_inventory") {
      await addRadioToInventory(text);
    } else {
      setMessage("Elige modo: Carnet, Radio (Asignar) o Inventario.", "bad");
    }
  } finally {
    scanInput.value = "";
    scanInput.focus();
  }
});

// ---------- Filtro ----------
toggleFilterSelected.addEventListener("change", () => {
  filterSelectedOnly = !!toggleFilterSelected.checked;
  renderAssignmentsFromCache();
  scanInput.focus();
});

// ---------- Buscador persona ----------
function renderResults(list) {
  if (!list.length) {
    searchResults.className = "results muted";
    searchResults.textContent = "Sin resultados";
    return;
  }

  searchResults.className = "results";
  searchResults.innerHTML = list.map(p => `
    <div class="resultItem" data-rut="${escapeHtml(p.rut)}" data-name="${escapeHtml(p.name)}">
      <div class="top">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="rut">${escapeHtml(p.rut)}</div>
      </div>
    </div>
  `).join("");

  searchResults.querySelectorAll(".resultItem").forEach(item => {
    item.addEventListener("click", () => {
      const rut = item.getAttribute("data-rut");
      const name = item.getAttribute("data-name");
      selectedPerson = { rut, name };
      setPersonBox();
      setMessage(`Persona seleccionada: ${name} (${rut})`, "ok");
      scanInput.focus();
    });
  });
}

async function doSearch() {
  const q = (searchPersonInput.value || "").trim();
  if (!q) return renderResults([]);

  try {
    const list = await api(`/api/people/search?q=${encodeURIComponent(q)}`);
    renderResults(list);
  } catch (e) {
    renderResults([]);
    setMessage(e.message, "bad");
  }
}

btnSearchPerson.addEventListener("click", doSearch);
searchPersonInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
btnClearSearch.addEventListener("click", () => {
  searchPersonInput.value = "";
  renderResults([]);
  scanInput.focus();
});

// ---------- Manuales ----------
btnManualPerson.addEventListener("click", async () => {
  const rut = prompt("RUT (ej: 21632444-7):");
  if (!rut) return;
  const name = prompt("Nombre:");
  if (!name) return;

  try {
    const person = await api("/api/people/upsert", { method: "POST", body: JSON.stringify({ rut: normalizeRut(rut), name: name.trim() }) });
    selectedPerson = { rut: person.rut, name: person.name };
    setPersonBox();
    setMessage(`Persona lista: ${person.name} (${person.rut})`, "ok");
    await refreshAll();
  } catch (e) {
    setMessage(e.message, "bad");
  }
});

btnManualRadio.addEventListener("click", async () => {
  const code = prompt("Código de radio/producto:");
  if (!code) return;

  if (scanMode === "radio_inventory") return addRadioToInventory(code);
  return assignRadioToSelectedPerson(code);
});

// ---------- Import radios esperadas ----------
btnImportExpected.addEventListener("click", async () => {
  try {
    const text = expectedText.value || "";
    const r = await api("/api/radios/expected/import", { method: "POST", body: JSON.stringify({ codesText: text }) });
    importMsg.textContent = `Importado: ${r.imported}`;
    await refreshAll();
  } catch (e) {
    importMsg.textContent = e.message;
  }
});

// ---------- ADMIN ----------
btnDeleteSelectedPerson.addEventListener("click", async () => {
  if (!selectedPerson) return setMessage("No hay persona seleccionada para eliminar.", "bad");

  const ok = window.confirm(
    `¿Eliminar a ${selectedPerson.name} (${selectedPerson.rut})?\n\nEsto también borrará todas sus asignaciones.`
  );
  if (!ok) return;

  try {
    const r = await api("/api/people/delete", { method: "POST", body: JSON.stringify({ rut: selectedPerson.rut }) });
    selectedPerson = null;
    setPersonBox();
    setMessage(`Persona eliminada. Asignaciones borradas: ${r.removedAssignments}`, "ok");
    await refreshAll();
  } catch (e) {
    setMessage(e.message, "bad");
  } finally {
    scanInput.focus();
  }
});

btnDeleteRadio.addEventListener("click", async () => {
  const code = (deleteRadioInput.value || "").trim();
  if (!code) return setMessage("Escribe el código de la radio a eliminar.", "bad");

  const ok = window.confirm(`¿Eliminar la radio "${code}" de las esperadas? Si está asignada, también se desasigna.`);
  if (!ok) return;

  try {
    await api("/api/radios/expected/delete", { method: "POST", body: JSON.stringify({ radioCode: code }) });
    deleteRadioInput.value = "";
    setMessage(`Radio ${code} eliminada de esperadas.`, "ok");
    await refreshAll();
  } catch (e) {
    setMessage(e.message, "bad");
  } finally {
    scanInput.focus();
  }
});

// --------------------
// QR por cámara (Carnet)
// --------------------
let qrStream = null;
let qrDetector = null;
let qrLoopTimer = null;

function openQrModal() {
  qrMsg.textContent = "";
  qrModal.classList.remove("hidden");
}

function closeQrModal() {
  stopQrCamera();
  qrModal.classList.add("hidden");
}

async function startQrCamera() {
  qrMsg.textContent = "";

  if (!("BarcodeDetector" in window)) {
    qrMsg.textContent = "Tu navegador no soporta BarcodeDetector. Prueba con Chrome en Android.";
    return;
  }

  qrDetector = new BarcodeDetector({
  formats: ["qr_code", "pdf417", "data_matrix", "aztec", "code_128", "ean_13"]
});

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    qrVideo.srcObject = qrStream;

    const tick = async () => {
      if (!qrDetector || !qrVideo || qrVideo.readyState < 2) {
        qrLoopTimer = requestAnimationFrame(tick);
        return;
      }

      try {
        const codes = await qrDetector.detect(qrVideo);
        if (codes && codes.length) {
          const c = codes[0];
          const raw = c.rawValue || "";
          const fmt = c.format || "desconocido";
          qrMsg.textContent = `Leído (${fmt}): ${raw}`;

          const rut = extractRutFromScan(raw);
          if (rut) {
            await selectPersonByRut(rut);
            setMessage(`Carnet por QR: ${rut}`, "ok");
            closeQrModal();
            return;
          } else {
            setMessage("Leí el QR, pero no pude extraer RUT. Pégame el texto del QR.", "bad");
          }
        }
      } catch {
        // sin spam
      }

      qrLoopTimer = requestAnimationFrame(tick);
    };

    qrLoopTimer = requestAnimationFrame(tick);
    qrMsg.textContent = "Cámara activa. Apunta al QR…";
  } catch {
    qrMsg.textContent = "No se pudo iniciar la cámara. Revisa permisos del navegador.";
  }
}

function stopQrCamera() {
  if (qrLoopTimer) cancelAnimationFrame(qrLoopTimer);
  qrLoopTimer = null;

  if (qrVideo) qrVideo.srcObject = null;

  if (qrStream) {
    qrStream.getTracks().forEach(t => t.stop());
    qrStream = null;
  }
}

btnScanQr?.addEventListener("click", openQrModal);
btnQrClose?.addEventListener("click", closeQrModal);
btnQrStart?.addEventListener("click", startQrCamera);
btnQrStop?.addEventListener("click", stopQrCamera);

// Init
setPersonBox();
setRadioBox();
renderResults([]);
refreshAll().catch(() => setMessage("No conecta con el servidor. ¿Lo iniciaste en /server?", "bad"));

scanInput.focus();


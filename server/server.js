import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "..", "public")));

const DATA_PATH = path.join(__dirname, "data.json");

async function loadDb() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    const db = JSON.parse(raw);
    db.people ||= {};
    db.radiosExpected ||= [];
    db.assignments ||= {};
    return db;
  } catch {
    const db = { people: {}, radiosExpected: [], assignments: {} };
    await saveDb(db);
    return db;
  }
}

async function saveDb(db) {
  const tmp = DATA_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
  await fs.rename(tmp, DATA_PATH);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCode(code) {
  let s = String(code ?? "");

  // limpia caracteres raros y espacios
  s = s.replace(/\u0000/g, "");        // nulls
  s = s.replace(/\r?\n/g, " ");        // saltos de línea
  s = s.trim();

  // quitar prefijos típicos de serial
  // ejemplos: "S/N: 752TYKA775", "SN 752TYKA775", "SERIAL=..."
  s = s.replace(/^(\s*(S\/N|SN|SERIAL|SERIE|S\.N)\s*[:=]?\s*)/i, "");

  // dejar solo letras y números
  s = s.replace(/[^a-z0-9]/gi, "");

  // mayúsculas
  s = s.toUpperCase();

  return s;
}

function uniqueArray(arr) {
  return Array.from(new Set(arr));
}

function normalizeRut(rut) {
  const s = String(rut || "").trim().replace(/\s+/g, "").replaceAll("'", "-");
  const m = s.match(/^([0-9]{7,8})[-]([0-9Kk])$/);
  if (!m) return s;
  return `${m[1]}-${String(m[2]).toUpperCase()}`;
}

// ---------- PEOPLE ----------
app.get("/api/people/get", async (req, res) => {
  const rut = normalizeRut(req.query.rut || "");
  if (!rut) return res.status(400).json({ error: "rut es requerido" });

  const db = await loadDb();
  const p = db.people[rut];
  if (!p) return res.status(404).json({ error: "Persona no encontrada" });
  res.json(p);
});

app.get("/api/people/list", async (req, res) => {
  const db = await loadDb();
  const list = Object.values(db.people).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  res.json(list);
});

app.get("/api/people/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const db = await loadDb();
  const qLower = q.toLowerCase();

  const results = Object.values(db.people)
    .filter(p =>
      String(p.rut).toLowerCase().includes(qLower) ||
      String(p.name).toLowerCase().includes(qLower)
    )
    .slice(0, 30)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  res.json(results);
});

app.post("/api/people/upsert", async (req, res) => {
  const { rut, name } = req.body || {};
  if (!rut || !name) return res.status(400).json({ error: "rut y name son requeridos" });

  const db = await loadDb();
  const r = normalizeRut(rut);
  const n = String(name).trim();

  const existing = db.people[r];
  db.people[r] = { rut: r, name: n, created_at: existing?.created_at || nowIso() };

  await saveDb(db);
  res.json(db.people[r]);
});

app.post("/api/people/delete", async (req, res) => {
  const { rut } = req.body || {};
  if (!rut) return res.status(400).json({ error: "rut es requerido" });

  const db = await loadDb();
  const r = normalizeRut(rut);

  if (!db.people[r]) return res.json({ ok: true, deleted: false, removedAssignments: 0 });

  let removed = 0;
  for (const code of Object.keys(db.assignments)) {
    if (db.assignments[code]?.person_rut === r) {
      delete db.assignments[code];
      removed++;
    }
  }

  delete db.people[r];
  await saveDb(db);

  res.json({ ok: true, deleted: true, removedAssignments: removed });
});

// ---------- ASSIGNMENTS ----------
app.post("/api/assign", async (req, res) => {
  const { rut, radioCode } = req.body || {};
  if (!rut || !radioCode) return res.status(400).json({ error: "rut y radioCode son requeridos" });

  const db = await loadDb();
  const r = normalizeRut(rut);
  const code = normalizeCode(radioCode);

  if (!db.people[r]) return res.status(400).json({ error: "La persona no existe. Escanea/crea primero el carnet." });

  db.radiosExpected = uniqueArray([...db.radiosExpected, code]);

  if (db.assignments[code]) {
    const assignedRut = db.assignments[code].person_rut;
    const assignedPerson = db.people[assignedRut];
    return res.status(409).json({
      error: "Esa radio ya está asignada.",
      alreadyAssigned: {
        radio_code: code,
        rut: assignedRut,
        name: assignedPerson?.name || "(sin nombre)",
        assigned_at: db.assignments[code].assigned_at
      }
    });
  }

  db.assignments[code] = { radio_code: code, person_rut: r, assigned_at: nowIso() };
  await saveDb(db);
  res.json({ ok: true });
});

app.post("/api/reassign", async (req, res) => {
  const { radioCode, newRut } = req.body || {};
  if (!radioCode || !newRut) return res.status(400).json({ error: "radioCode y newRut son requeridos" });

  const db = await loadDb();
  const code = normalizeCode(radioCode);
  const r = normalizeRut(newRut);

  if (!db.people[r]) return res.status(400).json({ error: "La persona destino no existe." });

  db.radiosExpected = uniqueArray([...db.radiosExpected, code]);
  db.assignments[code] = { radio_code: code, person_rut: r, assigned_at: nowIso() };

  await saveDb(db);
  res.json({ ok: true });
});

app.post("/api/unassign", async (req, res) => {
  const { radioCode } = req.body || {};
  if (!radioCode) return res.status(400).json({ error: "radioCode es requerido" });

  const db = await loadDb();
  const code = normalizeCode(radioCode);

  if (!db.assignments[code]) return res.json({ ok: true, removed: false });

  delete db.assignments[code];
  await saveDb(db);
  res.json({ ok: true, removed: true });
});

// ---------- RADIOS EXPECTED ----------
app.get("/api/radios/expected", async (req, res) => {
  const db = await loadDb();
  res.json((db.radiosExpected || []).slice().sort((a, b) => String(a).localeCompare(String(b))));
});

// ✅ NUEVO: Añadir 1 radio esperada (modo inventario)
app.post("/api/radios/expected/add", async (req, res) => {
  const { radioCode } = req.body || {};
  if (!radioCode) return res.status(400).json({ error: "radioCode es requerido" });

  const db = await loadDb();
  const code = normalizeCode(radioCode);

  const before = db.radiosExpected.length;
  db.radiosExpected = uniqueArray([...db.radiosExpected, code]);
  const added = db.radiosExpected.length !== before;

  await saveDb(db);
  res.json({ ok: true, added, radioCode: code });
});

app.post("/api/radios/expected/delete", async (req, res) => {
  const { radioCode } = req.body || {};
  if (!radioCode) return res.status(400).json({ error: "radioCode es requerido" });

  const db = await loadDb();
  const codeNorm = normalizeCode(radioCode);

  const before = db.radiosExpected.length;

  // ✅ borrar aunque esté guardado con puntos/espacios/etc
  db.radiosExpected = db.radiosExpected.filter(c => normalizeCode(c) !== codeNorm);
  const removedExpected = before !== db.radiosExpected.length;

  // ✅ borrar asignación aunque la key sea vieja o nueva
  let removedAssignment = false;
  for (const key of Object.keys(db.assignments)) {
    if (normalizeCode(key) === codeNorm) {
      delete db.assignments[key];
      removedAssignment = true;
    }
  }

  await saveDb(db);
  res.json({ ok: true, removedExpected, removedAssignment });
});

app.post("/api/radios/expected/import", async (req, res) => {
  const { codesText } = req.body || {};
  if (typeof codesText !== "string") return res.status(400).json({ error: "codesText es requerido" });

  const codes = codesText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  const db = await loadDb();
  db.radiosExpected = uniqueArray([...db.radiosExpected, ...codes]);

  await saveDb(db);
  res.json({ ok: true, imported: codes.length });
});

// ---------- VIEWS ----------
app.get("/api/assignments", async (req, res) => {
  const db = await loadDb();

  const rows = Object.values(db.assignments)
    .map(a => {
      const p = db.people[a.person_rut];
      return {
        radio_code: a.radio_code,
        rut: a.person_rut,
        name: p?.name || "(sin nombre)",
        assigned_at: a.assigned_at
      };
    })
    .sort((a, b) => (b.assigned_at || "").localeCompare(a.assigned_at || ""));

  res.json(rows);
});

app.get("/api/radios/missing", async (req, res) => {
  const db = await loadDb();
  const assignedSet = new Set(Object.keys(db.assignments));

  const missing = db.radiosExpected
    .filter(code => !assignedSet.has(code))
    .sort((a, b) => String(a).localeCompare(String(b)));

  res.json(missing);
});

app.get("/api/summary", async (req, res) => {
  const db = await loadDb();
  const expected = db.radiosExpected.length;
  const assigned = Object.keys(db.assignments).length;
  const people = Object.keys(db.people).length;
  res.json({ expected, assigned, missing: expected - assigned, people });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor listo en puerto", PORT));

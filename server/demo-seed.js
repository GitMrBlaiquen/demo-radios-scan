import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
    return { people: {}, radiosExpected: [], assignments: {} };
  }
}

function uniqueArray(arr) {
  return Array.from(new Set(arr));
}

async function saveDb(db) {
  const tmp = DATA_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
  await fs.rename(tmp, DATA_PATH);
}

const db = await loadDb();

for (let i = 1; i <= 50; i++) {
  db.radiosExpected.push(String(i).padStart(3, "0"));
}
db.radiosExpected = uniqueArray(db.radiosExpected);

await saveDb(db);
console.log("Seed listo: radiosExpected 001..050");
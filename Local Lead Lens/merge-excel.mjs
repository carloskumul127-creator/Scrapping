/**
 * Script para fusionar archivos Excel de nuevas ciudades al leads.json existente.
 * Mapea los campos del Excel al formato del JSON.
 * 
 * Uso: node merge-excel.mjs
 */
import XLSX from "xlsx";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Config: archivos a procesar ----
const FILES = [
  { path: "public/Veracruz_limpio.xlsx",              industry: "Arquitectos",    city: "Veracruz" },
  { path: "public/Veracruz_constructora_limpio.xlsx",  industry: "Constructoras",  city: "Veracruz" },
  { path: "public/Oaxaca_limpio.xlsx",                 industry: "Arquitectos",    city: "Oaxaca" },
  { path: "public/Oaxaca_constructora_limpio.xlsx",    industry: "Constructoras",  city: "Oaxaca" },
];

const LEADS_PATH = resolve(__dirname, "public/data/leads.json");

// ---- Step 1: Inspect columns of each Excel ----
console.log("=== Inspeccionando columnas de cada archivo ===\n");

for (const f of FILES) {
  const wb = XLSX.readFile(resolve(__dirname, f.path));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  console.log(`📄 ${f.path} → ${rows.length} filas`);
  if (rows.length > 0) {
    console.log("   Columnas:", Object.keys(rows[0]).join(", "));
    console.log("   Ejemplo fila 1:", JSON.stringify(rows[0], null, 2));
  }
  console.log();
}

#!/usr/bin/env node
/**
 * ============================================================================
 * DiDe - Artillery Yuk Testi Orkestratoru
 * ============================================================================
 *
 * TEK KOMUT - her seyi yapar:
 *   1) DB'de gecici test kullanicilari olusturur
 *   2) Artillery testini calistirir
 *   3) Test bitince OTOMATIK temizler (DB + CSV)
 *
 * KULLANIM:
 *   node run-load-test.js                  # Testi calistir
 *   node run-load-test.js --report         # Test + HTML rapor
 *   node run-load-test.js --keep-users     # Temizleme yapma (debug)
 *   node run-load-test.js --cleanup-only   # Sadece eski artiklari temizle
 *
 * .env'e eklenecekler (4 satir):
 *   TARGET_URL=http://localhost:3000
 *   TOTAL_VU_PER_SEC=10
 *   TEST_DURATION_SEC=60
 *   RAMP_DURATION_SEC=30
 * ============================================================================
 */

"use strict";

const path          = require("path");
const fs            = require("fs");
const { execSync }  = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

let bcrypt, Pool;
try {
  bcrypt = require("bcrypt");
  Pool   = require("pg").Pool;
} catch (err) {
  console.error("HATA: 'bcrypt' veya 'pg' bulunamadi. npm install calistirin.");
  process.exit(1);
}

// ── Sabitler ──────────────────────────────────────────────────────────────

const PREFIX         = "artillery_test_";
const AUTO_PASSWORD  = "ArtLoad_2026!x";
const SV_COUNT       = parseInt(process.env.ARTILLERY_SUPERVISOR_COUNT || "3", 10);
const UZ_COUNT       = parseInt(process.env.ARTILLERY_UZMAN_COUNT      || "5", 10);

const CSV_SV         = path.join(__dirname, "test-users-supervisor.csv");
const CSV_UZ         = path.join(__dirname, "test-users-uzman.csv");
const RESULTS_JSON   = path.join(__dirname, "artillery-results.json");
const REPORT_HTML    = path.join(__dirname, "artillery-rapor.html");
const YML_PATH       = path.join(__dirname, "load-test.yml");

const args           = process.argv.slice(2);
const FLAG_REPORT    = args.includes("--report");
const FLAG_KEEP      = args.includes("--keep-users");
const FLAG_CLEANUP   = args.includes("--cleanup-only");

// ── DB ───────────────────────────────────────────────────────────────────

const pool = new Pool({
  host:     process.env.PGHOST     || "localhost",
  port:     parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "dide",
  user:     process.env.PGUSER     || "postgres",
  password: process.env.PGPASSWORD || "",
});

// ── Kullanici Olustur ────────────────────────────────────────────────────

async function createTestUsers() {
  console.log("\n[1/4] Test kullanicilari olusturuluyor...");

  const client = await pool.connect();
  const created = { supervisor: [], user: [] };

  try {
    // Sifreyi hashle (index.js L:2323 ile ayni yontem)
    const hash = await bcrypt.hash(AUTO_PASSWORD, 10);

    for (const [role, count] of [["supervisor", SV_COUNT], ["user", UZ_COUNT]]) {
      for (let i = 1; i <= count; i++) {
        const username = `${PREFIX}${role}_${i}`;
        const email    = `${username}@artillery-test.local`;

        // Zaten var mi?
        const existing = await client.query(
          "SELECT id FROM users WHERE username = $1", [username]
        );
        if (existing.rows.length > 0) {
          created[role].push(username);
          console.log(`      ~ ${username} (zaten var)`);
          continue;
        }

        // ─────────────────────────────────────────────────────────
        // KRITIK FIX: DB trigger (app_api.users_before_ins_upd)
        // INSERT oncesi set_config('app.password_plain') ZORUNLU.
        // Bu pattern index.js L:2321 ile birebir ayni.
        // ─────────────────────────────────────────────────────────
        await client.query("BEGIN");
        try {
          // 1) Duz sifreyi session degiskenine yaz (trigger okuyacak)
          await client.query(
            `SELECT set_config('app.password_plain', $1, true)`,
            [AUTO_PASSWORD]
          );

          // 2) INSERT
          await client.query(
            `INSERT INTO users (
               username, password_hash, role, name, surname, email,
               email_verified, is_verified, is_active,
               two_factor_enabled, two_factor_secret
             ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, TRUE, FALSE, NULL)`,
            [username, hash, role, `Test_${role}`, `${i}`, email]
          );

          await client.query("COMMIT");
          created[role].push(username);
          console.log(`      + ${username}`);

        } catch (insertErr) {
          try { await client.query("ROLLBACK"); } catch {}

          if (insertErr.code === "23505" || insertErr.code === "P0002") {
            created[role].push(username);
            console.log(`      ~ ${username} (zaten var)`);
          } else {
            console.error(`      x ${username}: ${insertErr.message}`);
          }
        } finally {
          // 3) Duz sifreyi temizle (index.js L:2353)
          try {
            await client.query(
              `SELECT set_config('app.password_plain', NULL, true)`
            );
          } catch {}
        }
      }
    }

    // CSV olustur
    for (const [role, file] of [["supervisor", CSV_SV], ["user", CSV_UZ]]) {
      let csv = "username,password\n";
      created[role].forEach(u => { csv += `${u},${AUTO_PASSWORD}\n`; });
      fs.writeFileSync(file, csv, "utf-8");
    }

    console.log(`\n      Supervisor : ${created.supervisor.length}`);
    console.log(`      Uzman/User : ${created.user.length}`);
    console.log(`      CSV'ler yazildi.`);

    return created;
  } finally {
    client.release();
  }
}

// ── Temizle ──────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n[4/4] Temizlik yapiliyor...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const olayDel = await client.query(
      `DELETE FROM olay WHERE created_by_name LIKE $1`,
      [PREFIX + "%"]
    );
    console.log(`      ${olayDel.rowCount} test olayi silindi`);

    const userDel = await client.query(
      `DELETE FROM users WHERE username LIKE $1`,
      [PREFIX + "%"]
    );
    console.log(`      ${userDel.rowCount} test kullanicisi silindi`);

    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(`      Temizlik hatasi: ${err.message}`);
  } finally {
    client.release();
  }

  for (const f of [CSV_SV, CSV_UZ]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`      ${path.basename(f)} silindi`);
    }
  }

  console.log("      Temizlik tamamlandi.\n");
}

// ── Artillery ────────────────────────────────────────────────────────────

function runArtillery() {
  console.log("\n[2/4] Artillery testi baslatiliyor...");
  console.log(`      Hedef  : ${process.env.TARGET_URL || "http://localhost:3000"}`);
  console.log(`      VU/s   : ${process.env.TOTAL_VU_PER_SEC || "10"}`);
  console.log(`      Sure   : ${process.env.TEST_DURATION_SEC || "60"}s\n`);

  try {
    execSync(
      `artillery run "${YML_PATH}" --output "${RESULTS_JSON}"`,
      { stdio: "inherit", env: process.env }
    );
    return true;
  } catch {
    console.error("\n      Artillery tamamlandi (esik asilmis olabilir).");
    return false;
  }
}

function generateReport() {
  if (!fs.existsSync(RESULTS_JSON)) return;
  console.log("\n[3/4] HTML rapor olusturuluyor...");
  try {
    execSync(
      `artillery report "${RESULTS_JSON}" --output "${REPORT_HTML}"`,
      { stdio: "inherit" }
    );
    console.log(`      Rapor: ${REPORT_HTML}`);
  } catch (err) {
    console.error(`      Rapor hatasi: ${err.message}`);
  }
}

// ── Ana ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("==========================================================");
  console.log("    DiDe - Artillery Yuk Testi Orkestratoru");
  console.log("==========================================================");

  try {
    await pool.query("SELECT 1");
    console.log(`  DB: ${process.env.PGHOST||"localhost"}:${process.env.PGPORT||"5432"}/${process.env.PGDATABASE||"dide"}`);
  } catch (err) {
    console.error(`\n  DB baglanti hatasi: ${err.message}`);
    process.exit(1);
  }

  if (FLAG_CLEANUP) {
    await cleanup();
    await pool.end();
    return;
  }

  if (!fs.existsSync(YML_PATH)) {
    console.error(`\n  HATA: ${YML_PATH} bulunamadi!`);
    process.exit(1);
  }

  try {
    await createTestUsers();
    const ok = runArtillery();
    if (FLAG_REPORT || fs.existsSync(RESULTS_JSON)) generateReport();
    console.log(ok ? "\n  Test BASARIYLA tamamlandi." : "\n  Test tamamlandi.");
  } finally {
    if (!FLAG_KEEP) {
      await cleanup();
    } else {
      console.log("\n  --keep-users aktif, temizlik YAPILMADI.");
      console.log("  Manuel: node run-load-test.js --cleanup-only");
    }
  }

  await pool.end();
}

// CTRL+C temizlik
let cleaning = false;
async function emergencyCleanup() {
  if (cleaning) return;
  cleaning = true;
  console.log("\n\n  Durduruldu, temizlik yapiliyor...");
  if (!FLAG_KEEP) { try { await cleanup(); } catch {} }
  try { await pool.end(); } catch {}
  process.exit(0);
}
process.on("SIGINT",  emergencyCleanup);
process.on("SIGTERM", emergencyCleanup);

main().catch(async (err) => {
  console.error("\nBeklenmeyen hata:", err.message);
  if (!FLAG_KEEP) { try { await cleanup(); } catch {} }
  try { await pool.end(); } catch {}
  process.exit(1);
});
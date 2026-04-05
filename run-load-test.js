"use strict";

const path         = require("path");
const fs           = require("fs");
const { execSync } = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

let bcrypt, Pool;
try {
  bcrypt = require("bcrypt");
  Pool   = require("pg").Pool;
} catch (err) {
  console.error("HATA: 'bcrypt' veya 'pg' bulunamadi. npm install calistirin.");
  process.exit(1);
}

const PREFIX        = "artillery_test_";
const AUTO_PASSWORD = "ArtLoad_2026!x";
const SV_COUNT      = parseInt(process.env.ARTILLERY_SUPERVISOR_COUNT || "3", 10);
const UZ_COUNT      = parseInt(process.env.ARTILLERY_UZMAN_COUNT      || "5", 10);

const TARGET_URL    = process.env.TARGET_URL        || "http://localhost:3000";
const VU_PER_SEC    = parseInt(process.env.TOTAL_VU_PER_SEC  || "10", 10);
const TEST_DUR      = parseInt(process.env.TEST_DURATION_SEC || "60", 10);
const RAMP_DUR      = parseInt(process.env.RAMP_DURATION_SEC || "30", 10);

const CSV_SV        = path.join(__dirname, "test-users-supervisor.csv");
const CSV_UZ        = path.join(__dirname, "test-users-uzman.csv");
const RESULTS_JSON  = path.join(__dirname, "artillery-results.json");
const REPORT_HTML   = path.join(__dirname, "artillery-rapor.html");
const YML_BASE      = path.join(__dirname, "load-test.yml");
const YML_RUN       = path.join(__dirname, ".artillery-run.yml");

const args          = process.argv.slice(2);
const FLAG_REPORT   = args.includes("--report");
const FLAG_KEEP     = args.includes("--keep-users");
const FLAG_CLEANUP  = args.includes("--cleanup-only");

const pool = new Pool({
  host:     process.env.PGHOST     || "localhost",
  port:     parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "dide",
  user:     process.env.PGUSER     || "postgres",
  password: process.env.PGPASSWORD || "",
});

// ── Gecici YAML Olustur ──────────────────────────────────────────────────
// load-test.yml'i okur, config.target ve phases degerlerini .env'den
// gelen degerlerle degistirip .artillery-run.yml olarak yazar.
// Boylece --overrides veya --target CLI flag'i GEREKMEZ.

function buildRunYaml() {
  let yml = fs.readFileSync(YML_BASE, "utf-8");

  // target degistir
  yml = yml.replace(
    /^(\s*target:\s*)"[^"]*"/m,
    `$1"${TARGET_URL}"`
  );

  // phases blogunun tamamini degistir
  const newPhases = [
    `    - name: "Isinma Fazi"`,
    `      duration: ${RAMP_DUR}`,
    `      arrivalRate: 1`,
    `      rampTo: ${VU_PER_SEC}`,
    ``,
    `    - name: "Sabit Yuk Fazi"`,
    `      duration: ${TEST_DUR}`,
    `      arrivalRate: ${VU_PER_SEC}`,
    ``,
    `    - name: "Soguma Fazi"`,
    `      duration: 10`,
    `      arrivalRate: ${VU_PER_SEC}`,
    `      rampTo: 1`,
  ].join("\n");

  yml = yml.replace(
    /phases:[\s\S]*?(?=\n  payload:)/m,
    `phases:\n${newPhases}\n\n  `
  );

  fs.writeFileSync(YML_RUN, yml, "utf-8");
}

// ── Kullanici Olustur ────────────────────────────────────────────────────

async function createTestUsers() {
  console.log("\n[1/4] Test kullanicilari olusturuluyor...");

  const client  = await pool.connect();
  const created = { supervisor: [], user: [] };

  try {
    const hash = await bcrypt.hash(AUTO_PASSWORD, 10);

    for (const [role, count] of [["supervisor", SV_COUNT], ["user", UZ_COUNT]]) {
      for (let i = 1; i <= count; i++) {
        const username = `${PREFIX}${role}_${i}`;
        const email    = `${username}@artillery-test.local`;

        const existing = await client.query(
          "SELECT id FROM users WHERE username = $1", [username]
        );
        if (existing.rows.length > 0) {
          created[role].push(username);
          console.log(`      ~ ${username} (zaten var)`);
          continue;
        }

        await client.query("BEGIN");
        try {
          await client.query(
            `SELECT set_config('app.password_plain', $1, true)`,
            [AUTO_PASSWORD]
          );
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
          try { await client.query(`SELECT set_config('app.password_plain', NULL, true)`); } catch {}
        }
      }
    }

    for (const [role, file] of [["supervisor", CSV_SV], ["user", CSV_UZ]]) {
      let csv = "username,password\n";
      created[role].forEach(u => { csv += `${u},${AUTO_PASSWORD}\n`; });
      fs.writeFileSync(file, csv, "utf-8");
    }

    console.log(`\n      Supervisor : ${created.supervisor.length}`);
    console.log(`      Uzman/User : ${created.user.length}`);
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
      `DELETE FROM olay WHERE created_by_name LIKE $1`, [PREFIX + "%"]
    );
    console.log(`      ${olayDel.rowCount} test olayi silindi`);
    const userDel = await client.query(
      `DELETE FROM users WHERE username LIKE $1`, [PREFIX + "%"]
    );
    console.log(`      ${userDel.rowCount} test kullanicisi silindi`);
    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(`      Temizlik hatasi: ${err.message}`);
  } finally {
    client.release();
  }

  for (const f of [CSV_SV, CSV_UZ, YML_RUN]) {
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
  console.log(`      Hedef  : ${TARGET_URL}`);
  console.log(`      VU/s   : ${VU_PER_SEC}`);
  console.log(`      Sure   : ${TEST_DUR}s`);
  console.log(`      Rampa  : ${RAMP_DUR}s\n`);

  // .env degerlerini iceren gecici YAML olustur
  buildRunYaml();

  try {
    execSync(
      `artillery run "${YML_RUN}" --output "${RESULTS_JSON}"`,
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
    execSync(`artillery report "${RESULTS_JSON}" --output "${REPORT_HTML}"`, { stdio: "inherit" });
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

  if (FLAG_CLEANUP) { await cleanup(); await pool.end(); return; }

  if (!fs.existsSync(YML_BASE)) {
    console.error(`\n  HATA: ${YML_BASE} bulunamadi!`);
    process.exit(1);
  }

  try {
    await createTestUsers();
    const ok = runArtillery();
    if (FLAG_REPORT || fs.existsSync(RESULTS_JSON)) generateReport();
    console.log(ok ? "\n  Test BASARIYLA tamamlandi." : "\n  Test tamamlandi.");
  } finally {
    if (!FLAG_KEEP) { await cleanup(); }
    else {
      console.log("\n  --keep-users aktif, temizlik YAPILMADI.");
      console.log("  Manuel: node run-load-test.js --cleanup-only");
    }
  }
  await pool.end();
}

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


"use strict";

const path          = require("path");
const fs            = require("fs");
const { execSync }  = require("child_process");

// .env yukle
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
const SV_COUNT       = parseInt(process.env.ARTILLERY_SUPERVISOR_COUNT, 10);
const UZ_COUNT       = parseInt(process.env.ARTILLERY_UZMAN_COUNT, 10);

const CSV_SV         = path.join(__dirname, "test-users-supervisor.csv");
const CSV_UZ         = path.join(__dirname, "test-users-uzman.csv");
const RESULTS_JSON   = path.join(__dirname, "artillery-results.json");
const REPORT_HTML    = path.join(__dirname, "artillery-rapor.html");
const YML_PATH       = path.join(__dirname, "load-test.yml");

// CLI argumanlari
const args           = process.argv.slice(2);
const FLAG_REPORT    = args.includes("--report");
const FLAG_KEEP      = args.includes("--keep-users");
const FLAG_CLEANUP   = args.includes("--cleanup-only");

// ── DB Baglantisi ────────────────────────────────────────────────────────

const pool = new Pool({
  host:     process.env.PGHOST     || "localhost",
  port:     parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "dide",
  user:     process.env.PGUSER     || "postgres",
  password: process.env.PGPASSWORD || "",
});

// ── Olustur ──────────────────────────────────────────────────────────────

async function createTestUsers() {
  console.log("\n[1/4] Test kullanicilari olusturuluyor...");

  const client = await pool.connect();
  const createdUsers = { supervisor: [], user: [] };

  try {
    await client.query("BEGIN");

    const hash = await bcrypt.hash(AUTO_PASSWORD, 10);

    for (const [role, count] of [["supervisor", SV_COUNT], ["user", UZ_COUNT]]) {
      for (let i = 1; i <= count; i++) {
        const username = `${PREFIX}${role}_${i}`;
        const email    = `${username}@artillery-test.local`;

        // Varsa atla
        const existing = await client.query(
          "SELECT id FROM users WHERE username = $1", [username]
        );

        if (existing.rows.length > 0) {
          createdUsers[role].push(username);
          continue;
        }

        await client.query(
          `INSERT INTO users (
             username, password_hash, role, name, surname, email,
             email_verified, is_verified, is_active,
             two_factor_enabled, two_factor_secret
           ) VALUES ($1,$2,$3,$4,$5,$6, TRUE,TRUE,TRUE, FALSE,NULL)`,
          [username, hash, role, `Test_${role}`, `${i}`, email]
        );
        createdUsers[role].push(username);
      }
    }

    await client.query("COMMIT");

    // CSV dosyalari olustur
    for (const [role, file] of [["supervisor", CSV_SV], ["user", CSV_UZ]]) {
      let csv = "username,password\n";
      createdUsers[role].forEach(u => { csv += `${u},${AUTO_PASSWORD}\n`; });
      fs.writeFileSync(file, csv, "utf-8");
    }

    console.log(`      Supervisor : ${createdUsers.supervisor.length} kullanici`);
    console.log(`      Uzman/User : ${createdUsers.user.length} kullanici`);
    console.log(`      CSV'ler yazildi.`);

    return createdUsers;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
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

    // 1) Test kullanicilarinin olusturdugu olaylari kalici sil
    const olayDel = await client.query(
      `DELETE FROM olay WHERE created_by_name LIKE $1`,
      [PREFIX + "%"]
    );
    console.log(`      ${olayDel.rowCount} test olayi DB'den silindi`);

    // 2) Test kullanicilarini kalici sil
    const userDel = await client.query(
      `DELETE FROM users WHERE username LIKE $1`,
      [PREFIX + "%"]
    );
    console.log(`      ${userDel.rowCount} test kullanicisi DB'den silindi`);

    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(`      Temizlik hatasi: ${err.message}`);
  } finally {
    client.release();
  }

  // 3) CSV dosyalarini sil
  for (const f of [CSV_SV, CSV_UZ]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`      ${path.basename(f)} silindi`);
    }
  }

  console.log("      Temizlik tamamlandi.\n");
}

// ── Artillery Calistir ───────────────────────────────────────────────────

function runArtillery() {
  console.log("\n[2/4] Artillery testi baslatiliyor...");
  console.log(`      Hedef  : ${process.env.TARGET_URL}`);
  console.log(`      VU/s   : ${process.env.TOTAL_VU_PER_SEC}`);
  console.log(`      Sure   : ${process.env.TEST_DURATION_SEC}s\n`);

  const cmd = `artillery run "${YML_PATH}" --output "${RESULTS_JSON}"`;

  try {
    execSync(cmd, { stdio: "inherit", env: process.env });
    return true;
  } catch (err) {
    console.error("\n      Artillery test hatasi veya esik asimi (beklenen olabilir).");
    return false;
  }
}

function generateReport() {
  if (!fs.existsSync(RESULTS_JSON)) {
    console.log("\n[3/4] JSON sonuc dosyasi bulunamadi, rapor olusturulamadi.");
    return;
  }

  console.log("\n[3/4] HTML rapor olusturuluyor...");

  try {
    execSync(
      `artillery report "${RESULTS_JSON}" --output "${REPORT_HTML}"`,
      { stdio: "inherit" }
    );
    console.log(`      Rapor: ${REPORT_HTML}`);
  } catch (err) {
    console.error(`      Rapor olusturma hatasi: ${err.message}`);
  }
}

// ── Ana Akis ─────────────────────────────────────────────────────────────

async function main() {

  // Baglanti testi
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error(`\nDB baglanti hatasi: ${err.message}`);
    console.error(".env'deki PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE kontrol edin.");
    process.exit(1);
  }

  // Sadece temizlik modu
  if (FLAG_CLEANUP) {
    await cleanup();
    await pool.end();
    return;
  }

  // load-test.yml var mi?
  if (!fs.existsSync(YML_PATH)) {
    console.error(`\nHATA: ${YML_PATH} bulunamadi!`);
    process.exit(1);
  }

  // ── ANA AKIS: Olustur → Test → Temizle ──
  try {
    // 1) Test kullanicilarini olustur
    await createTestUsers();

    // 2) Artillery testini calistir
    const success = runArtillery();

    // 3) Rapor 
    if (FLAG_REPORT || fs.existsSync(RESULTS_JSON)) {
      generateReport();
    }

    if (success) {
      console.log("\n  Test BASARIYLA tamamlandi.");
    } else {
      console.log("\n  Test tamamlandi (bazi esikler asilmis olabilir).");
    }

  } finally {

    if (!FLAG_KEEP) {
      await cleanup();
    } else {
      console.log("\n  --keep-users flagi aktif, temizlik YAPILMADI.");
      console.log("  Manuel temizlik: node run-load-test.js --cleanup-only");
    }
  }

  await pool.end();
}


let cleanupDone = false;
async function emergencyCleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  console.log("\n\n  SIGINT/SIGTERM yakalandi, temizlik yapiliyor...");
  if (!FLAG_KEEP) {
    try { await cleanup(); } catch {}
  }
  try { await pool.end(); } catch {}
  process.exit(0);
}
process.on("SIGINT",  emergencyCleanup);
process.on("SIGTERM", emergencyCleanup);

main().catch(async (err) => {
  console.error("\nBeklenmeyen hata:", err.message);
  if (!FLAG_KEEP) {
    try { await cleanup(); } catch {}
  }
  try { await pool.end(); } catch {}
  process.exit(1);
});
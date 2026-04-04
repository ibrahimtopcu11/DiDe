"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Varsayilan degerler
const defaults = {
  TARGET_URL:        "http://localhost:3000",
  TOTAL_VU_PER_SEC:  "10",
  TEST_DURATION_SEC: "60",
  RAMP_DURATION_SEC: "30",
};

Object.entries(defaults).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});

// Bilgi mesaji

console.log(`  Hedef       : ${process.env.TARGET_URL}`);
console.log(`  VU/saniye   : ${process.env.TOTAL_VU_PER_SEC}`);
console.log(`  Test suresi : ${process.env.TEST_DURATION_SEC}s`);
console.log(`  Rampa suresi: ${process.env.RAMP_DURATION_SEC}s`);
console.log("══════════════════════════════════════════════════════\n");


function saveCreatedOlayId(requestParams, response, context, ee, next) {
  try {
    if (response && response.body) {
      const body = typeof response.body === "string"
        ? JSON.parse(response.body)
        : response.body;

      const olayId = body.olay_id || body.id
        || (body.data && (body.data.olay_id || body.data.id))
        || null;

      if (olayId) {
        context.vars.createdOlayId = olayId;
        context.vars.newOlayId     = olayId;
      }
    }
  } catch (_) { /* JSON parse hatasi - devam et */ }
  return next();
}

module.exports = { saveCreatedOlayId };
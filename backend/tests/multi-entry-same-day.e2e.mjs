import assert from "node:assert/strict";
import mongoose from "mongoose";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4001/api";
const MONGO_URI = process.env.MONGODB_URI ?? "mongodb://admin:123456@localhost:27017/mouse_lottery?authSource=admin";

function randomPhone() {
  return `+2547${Math.floor(Math.random() * 90000000 + 10000000)}`;
}

async function post(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { status: res.status, json };
}

async function get(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return { status: res.status, json };
}

function pushPayload(number, timestampMs) {
  const date = new Date(timestampMs);
  return {
    date: date.toISOString().slice(0, 10),
    created_at: timestampMs,
    port: "e2e-test",
    data: {
      sn: "SIM-E2E",
      number,
      timestamp: date.toISOString(),
    },
  };
}

async function main() {
  const password = "Pass1234!";
  const phone = randomPhone();

  const reg = await post("/auth/register", { phone, password });
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.json)}`);

  const token = reg.json.accessToken;
  assert.ok(token, "missing access token");

  const firstEntryRes = await post("/game/entries", { numbers: [1, 2, 3, 4] }, token);
  const secondEntryRes = await post("/game/entries", { numbers: [5, 6, 7, 8] }, token);

  assert.equal(firstEntryRes.status, 201, `create first entry failed: ${JSON.stringify(firstEntryRes.json)}`);
  assert.equal(secondEntryRes.status, 201, `create second entry failed: ${JSON.stringify(secondEntryRes.json)}`);

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const entries = db.collection("entries");
  const jackpotStates = db.collection("jackpot_states");

  const user = await users.findOne({ phone });
  assert.ok(user?._id, "user not found in db");

  const baseTs = Date.now() + 500;

  // Start from known jackpot state so first settlement has non-zero payout.
  await jackpotStates.updateOne(
    { scope: "global" },
    {
      $set: {
        scope: "global",
        currentAmountKES: 5000,
        currency: "KES",
        lastAccumulatedAt: new Date(baseTs),
      },
    },
    { upsert: true },
  );

  await mongoose.disconnect();

  const preSettlementEntries = await get("/game/my-entries", token);
  assert.equal(preSettlementEntries.status, 200, "pre-settlement entries fetch failed");
  assert.ok(Array.isArray(preSettlementEntries.json), "pre-settlement entries payload is not array");

  const pendingEntries = preSettlementEntries.json.filter((entry) => entry.status === "Pending");
  const pendingByNumbers = new Set(pendingEntries.map((entry) => entry.numbers.join("")));
  assert.ok(pendingByNumbers.has("1234"), "first entry should remain Pending before draw");
  assert.ok(pendingByNumbers.has("5678"), "second entry should remain Pending before draw");

  const pushResults = [];
  for (const [index, number] of [1, 2, 3, 4, 5, 6, 7, 8].entries()) {
    const result = await post("/game/push", pushPayload(number, baseTs + index));
    pushResults.push(result);
  }

  for (const result of pushResults) {
    assert.equal(result.status, 201, `push failed: ${JSON.stringify(result.json)}`);
  }

  const entriesAfter = await get("/game/my-entries", token);
  const creditsAfter = await get("/game/my-wallet-credits", token);

  assert.equal(entriesAfter.status, 200, "post-settlement entries fetch failed");
  assert.equal(creditsAfter.status, 200, "post-settlement credits fetch failed");
  assert.ok(Array.isArray(entriesAfter.json), "post-settlement entries payload is not array");
  assert.ok(Array.isArray(creditsAfter.json), "post-settlement credits payload is not array");

  const entryByNumbers = new Map(entriesAfter.json.map((entry) => [entry.numbers.join(""), entry]));
  const firstFinal = entryByNumbers.get("1234");
  const secondFinal = entryByNumbers.get("5678");

  assert.ok(firstFinal, "first entry not found after draw");
  assert.ok(secondFinal, "second entry not found after draw");
  assert.equal(firstFinal.status, "Won", `first entry should be Won, got ${firstFinal.status}`);
  assert.equal(secondFinal.status, "Won", `second entry should be Won, got ${secondFinal.status}`);
  assert.notEqual(firstFinal.status, "Voided", "first entry should not be Voided");
  assert.notEqual(secondFinal.status, "Voided", "second entry should not be Voided");

  const creditedEntryIds = new Set(creditsAfter.json.map((credit) => credit.entryId));
  assert.ok(creditedEntryIds.has(firstFinal.id), "missing payout record for first entry");
  assert.ok(creditedEntryIds.has(secondFinal.id), "missing payout record for second entry");

  console.log("multi-entry-same-day.e2e passed");
}

main().catch((error) => {
  console.error("multi-entry-same-day.e2e failed:", error);
  process.exit(1);
});

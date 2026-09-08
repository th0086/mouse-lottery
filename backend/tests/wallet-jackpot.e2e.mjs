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
  const phoneA = randomPhone();
  const phoneB = randomPhone();

  const regA = await post("/auth/register", { phone: phoneA, password });
  const regB = await post("/auth/register", { phone: phoneB, password });

  assert.equal(regA.status, 201, `register A failed: ${JSON.stringify(regA.json)}`);
  assert.equal(regB.status, 201, `register B failed: ${JSON.stringify(regB.json)}`);

  const tokenA = regA.json.accessToken;
  const tokenB = regB.json.accessToken;

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const entries = db.collection("entries");
  const jackpotStates = db.collection("jackpot_states");

  const userA = await users.findOne({ phone: phoneA });
  const userB = await users.findOne({ phone: phoneB });

  assert.ok(userA?._id, "user A not found in db");
  assert.ok(userB?._id, "user B not found in db");

  // Start from known jackpot amount and deterministic accumulation clock.
  const baseTs = Date.now() + 500;
  await jackpotStates.updateOne(
    { scope: "global" },
    {
      $set: {
        scope: "global",
        currentAmountKES: 1000,
        currency: "KES",
        lastAccumulatedAt: new Date(baseTs - 3000),
      },
    },
    { upsert: true },
  );

  const createA = await post("/game/entries", { numbers: [9, 8, 7, 6] }, tokenA);
  const createB = await post("/game/entries", { numbers: [9, 8, 7, 6] }, tokenB);

  assert.equal(createA.status, 201, `create entry A failed: ${JSON.stringify(createA.json)}`);
  assert.equal(createB.status, 201, `create entry B failed: ${JSON.stringify(createB.json)}`);

  await mongoose.disconnect();

  const pushes = [];
  for (const [index, number] of [9, 8, 7, 6].entries()) {
    const pushResult = await post("/game/push", pushPayload(number, baseTs + index));
    pushes.push(pushResult);
  }

  for (const pushResult of pushes) {
    assert.equal(pushResult.status, 201, `push failed: ${JSON.stringify(pushResult.json)}`);
  }

  const meA = await get("/auth/me", tokenA);
  const meB = await get("/auth/me", tokenB);
  const state = await get("/game/state");
  const creditsA = await get("/game/my-wallet-credits", tokenA);
  const entriesA = await get("/game/my-entries", tokenA);

  assert.equal(meA.status, 200, "me A failed");
  assert.equal(meB.status, 200, "me B failed");
  assert.equal(state.status, 200, "game state failed");
  assert.equal(creditsA.status, 200, "wallet credits A failed");
  assert.equal(entriesA.status, 200, "my entries A failed");

  assert.ok(meA.json.walletBalanceKES > 0, `wallet A should receive payout, got ${meA.json.walletBalanceKES}`);
  assert.equal(meA.json.walletBalanceKES, meB.json.walletBalanceKES, "wallet payouts should be equal for equal winners");
  assert.equal(state.json.jackpot.amount, 0, `jackpot not reset: ${state.json.jackpot.amount}`);

  assert.ok(Array.isArray(creditsA.json), "wallet credits payload is not array");
  assert.ok(creditsA.json.length > 0, "wallet credits should contain payout records");
  assert.equal(creditsA.json[0].payoutKES, meA.json.walletBalanceKES, "credit payout should equal wallet increment");

  assert.ok(Array.isArray(entriesA.json), "entries payload is not array");
  assert.equal(entriesA.json[0].status, "Won", `entry status mismatch: ${entriesA.json[0].status}`);
  assert.equal(entriesA.json[0].payoutKES, meA.json.walletBalanceKES, "entry payout should match wallet increment");

  console.log("wallet-jackpot.e2e passed");
}

main().catch((error) => {
  console.error("wallet-jackpot.e2e failed:", error);
  process.exit(1);
});

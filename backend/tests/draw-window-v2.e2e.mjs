import assert from "node:assert/strict";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4001/api";

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

async function pushSequence(numbers, baseTs) {
  for (const [index, number] of numbers.entries()) {
    const result = await post("/game/push", pushPayload(number, baseTs + index));
    assert.equal(result.status, 201, `push failed: ${JSON.stringify(result.json)}`);
  }
}

async function fetchLatestEntry(token) {
  const entriesRes = await get("/game/my-entries", token);
  assert.equal(entriesRes.status, 200, "my-entries request failed");
  assert.ok(Array.isArray(entriesRes.json), "my-entries payload is not array");
  assert.ok(entriesRes.json.length > 0, "expected at least one entry");
  return entriesRes.json[0];
}

async function main() {
  const password = "Pass1234!";
  const phone = randomPhone();

  const reg = await post("/auth/register", { phone, password });
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.json)}`);

  const token = reg.json.accessToken;
  assert.ok(token, "missing access token");

  // Non-destructive regression: no DB reset, only one new entry.
  // This must remain Pending after day rollover at the 53rd draw and only become Unmatched at the 54th draw.
  const baseTs = Date.now();
  await pushSequence([0, 1, 2, 3], baseTs);

  const createRes = await post("/game/entries", { numbers: [1, 2, 3, 4] }, token);
  assert.equal(createRes.status, 201, `create entry failed: ${JSON.stringify(createRes.json)}`);

  let latest = await fetchLatestEntry(token);
  assert.equal(latest.status, "Pending", "entry should start as Pending");
  assert.equal(latest.drawsSincePlaced, 0, `drawsSincePlaced mismatch: ${latest.drawsSincePlaced}`);
  assert.equal(latest.numbersUntilExpiry, 53, `numbersUntilExpiry mismatch: ${latest.numbersUntilExpiry}`);

  const DAY_MS = 24 * 60 * 60 * 1000;
  await pushSequence(Array.from({ length: 53 }, () => 9), baseTs + DAY_MS);
  latest = await fetchLatestEntry(token);
  assert.equal(latest.status, "Pending", `entry should remain Pending at #53 even across day rollover, got ${latest.status}`);
  assert.equal(latest.drawsSincePlaced, 53, `drawsSincePlaced at #53 mismatch: ${latest.drawsSincePlaced}`);
  assert.equal(latest.numbersUntilExpiry, 0, `numbersUntilExpiry at #53 mismatch: ${latest.numbersUntilExpiry}`);

  await pushSequence([9], baseTs + DAY_MS + 1000);
  latest = await fetchLatestEntry(token);
  assert.equal(latest.status, "Unmatched", `entry should be marked as Unmatched at #54, got ${latest.status}`);

  console.log("draw-window-v2.e2e passed");
}

main().catch((error) => {
  console.error("draw-window-v2.e2e failed:", error);
  process.exit(1);
});

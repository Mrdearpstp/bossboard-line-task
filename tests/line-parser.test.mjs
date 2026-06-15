import assert from "node:assert/strict";
import {
  parseNaturalTask,
  verifyLineWebhookSignature
} from "../functions/api/[[path]].js";

const now = new Date("2026-06-15T05:00:00Z");

const cases = [
  {
    text: "ประชุม วันนี้ 17.00",
    expected: { title: "ประชุม", dueDate: "2026-06-15", dueTime: "17:00" }
  },
  {
    text: "ประชุม วันนี้",
    expected: { title: "ประชุม", dueDate: "2026-06-15", dueTime: "" }
  },
  {
    text: "สรุปค่าโฆษณา วันที่ 5 เดือนหน้า",
    expected: { title: "สรุปค่าโฆษณา", dueDate: "2026-07-05", dueTime: "" }
  },
  {
    text: "ส่งรายงาน วันที่ 15 กันยายน 2569 เวลา 09:30",
    expected: { title: "ส่งรายงาน", dueDate: "2026-09-15", dueTime: "09:30" }
  },
  {
    text: "เตือนกินยา พรุ่งนี้ 2 ทุ่ม",
    expected: { title: "เตือนกินยา", dueDate: "2026-06-16", dueTime: "20:00" }
  }
];

for (const item of cases) {
  const parsed = parseNaturalTask(item.text, now);
  assert.deepEqual(
    { title: parsed.title, dueDate: parsed.dueDate, dueTime: parsed.dueTime },
    item.expected,
    item.text
  );
}

console.log(`LINE parser passed ${cases.length} cases`);

const secret = "test-channel-secret";
const rawBody = new TextEncoder().encode('{"events":[]}');
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);
const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
const signature = Buffer.from(digest).toString("base64");
assert.equal(await verifyLineWebhookSignature(rawBody, signature, secret), true);
assert.equal(await verifyLineWebhookSignature(rawBody, "invalid", secret), false);
console.log("LINE signature verification passed");

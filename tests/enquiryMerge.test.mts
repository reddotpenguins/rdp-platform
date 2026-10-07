import assert from "node:assert/strict";
import test from "node:test";
import { defaultMergeChoice, isTicketId, mergeFields, normaliseMergedPhone, phoneMatchKey, validateMergeChoices } from "../lib/enquiryMerge.ts";

test("phone matches ignore formatting without guessing local country codes or extensions", () => {
  assert.equal(phoneMatchKey("6500000000"), phoneMatchKey("+65 0000-0000"));
  assert.equal(normaliseMergedPhone("6500000000"), "+6500000000");
  assert.equal(normaliseMergedPhone("+6500000000"), "+6500000000");
  assert.notEqual(phoneMatchKey("00000000"), phoneMatchKey("+6500000000"));
  assert.equal(phoneMatchKey("+6500000000 ext 2"), "");
  assert.equal(phoneMatchKey(null), "");
});

test("merge defaults fill missing fields and preserve both narrative histories", () => {
  assert.equal(defaultMergeChoice("phone", null, "6500000000"), "source");
  assert.equal(defaultMergeChoice("message", "First enquiry", "Trial follow-up"), "combine");
  assert.equal(defaultMergeChoice("message", "Same", "Same"), "target");
  assert.equal(defaultMergeChoice("status", "trial_booked", "new"), "target");
});

test("merge requests allow only explicit choices over editable fields", () => {
  const choices = Object.fromEntries(mergeFields.map(([key]) => [key, "target"]));
  assert.equal(validateMergeChoices(choices), true);
  assert.equal(validateMergeChoices({ ...choices, id: "source" }), false);
  assert.equal(validateMergeChoices({ ...choices, phone: "combine" }), false);
  assert.equal(validateMergeChoices({ ...choices, notes: "combine" }), true);
  assert.equal(validateMergeChoices({}), false);
  assert.equal(isTicketId("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isTicketId("x),target.eq.other"), false);
});

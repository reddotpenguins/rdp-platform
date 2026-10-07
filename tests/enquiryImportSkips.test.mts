import assert from "node:assert/strict";
import test from "node:test";
import { escapeSkipSearch, isSkipDecision, skipQueuePage, validateSkipReview } from "../lib/enquiryImportSkips.ts";

test("review accepts only known decisions, a valid ID and meaningful bounded notes", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(validateSkipReview(id, "existing_record", "Checked against the enquiry"), null);
  assert.ok(validateSkipReview(id, "delete", "Checked"));
  assert.ok(validateSkipReview(id, "__proto__", "Checked"));
  assert.ok(validateSkipReview("bad-id", "not_needed", "Checked"));
  assert.ok(validateSkipReview(id, "not_needed", "   "));
  assert.ok(validateSkipReview(id, "not_needed", "a".repeat(4001)));
  assert.equal(isSkipDecision("constructor"), false);
});

test("pagination rejects invalid offsets and search treats wildcards as literal input", () => {
  for (const value of [undefined, "", "-1", "0", "1.5", "Infinity", "100001"]) assert.equal(skipQueuePage(value), 1);
  assert.equal(skipQueuePage("3"), 3);
  assert.equal(escapeSkipSearch("  100%_\\  "), "100\\%\\_\\\\");
});

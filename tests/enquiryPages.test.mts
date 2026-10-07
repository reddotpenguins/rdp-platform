import assert from "node:assert/strict";
import test from "node:test";
import { loadEnquiryPages } from "../lib/enquiryPages.ts";

test("enquiries beyond positions 500 and 1000 remain available for search", async () => {
  const records = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const result = await loadEnquiryPages(async (from, to) => ({
    data: records.slice(from, to + 1), error: null
  }));
  assert.deepEqual(result.data, records);
  assert.equal(result.error, null);
});

test("a smaller database response cap does not truncate the enquiry list", async () => {
  const records = Array.from({ length: 501 }, (_, id) => ({ id }));
  const result = await loadEnquiryPages(async (from, to) => ({
    data: records.slice(from, Math.min(to + 1, from + 100)), error: null
  }));
  assert.deepEqual(result.data, records);
});

test("a later page failure reports an error instead of a misleading partial list", async () => {
  const result = await loadEnquiryPages(async (from) => from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { message: "Unable to load" } });
  assert.deepEqual(result, { data: [], error: { message: "Unable to load" } });
});

test("empty enquiry tables return an empty list", async () => {
  const result = await loadEnquiryPages(async () => ({ data: [], error: null }));
  assert.deepEqual(result, { data: [], error: null });
});

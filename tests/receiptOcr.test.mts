import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractReceiptDetailsFromOcrText } from "../lib/receiptOcr.ts";

describe("receipt OCR parsing", () => {
  it("extracts common Singapore receipt fields", () => {
    const extraction = extractReceiptDetailsFromOcrText(`
      RED DOT SWIM SCHOOL
      TAX INVOICE
      Receipt No: RDP-2026-1188
      Date: 15/03/26 14:22
      Subtotal 43.58
      GST 9% 3.92
      Grand Total SGD 47.50
      Paid by Visa
    `);

    assert.equal(extraction.merchantName, "RED DOT SWIM SCHOOL");
    assert.equal(extraction.receiptNumber, "RDP-2026-1188");
    assert.equal(extraction.transactionDate, "2026-03-15");
    assert.equal(extraction.subtotal, "43.58");
    assert.equal(extraction.gstShown, "3.92");
    assert.equal(extraction.totalSpent, "47.50");
    assert.equal(extraction.amountRequested, "47.50");
    assert.equal(extraction.currency, "SGD");
    assert.equal(extraction.paymentMethod, "Visa");
    assert.equal(extraction.fieldStatuses.merchantName, "verify");
    assert.equal(extraction.fieldStatuses.receiptNumber, "confirmed");
    assert.equal(extraction.fieldStatuses.transactionDate, "confirmed");
    assert.equal(extraction.fieldStatuses.subtotal, "confirmed");
    assert.equal(extraction.fieldStatuses.gstShown, "confirmed");
    assert.equal(extraction.fieldStatuses.totalSpent, "confirmed");
    assert.equal(extraction.fieldStatuses.paymentMethod, "confirmed");
  });

  it("falls back to the largest visible amount when no total label is clear", () => {
    const extraction = extractReceiptDetailsFromOcrText(`
      POOL SUPPLIES PTE LTD
      INV 900733
      2026-08-06
      lane rope 18.00
      clips 6.40
      VISA 24.40
    `);

    assert.equal(extraction.merchantName, "POOL SUPPLIES PTE LTD");
    assert.equal(extraction.receiptNumber, "900733");
    assert.equal(extraction.transactionDate, "2026-08-06");
    assert.equal(extraction.totalSpent, "24.40");
    assert.equal(extraction.amountRequested, "24.40");
    assert.equal(extraction.fieldStatuses.totalSpent, "verify");
    assert.equal(extraction.fieldStatuses.subtotal, "missing");
    assert.equal(extraction.fieldStatuses.gstShown, "missing");
  });

  it("keeps split receipt number digits and ignores GST percentage rates", () => {
    const extraction = extractReceiptDetailsFromOcrText(`
      SWIM GEAR SHOP
      Tax Invoice
      Receipt No: 7 613
      Date: 07/08/2026
      Subtotal 40.00
      GST 9.00% 3.60
      Total SGD 43.60
      NETS
    `);

    assert.equal(extraction.receiptNumber, "7613");
    assert.equal(extraction.gstShown, "3.60");
    assert.equal(extraction.totalSpent, "43.60");
    assert.equal(extraction.fieldStatuses.receiptNumber, "confirmed");
    assert.equal(extraction.fieldStatuses.gstShown, "confirmed");
  });

  it("marks GST as needing review when it is calculated from subtotal and total", () => {
    const extraction = extractReceiptDetailsFromOcrText(`
      AQUA MART
      INV 881002
      2026-08-07
      Subtotal 100.00
      GST 9%
      Grand Total 109.00
      Paid by Card
    `);

    assert.equal(extraction.gstShown, "9.00");
    assert.equal(extraction.gstClaimable, "9.00");
    assert.equal(extraction.fieldStatuses.gstShown, "verify");
  });
});

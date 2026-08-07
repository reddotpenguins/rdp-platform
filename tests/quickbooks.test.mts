import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQuickBooksPurchasePayload,
  createQuickBooksAuthorizationUrl,
  getQuickBooksConfig,
  getQuickBooksCompanyBaseUrl,
  getQuickBooksPostingConfig,
  getQuickBooksTokenExpiryDate,
  quickBooksAccountingScope
} from "../lib/quickbooks.ts";

describe("QuickBooks OAuth helpers", () => {
  it("loads sandbox config from environment values", () => {
    const config = getQuickBooksConfig({
      QUICKBOOKS_CLIENT_ID: " client-id ",
      QUICKBOOKS_CLIENT_SECRET: " client-secret ",
      QUICKBOOKS_REDIRECT_URI: " https://example.com/api/quickbooks/callback "
    });

    assert.deepEqual(config, {
      clientId: "client-id",
      clientSecret: "client-secret",
      environment: "sandbox",
      redirectUri: "https://example.com/api/quickbooks/callback"
    });
  });

  it("requires all OAuth settings", () => {
    assert.equal(
      getQuickBooksConfig({
        QUICKBOOKS_CLIENT_ID: "client-id",
        QUICKBOOKS_REDIRECT_URI: "https://example.com/api/quickbooks/callback"
      }),
      null
    );
  });

  it("builds an authorization URL with the accounting scope", () => {
    const url = new URL(
      createQuickBooksAuthorizationUrl(
        {
          clientId: "client-id",
          clientSecret: "client-secret",
          environment: "sandbox",
          redirectUri: "https://example.com/api/quickbooks/callback"
        },
        "state-123"
      )
    );

    assert.equal(url.origin, "https://appcenter.intuit.com");
    assert.equal(url.searchParams.get("client_id"), "client-id");
    assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/quickbooks/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), quickBooksAccountingScope);
    assert.equal(url.searchParams.get("state"), "state-123");
  });

  it("calculates token expiry timestamps", () => {
    assert.equal(getQuickBooksTokenExpiryDate(90, new Date("2026-08-07T00:00:00.000Z")), "2026-08-07T00:01:30.000Z");
  });
});

describe("QuickBooks purchase posting helpers", () => {
  it("loads required posting account configuration", () => {
    const config = getQuickBooksPostingConfig({
      QUICKBOOKS_EXPENSE_ACCOUNT_ID: " 72 ",
      QUICKBOOKS_EXPENSE_ACCOUNT_MAP: "{\"Transport\":\"45\"}",
      QUICKBOOKS_PAYMENT_ACCOUNT_ID: " 42 ",
      QUICKBOOKS_PURCHASE_PAYMENT_TYPE: "Credit Card",
      QUICKBOOKS_REIMBURSEMENT_VENDOR_ID: " 99 ",
      QUICKBOOKS_PURCHASE_TAX_CODE_ID: " GST ",
      QUICKBOOKS_MINOR_VERSION: "75"
    });

    assert.deepEqual(config, {
      categoryExpenseAccountMap: {
        transport: "45"
      },
      defaultExpenseAccountId: "72",
      minorVersion: "75",
      paymentAccountId: "42",
      paymentType: "CreditCard",
      taxCodeId: "GST",
      vendorId: "99"
    });
  });

  it("requires payment and expense account IDs before posting", () => {
    assert.equal(getQuickBooksPostingConfig({ QUICKBOOKS_PAYMENT_ACCOUNT_ID: "42" }), null);
  });

  it("builds a QuickBooks Purchase payload from a claim", () => {
    const payload = buildQuickBooksPurchasePayload(
      {
        amountCents: 8640,
        businessPurpose: "Kickboards for LTS",
        categoryName: "Equipment",
        claimReference: "RDP-260807-001",
        claimantName: "Coach A",
        currency: "SGD",
        groupName: "Learn to Swim",
        gstClaimableCents: 713,
        gstShownCents: 713,
        merchantName: "Decathlon Singapore",
        notes: "Urgent replacement",
        receiptNumber: "7613",
        transactionDate: "2026-08-07"
      },
      {
        categoryExpenseAccountMap: {
          equipment: "72"
        },
        defaultExpenseAccountId: "99",
        minorVersion: "75",
        paymentAccountId: "42",
        paymentType: "Cash",
        taxCodeId: "",
        vendorId: ""
      }
    ) as {
      AccountRef: { value: string };
      DocNumber: string;
      Line: Array<{
        AccountBasedExpenseLineDetail: { AccountRef: { value: string } };
        Amount: number;
        DetailType: string;
      }>;
      PaymentType: string;
      PrivateNote: string;
      TxnDate: string;
    };

    assert.equal(payload.AccountRef.value, "42");
    assert.equal(payload.DocNumber, "RDP-260807-001");
    assert.equal(payload.Line[0].Amount, 86.4);
    assert.equal(payload.Line[0].DetailType, "AccountBasedExpenseLineDetail");
    assert.equal(payload.Line[0].AccountBasedExpenseLineDetail.AccountRef.value, "72");
    assert.equal(payload.PaymentType, "Cash");
    assert.equal(payload.TxnDate, "2026-08-07");
    assert.match(payload.PrivateNote, /Receipt no.: 7613/);
    assert.match(payload.PrivateNote, /GST shown: SGD 7.13/);
  });

  it("uses the correct QuickBooks company base URL", () => {
    assert.equal(
      getQuickBooksCompanyBaseUrl("sandbox", "company-1"),
      "https://sandbox-quickbooks.api.intuit.com/v3/company/company-1"
    );
    assert.equal(
      getQuickBooksCompanyBaseUrl("production", "company-1"),
      "https://quickbooks.api.intuit.com/v3/company/company-1"
    );
  });
});

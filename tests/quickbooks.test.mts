import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createQuickBooksAuthorizationUrl,
  getQuickBooksConfig,
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

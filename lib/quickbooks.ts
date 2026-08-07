export const quickBooksAccountingScope = "com.intuit.quickbooks.accounting";
export const quickBooksOAuthStateCookie = "rdp_qbo_oauth_state";
export const quickBooksDefaultMinorVersion = "75";

export type QuickBooksEnvironment = "sandbox" | "production";
export type QuickBooksPurchasePaymentType = "Cash" | "Check" | "CreditCard";

export type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  environment: QuickBooksEnvironment;
  redirectUri: string;
};

export type QuickBooksTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  x_refresh_token_expires_in: number;
};

export type QuickBooksPostingConfig = {
  categoryExpenseAccountMap: Record<string, string>;
  defaultExpenseAccountId: string;
  minorVersion: string;
  paymentAccountId: string;
  paymentType: QuickBooksPurchasePaymentType;
  taxCodeId: string;
  vendorId: string;
};

export type QuickBooksPurchaseInput = {
  amountCents: number;
  businessPurpose: string;
  categoryName: string;
  claimReference: string;
  claimantName: string;
  currency: string;
  groupName: string;
  gstClaimableCents: number;
  gstShownCents: number;
  merchantName: string;
  notes: string;
  receiptNumber: string;
  transactionDate: string;
};

export type QuickBooksPurchaseResult = {
  docNumber: string;
  id: string;
  syncToken: string;
};

export class QuickBooksApiError extends Error {
  payload: unknown;
  status: number;

  constructor(
    message: string,
    status: number,
    payload: unknown
  ) {
    super(message);
    this.name = "QuickBooksApiError";
    this.payload = payload;
    this.status = status;
  }
}

const authorizationEndpoint = "https://appcenter.intuit.com/connect/oauth2";
const tokenEndpoint = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export function getQuickBooksConfig(env: NodeJS.ProcessEnv = process.env): QuickBooksConfig | null {
  const clientId = env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const redirectUri = env.QUICKBOOKS_REDIRECT_URI?.trim();
  const environment = normalizeQuickBooksEnvironment(env.QUICKBOOKS_ENVIRONMENT);

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    environment,
    redirectUri
  };
}

export function getQuickBooksPostingConfig(env: NodeJS.ProcessEnv = process.env): QuickBooksPostingConfig | null {
  const paymentAccountId = env.QUICKBOOKS_PAYMENT_ACCOUNT_ID?.trim();
  const defaultExpenseAccountId = env.QUICKBOOKS_EXPENSE_ACCOUNT_ID?.trim();

  if (!paymentAccountId || !defaultExpenseAccountId) {
    return null;
  }

  return {
    categoryExpenseAccountMap: parseExpenseAccountMap(env.QUICKBOOKS_EXPENSE_ACCOUNT_MAP),
    defaultExpenseAccountId,
    minorVersion: normalizeMinorVersion(env.QUICKBOOKS_MINOR_VERSION),
    paymentAccountId,
    paymentType: normalizePaymentType(env.QUICKBOOKS_PURCHASE_PAYMENT_TYPE),
    taxCodeId: env.QUICKBOOKS_PURCHASE_TAX_CODE_ID?.trim() ?? "",
    vendorId: env.QUICKBOOKS_REIMBURSEMENT_VENDOR_ID?.trim() ?? ""
  };
}

export function createQuickBooksAuthorizationUrl(config: QuickBooksConfig, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: quickBooksAccountingScope,
    state
  });

  return `${authorizationEndpoint}?${params.toString()}`;
}

export async function exchangeQuickBooksAuthorizationCode(
  config: QuickBooksConfig,
  code: string
): Promise<QuickBooksTokenResponse> {
  return requestQuickBooksToken(config, {
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri
  });
}

export async function refreshQuickBooksAccessToken(
  config: QuickBooksConfig,
  refreshToken: string
): Promise<QuickBooksTokenResponse> {
  return requestQuickBooksToken(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
}

export function getQuickBooksCompanyBaseUrl(environment: QuickBooksEnvironment, realmId: string) {
  const host =
    environment === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";

  return `${host}/v3/company/${encodeURIComponent(realmId)}`;
}

export function buildQuickBooksPurchasePayload(
  input: QuickBooksPurchaseInput,
  config: QuickBooksPostingConfig
) {
  const expenseAccountId = resolveExpenseAccountId(input.categoryName, config);
  const lineDetail: Record<string, unknown> = {
    AccountRef: {
      value: expenseAccountId
    }
  };

  if (config.taxCodeId) {
    lineDetail.TaxCodeRef = {
      value: config.taxCodeId
    };
  }

  return removeUndefinedValues({
    AccountRef: {
      value: config.paymentAccountId
    },
    DocNumber: input.claimReference.slice(0, 21),
    EntityRef: config.vendorId
      ? {
          type: "Vendor",
          value: config.vendorId
        }
      : undefined,
    Line: [
      {
        AccountBasedExpenseLineDetail: lineDetail,
        Amount: centsToQuickBooksAmount(input.amountCents),
        Description: truncateForQuickBooks(buildPurchaseDescription(input), 4000),
        DetailType: "AccountBasedExpenseLineDetail"
      }
    ],
    PaymentType: config.paymentType,
    PrivateNote: truncateForQuickBooks(buildPurchasePrivateNote(input), 4000),
    TxnDate: normalizeQuickBooksDate(input.transactionDate)
  });
}

export async function createQuickBooksPurchase({
  accessToken,
  config,
  payload,
  realmId,
  requestId
}: {
  accessToken: string;
  config: Pick<QuickBooksConfig, "environment"> & { minorVersion?: string };
  payload: unknown;
  realmId: string;
  requestId: string;
}): Promise<QuickBooksPurchaseResult> {
  const response = await fetch(
    `${getQuickBooksCompanyBaseUrl(config.environment, realmId)}/purchase?minorversion=${
      config.minorVersion ?? quickBooksDefaultMinorVersion
    }`,
    {
      body: JSON.stringify(payload),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Request-Id": requestId
      },
      method: "POST"
    }
  );
  const responsePayload = await response.json().catch(() => ({}));
  const purchase = getResponsePurchase(responsePayload);

  if (!response.ok || !purchase?.Id) {
    throw new QuickBooksApiError(
      getQuickBooksErrorMessage(responsePayload) || "QuickBooks purchase could not be created.",
      response.status,
      responsePayload
    );
  }

  return {
    docNumber: String(purchase.DocNumber ?? ""),
    id: String(purchase.Id),
    syncToken: String(purchase.SyncToken ?? "")
  };
}

async function requestQuickBooksToken(
  config: QuickBooksConfig,
  values: Record<string, string>
): Promise<QuickBooksTokenResponse> {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams(values),
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<QuickBooksTokenResponse> & {
    error?: string;
  };

  if (
    !response.ok ||
    !payload.access_token ||
    !payload.refresh_token ||
    !payload.expires_in ||
    !payload.x_refresh_token_expires_in
  ) {
    throw new Error(payload.error || "QuickBooks authorization failed.");
  }

  return payload as QuickBooksTokenResponse;
}

export function getQuickBooksTokenExpiryDate(secondsFromNow: number, now = new Date()) {
  return new Date(now.getTime() + secondsFromNow * 1000).toISOString();
}

function normalizeQuickBooksEnvironment(value: string | undefined): QuickBooksEnvironment {
  return value?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

function normalizePaymentType(value: string | undefined): QuickBooksPurchasePaymentType {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "check") return "Check";
  if (normalized === "creditcard" || normalized === "credit_card" || normalized === "credit card") {
    return "CreditCard";
  }

  return "Cash";
}

function normalizeMinorVersion(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^\d+$/.test(trimmed) ? trimmed : quickBooksDefaultMinorVersion;
}

function parseExpenseAccountMap(value: string | undefined) {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, accountId]) => [normalizeCategoryKey(key), String(accountId ?? "").trim()])
        .filter(([, accountId]) => accountId)
    );
  } catch {
    return {};
  }
}

function resolveExpenseAccountId(categoryName: string, config: QuickBooksPostingConfig) {
  return config.categoryExpenseAccountMap[normalizeCategoryKey(categoryName)] || config.defaultExpenseAccountId;
}

function normalizeCategoryKey(value: string) {
  return value.trim().toLowerCase();
}

function centsToQuickBooksAmount(cents: number) {
  return Math.round(Number(cents || 0)) / 100;
}

function buildPurchaseDescription(input: QuickBooksPurchaseInput) {
  return [
    `RDP claim ${input.claimReference}`,
    input.categoryName ? `Category: ${input.categoryName}` : "",
    input.groupName ? `Group: ${input.groupName}` : "",
    input.businessPurpose ? `Purpose: ${input.businessPurpose}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPurchasePrivateNote(input: QuickBooksPurchaseInput) {
  return [
    `RDP claim: ${input.claimReference}`,
    input.claimantName ? `Claimant: ${input.claimantName}` : "",
    input.merchantName ? `Merchant: ${input.merchantName}` : "",
    input.receiptNumber ? `Receipt no.: ${input.receiptNumber}` : "",
    `GST shown: ${input.currency || "SGD"} ${centsToQuickBooksAmount(input.gstShownCents).toFixed(2)}`,
    `GST claimable: ${input.currency || "SGD"} ${centsToQuickBooksAmount(input.gstClaimableCents).toFixed(2)}`,
    input.notes ? `Notes: ${input.notes}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function truncateForQuickBooks(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeQuickBooksDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function removeUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedValues);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefinedValues(entryValue)])
    );
  }

  return value;
}

function getResponsePurchase(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("Purchase" in payload)) {
    return null;
  }

  return (payload as { Purchase?: { DocNumber?: unknown; Id?: unknown; SyncToken?: unknown } }).Purchase ?? null;
}

function getQuickBooksErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("Fault" in payload)) {
    return "";
  }

  const fault = (payload as { Fault?: { Error?: Array<{ Detail?: string; Message?: string }> } }).Fault;
  const firstError = fault?.Error?.[0];

  return firstError?.Detail || firstError?.Message || "";
}

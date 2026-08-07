export const quickBooksAccountingScope = "com.intuit.quickbooks.accounting";
export const quickBooksOAuthStateCookie = "rdp_qbo_oauth_state";

export type QuickBooksEnvironment = "sandbox" | "production";

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
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    }),
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

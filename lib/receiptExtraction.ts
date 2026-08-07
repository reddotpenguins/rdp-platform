import {
  extractReceiptDetailsFromOcrText,
  type ReceiptFieldKey,
  type ReceiptFieldStatus,
  type ReceiptFieldStatuses
} from "./receiptOcr.ts";

export type ReceiptFieldConfidences = Partial<Record<ReceiptFieldKey, number>>;

export type NormalizedReceiptExtraction = {
  amountRequested: string | null;
  confidence: number;
  currency: string | null;
  fieldConfidences: ReceiptFieldConfidences;
  fieldStatuses: ReceiptFieldStatuses;
  gstClaimable: string | null;
  gstShown: string | null;
  manualReviewRequired: boolean;
  merchantName: string | null;
  model: string;
  paymentMethod: string | null;
  provider: "azure-document-intelligence";
  receiptNumber: string | null;
  subtotal: string | null;
  totalSpent: string | null;
  transactionDate: string | null;
  warnings: string[];
};

export type ReceiptExtractorInput = {
  contentType: string;
  data: ArrayBuffer;
  filename: string;
};

export type ReceiptExtractor = {
  extract(input: ReceiptExtractorInput): Promise<NormalizedReceiptExtraction>;
};

type AzureAnalyzeResultResponse = {
  analyzeResult?: {
    content?: string;
    documents?: Array<{
      confidence?: number;
      fields?: Record<string, AzureDocumentField>;
    }>;
  };
  status?: string;
};

type AzureDocumentField = {
  confidence?: number;
  content?: string;
  type?: string;
  valueArray?: AzureDocumentField[];
  valueCurrency?: {
    amount?: number;
    currencyCode?: string;
    currencySymbol?: string;
  };
  valueDate?: string;
  valueNumber?: number;
  valueString?: string;
  valueTime?: string;
};

const receiptFieldKeys: ReceiptFieldKey[] = [
  "merchantName",
  "receiptNumber",
  "transactionDate",
  "subtotal",
  "gstShown",
  "totalSpent",
  "paymentMethod"
];

const requiredReviewFields: ReceiptFieldKey[] = [
  "merchantName",
  "transactionDate",
  "subtotal",
  "gstShown",
  "totalSpent"
];

const confidenceThreshold = 0.75;

export function normalizeAzureReceiptResult(result: unknown): NormalizedReceiptExtraction {
  const response = isRecord(result) ? (result as AzureAnalyzeResultResponse) : {};
  const analyzeResult = response.analyzeResult;
  const document = analyzeResult?.documents?.[0];
  const fields = document?.fields ?? {};
  const content = analyzeResult?.content ?? "";
  const textFallback = extractReceiptDetailsFromOcrText(content);

  const merchantName = readStringField(fields, ["MerchantName"]) ?? textFallback.merchantName;
  const transactionDate =
    readDateField(fields, ["TransactionDate"]) ?? textFallback.transactionDate;
  const subtotal = readMoneyField(fields, ["Subtotal"])?.amount ?? textFallback.subtotal;
  const gstShown =
    readMoneyField(fields, ["TotalTax", "Tax"])?.amount ??
    readTaxDetailsTotal(fields)?.amount ??
    textFallback.gstShown;
  const totalSpent = readMoneyField(fields, ["Total"])?.amount ?? textFallback.totalSpent;
  const receiptNumber =
    readStringField(fields, ["ReceiptNumber", "InvoiceId", "TransactionId"]) ??
    textFallback.receiptNumber;
  const paymentMethod = readStringField(fields, ["PaymentMethod"]) ?? textFallback.paymentMethod;
  const currency =
    readCurrency(fields, content) ?? textFallback.currency ?? (totalSpent ? "SGD" : null);
  const fieldConfidences: ReceiptFieldConfidences = {
    gstShown:
      readMoneyField(fields, ["TotalTax", "Tax"])?.confidence ??
      readTaxDetailsTotal(fields)?.confidence ??
      fallbackConfidence(gstShown, textFallback.gstShown),
    merchantName: readConfidence(fields, ["MerchantName"]) ?? fallbackConfidence(merchantName, textFallback.merchantName),
    paymentMethod:
      readConfidence(fields, ["PaymentMethod"]) ??
      fallbackConfidence(paymentMethod, textFallback.paymentMethod),
    receiptNumber:
      readConfidence(fields, ["ReceiptNumber", "InvoiceId", "TransactionId"]) ??
      fallbackConfidence(receiptNumber, textFallback.receiptNumber),
    subtotal: readMoneyField(fields, ["Subtotal"])?.confidence ?? fallbackConfidence(subtotal, textFallback.subtotal),
    totalSpent: readMoneyField(fields, ["Total"])?.confidence ?? fallbackConfidence(totalSpent, textFallback.totalSpent),
    transactionDate:
      readConfidence(fields, ["TransactionDate"]) ??
      fallbackConfidence(transactionDate, textFallback.transactionDate)
  };
  const fieldStatuses = buildReceiptFieldStatuses(
    {
      gstShown,
      merchantName,
      paymentMethod,
      receiptNumber,
      subtotal,
      totalSpent,
      transactionDate
    },
    fieldConfidences
  );
  const warnings = buildWarnings(fieldStatuses);
  const confidence = calculateOverallConfidence(fieldConfidences);

  return {
    amountRequested: totalSpent,
    confidence,
    currency,
    fieldConfidences,
    fieldStatuses,
    gstClaimable: gstShown,
    gstShown,
    manualReviewRequired: shouldRequireManualReview(fieldStatuses),
    merchantName,
    model: "prebuilt-receipt",
    paymentMethod,
    provider: "azure-document-intelligence",
    receiptNumber,
    subtotal,
    totalSpent,
    transactionDate,
    warnings
  };
}

export class AzureDocumentIntelligenceReceiptExtractor implements ReceiptExtractor {
  private readonly apiVersion: string;
  private readonly endpoint: string;
  private readonly key: string;
  private readonly maxPollAttempts: number;
  private readonly pollDelayMs: number;

  constructor({
    apiVersion = "2024-11-30",
    endpoint,
    key,
    maxPollAttempts = 8,
    pollDelayMs = 900
  }: {
    apiVersion?: string;
    endpoint: string;
    key: string;
    maxPollAttempts?: number;
    pollDelayMs?: number;
  }) {
    this.apiVersion = apiVersion;
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.key = key;
    this.maxPollAttempts = maxPollAttempts;
    this.pollDelayMs = pollDelayMs;
  }

  async extract(input: ReceiptExtractorInput) {
    const operationLocation = await this.startAnalyze(input);
    const result = await this.pollAnalyzeResult(operationLocation);

    return normalizeAzureReceiptResult(result);
  }

  private async startAnalyze(input: ReceiptExtractorInput) {
    const response = await fetch(
      `${this.endpoint}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=${this.apiVersion}`,
      {
        body: Buffer.from(input.data),
        headers: {
          "Content-Type": input.contentType,
          "Ocp-Apim-Subscription-Key": this.key
        },
        method: "POST"
      }
    );

    if (!response.ok) {
      throw new Error(await getAzureDocumentIntelligenceErrorMessage(response));
    }

    const operationLocation = response.headers.get("operation-location");

    if (!operationLocation) {
      throw new Error("Azure accepted the receipt but did not return an operation location.");
    }

    return operationLocation;
  }

  private async pollAnalyzeResult(operationLocation: string) {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      if (attempt > 0) {
        await delay(this.pollDelayMs);
      }

      const response = await fetch(operationLocation, {
        headers: {
          "Ocp-Apim-Subscription-Key": this.key
        },
        method: "GET"
      });

      if (!response.ok) {
        throw new Error(await getAzureDocumentIntelligenceErrorMessage(response));
      }

      const result = (await response.json()) as AzureAnalyzeResultResponse;

      if (result.status === "succeeded") {
        return result;
      }

      if (result.status === "failed") {
        throw new Error("Azure could not read this receipt. Please try a clearer file or enter the claim manually.");
      }
    }

    throw new Error("Azure is still reading this receipt. Please try again or enter the claim manually.");
  }
}

export function buildReceiptFieldStatuses(
  fields: Record<ReceiptFieldKey, string | null>,
  fieldConfidences: ReceiptFieldConfidences
): ReceiptFieldStatuses {
  return receiptFieldKeys.reduce((statuses, key) => {
    const value = fields[key];
    const confidence = fieldConfidences[key];

    if (!value) {
      statuses[key] = "missing";
    } else if (typeof confidence === "number" && confidence >= confidenceThreshold) {
      statuses[key] = "confirmed";
    } else {
      statuses[key] = "verify";
    }

    return statuses;
  }, {} as ReceiptFieldStatuses);
}

export function shouldRequireManualReview(fieldStatuses: ReceiptFieldStatuses) {
  return requiredReviewFields.some((field) => fieldStatuses[field] !== "confirmed");
}

export function hasUsableReceiptExtraction(extraction: NormalizedReceiptExtraction) {
  return Boolean(
    extraction.amountRequested ||
      extraction.gstShown ||
      extraction.merchantName ||
      extraction.receiptNumber ||
      extraction.totalSpent ||
      extraction.transactionDate
  );
}

export async function getAzureDocumentIntelligenceErrorMessage(response: Response) {
  const rawText = await response.text();
  let message = rawText;

  try {
    const parsed = JSON.parse(rawText) as {
      error?: {
        code?: string;
        message?: string;
      };
    };
    message = parsed.error?.message || parsed.error?.code || rawText;
  } catch {
    message = rawText;
  }

  const lowerMessage = message.toLowerCase();

  if (response.status === 401 || response.status === 403) {
    return "Azure Document Intelligence rejected the key or endpoint. Check the Vercel environment variables.";
  }

  if (response.status === 413 || lowerMessage.includes("size")) {
    return "Azure F0 can only process receipts up to 4MB. Upload a smaller JPG, PNG, or PDF.";
  }

  if (response.status === 415 || lowerMessage.includes("content type")) {
    return "Azure receipt extraction supports JPG, PNG, or PDF for this workflow.";
  }

  if (response.status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate")) {
    return "Azure Document Intelligence F0 quota or rate limit was reached. Try again later or enter the claim manually.";
  }

  return "Azure could not extract this receipt. Please try a clearer file or enter the claim manually.";
}

function readStringField(fields: Record<string, AzureDocumentField>, names: string[]) {
  const field = findField(fields, names);
  const value = normalizeText(field?.valueString ?? field?.content ?? null);

  return value;
}

function readDateField(fields: Record<string, AzureDocumentField>, names: string[]) {
  const field = findField(fields, names);
  const value = normalizeText(field?.valueDate ?? field?.content ?? null);

  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : null;
}

function readMoneyField(fields: Record<string, AzureDocumentField>, names: string[]) {
  const field = findField(fields, names);

  if (!field) {
    return null;
  }

  const amount = normalizeMoney(
    field.valueCurrency?.amount ?? field.valueNumber ?? field.valueString ?? field.content ?? null
  );

  return amount ? { amount, confidence: normalizeConfidence(field.confidence) } : null;
}

function readTaxDetailsTotal(fields: Record<string, AzureDocumentField>) {
  const taxDetails = findField(fields, ["TaxDetails"]);

  if (!Array.isArray(taxDetails?.valueArray)) {
    return null;
  }

  const taxAmounts = taxDetails.valueArray
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const properties = (item as { valueObject?: Record<string, AzureDocumentField> }).valueObject;
      const amountField = properties ? readMoneyField(properties, ["Amount", "Tax", "Total"]) : null;

      return amountField;
    })
    .filter((item): item is { amount: string; confidence: number | undefined } => Boolean(item));

  if (taxAmounts.length === 0) {
    return null;
  }

  const total = taxAmounts.reduce((sum, item) => sum + Number(item.amount), 0);
  const confidence = calculateOverallConfidence(
    Object.fromEntries(taxAmounts.map((item, index) => [String(index), item.confidence])) as ReceiptFieldConfidences
  );

  return { amount: total.toFixed(2), confidence };
}

function readCurrency(fields: Record<string, AzureDocumentField>, content: string) {
  const currencyCode =
    readMoneyFieldRaw(fields, ["Total"])?.valueCurrency?.currencyCode ??
    readMoneyFieldRaw(fields, ["Subtotal"])?.valueCurrency?.currencyCode ??
    readMoneyFieldRaw(fields, ["TotalTax", "Tax"])?.valueCurrency?.currencyCode;

  if (/^[A-Z]{3}$/.test(currencyCode ?? "")) {
    return currencyCode ?? null;
  }

  if (/\bsgd\b|\bs\$/i.test(content)) {
    return "SGD";
  }

  if (/\busd\b|\bus\$/i.test(content)) {
    return "USD";
  }

  return null;
}

function readMoneyFieldRaw(fields: Record<string, AzureDocumentField>, names: string[]) {
  return findField(fields, names);
}

function readConfidence(fields: Record<string, AzureDocumentField>, names: string[]) {
  return normalizeConfidence(findField(fields, names)?.confidence);
}

function findField(fields: Record<string, AzureDocumentField>, names: string[]) {
  return names.map((name) => fields[name]).find(Boolean) ?? null;
}

function fallbackConfidence(value: string | null, fallbackValue: string | null) {
  return value && fallbackValue && value === fallbackValue ? 0.6 : undefined;
}

function calculateOverallConfidence(fieldConfidences: ReceiptFieldConfidences) {
  const values = Object.values(fieldConfidences).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function buildWarnings(fieldStatuses: ReceiptFieldStatuses) {
  const labels: Record<ReceiptFieldKey, string> = {
    gstShown: "GST",
    merchantName: "merchant",
    paymentMethod: "payment method",
    receiptNumber: "receipt number",
    subtotal: "subtotal",
    totalSpent: "total",
    transactionDate: "date"
  };

  return receiptFieldKeys
    .filter((key) => fieldStatuses[key] !== "confirmed")
    .map((key) =>
      fieldStatuses[key] === "missing"
        ? `${labels[key]} was not found.`
        : `${labels[key]} needs review.`
    );
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();

  return trimmed || null;
}

function normalizeMoney(value: number | string | null) {
  const amount =
    typeof value === "number"
      ? value
      : Number(
          value
            ?.replace(/[^0-9.,-]/g, "")
            .replace(/,/g, "")
            .trim() || ""
        );

  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
}

function normalizeConfidence(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

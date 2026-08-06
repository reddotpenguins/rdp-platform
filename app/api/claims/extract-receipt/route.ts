import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReceiptExtraction = {
  amountRequested: string | null;
  confidence: number;
  currency: string | null;
  gstClaimable: string | null;
  gstShown: string | null;
  merchantName: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  subtotal: string | null;
  totalSpent: string | null;
  transactionDate: string | null;
  warnings: string[];
};

type ReceiptInput =
  | { type: "input_file"; filename: string; file_data: string }
  | { type: "input_image"; image_url: string; detail: "high" };

const receiptExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchantName",
    "receiptNumber",
    "transactionDate",
    "currency",
    "subtotal",
    "gstShown",
    "totalSpent",
    "amountRequested",
    "gstClaimable",
    "paymentMethod",
    "confidence",
    "warnings"
  ],
  properties: {
    merchantName: { type: ["string", "null"] },
    receiptNumber: { type: ["string", "null"] },
    transactionDate: { type: ["string", "null"], description: "YYYY-MM-DD when visible." },
    currency: { type: ["string", "null"], description: "ISO currency code, such as SGD." },
    subtotal: { type: ["string", "null"], description: "Decimal amount with two places." },
    gstShown: { type: ["string", "null"], description: "Decimal amount with two places." },
    totalSpent: { type: ["string", "null"], description: "Receipt total with two decimals." },
    amountRequested: {
      type: ["string", "null"],
      description: "Usually the same as totalSpent unless the receipt clearly marks a claimable total."
    },
    gstClaimable: {
      type: ["string", "null"],
      description: "Usually the same as gstShown when GST is visible."
    },
    paymentMethod: { type: ["string", "null"] },
    confidence: { type: "number" },
    warnings: { type: "array", items: { type: "string" } }
  }
} as const;

export async function POST(request: NextRequest) {
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.json({ error: "Please log in before extracting receipt details." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Receipt extraction is not configured yet. Add OPENAI_API_KEY in Vercel first." },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const receiptFile = formData.get("receipt");

  if (!(receiptFile instanceof File)) {
    return NextResponse.json({ error: "Upload a receipt photo or PDF first." }, { status: 400 });
  }

  const mimeType = receiptFile.type || getMimeTypeFromFilename(receiptFile.name);
  const canExtract =
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "application/pdf";

  if (!canExtract) {
    return NextResponse.json(
      {
        error:
          "Receipt auto-fill supports JPG, PNG, or PDF. If this was taken on an iPhone as HEIC/HEIF, please upload it as JPG or try taking the photo again."
      },
      { status: 400 }
    );
  }

  if (receiptFile.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Receipt file must be 15MB or smaller." }, { status: 400 });
  }

  const arrayBuffer = await receiptFile.arrayBuffer();
  const fileDataUrl = `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  const receiptInput: ReceiptInput =
    mimeType === "application/pdf"
      ? {
          type: "input_file",
          filename: receiptFile.name || "receipt.pdf",
          file_data: fileDataUrl
        }
      : {
          type: "input_image",
          image_url: fileDataUrl,
          detail: "high"
        };

  const preferredModel = process.env.OPENAI_RECEIPT_MODEL?.trim() || "gpt-4o-mini";
  const response = await fetchOpenAiReceiptExtraction({
    apiKey,
    model: preferredModel,
    receiptInput
  });
  const fallbackModel = "gpt-4o-mini";
  const finalResponse =
    !response.ok &&
    preferredModel !== fallbackModel &&
    shouldRetryWithFallback(response.status, await response.clone().text())
      ? await fetchOpenAiReceiptExtraction({
          apiKey,
          model: fallbackModel,
          receiptInput
        })
      : response;

  if (!finalResponse.ok) {
    const errorText = await finalResponse.text();
    const errorMessage = getOpenAiErrorMessage(finalResponse.status, errorText);
    console.error("Receipt extraction failed", {
      message: getOpenAiRawErrorMessage(errorText),
      status: finalResponse.status
    });
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  const openAiResult = await finalResponse.json();
  const outputText = getResponseOutputText(openAiResult);

  if (!outputText) {
    return NextResponse.json(
      { error: "Receipt details could not be read from the extraction response." },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(outputText) as ReceiptExtraction;

    return NextResponse.json(normalizeReceiptExtraction(parsed));
  } catch (error) {
    console.error("Receipt extraction parse failed", error);
    return NextResponse.json(
      { error: "Receipt details came back in an unreadable format. Please try again." },
      { status: 502 }
    );
  }
}

function fetchOpenAiReceiptExtraction({
  apiKey,
  model,
  receiptInput
}: {
  apiKey: string;
  model: string;
  receiptInput: ReceiptInput;
}) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract claim receipt details from this receipt. Return only values visible on the receipt. " +
                "Use null for anything uncertain or not visible. Currency should be an ISO code. Dates must be YYYY-MM-DD. " +
                "Amounts must be decimal strings with two places and no currency symbols. If a GST amount is visible, set both gstShown and gstClaimable to that amount. " +
                "If a total is visible, set totalSpent and amountRequested to the total."
            },
            receiptInput
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "receipt_extraction",
          strict: true,
          schema: receiptExtractionSchema
        }
      }
    })
  });
}

function getResponseOutputText(result: unknown) {
  if (isRecord(result) && typeof result.output_text === "string") {
    return result.output_text;
  }

  if (!isRecord(result) || !Array.isArray(result.output)) {
    return "";
  }

  return result.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (!isRecord(content)) {
        return "";
      }

      if (typeof content.text === "string") {
        return content.text;
      }

      return "";
    })
    .join("")
    .trim();
}

function normalizeReceiptExtraction(value: ReceiptExtraction): ReceiptExtraction {
  const totalSpent = normalizeMoney(value.totalSpent);
  const gstShown = normalizeMoney(value.gstShown);

  return {
    amountRequested: normalizeMoney(value.amountRequested) ?? totalSpent,
    confidence: clampConfidence(value.confidence),
    currency: normalizeCurrency(value.currency),
    gstClaimable: normalizeMoney(value.gstClaimable) ?? gstShown,
    gstShown,
    merchantName: normalizeText(value.merchantName),
    paymentMethod: normalizeText(value.paymentMethod),
    receiptNumber: normalizeText(value.receiptNumber),
    subtotal: normalizeMoney(value.subtotal),
    totalSpent,
    transactionDate: normalizeDate(value.transactionDate),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map(normalizeText).filter((warning): warning is string => Boolean(warning))
      : []
  };
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeCurrency(value: string | null) {
  const currency = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency ?? "") ? currency ?? null : null;
}

function normalizeDate(value: string | null) {
  const date = value?.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date ?? null : null;
}

function normalizeMoney(value: string | null) {
  const trimmed = value?.replace(/,/g, "").trim();

  if (!trimmed) {
    return null;
  }

  const amount = Number(trimmed);

  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function getMimeTypeFromFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "pdf") return "application/pdf";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";

  return "application/octet-stream";
}

function shouldRetryWithFallback(status: number, errorText: string) {
  const message = getOpenAiRawErrorMessage(errorText).toLowerCase();

  return (
    status === 400 &&
    (message.includes("model") ||
      message.includes("does not exist") ||
      message.includes("not found") ||
      message.includes("unsupported"))
  );
}

function getOpenAiErrorMessage(status: number, errorText: string) {
  const message = getOpenAiRawErrorMessage(errorText);
  const lowerMessage = message.toLowerCase();

  if (status === 401 || lowerMessage.includes("api key")) {
    return "The OpenAI API key is invalid. Please create a new service account key and update OPENAI_API_KEY in Vercel.";
  }

  if (status === 403 || lowerMessage.includes("permission")) {
    return "The OpenAI key does not have permission for receipt extraction. Check the project key permissions and model access.";
  }

  if (
    status === 429 ||
    lowerMessage.includes("billing") ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("rate limit")
  ) {
    return "OpenAI billing, quota, or rate limit blocked receipt extraction. Check Platform billing and project limits.";
  }

  if (lowerMessage.includes("model") || lowerMessage.includes("does not exist")) {
    return "The selected OpenAI receipt model is not available to this project. Try setting OPENAI_RECEIPT_MODEL to gpt-4o-mini in Vercel.";
  }

  if (lowerMessage.includes("image") || lowerMessage.includes("file")) {
    return "OpenAI could not read this receipt file. Try a clearer JPG, PNG, or PDF receipt.";
  }

  if (lowerMessage.includes("schema")) {
    return "Receipt extraction format was rejected. The app needs a small extractor update before trying again.";
  }

  return "OpenAI could not extract this receipt yet. Please try a clearer photo or check the OpenAI project setup.";
}

function getOpenAiRawErrorMessage(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: {
        message?: string;
      };
    };

    return parsed.error?.message || errorText;
  } catch {
    return errorText;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

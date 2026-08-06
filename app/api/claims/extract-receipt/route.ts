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
    confidence: { type: "number", minimum: 0, maximum: 1 },
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

  const mimeType = receiptFile.type || "application/octet-stream";
  const canExtract = mimeType.startsWith("image/") || mimeType === "application/pdf";

  if (!canExtract) {
    return NextResponse.json(
      { error: "Automatic extraction supports receipt photos and PDFs only." },
      { status: 400 }
    );
  }

  if (receiptFile.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Receipt file must be 15MB or smaller." }, { status: 400 });
  }

  const arrayBuffer = await receiptFile.arrayBuffer();
  const fileDataUrl = `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  const receiptInput =
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECEIPT_MODEL?.trim() || "gpt-5-mini",
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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Receipt extraction failed", errorText);
    return NextResponse.json(
      { error: "Receipt details could not be extracted. Please try another photo or key in the details." },
      { status: 502 }
    );
  }

  const openAiResult = await response.json();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

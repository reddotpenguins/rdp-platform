export type ReceiptFieldStatus = "confirmed" | "verify" | "missing";

export type ReceiptFieldKey =
  | "merchantName"
  | "receiptNumber"
  | "transactionDate"
  | "subtotal"
  | "gstShown"
  | "totalSpent"
  | "paymentMethod";

export type ReceiptFieldStatuses = Record<ReceiptFieldKey, ReceiptFieldStatus>;

export type ReceiptOcrExtraction = {
  amountRequested: string | null;
  confidence: number;
  currency: string | null;
  fieldStatuses: ReceiptFieldStatuses;
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

const totalKeywordPatterns = [
  /\bgrand\s+total\b/i,
  /\bamount\s+due\b/i,
  /\btotal\s+due\b/i,
  /\btotal\s+amount\b/i,
  /\bnet{1,2}\s+total\b/i,
  /\btotal\b/i,
  /\bamount\b/i
];

const subtotalKeywordPatterns = [/\bsub\s*total\b/i, /\bsubtotal\b/i, /\bbefore\s+gst\b/i, /\bnet\s+amount\b/i];
const gstKeywordPatterns = [/\bgst\b/i, /\btax\b/i];
const totalExclusionPatterns = [
  /\bsub\s*total\b/i,
  /\bsubtotal\b/i,
  /\bgst\b/i,
  /\btax\b/i,
  /\bchange\b/i,
  /\bdiscount\b/i,
  /\btender/i,
  /\bround/i
];

type TotalAmountMatch = {
  amount: string;
  source: "label" | "fallback";
};

type GstAmountMatch = {
  amount: string;
  source: "label" | "calculated";
};

export function extractReceiptDetailsFromOcrText(text: string): ReceiptOcrExtraction {
  const lines = getReceiptLines(text);
  const joinedText = lines.join("\n");
  const totalSpentMatch = findTotalAmount(lines) ?? findLargestMoneyAmount(lines);
  const totalSpent = totalSpentMatch?.amount ?? null;
  const subtotal = findKeywordAmount(lines, subtotalKeywordPatterns);
  const gstShownMatch =
    findKeywordAmount(lines, gstKeywordPatterns, "match") ??
    calculateGstFromSubtotalAndTotal({ lines, subtotal, totalSpent });
  const gstShown = gstShownMatch?.amount ?? null;
  const transactionDate = findTransactionDate(joinedText);
  const merchantName = findMerchantName(lines);
  const receiptNumber = findReceiptNumber(lines);
  const paymentMethod = findPaymentMethod(joinedText);
  const currency = findCurrency(joinedText);
  const warnings = buildWarnings({
    merchantName,
    receiptNumber,
    text,
    totalSpent,
    transactionDate
  });

  return {
    amountRequested: totalSpent,
    confidence: calculateConfidence({
      gstShown,
      merchantName,
      paymentMethod,
      receiptNumber,
      text,
      totalSpent,
      transactionDate
    }),
    currency,
    fieldStatuses: buildFieldStatuses({
      gstShown,
      gstShownSource: gstShownMatch?.source ?? null,
      merchantName,
      paymentMethod,
      receiptNumber,
      subtotal,
      totalSpent,
      totalSpentSource: totalSpentMatch?.source ?? null,
      transactionDate
    }),
    gstClaimable: gstShown,
    gstShown,
    merchantName,
    paymentMethod,
    receiptNumber,
    subtotal,
    totalSpent,
    transactionDate,
    warnings
  };
}

function getReceiptLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findTotalAmount(lines: string[]): TotalAmountMatch | null {
  const candidates = lines.flatMap((line, index) => {
    const amounts = getMoneyAmounts(line);

    if (amounts.length === 0) {
      return [];
    }

    const score = totalKeywordPatterns.reduce(
      (currentScore, pattern, patternIndex) =>
        pattern.test(line) ? Math.max(currentScore, 100 - patternIndex * 8) : currentScore,
      0
    );

    if (score === 0 || totalExclusionPatterns.some((pattern) => pattern.test(line))) {
      return [];
    }

    return [
      {
        amount: Math.max(...amounts),
        index,
        score
      }
    ];
  });

  const bestCandidate = candidates.sort((first, second) => {
    if (second.score !== first.score) return second.score - first.score;
    if (second.amount !== first.amount) return second.amount - first.amount;
    return second.index - first.index;
  })[0];

  return bestCandidate ? { amount: formatAmount(bestCandidate.amount), source: "label" } : null;
}

function findLargestMoneyAmount(lines: string[]): TotalAmountMatch | null {
  const amounts = lines
    .filter((line) => !totalExclusionPatterns.some((pattern) => pattern.test(line)))
    .flatMap(getMoneyAmounts)
    .filter((amount) => amount > 0 && amount < 100000);

  return amounts.length > 0 ? { amount: formatAmount(Math.max(...amounts)), source: "fallback" } : null;
}

function findKeywordAmount(
  lines: string[],
  keywordPatterns: RegExp[],
  returnMode?: "amount"
): string | null;
function findKeywordAmount(
  lines: string[],
  keywordPatterns: RegExp[],
  returnMode: "match"
): GstAmountMatch | null;
function findKeywordAmount(
  lines: string[],
  keywordPatterns: RegExp[],
  returnMode: "amount" | "match" = "amount"
) {
  for (const line of lines) {
    if (!keywordPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    const amounts = getMoneyAmounts(line);

    if (amounts.length > 0) {
      const amount = formatAmount(amounts[amounts.length - 1]);

      return returnMode === "match" ? { amount, source: "label" } : amount;
    }
  }

  return null;
}

function calculateGstFromSubtotalAndTotal({
  lines,
  subtotal,
  totalSpent
}: {
  lines: string[];
  subtotal: string | null;
  totalSpent: string | null;
}): GstAmountMatch | null {
  if (!subtotal || !totalSpent || !hasTaxRateLine(lines)) {
    return null;
  }

  const subtotalAmount = Number(subtotal);
  const totalAmount = Number(totalSpent);
  const gstAmount = totalAmount - subtotalAmount;

  if (!Number.isFinite(gstAmount) || gstAmount <= 0 || gstAmount > totalAmount * 0.2) {
    return null;
  }

  return { amount: formatAmount(gstAmount), source: "calculated" };
}

function hasTaxRateLine(lines: string[]) {
  return lines.some(
    (line) =>
      gstKeywordPatterns.some((pattern) => pattern.test(line)) &&
      /\b\d{1,2}(?:\.\d+)?\s*%/.test(line)
  );
}

function getMoneyAmounts(line: string) {
  return Array.from(line.matchAll(/(?:s\$|sgd|\$)?\s*([0-9]{1,5}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2}))/gi))
    .filter((match) => !line.slice((match.index ?? 0) + match[0].length).trimStart().startsWith("%"))
    .map((match) => Number(match[1].replace(/[,\s]/g, "")))
    .filter((amount) => Number.isFinite(amount));
}

function findTransactionDate(text: string) {
  const yyyyFirst = text.match(/\b(20\d{2}|19\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);

  if (yyyyFirst) {
    return buildDate(Number(yyyyFirst[1]), Number(yyyyFirst[2]), Number(yyyyFirst[3]));
  }

  const dayFirst = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);

  if (dayFirst) {
    return buildDate(normalizeYear(Number(dayFirst[3])), Number(dayFirst[2]), Number(dayFirst[1]));
  }

  const monthName = text.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{2,4})\b/i
  );

  if (monthName) {
    return buildDate(
      normalizeYear(Number(monthName[3])),
      getMonthNumber(monthName[2]),
      Number(monthName[1])
    );
  }

  return null;
}

function buildDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function normalizeYear(year: number) {
  if (year < 100) {
    return year < 70 ? 2000 + year : 1900 + year;
  }

  return year;
}

function getMonthNumber(value: string) {
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    value.toLowerCase().slice(0, 3)
  );

  return monthIndex + 1;
}

function findMerchantName(lines: string[]) {
  for (const line of lines.slice(0, 10)) {
    if (!/[a-z]/i.test(line) || getMoneyAmounts(line).length > 0) {
      continue;
    }

    if (
      /\b(receipt|invoice|tax|gst|date|time|cashier|tel|phone|duplicate|copy|www|http|order|ref)\b/i.test(
        line
      )
    ) {
      continue;
    }

    const merchantName = line.replace(/[^a-z0-9 &'()./-]/gi, "").replace(/\s+/g, " ").trim();

    if (merchantName.length >= 2 && merchantName.length <= 70) {
      return merchantName;
    }
  }

  return null;
}

function findReceiptNumber(lines: string[]) {
  const keywordPattern = /\b(receipt|invoice|inv|bill|ref|reference|txn|transaction|order)\b/i;

  for (const line of lines) {
    if (!keywordPattern.test(line)) {
      continue;
    }

    const candidate = extractReceiptNumberFromLine(line, keywordPattern);

    if (candidate) {
      return candidate.toUpperCase();
    }
  }

  return null;
}

function extractReceiptNumberFromLine(line: string, keywordPattern: RegExp) {
  const keywordIndex = line.search(keywordPattern);
  const afterKeyword = line
    .slice(keywordIndex)
    .replace(keywordPattern, " ")
    .replace(/\b(no|number|num|id)\b/gi, " ")
    .replace(/[#:=]/g, " ")
    .split(/\b(date|time|total|sub\s*total|subtotal|gst|tax|amount|paid|cash|card|visa|mastercard)\b/i)[0]
    .replace(/\b(20\d{2}|19\d{2})[./-]\d{1,2}[./-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ");

  const tokens = afterKeyword.match(/[a-z0-9]+(?:[-/][a-z0-9]+)*/gi) ?? [];
  const usefulTokens = tokens.filter(
    (token) => /\d/.test(token) && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(token)
  );

  for (let index = 0; index < usefulTokens.length; index += 1) {
    const token = usefulTokens[index];

    if (!/^\d+$/.test(token)) {
      if (token.length >= 3) {
        return token;
      }

      continue;
    }

    const numericChunks = [token];
    let nextIndex = index + 1;

    while (nextIndex < usefulTokens.length && /^\d+$/.test(usefulTokens[nextIndex])) {
      numericChunks.push(usefulTokens[nextIndex]);
      nextIndex += 1;
    }

    const joinedNumber = numericChunks.join("");

    if (joinedNumber.length >= 3 && joinedNumber.length <= 24) {
      return joinedNumber;
    }
  }

  return null;
}

function findPaymentMethod(text: string) {
  const paymentMethods: Array<[RegExp, string]> = [
    [/\bpaynow\b/i, "PayNow"],
    [/\bgrab\s*pay\b/i, "GrabPay"],
    [/\bnets\b/i, "NETS"],
    [/\bvisa\b/i, "Visa"],
    [/\bmaster\s*card\b|\bmastercard\b/i, "Mastercard"],
    [/\bamex\b|\bamerican\s+express\b/i, "American Express"],
    [/\bcash\b/i, "Cash"],
    [/\bcard\b/i, "Card"]
  ];
  const match = paymentMethods.find(([pattern]) => pattern.test(text));

  return match?.[1] ?? null;
}

function findCurrency(text: string) {
  if (/\bsgd\b|\bs\$/i.test(text)) {
    return "SGD";
  }

  if (/\busd\b|\bus\$/i.test(text)) {
    return "USD";
  }

  return null;
}

function calculateConfidence(fields: {
  gstShown: string | null;
  merchantName: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  text: string;
  totalSpent: string | null;
  transactionDate: string | null;
}) {
  if (!fields.text.trim()) {
    return 0;
  }

  const score =
    (fields.totalSpent ? 0.28 : 0) +
    (fields.transactionDate ? 0.18 : 0) +
    (fields.merchantName ? 0.16 : 0) +
    (fields.receiptNumber ? 0.12 : 0) +
    (fields.gstShown ? 0.1 : 0) +
    (fields.paymentMethod ? 0.08 : 0) +
    0.08;

  return Math.min(0.92, Math.max(0.2, Number(score.toFixed(2))));
}

function buildFieldStatuses(fields: {
  gstShown: string | null;
  gstShownSource: GstAmountMatch["source"] | null;
  merchantName: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  subtotal: string | null;
  totalSpent: string | null;
  totalSpentSource: TotalAmountMatch["source"] | null;
  transactionDate: string | null;
}): ReceiptFieldStatuses {
  return {
    gstShown: getGstShownStatus(fields.gstShown, fields.gstShownSource),
    merchantName: fields.merchantName ? "verify" : "missing",
    paymentMethod: fields.paymentMethod ? "confirmed" : "missing",
    receiptNumber: fields.receiptNumber ? "confirmed" : "missing",
    subtotal: fields.subtotal ? "confirmed" : "missing",
    totalSpent: getTotalSpentStatus(fields.totalSpent, fields.totalSpentSource),
    transactionDate: fields.transactionDate ? "confirmed" : "missing"
  };
}

function getGstShownStatus(
  gstShown: string | null,
  source: GstAmountMatch["source"] | null
): ReceiptFieldStatus {
  if (!gstShown) {
    return "missing";
  }

  return source === "label" ? "confirmed" : "verify";
}

function getTotalSpentStatus(
  totalSpent: string | null,
  source: TotalAmountMatch["source"] | null
): ReceiptFieldStatus {
  if (!totalSpent) {
    return "missing";
  }

  return source === "label" ? "confirmed" : "verify";
}

function buildWarnings(fields: {
  merchantName: string | null;
  receiptNumber: string | null;
  text: string;
  totalSpent: string | null;
  transactionDate: string | null;
}) {
  if (!fields.text.trim()) {
    return ["No receipt text was detected. Please key in the claim details manually."];
  }

  const warnings: string[] = [];

  if (!fields.totalSpent) warnings.push("Total amount was not found.");
  if (!fields.transactionDate) warnings.push("Receipt date was not found.");
  if (!fields.merchantName) warnings.push("Merchant name was not found.");
  if (!fields.receiptNumber) warnings.push("Receipt number was not found.");

  return warnings;
}

function formatAmount(amount: number) {
  return amount.toFixed(2);
}

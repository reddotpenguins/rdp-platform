"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Download,
  FileSearch,
  FileText,
  FolderCog,
  History,
  ImagePlus,
  Receipt,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  WalletCards,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import type { NormalizedReceiptExtraction } from "@/lib/receiptExtraction";
import type { ReceiptFieldKey, ReceiptFieldStatus, ReceiptFieldStatuses } from "@/lib/receiptOcr";
import {
  calculateNonClaimableCents,
  canDeleteClaimDraft,
  canDeleteReferencedItem,
  centsToDecimal,
  claimStatuses,
  decimalToCents,
  defaultClaimSettings,
  detectPossibleDuplicates,
  formatMoneyCents,
  getNextClaimReference,
  initialClaimGroups,
  initialExpenseCategories,
  isClaimEditableByClaimant,
  isVisibleInReviewQueue,
  safeDisplayFilename,
  slugifyClaimConfig,
  sortClaimConfigItems,
  transitionClaimStatus,
  validateFinancials,
  validateReceiptFile,
  type ClaimConfigItem,
  type ClaimGroup,
  type ClaimReceipt,
  type ClaimRecord,
  type ClaimSettings,
  type ClaimStatus,
  type ExpenseCategory
} from "@/lib/claimsLogic";
import { getClaimPermissions, type StaffProfile } from "@/lib/staffRoles";

type ClaimsClientProps = {
  staffProfile: StaffProfile;
};

type ClaimsState = {
  settings: ClaimSettings;
  groups: ClaimGroup[];
  categories: ExpenseCategory[];
  claims: ClaimRecord[];
};

type ClaimsTab = "mine" | "new" | "review" | "ledger" | "settings";
type LedgerStatusFilter = "All" | ClaimStatus;

type DraftForm = {
  groupId: string;
  categoryId: string;
  merchantName: string;
  receiptNumber: string;
  transactionDate: string;
  currency: string;
  subtotal: string;
  gstShown: string;
  totalSpent: string;
  amountRequested: string;
  gstClaimable: string;
  businessPurpose: string;
  paymentMethod: string;
  notes: string;
  receipt: ClaimReceipt | null;
};

type ReviewInput = {
  comment: string;
  approvedAmount: string;
};

type ReceiptExtractionState = {
  fieldStatuses?: ReceiptFieldStatuses;
  message: string;
  status: "idle" | "uploading" | "extracting" | "filling" | "completed" | "failed";
};

type ExtractedReceiptDetails = NormalizedReceiptExtraction;

type ServerReceiptExtractionResponse = {
  claimId: string;
  extraction: ExtractedReceiptDetails;
  extractionAttemptId: string;
  receipt: {
    checksum?: string;
    id: string;
    name: string;
    receiptVersion: number;
    safeName: string;
    size: number;
    storageObjectPath: string;
    type: string;
    uploadedAt: string;
    uploadedBy: string;
  };
};

const storageKey = "rdp-platform-claims.v1";
const idleReceiptExtractionState: ReceiptExtractionState = { message: "", status: "idle" };

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium"
});

export function ClaimsClient({ staffProfile }: ClaimsClientProps) {
  const permissions = getClaimPermissions(staffProfile.role);
  const [state, setState] = useState<ClaimsState>(() => createDefaultClaimsState(staffProfile));
  const [activeTab, setActiveTab] = useState<ClaimsTab>("mine");
  const [ready, setReady] = useState(false);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm>(() =>
    createBlankDraft(createDefaultClaimsState(staffProfile))
  );
  const [receiptProgress, setReceiptProgress] = useState(0);
  const [receiptExtraction, setReceiptExtraction] =
    useState<ReceiptExtractionState>(idleReceiptExtractionState);
  const receiptAbortController = useRef<AbortController | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [reviewFilter, setReviewFilter] = useState<LedgerStatusFilter>("Submitted");
  const [reviewInputs, setReviewInputs] = useState<Record<string, ReviewInput>>({});
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerStatus, setLedgerStatus] = useState<LedgerStatusFilter>("All");
  const [ledgerGroup, setLedgerGroup] = useState("All");
  const [ledgerCategory, setLedgerCategory] = useState("All");
  const [newGroupName, setNewGroupName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryGst, setNewCategoryGst] = useState(false);

  useEffect(() => {
    const loadedState = readStoredClaimsState(staffProfile);
    setState(loadedState);
    setDraft(createBlankDraft(loadedState));
    setReady(true);
  }, [staffProfile]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [ready, state]);

  useEffect(() => {
    if (!permissions.canReview && (activeTab === "review" || activeTab === "ledger")) {
      setActiveTab("mine");
    }

    if (!permissions.canManageSettings && activeTab === "settings") {
      setActiveTab("mine");
    }
  }, [activeTab, permissions.canManageSettings, permissions.canReview]);

  const sortedGroups = useMemo(() => sortClaimConfigItems(state.groups), [state.groups]);
  const sortedCategories = useMemo(
    () => sortClaimConfigItems(state.categories),
    [state.categories]
  );
  const visibleClaims = useMemo(
    () =>
      permissions.canReview
        ? state.claims
        : state.claims.filter((claim) => claim.claimantUserId === staffProfile.id),
    [permissions.canReview, staffProfile.id, state.claims]
  );
  const ownClaims = useMemo(
    () =>
      state.claims
        .filter((claim) => claim.claimantUserId === staffProfile.id)
        .sort(sortClaimsByUpdatedDesc),
    [staffProfile.id, state.claims]
  );
  const editingClaim = useMemo(
    () => (editingClaimId ? state.claims.find((claim) => claim.id === editingClaimId) ?? null : null),
    [editingClaimId, state.claims]
  );
  const reviewClaims = useMemo(
    () =>
      state.claims
        .filter((claim) => claim.claimantUserId !== staffProfile.id)
        .filter(isVisibleInReviewQueue)
        .filter((claim) => reviewFilter === "All" || claim.status === reviewFilter)
        .sort(sortClaimsByUpdatedDesc),
    [reviewFilter, staffProfile.id, state.claims]
  );
  const ledgerClaims = useMemo(
    () =>
      visibleClaims
        .filter((claim) => ledgerStatus === "All" || claim.status === ledgerStatus)
        .filter((claim) => ledgerGroup === "All" || claim.groupId === ledgerGroup)
        .filter((claim) => ledgerCategory === "All" || claim.categoryId === ledgerCategory)
        .filter((claim) => {
          const query = ledgerSearch.trim().toLowerCase();

          if (!query) {
            return true;
          }

          return [
            claim.id,
            claim.claimantName,
            claim.merchantName,
            claim.receiptNumber,
            getGroupName(state.groups, claim.groupId),
            getCategoryName(state.categories, claim.categoryId),
            claim.status
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .sort(sortClaimsByUpdatedDesc),
    [
      ledgerCategory,
      ledgerGroup,
      ledgerSearch,
      ledgerStatus,
      state.categories,
      state.groups,
      visibleClaims
    ]
  );
  const summary = useMemo(() => getClaimsSummary(visibleClaims), [visibleClaims]);

  const formFinancials = useMemo(() => parseDraftFinancials(draft), [draft]);
  const formValidation = useMemo(
    () => validateFinancials(formFinancials, state.settings),
    [formFinancials, state.settings]
  );
  const receiptBusy = isReceiptExtractionBusy(receiptExtraction.status);
  const formNonClaimable = calculateNonClaimableCents(
    formFinancials.totalSpentCents,
    formFinancials.amountRequestedCents
  );

  function updateDraftField<TKey extends keyof DraftForm>(key: TKey, value: DraftForm[TKey]) {
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  }

  function showMessage(tone: "success" | "error", text: string) {
    setMessage({ tone, text });
  }

  function clearDraftForm() {
    setEditingClaimId(null);
    setDraft(createBlankDraft(state));
    setReceiptExtraction(idleReceiptExtractionState);
    setReceiptProgress(0);
  }

  function resetDraft() {
    receiptAbortController.current?.abort();
    void cancelServerReceipt(draft.receipt, { deleteDraftClaim: !editingClaimId });
    clearDraftForm();
  }

  function fillSampleReceipt() {
    const sampleReceipt: ClaimReceipt = {
      id: createClientId(),
      checksum: "sample-decathlon-8640",
      name: "sample-decathlon-receipt.pdf",
      safeName: "sample-decathlon-receipt.pdf",
      size: 48210,
      type: "application/pdf",
      uploadedAt: new Date().toISOString(),
      uploadedBy: staffProfile.id
    };

    setDraft((currentDraft) => ({
      ...currentDraft,
      amountRequested: "86.40",
      businessPurpose: "Kickboards and spare swim caps for Learn to Swim classes.",
      categoryId: "equipment",
      groupId: "learn-to-swim",
      gstClaimable: "7.13",
      gstShown: "7.13",
      merchantName: "Decathlon Singapore",
      paymentMethod: "Card",
      receipt: sampleReceipt,
      receiptNumber: "DCSG-2026-0812",
      subtotal: "79.27",
      totalSpent: "86.40",
      transactionDate: "2026-08-12"
    }));
    setReceiptExtraction({
      fieldStatuses: createConfirmedReceiptFieldStatuses(),
      message: "Sample receipt details filled.",
      status: "completed"
    });
    setReceiptProgress(100);
    showMessage("success", "Sample receipt details added.");
  }

  function editClaim(claim: ClaimRecord) {
    if (!isClaimEditableByClaimant(claim, staffProfile.id)) {
      showMessage("error", "Only draft or returned claims can be edited.");
      return;
    }

    setEditingClaimId(claim.id);
    setDraft({
      amountRequested: centsToDecimal(claim.amountRequestedCents),
      businessPurpose: claim.businessPurpose,
      categoryId: claim.categoryId,
      currency: claim.currency,
      groupId: claim.groupId,
      gstClaimable: centsToDecimal(claim.gstClaimableCents),
      gstShown: centsToDecimal(claim.gstShownCents),
      merchantName: claim.merchantName,
      notes: claim.notes,
      paymentMethod: claim.paymentMethod,
      receipt: claim.receipt,
      receiptNumber: claim.receiptNumber,
      subtotal: centsToDecimal(claim.subtotalCents),
      totalSpent: centsToDecimal(claim.totalSpentCents),
      transactionDate: claim.transactionDate
    });
    setReceiptExtraction(idleReceiptExtractionState);
    setReceiptProgress(claim.receipt ? 100 : 0);
    setActiveTab("new");
  }

  async function saveDraft(nextStatus: "Draft" | "Submitted") {
    if (receiptBusy) {
      showMessage("error", "Please wait until receipt extraction is ready to review.");
      return;
    }

    const parsed = parseDraftFinancials(draft);
    const invalidMoney = Object.values(parsed).some((value) => Number.isNaN(value));

    if (invalidMoney) {
      showMessage("error", "Please enter money values with up to two decimal places.");
      return;
    }

    const requiredFields = [
      draft.groupId,
      draft.categoryId,
      draft.merchantName.trim(),
      draft.transactionDate,
      draft.businessPurpose.trim()
    ];

    if (nextStatus === "Submitted" && requiredFields.some((field) => !field)) {
      showMessage("error", "Complete the group, category, merchant, date, and purpose before submitting.");
      return;
    }

    const validation = validateFinancials(parsed, state.settings);

    if (validation.errors.length > 0) {
      showMessage("error", validation.errors[0]);
      return;
    }

    const synced = await syncServerClaim(nextStatus, validation.warnings);

    if (!synced) {
      return;
    }

    const now = new Date().toISOString();
    const existingClaim = editingClaimId
      ? state.claims.find((claim) => claim.id === editingClaimId) ?? null
      : null;
    const claimId = existingClaim?.id ?? getNextClaimReference(state.claims);
    const status =
      nextStatus === "Submitted"
        ? "Submitted"
        : existingClaim?.status === "Returned for Correction"
          ? "Returned for Correction"
          : "Draft";
    const baseClaim: ClaimRecord = {
      amountRequestedCents: parsed.amountRequestedCents,
      approvalComment: existingClaim?.approvalComment ?? "",
      approvedAmountCents: existingClaim?.approvedAmountCents ?? null,
      approverUserId: existingClaim?.approverUserId ?? null,
      businessPurpose: draft.businessPurpose.trim(),
      categoryId: draft.categoryId,
      claimantName: getStaffDisplayName(staffProfile),
      claimantUserId: staffProfile.id,
      createdAt: existingClaim?.createdAt ?? now,
      currency: draft.currency || "SGD",
      extractionConfidence: null,
      extractionReviewStatus: "review_required",
      extractionStatus: draft.receipt ? "reviewed" : "not_started",
      groupId: draft.groupId,
      gstClaimableCents: parsed.gstClaimableCents,
      gstShownCents: parsed.gstShownCents,
      history: existingClaim?.history ?? [],
      id: claimId,
      merchantName: draft.merchantName.trim(),
      nonClaimableCents: formNonClaimable,
      notes: draft.notes.trim(),
      paidAt: existingClaim?.paidAt ?? null,
      paymentMethod: draft.paymentMethod.trim(),
      possibleDuplicate: false,
      receipt: draft.receipt,
      receiptNumber: draft.receiptNumber.trim(),
      status,
      submittedAt: nextStatus === "Submitted" ? existingClaim?.submittedAt ?? now : existingClaim?.submittedAt ?? null,
      subtotalCents: parsed.subtotalCents,
      totalSpentCents: parsed.totalSpentCents,
      transactionDate: draft.transactionDate,
      updatedAt: now,
      validationWarnings: validation.warnings
    };
    const duplicateCount = detectPossibleDuplicates(baseClaim, state.claims).length;
    const nextClaim: ClaimRecord = {
      ...baseClaim,
      possibleDuplicate: duplicateCount > 0,
      history:
        existingClaim && existingClaim.status === status
          ? existingClaim.history
          : [
              ...(existingClaim?.history ?? []),
              {
                at: now,
                by: staffProfile.id,
                comment: nextStatus === "Submitted" ? "Claim submitted." : "Draft saved.",
                fromStatus: existingClaim?.status ?? null,
                toStatus: status
              }
            ]
    };

    setState((currentState) => ({
      ...currentState,
      claims: existingClaim
        ? currentState.claims.map((claim) => (claim.id === nextClaim.id ? nextClaim : claim))
        : [nextClaim, ...currentState.claims]
    }));
    clearDraftForm();
    setActiveTab("mine");
    showMessage(
      duplicateCount > 0 ? "error" : "success",
      nextStatus === "Submitted"
        ? duplicateCount > 0
          ? "Claim submitted and marked as possible duplicate."
          : "Claim submitted."
        : "Draft saved."
    );
  }

  function removeDraftReceipt() {
    receiptAbortController.current?.abort();
    void cancelServerReceipt(draft.receipt, { deleteDraftClaim: !editingClaimId });
    updateDraftField("receipt", null);
    setReceiptExtraction(idleReceiptExtractionState);
    setReceiptProgress(0);
  }

  function handleReceiptFile(file: File | null) {
    const validation = validateReceiptFile(file, state.settings);

    if (!file || !validation.valid) {
      showMessage("error", validation.errors[0] ?? "Receipt file is not valid.");
      return;
    }

    receiptAbortController.current?.abort();
    const previousReceipt = draft.receipt;
    const extractionAttemptId = createClientId();
    const receipt: ClaimReceipt = {
      checksum: `${validation.safeName}-${file.size}-${file.lastModified}`,
      extractionAttemptId,
      id: createClientId(),
      name: file.name,
      receiptVersion: (previousReceipt?.receiptVersion ?? 0) + 1,
      safeName: validation.safeName,
      serverClaimId: previousReceipt?.serverClaimId,
      size: file.size,
      type: file.type || getMimeTypeFromExtension(validation.extension),
      uploadedAt: new Date().toISOString(),
      uploadedBy: staffProfile.id
    };

    setReceiptProgress(20);
    setReceiptExtraction({
      message: "Uploading receipt to private storage...",
      status: "uploading"
    });
    setDraft((currentDraft) => ({
      ...clearExtractedDraftFields(currentDraft),
      receipt
    }));

    if (receipt.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setDraft((currentDraft) =>
          currentDraft.receipt?.id === receipt.id
            ? {
                ...currentDraft,
                receipt: {
                  ...currentDraft.receipt,
                  dataUrl: typeof reader.result === "string" ? reader.result : undefined
                }
              }
            : currentDraft
        );
        setReceiptProgress((currentProgress) => Math.max(currentProgress, 45));
      };
      reader.onerror = () => {
        setReceiptProgress((currentProgress) => Math.max(currentProgress, 45));
      };
      reader.readAsDataURL(file);
    }

    void extractReceiptDetails(file, receipt);
  }

  async function extractReceiptDetails(file: File, receipt: ClaimReceipt) {
    const abortController = new AbortController();
    receiptAbortController.current = abortController;
    setReceiptProgress(45);
    setReceiptExtraction({
      message: "Reading receipt with Azure Document Intelligence...",
      status: "extracting"
    });

    try {
      const extractionResponse = await uploadReceiptForExtraction(file, receipt, abortController.signal);
      const extraction = extractionResponse.extraction;

      if (!hasExtractedReceiptFields(extraction)) {
        throw new Error("Azure read the receipt, but no obvious date or amount was found. Please key in the details.");
      }

      setReceiptProgress(85);
      setReceiptExtraction({
        message: "Filling claim fields...",
        status: "filling"
      });
      setDraft((currentDraft) => {
        if (
          currentDraft.receipt?.id !== receipt.id ||
          currentDraft.receipt.extractionAttemptId !== receipt.extractionAttemptId
        ) {
          return currentDraft;
        }

        return applyReceiptExtraction(
          {
            ...currentDraft,
            receipt: {
              ...currentDraft.receipt,
              checksum: extractionResponse.receipt.checksum ?? currentDraft.receipt.checksum,
              receiptVersion: extractionResponse.receipt.receiptVersion,
              serverClaimId: extractionResponse.claimId,
              serverReceiptId: extractionResponse.receipt.id,
              storageObjectPath: extractionResponse.receipt.storageObjectPath,
              uploadedAt: extractionResponse.receipt.uploadedAt
            }
          },
          extraction
        );
      });
      setReceiptExtraction({
        fieldStatuses: extraction.fieldStatuses,
        message: getReceiptExtractionSuccessMessage(extraction),
        status: "completed"
      });
      setReceiptProgress(100);
      showMessage("success", "Receipt details filled by Azure. Please review before submitting.");
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Receipt details could not be extracted.";

      setReceiptExtraction({
        message: errorMessage,
        status: "failed"
      });
      setReceiptProgress(100);
      showMessage("error", errorMessage);
    } finally {
      if (receiptAbortController.current === abortController) {
        receiptAbortController.current = null;
      }
    }
  }

  async function uploadReceiptForExtraction(
    file: File,
    receipt: ClaimReceipt,
    signal: AbortSignal
  ): Promise<ServerReceiptExtractionResponse> {
    const formData = new FormData();

    formData.append("receipt", file);
    formData.append("extractionAttemptId", receipt.extractionAttemptId ?? createClientId());
    formData.append("groupName", getGroupName(state.groups, draft.groupId));
    formData.append("categoryName", getCategoryName(state.categories, draft.categoryId));

    if (receipt.serverClaimId) {
      formData.append("claimId", receipt.serverClaimId);
    }

    const response = await fetch("/api/claims/extract-receipt", {
      body: formData,
      method: "POST",
      signal
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<ServerReceiptExtractionResponse> & {
      error?: string;
    };

    if (!response.ok || !payload.extraction || !payload.claimId || !payload.receipt) {
      throw new Error(payload.error || "Receipt details could not be extracted.");
    }

    return payload as ServerReceiptExtractionResponse;
  }

  async function syncServerClaim(nextStatus: "Draft" | "Submitted", validationWarnings: string[]) {
    if (!draft.receipt?.serverClaimId) {
      return true;
    }

    const response = await fetch("/api/claims/extract-receipt", {
      body: JSON.stringify({
        amountRequested: draft.amountRequested,
        businessPurpose: draft.businessPurpose,
        categoryName: getCategoryName(state.categories, draft.categoryId),
        claimId: draft.receipt.serverClaimId,
        currency: draft.currency,
        groupName: getGroupName(state.groups, draft.groupId),
        gstClaimable: draft.gstClaimable,
        gstShown: draft.gstShown,
        merchantName: draft.merchantName,
        notes: draft.notes,
        paymentMethod: draft.paymentMethod,
        receiptNumber: draft.receiptNumber,
        status: nextStatus,
        subtotal: draft.subtotal,
        totalSpent: draft.totalSpent,
        transactionDate: draft.transactionDate,
        validationWarnings
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      showMessage("error", payload.error || "Claim could not be saved to Supabase.");
      return false;
    }

    return true;
  }

  async function cancelServerReceipt(
    receipt: ClaimReceipt | null,
    options: { deleteDraftClaim?: boolean } = {}
  ) {
    if (!receipt?.serverClaimId && !receipt?.serverReceiptId) {
      return;
    }

    await fetch("/api/claims/extract-receipt", {
      body: JSON.stringify({
        claimId: receipt.serverClaimId,
        deleteClaim: options.deleteDraftClaim ?? false,
        receiptId: receipt.serverReceiptId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "DELETE"
    }).catch(() => undefined);
  }

  async function deleteServerDraftClaim(claim: ClaimRecord) {
    if (!claim.receipt?.serverClaimId && !claim.receipt?.serverReceiptId) {
      return true;
    }

    const response = await fetch("/api/claims/extract-receipt", {
      body: JSON.stringify({
        claimId: claim.receipt.serverClaimId,
        deleteClaim: true,
        receiptId: claim.receipt.serverReceiptId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      showMessage("error", payload.error || "Draft claim could not be deleted.");
      return false;
    }

    return true;
  }

  async function deleteSavedDraftClaim(claim: ClaimRecord) {
    if (!canDeleteClaimDraft(claim, staffProfile.id)) {
      showMessage("error", "Only your own draft claims can be deleted.");
      return;
    }

    if (!window.confirm(`Delete draft ${claim.id}? This cannot be undone.`)) {
      return;
    }

    if (editingClaimId === claim.id) {
      receiptAbortController.current?.abort();
    }

    const deleted = await deleteServerDraftClaim(claim);

    if (!deleted) {
      return;
    }

    setState((currentState) => ({
      ...currentState,
      claims: currentState.claims.filter((item) => item.id !== claim.id)
    }));

    if (editingClaimId === claim.id) {
      clearDraftForm();
    }

    showMessage("success", "Draft claim deleted.");
  }

  function updateReviewInput(claimId: string, patch: Partial<ReviewInput>) {
    setReviewInputs((currentInputs) => ({
      ...currentInputs,
      [claimId]: {
        approvedAmount: currentInputs[claimId]?.approvedAmount ?? "",
        comment: currentInputs[claimId]?.comment ?? "",
        ...patch
      }
    }));
  }

  function applyReviewAction(claim: ClaimRecord, action: "start" | "return" | "approve" | "reject" | "paid") {
    if (claim.claimantUserId === staffProfile.id) {
      showMessage("error", "You cannot review your own claim.");
      return;
    }

    if (action === "paid" && !permissions.canMarkPaid) {
      showMessage("error", "Only admins can mark claims as paid.");
      return;
    }

    const input = reviewInputs[claim.id] ?? {
      approvedAmount: centsToDecimal(claim.approvedAmountCents ?? claim.amountRequestedCents),
      comment: ""
    };
    const approvedAmountCents = decimalToCents(input.approvedAmount || centsToDecimal(claim.amountRequestedCents));

    if (Number.isNaN(approvedAmountCents)) {
      showMessage("error", "Approved amount must use up to two decimal places.");
      return;
    }

    const statusByAction: Record<typeof action, ClaimStatus> = {
      approve: "Approved",
      paid: "Paid",
      reject: "Rejected",
      return: "Returned for Correction",
      start: "Under Review"
    };
    const targetStatus = statusByAction[action];

    if (targetStatus === "Approved") {
      const validation = validateFinancials(
        {
          amountRequestedCents: claim.amountRequestedCents,
          approvedAmountCents,
          gstClaimableCents: claim.gstClaimableCents,
          gstShownCents: claim.gstShownCents,
          subtotalCents: claim.subtotalCents,
          totalSpentCents: claim.totalSpentCents
        },
        state.settings
      );

      if (validation.errors.length > 0) {
        showMessage("error", validation.errors[0]);
        return;
      }
    }

    const transition = transitionClaimStatus(claim, targetStatus, staffProfile.id, input.comment);

    if (transition.error) {
      showMessage("error", transition.error);
      return;
    }

    const nextClaim: ClaimRecord = {
      ...transition.claim,
      approvalComment: input.comment.trim(),
      approvedAmountCents: targetStatus === "Approved" ? approvedAmountCents : transition.claim.approvedAmountCents,
      approverUserId:
        targetStatus === "Approved" || targetStatus === "Rejected" || targetStatus === "Returned for Correction"
          ? staffProfile.id
          : transition.claim.approverUserId
    };

    setState((currentState) => ({
      ...currentState,
      claims: currentState.claims.map((item) => (item.id === claim.id ? nextClaim : item))
    }));
    showMessage("success", `Claim moved to ${targetStatus}.`);
  }

  function updateConfigItem(
    type: "groups" | "categories",
    itemId: string,
    patch: Partial<ClaimGroup | ExpenseCategory>
  ) {
    setState((currentState) => ({
      ...currentState,
      [type]: currentState[type].map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch
            }
          : item
      )
    }));
  }

  function addGroup() {
    const name = newGroupName.trim();

    if (!name) {
      showMessage("error", "Enter a group name first.");
      return;
    }

    const id = getUniqueConfigId(name, state.groups);
    setState((currentState) => ({
      ...currentState,
      groups: [
        ...currentState.groups,
        {
          active: true,
          id,
          name,
          sortOrder: getNextSortOrder(currentState.groups)
        }
      ]
    }));
    setNewGroupName("");
    showMessage("success", "Group added.");
  }

  function addCategory() {
    const name = newCategoryName.trim();

    if (!name) {
      showMessage("error", "Enter a category name first.");
      return;
    }

    const id = getUniqueConfigId(name, state.categories);
    setState((currentState) => ({
      ...currentState,
      categories: [
        ...currentState.categories,
        {
          active: true,
          id,
          name,
          normallyGstClaimable: newCategoryGst,
          sortOrder: getNextSortOrder(currentState.categories)
        }
      ]
    }));
    setNewCategoryGst(false);
    setNewCategoryName("");
    showMessage("success", "Category added.");
  }

  function resetLocalClaimsData() {
    const nextState = createDefaultClaimsState(staffProfile);
    setState(nextState);
    setDraft(createBlankDraft(nextState));
    setEditingClaimId(null);
    showMessage("success", "Claims prototype data reset.");
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Claims Management
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <HeaderLink href="/admin" icon={ArrowLeft} label="Admin home" />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={FileText} label="Visible claims" value={visibleClaims.length} />
        <MetricCard icon={FileSearch} label="Awaiting review" value={summary.awaitingReview} />
        <MetricCard icon={WalletCards} label="Requested" value={formatMoneyCents(summary.requestedCents)} />
        <MetricCard icon={Banknote} label="Approved unpaid" value={formatMoneyCents(summary.approvedUnpaidCents)} />
        <MetricCard icon={Receipt} label="GST claimable" value={formatMoneyCents(summary.gstClaimableCents)} />
      </section>

      {message ? <StatusMessage tone={message.tone} message={message.text} /> : null}

      <nav className="flex flex-wrap gap-2 rounded-lg border border-line bg-paper p-2 shadow-panel">
        <TabButton active={activeTab === "mine"} icon={History} label="My claims" onClick={() => setActiveTab("mine")} />
        <TabButton active={activeTab === "new"} icon={ImagePlus} label="New claim" onClick={() => setActiveTab("new")} />
        {permissions.canReview ? (
          <>
            <TabButton active={activeTab === "review"} icon={ShieldCheck} label="Review" onClick={() => setActiveTab("review")} />
            <TabButton active={activeTab === "ledger"} icon={FileSearch} label="Ledger" onClick={() => setActiveTab("ledger")} />
          </>
        ) : null}
        {permissions.canManageSettings ? (
          <TabButton active={activeTab === "settings"} icon={Settings} label="Setup" onClick={() => setActiveTab("settings")} />
        ) : null}
      </nav>

      {activeTab === "mine" ? (
        <MyClaimsPanel
          claims={ownClaims}
          categories={state.categories}
          groups={state.groups}
          onDeleteDraft={(claim) => void deleteSavedDraftClaim(claim)}
          onEdit={editClaim}
          userId={staffProfile.id}
        />
      ) : null}

      {activeTab === "new" ? (
        <ClaimFormPanel
          categories={sortedCategories}
          canDeleteDraft={Boolean(editingClaim && canDeleteClaimDraft(editingClaim, staffProfile.id))}
          draft={draft}
          editingClaimId={editingClaimId}
          formNonClaimable={formNonClaimable}
          formValidation={formValidation}
          groups={sortedGroups}
          onDropFile={handleReceiptFile}
          onDeleteDraft={() => {
            if (editingClaim) {
              void deleteSavedDraftClaim(editingClaim);
            }
          }}
          onFillSample={fillSampleReceipt}
          onRemoveReceipt={removeDraftReceipt}
          onReset={resetDraft}
          onSaveDraft={() => saveDraft("Draft")}
          onSubmitClaim={() => saveDraft("Submitted")}
          onUpdateDraft={updateDraftField}
          receiptExtraction={receiptExtraction}
          receiptBusy={receiptBusy}
          receiptProgress={receiptProgress}
        />
      ) : null}

      {activeTab === "review" && permissions.canReview ? (
        <ReviewPanel
          canMarkPaid={permissions.canMarkPaid}
          categories={state.categories}
          claims={reviewClaims}
          filter={reviewFilter}
          groups={state.groups}
          onAction={applyReviewAction}
          onFilterChange={setReviewFilter}
          onUpdateInput={updateReviewInput}
          reviewInputs={reviewInputs}
        />
      ) : null}

      {activeTab === "ledger" && permissions.canReview ? (
        <LedgerPanel
          categories={sortedCategories}
          categoryFilter={ledgerCategory}
          claims={ledgerClaims}
          groupFilter={ledgerGroup}
          groups={sortedGroups}
          onCategoryChange={setLedgerCategory}
          onDownloadCsv={() => downloadClaimsCsv(ledgerClaims, state.groups, state.categories)}
          onGroupChange={setLedgerGroup}
          onSearchChange={setLedgerSearch}
          onStatusChange={setLedgerStatus}
          search={ledgerSearch}
          statusFilter={ledgerStatus}
        />
      ) : null}

      {activeTab === "settings" && permissions.canManageSettings ? (
        <SettingsPanel
          categories={sortedCategories}
          claims={state.claims}
          groups={sortedGroups}
          newCategoryGst={newCategoryGst}
          newCategoryName={newCategoryName}
          newGroupName={newGroupName}
          onAddCategory={addCategory}
          onAddGroup={addGroup}
          onNewCategoryGstChange={setNewCategoryGst}
          onNewCategoryNameChange={setNewCategoryName}
          onNewGroupNameChange={setNewGroupName}
          onResetData={resetLocalClaimsData}
          onUpdateCategory={(itemId, patch) => updateConfigItem("categories", itemId, patch)}
          onUpdateGroup={(itemId, patch) => updateConfigItem("groups", itemId, patch)}
        />
      ) : null}
    </main>
  );
}

function HeaderLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 break-words text-2xl font-semibold text-ink">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusMessage({ message, tone }: { message: string; tone: "success" | "error" }) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm font-medium shadow-panel",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      )}
    >
      {message}
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition",
        active ? "bg-teal text-white" : "text-slate-700 hover:bg-teal/10 hover:text-teal"
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function MyClaimsPanel({
  categories,
  claims,
  groups,
  onDeleteDraft,
  onEdit,
  userId
}: {
  categories: ExpenseCategory[];
  claims: ClaimRecord[];
  groups: ClaimGroup[];
  onDeleteDraft: (claim: ClaimRecord) => void;
  onEdit: (claim: ClaimRecord) => void;
  userId: string;
}) {
  const sections: Array<{ title: string; statuses: ClaimStatus[] }> = [
    { title: "Draft claims", statuses: ["Draft"] },
    { title: "Awaiting review", statuses: ["Submitted", "Under Review"] },
    { title: "Returned for action", statuses: ["Returned for Correction"] },
    { title: "Approved", statuses: ["Approved"] },
    { title: "Paid", statuses: ["Paid"] },
    { title: "Recently submitted", statuses: claimStatuses.filter((status) => status !== "Draft") }
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {sections.map((section) => {
        const sectionClaims = claims.filter((claim) => section.statuses.includes(claim.status)).slice(0, 8);

        return (
          <div className="rounded-lg border border-line bg-paper shadow-panel" key={section.title}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
              <span className="rounded-md bg-field px-2 py-1 text-xs font-semibold text-slate-500">
                {sectionClaims.length} shown
              </span>
            </div>
            <div className="divide-y divide-line">
              {sectionClaims.length > 0 ? (
                sectionClaims.map((claim) => (
                  <ClaimListItem
                    categories={categories}
                    claim={claim}
                    groups={groups}
                    key={claim.id}
                    onDeleteDraft={onDeleteDraft}
                    onEdit={onEdit}
                    userId={userId}
                  />
                ))
              ) : (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No claims here.</div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ClaimListItem({
  categories,
  claim,
  groups,
  onDeleteDraft,
  onEdit,
  userId
}: {
  categories: ExpenseCategory[];
  claim: ClaimRecord;
  groups: ClaimGroup[];
  onDeleteDraft: (claim: ClaimRecord) => void;
  onEdit: (claim: ClaimRecord) => void;
  userId: string;
}) {
  return (
    <article className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{claim.id}</p>
          <StatusPill status={claim.status} />
          {claim.possibleDuplicate ? <WarningPill label="Possible duplicate" /> : null}
        </div>
        <p className="mt-1 break-words text-slate-600">
          {claim.merchantName || "No merchant"} · {getGroupName(groups, claim.groupId)} ·{" "}
          {getCategoryName(categories, claim.categoryId)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {formatDate(claim.transactionDate)} · {claim.receipt?.safeName ?? "No receipt attached"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        <span className="font-semibold text-ink">
          {formatMoneyCents(claim.amountRequestedCents, claim.currency)}
        </span>
        {isClaimEditableByClaimant(claim, userId) ? (
          <button
            type="button"
            onClick={() => onEdit(claim)}
            className="inline-flex h-9 items-center rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            Edit
          </button>
        ) : null}
        {canDeleteClaimDraft(claim, userId) ? (
          <button
            type="button"
            aria-label={`Delete draft ${claim.id}`}
            onClick={() => onDeleteDraft(claim)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ClaimFormPanel({
  categories,
  canDeleteDraft,
  draft,
  editingClaimId,
  formNonClaimable,
  formValidation,
  groups,
  onDeleteDraft,
  onDropFile,
  onFillSample,
  onRemoveReceipt,
  onReset,
  onSaveDraft,
  onSubmitClaim,
  onUpdateDraft,
  receiptExtraction,
  receiptBusy,
  receiptProgress
}: {
  categories: ExpenseCategory[];
  canDeleteDraft: boolean;
  draft: DraftForm;
  editingClaimId: string | null;
  formNonClaimable: number;
  formValidation: ReturnType<typeof validateFinancials>;
  groups: ClaimGroup[];
  onDeleteDraft: () => void;
  onDropFile: (file: File | null) => void;
  onFillSample: () => void;
  onRemoveReceipt: () => void;
  onReset: () => void;
  onSaveDraft: () => void;
  onSubmitClaim: () => void;
  onUpdateDraft: <TKey extends keyof DraftForm>(key: TKey, value: DraftForm[TKey]) => void;
  receiptExtraction: ReceiptExtractionState;
  receiptBusy: boolean;
  receiptProgress: number;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form
        className="rounded-lg border border-line bg-paper p-4 shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitClaim();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {editingClaimId ? `Edit ${editingClaimId}` : "New claim"}
            </h2>
            <p className="text-sm text-slate-500">Receipt, claim amount, GST, and review fields</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canDeleteDraft ? (
              <button
                type="button"
                onClick={onDeleteDraft}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete draft
              </button>
            ) : null}
            <button
              type="button"
              onClick={onFillSample}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
            >
              <FileText aria-hidden="true" className="size-4" />
              Sample
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SelectField
            label="Group"
            value={draft.groupId}
            values={groups.filter((group) => group.active).map((group) => group.id)}
            labelForValue={(value) => getGroupName(groups, value)}
            onChange={(value) => onUpdateDraft("groupId", value)}
          />
          <SelectField
            label="Category"
            value={draft.categoryId}
            values={categories.filter((category) => category.active).map((category) => category.id)}
            labelForValue={(value) => getCategoryName(categories, value)}
            onChange={(value) => onUpdateDraft("categoryId", value)}
          />
          <TextField
            label="Merchant or supplier"
            value={draft.merchantName}
            onChange={(value) => onUpdateDraft("merchantName", value)}
          />
          <TextField
            label="Receipt or invoice number"
            value={draft.receiptNumber}
            onChange={(value) => onUpdateDraft("receiptNumber", value)}
          />
          <TextField
            label="Transaction date"
            type="date"
            value={draft.transactionDate}
            onChange={(value) => onUpdateDraft("transactionDate", value)}
          />
          <SelectField
            label="Currency"
            value={draft.currency}
            values={["SGD", "MYR", "USD", "EUR", "AUD"]}
            labelForValue={(value) => value}
            onChange={(value) => onUpdateDraft("currency", value)}
          />
          <MoneyField label="Subtotal before GST" value={draft.subtotal} onChange={(value) => onUpdateDraft("subtotal", value)} />
          <MoneyField label="GST shown" value={draft.gstShown} onChange={(value) => onUpdateDraft("gstShown", value)} />
          <MoneyField label="Total amount spent" value={draft.totalSpent} onChange={(value) => onUpdateDraft("totalSpent", value)} />
          <MoneyField label="Amount requested" value={draft.amountRequested} onChange={(value) => onUpdateDraft("amountRequested", value)} />
          <MoneyField label="GST claimable" value={draft.gstClaimable} onChange={(value) => onUpdateDraft("gstClaimable", value)} />
          <ReadOnlyValue label="Non-claimable amount" value={formatMoneyCents(formNonClaimable, draft.currency)} />
          <TextField
            label="Payment method"
            value={draft.paymentMethod}
            onChange={(value) => onUpdateDraft("paymentMethod", value)}
          />
          <TextAreaField
            label="Business purpose"
            value={draft.businessPurpose}
            onChange={(value) => onUpdateDraft("businessPurpose", value)}
          />
          <div className="md:col-span-2">
            <TextAreaField
              label="Notes"
              value={draft.notes}
              onChange={(value) => onUpdateDraft("notes", value)}
            />
          </div>
        </div>

        {formValidation.errors.length > 0 || formValidation.warnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {[...formValidation.errors, ...formValidation.warnings].map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={receiptBusy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save aria-hidden="true" className="size-4" />
            Save draft
          </button>
          <button
            type="submit"
            disabled={receiptBusy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send aria-hidden="true" className="size-4" />
            Submit
          </button>
        </div>
      </form>

      <ReceiptUploadPanel
        onDropFile={onDropFile}
        onRemoveReceipt={onRemoveReceipt}
        receipt={draft.receipt}
        receiptExtraction={receiptExtraction}
        receiptProgress={receiptProgress}
      />
    </section>
  );
}

function ReceiptUploadPanel({
  onDropFile,
  onRemoveReceipt,
  receipt,
  receiptExtraction,
  receiptProgress
}: {
  onDropFile: (file: File | null) => void;
  onRemoveReceipt: () => void;
  receipt: ClaimReceipt | null;
  receiptExtraction: ReceiptExtractionState;
  receiptProgress: number;
}) {
  return (
    <aside className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <UploadCloud aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-ink">Receipt</h2>
          <p className="text-sm text-slate-500">Photo, gallery, PDF, or desktop drop</p>
        </div>
      </div>

      <label
        className="mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-field px-4 py-8 text-center transition hover:border-teal hover:bg-paper"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onDropFile(event.dataTransfer.files[0] ?? null);
        }}
      >
        <Receipt aria-hidden="true" className="size-9 text-teal" />
        <span className="text-sm font-semibold text-ink">Upload receipt</span>
        <span className="text-xs text-slate-500">JPG, JPEG, PNG, or PDF up to 4MB</span>
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          onChange={(event) => onDropFile(event.target.files?.[0] ?? null)}
        />
      </label>

      <label className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal">
        <ImagePlus aria-hidden="true" className="size-4" />
        Take photo
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={(event) => onDropFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {receiptExtraction.status !== "idle" ? (
        <div
          className={clsx(
            "mt-3 rounded-md border px-3 py-2 text-sm",
            receiptExtraction.status === "completed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : receiptExtraction.status === "failed"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-900"
          )}
          role="status"
        >
          <p className="font-semibold">
            {getReceiptExtractionHeading(receiptExtraction.status)}
          </p>
          <p className="mt-1">{receiptExtraction.message}</p>
          {receiptExtraction.fieldStatuses ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {getReceiptStatusItems(receiptExtraction.fieldStatuses).map((item) => (
                <div
                  key={item.key}
                  className={clsx(
                    "flex min-h-9 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                    getReceiptFieldStatusClasses(item.status)
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="shrink-0 font-semibold">
                    {getReceiptFieldStatusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {receipt ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-field">
          {receipt.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receipt.dataUrl} alt={`Receipt preview for ${receipt.safeName}`} className="max-h-72 w-full object-contain bg-white" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 bg-white text-center">
              <FileText aria-hidden="true" className="size-9 text-slate-400" />
              <p className="px-4 text-sm font-semibold text-ink">{receipt.safeName}</p>
            </div>
          )}
          <div className="border-t border-line px-3 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold text-ink">{receipt.safeName}</p>
                <p className="mt-1 text-xs text-slate-500">{formatFileSize(receipt.size)}</p>
              </div>
              <button
                type="button"
                onClick={onRemoveReceipt}
                className="inline-flex h-8 items-center justify-center rounded-md border border-line bg-paper px-2 text-xs font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
              >
                Remove
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-teal" style={{ width: `${receiptProgress}%` }} />
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ReviewPanel({
  canMarkPaid,
  categories,
  claims,
  filter,
  groups,
  onAction,
  onFilterChange,
  onUpdateInput,
  reviewInputs
}: {
  canMarkPaid: boolean;
  categories: ExpenseCategory[];
  claims: ClaimRecord[];
  filter: LedgerStatusFilter;
  groups: ClaimGroup[];
  onAction: (claim: ClaimRecord, action: "start" | "return" | "approve" | "reject" | "paid") => void;
  onFilterChange: (status: LedgerStatusFilter) => void;
  onUpdateInput: (claimId: string, patch: Partial<ReviewInput>) => void;
  reviewInputs: Record<string, ReviewInput>;
}) {
  const filters: LedgerStatusFilter[] = ["Submitted", "Under Review", "Returned for Correction", "Approved", "Paid", "Rejected", "All"];

  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Review queue</h2>
          <p className="text-sm text-slate-500">{claims.length.toLocaleString()} claims shown</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((status) => (
            <button
              className={clsx(
                "h-9 rounded-md px-3 text-sm font-semibold transition",
                filter === status ? "bg-teal text-white" : "bg-field text-slate-700 hover:bg-teal/10 hover:text-teal"
              )}
              key={status}
              onClick={() => onFilterChange(status)}
              type="button"
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 bg-field p-3">
        {claims.length > 0 ? (
          claims.map((claim) => (
            <ReviewCard
              canMarkPaid={canMarkPaid}
              categories={categories}
              claim={claim}
              groups={groups}
              input={reviewInputs[claim.id]}
              key={claim.id}
              onAction={onAction}
              onUpdateInput={onUpdateInput}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-slate-500">
            No claims match this review filter.
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewCard({
  canMarkPaid,
  categories,
  claim,
  groups,
  input,
  onAction,
  onUpdateInput
}: {
  canMarkPaid: boolean;
  categories: ExpenseCategory[];
  claim: ClaimRecord;
  groups: ClaimGroup[];
  input?: ReviewInput;
  onAction: (claim: ClaimRecord, action: "start" | "return" | "approve" | "reject" | "paid") => void;
  onUpdateInput: (claimId: string, patch: Partial<ReviewInput>) => void;
}) {
  const reviewInput = input ?? {
    approvedAmount: centsToDecimal(claim.approvedAmountCents ?? claim.amountRequestedCents),
    comment: ""
  };
  const canStart = claim.status === "Submitted";
  const canDecide = claim.status === "Under Review";
  const canPay = claim.status === "Approved" && canMarkPaid;
  const warnings = [
    ...claim.validationWarnings,
    claim.possibleDuplicate ? "Possible duplicate receipt or claim details." : null
  ].filter(Boolean);

  return (
    <article className="grid gap-4 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{claim.id}</p>
          <StatusPill status={claim.status} />
          {warnings.length > 0 ? <WarningPill label="Review note" /> : null}
        </div>
        <h3 className="mt-2 break-words text-xl font-semibold text-ink">{claim.merchantName || "No merchant"}</h3>
        <p className="mt-1 break-words text-sm text-slate-600">{claim.businessPurpose || "No purpose entered."}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetaBox label="Claimant" value={claim.claimantName} />
          <MetaBox label="Group" value={getGroupName(groups, claim.groupId)} />
          <MetaBox label="Category" value={getCategoryName(categories, claim.categoryId)} />
          <MetaBox label="Requested" value={formatMoneyCents(claim.amountRequestedCents, claim.currency)} />
          <MetaBox label="GST claimable" value={formatMoneyCents(claim.gstClaimableCents, claim.currency)} />
          <MetaBox label="Receipt" value={claim.receipt?.safeName ?? "No receipt"} />
          <MetaBox label="Date" value={formatDate(claim.transactionDate)} />
          <MetaBox label="Review" value={claim.extractionReviewStatus.replace("_", " ")} />
        </div>

        {warnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-field p-3">
        <TextAreaField
          label="Approval or rejection comment"
          value={reviewInput.comment}
          onChange={(value) => onUpdateInput(claim.id, { comment: value })}
        />
        <div className="mt-3">
          <MoneyField
            label="Approved amount"
            value={reviewInput.approvedAmount}
            onChange={(value) => onUpdateInput(claim.id, { approvedAmount: value })}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ReviewButton disabled={!canStart} icon={FileSearch} label="Start" onClick={() => onAction(claim, "start")} />
          <ReviewButton disabled={!canDecide} icon={RotateCcw} label="Return" onClick={() => onAction(claim, "return")} />
          <ReviewButton disabled={!canDecide} icon={CheckCircle2} label="Approve" onClick={() => onAction(claim, "approve")} primary />
          <ReviewButton disabled={!canDecide} icon={XCircle} label="Reject" onClick={() => onAction(claim, "reject")} danger />
          <button
            type="button"
            disabled={!canPay}
            onClick={() => onAction(claim, "paid")}
            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Banknote aria-hidden="true" className="size-4" />
            Mark paid
          </button>
        </div>
      </div>
    </article>
  );
}

function ReviewButton({
  danger = false,
  disabled,
  icon: Icon,
  label,
  onClick,
  primary = false
}: {
  danger?: boolean;
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400",
        primary
          ? "bg-teal text-white hover:bg-teal/90"
          : danger
            ? "bg-rose-600 text-white hover:bg-rose-700"
            : "border border-line bg-paper text-slate-700 hover:border-teal hover:text-teal"
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function LedgerPanel({
  categories,
  categoryFilter,
  claims,
  groupFilter,
  groups,
  onCategoryChange,
  onDownloadCsv,
  onGroupChange,
  onSearchChange,
  onStatusChange,
  search,
  statusFilter
}: {
  categories: ExpenseCategory[];
  categoryFilter: string;
  claims: ClaimRecord[];
  groupFilter: string;
  groups: ClaimGroup[];
  onCategoryChange: (value: string) => void;
  onDownloadCsv: () => void;
  onGroupChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: LedgerStatusFilter) => void;
  search: string;
  statusFilter: LedgerStatusFilter;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Claims ledger</h2>
          <p className="text-sm text-slate-500">{claims.length.toLocaleString()} filtered records</p>
        </div>
        <button
          type="button"
          onClick={onDownloadCsv}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
        >
          <Download aria-hidden="true" className="size-4" />
          Export CSV
        </button>
      </div>

      <div className="grid gap-3 border-b border-line p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_220px_240px]">
        <label className="relative block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Search</span>
          <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            placeholder="Claim, claimant, merchant, receipt"
          />
        </label>
        <SelectField
          label="Status"
          value={statusFilter}
          values={["All", ...claimStatuses]}
          labelForValue={(value) => value}
          onChange={(value) => onStatusChange(value as LedgerStatusFilter)}
        />
        <SelectField
          label="Group"
          value={groupFilter}
          values={["All", ...groups.map((group) => group.id)]}
          labelForValue={(value) => (value === "All" ? "All groups" : getGroupName(groups, value))}
          onChange={onGroupChange}
        />
        <SelectField
          label="Category"
          value={categoryFilter}
          values={["All", ...categories.map((category) => category.id)]}
          labelForValue={(value) => (value === "All" ? "All categories" : getCategoryName(categories, value))}
          onChange={onCategoryChange}
        />
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-field text-xs uppercase text-slate-500 shadow-[0_1px_0_#ffd6b3]">
            <tr>
              <th className="px-4 py-3 font-semibold">Claim</th>
              <th className="px-4 py-3 font-semibold">Claimant</th>
              <th className="px-4 py-3 font-semibold">Group</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Merchant</th>
              <th className="px-4 py-3 font-semibold">Requested</th>
              <th className="px-4 py-3 font-semibold">GST</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {claims.length > 0 ? (
              claims.map((claim) => (
                <tr className="align-top odd:bg-paper even:bg-field/50" key={claim.id}>
                  <td className="border-b border-line px-4 py-3 font-semibold text-ink">{claim.id}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{claim.claimantName}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{getGroupName(groups, claim.groupId)}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{getCategoryName(categories, claim.categoryId)}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{claim.merchantName || "-"}</td>
                  <td className="border-b border-line px-4 py-3 font-semibold text-ink">{formatMoneyCents(claim.amountRequestedCents, claim.currency)}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{formatMoneyCents(claim.gstClaimableCents, claim.currency)}</td>
                  <td className="border-b border-line px-4 py-3"><StatusPill status={claim.status} /></td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{formatDate(claim.transactionDate)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={9}>
                  No claims match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsPanel({
  categories,
  claims,
  groups,
  newCategoryGst,
  newCategoryName,
  newGroupName,
  onAddCategory,
  onAddGroup,
  onNewCategoryGstChange,
  onNewCategoryNameChange,
  onNewGroupNameChange,
  onResetData,
  onUpdateCategory,
  onUpdateGroup
}: {
  categories: ExpenseCategory[];
  claims: ClaimRecord[];
  groups: ClaimGroup[];
  newCategoryGst: boolean;
  newCategoryName: string;
  newGroupName: string;
  onAddCategory: () => void;
  onAddGroup: () => void;
  onNewCategoryGstChange: (value: boolean) => void;
  onNewCategoryNameChange: (value: string) => void;
  onNewGroupNameChange: (value: string) => void;
  onResetData: () => void;
  onUpdateCategory: (itemId: string, patch: Partial<ExpenseCategory>) => void;
  onUpdateGroup: (itemId: string, patch: Partial<ClaimGroup>) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <ConfigPanel
        icon={FolderCog}
        items={groups}
        claims={claims}
        itemKey="groupId"
        newName={newGroupName}
        onAdd={onAddGroup}
        onNewNameChange={onNewGroupNameChange}
        onUpdate={onUpdateGroup}
        title="Organisational groups"
      />

      <div className="rounded-lg border border-line bg-paper shadow-panel">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <Settings aria-hidden="true" className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-ink">Expense categories</h2>
        </div>
        <div className="grid gap-3 p-4">
          {categories.map((category) => (
            <div className="grid gap-3 rounded-lg border border-line bg-field p-3 sm:grid-cols-[minmax(0,1fr)_90px_100px_120px] sm:items-end" key={category.id}>
              <TextField label="Name" value={category.name} onChange={(value) => onUpdateCategory(category.id, { name: value })} />
              <NumberField label="Order" value={category.sortOrder} onChange={(value) => onUpdateCategory(category.id, { sortOrder: value })} />
              <ToggleField label="GST" checked={category.normallyGstClaimable} onChange={(checked) => onUpdateCategory(category.id, { normallyGstClaimable: checked })} />
              <ToggleField label="Active" checked={category.active} onChange={(checked) => onUpdateCategory(category.id, { active: checked })} />
              {!canDeleteReferencedItem(category.id, claims, "categoryId") ? (
                <p className="text-xs text-slate-500 sm:col-span-4">Referenced by claims, so keep as active or inactive instead of deleting.</p>
              ) : null}
            </div>
          ))}
          <div className="grid gap-3 rounded-lg border border-dashed border-line bg-field p-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
            <TextField label="New category" value={newCategoryName} onChange={onNewCategoryNameChange} />
            <ToggleField label="GST" checked={newCategoryGst} onChange={onNewCategoryGstChange} />
            <button
              type="button"
              onClick={onAddCategory}
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-paper p-4 shadow-panel xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Local prototype data</h2>
            <p className="text-sm text-slate-500">Resets claims, groups, categories, and settings in this browser.</p>
          </div>
          <button
            type="button"
            onClick={onResetData}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset data
          </button>
        </div>
      </div>
    </section>
  );
}

function ConfigPanel({
  claims,
  icon: Icon,
  itemKey,
  items,
  newName,
  onAdd,
  onNewNameChange,
  onUpdate,
  title
}: {
  claims: ClaimRecord[];
  icon: LucideIcon;
  itemKey: "groupId" | "categoryId";
  items: ClaimConfigItem[];
  newName: string;
  onAdd: () => void;
  onNewNameChange: (value: string) => void;
  onUpdate: (itemId: string, patch: Partial<ClaimConfigItem>) => void;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      <div className="grid gap-3 p-4">
        {items.map((item) => (
          <div className="grid gap-3 rounded-lg border border-line bg-field p-3 sm:grid-cols-[minmax(0,1fr)_90px_120px] sm:items-end" key={item.id}>
            <TextField label="Name" value={item.name} onChange={(value) => onUpdate(item.id, { name: value })} />
            <NumberField label="Order" value={item.sortOrder} onChange={(value) => onUpdate(item.id, { sortOrder: value })} />
            <ToggleField label="Active" checked={item.active} onChange={(checked) => onUpdate(item.id, { active: checked })} />
            {!canDeleteReferencedItem(item.id, claims, itemKey) ? (
              <p className="text-xs text-slate-500 sm:col-span-3">Referenced by claims, so keep as active or inactive instead of deleting.</p>
            ) : null}
          </div>
        ))}
        <div className="grid gap-3 rounded-lg border border-dashed border-line bg-field p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <TextField label="New group" value={newName} onChange={onNewNameChange} />
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
      />
    </label>
  );
}

function MoneyField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        inputMode="decimal"
        min="0"
        step="0.01"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
      />
    </label>
  );
}

function NumberField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        min="0"
        step="10"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
      />
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full resize-y rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
      />
    </label>
  );
}

function SelectField<TValue extends string>({
  label,
  labelForValue,
  onChange,
  value,
  values
}: {
  label: string;
  labelForValue: (value: TValue) => string;
  onChange: (value: TValue) => void;
  value: TValue;
  values: TValue[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {labelForValue(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <div className="flex h-10 items-center rounded-md border border-line bg-slate-50 px-3 text-sm font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}

function ToggleField({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex h-10 items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700">
      {label}
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-field px-3 py-2">
      <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-ink">{value || "-"}</p>
    </div>
  );
}

function StatusPill({ status }: { status: ClaimStatus }) {
  const className = {
    Approved: "bg-emerald-100 text-emerald-800",
    Cancelled: "bg-slate-200 text-slate-700",
    Draft: "bg-slate-100 text-slate-700",
    Paid: "bg-teal/10 text-teal",
    Rejected: "bg-rose-100 text-rose-800",
    "Returned for Correction": "bg-amber-100 text-amber-900",
    Submitted: "bg-sky-100 text-sky-800",
    "Under Review": "bg-indigo-100 text-indigo-800"
  }[status];

  return (
    <span className={clsx("inline-flex rounded-md px-2 py-1 text-xs font-semibold", className)}>
      {status}
    </span>
  );
}

function WarningPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
      {label}
    </span>
  );
}

function createDefaultClaimsState(staffProfile: StaffProfile): ClaimsState {
  return {
    categories: initialExpenseCategories,
    claims: createSeedClaims(staffProfile),
    groups: initialClaimGroups,
    settings: defaultClaimSettings
  };
}

function readStoredClaimsState(staffProfile: StaffProfile): ClaimsState {
  const fallback = createDefaultClaimsState(staffProfile);

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<ClaimsState>;

    return {
      categories: mergeCategories(parsed.categories, fallback.categories),
      claims: Array.isArray(parsed.claims)
        ? ensureCurrentUserClaim(sanitizeStoredClaims(parsed.claims), staffProfile)
        : fallback.claims,
      groups: mergeConfigItems(parsed.groups, fallback.groups),
      settings: {
        ...fallback.settings,
        ...(parsed.settings ?? {})
      }
    };
  } catch {
    return fallback;
  }
}

function ensureCurrentUserClaim(claims: ClaimRecord[], staffProfile: StaffProfile) {
  if (claims.some((claim) => claim.claimantUserId === staffProfile.id)) {
    return claims;
  }

  return [createCurrentUserSeedClaim(staffProfile), ...claims];
}

function sanitizeStoredClaims(claims: ClaimRecord[]) {
  return claims.map((claim) => {
    if (!claim.receipt || !isClaimEditableByClaimant(claim, claim.claimantUserId)) {
      return claim;
    }

    const receiptValidation = validateReceiptFile({
      name: claim.receipt.name || claim.receipt.safeName,
      size: claim.receipt.size,
      type: claim.receipt.type
    });

    if (receiptValidation.valid) {
      return claim;
    }

    return {
      ...claim,
      extractionConfidence: null,
      extractionReviewStatus: "review_required" as const,
      extractionStatus: "not_started" as const,
      receipt: null
    };
  });
}

function mergeConfigItems<TItem extends ClaimConfigItem>(items: TItem[] | undefined, fallback: TItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallback;
  }

  const byId = new Map(fallback.map((item) => [item.id, item]));

  for (const item of items) {
    byId.set(item.id, {
      ...byId.get(item.id),
      ...item
    } as TItem);
  }

  return Array.from(byId.values());
}

function mergeCategories(items: ExpenseCategory[] | undefined, fallback: ExpenseCategory[]) {
  return mergeConfigItems(items, fallback).map((category) => ({
    ...category,
    normallyGstClaimable: category.normallyGstClaimable ?? false
  }));
}

function createSeedClaims(staffProfile: StaffProfile): ClaimRecord[] {
  return [
    createCurrentUserSeedClaim(staffProfile),
    createClaim({
      amountRequestedCents: 8640,
      businessPurpose: "Kickboards and spare swim caps for Learn to Swim classes.",
      categoryId: "equipment",
      claimantName: "Alicia Tan",
      claimantUserId: "demo-coach-alicia",
      groupId: "learn-to-swim",
      gstClaimableCents: 713,
      gstShownCents: 713,
      id: "RDP-260801-001",
      merchantName: "Decathlon Singapore",
      receiptName: "decathlon-kickboards-2026-08-01.pdf",
      receiptNumber: "DCSG-2026-0801",
      status: "Submitted",
      subtotalCents: 7927,
      totalSpentCents: 8640,
      transactionDate: "2026-08-01"
    }),
    createClaim({
      amountRequestedCents: 2380,
      businessPurpose: "Transport to replacement coach briefing after rain delay.",
      categoryId: "transport",
      claimantName: "Benjamin Lee",
      claimantUserId: "demo-coach-benjamin",
      groupId: "race-team",
      gstClaimableCents: 0,
      gstShownCents: 0,
      id: "RDP-260802-002",
      merchantName: "Grab",
      receiptName: "grab-2026-08-02-sgd23.80.png",
      receiptNumber: "GRAB-2380",
      status: "Approved",
      subtotalCents: 2380,
      totalSpentCents: 2380,
      transactionDate: "2026-08-02"
    }),
    createClaim({
      amountRequestedCents: 14820,
      approvalComment: "Please confirm whether GST should be claimable.",
      businessPurpose: "Parent referral flyers for Baby Class.",
      categoryId: "marketing",
      claimantName: "Carmen Ong",
      claimantUserId: "demo-coach-carmen",
      groupId: "baby-class",
      gstClaimableCents: 0,
      gstShownCents: 1231,
      id: "RDP-260803-003",
      merchantName: "Print City",
      receiptName: "print-city-flyers-148.20.pdf",
      receiptNumber: "PC-14820",
      status: "Returned for Correction",
      subtotalCents: 13676,
      totalSpentCents: 14907,
      transactionDate: "2026-08-03",
      validationWarnings: ["Subtotal plus GST does not match the total. Review for rounding or other charges."]
    })
  ];
}

function createCurrentUserSeedClaim(staffProfile: StaffProfile) {
  return createClaim({
    amountRequestedCents: 4520,
    businessPurpose: "Stopwatches for weekly timing checks.",
    categoryId: "equipment",
    claimantName: getStaffDisplayName(staffProfile),
    claimantUserId: staffProfile.id,
    groupId: "learn-to-swim",
    gstClaimableCents: 0,
    gstShownCents: 373,
    id: "RDP-260804-004",
    merchantName: "Swim Supplies SG",
    receiptName: "swim-supplies-stopwatches.pdf",
    receiptNumber: "SSG-4520",
    status: "Draft",
    subtotalCents: 4147,
    totalSpentCents: 4520,
    transactionDate: "2026-08-04"
  });
}

function createClaim(
  overrides: Omit<
    Partial<ClaimRecord>,
    | "createdAt"
    | "extractionConfidence"
    | "extractionReviewStatus"
    | "extractionStatus"
    | "history"
    | "nonClaimableCents"
    | "receipt"
    | "updatedAt"
  > & {
    amountRequestedCents: number;
    categoryId: string;
    claimantName: string;
    claimantUserId: string;
    groupId: string;
    id: string;
    receiptName: string;
    status: ClaimStatus;
    totalSpentCents: number;
  }
): ClaimRecord {
  const now = new Date().toISOString();
  const receiptName = overrides.receiptName;
  const receiptType = receiptName.endsWith(".png") ? "image/png" : "application/pdf";

  return {
    approvalComment: "",
    approvedAmountCents: overrides.status === "Approved" ? overrides.amountRequestedCents : null,
    approverUserId: null,
    businessPurpose: "",
    currency: "SGD",
    extractionConfidence: null,
    extractionReviewStatus: "review_required",
    extractionStatus: "reviewed",
    gstClaimableCents: 0,
    gstShownCents: 0,
    history: [
      {
        at: now,
        by: overrides.claimantUserId,
        comment: "Seed claim created.",
        fromStatus: null,
        toStatus: overrides.status
      }
    ],
    merchantName: "",
    nonClaimableCents: calculateNonClaimableCents(
      overrides.totalSpentCents,
      overrides.amountRequestedCents
    ),
    notes: "",
    paidAt: null,
    paymentMethod: "Card",
    possibleDuplicate: false,
    receipt: {
      checksum: `${overrides.id}-checksum`,
      id: `${overrides.id}-receipt`,
      name: receiptName,
      safeName: safeDisplayFilename(receiptName),
      size: 48210,
      type: receiptType,
      uploadedAt: now,
      uploadedBy: overrides.claimantUserId
    },
    receiptNumber: "",
    submittedAt: overrides.status === "Draft" ? null : now,
    subtotalCents: 0,
    transactionDate: "",
    validationWarnings: [],
    ...overrides,
    createdAt: now,
    updatedAt: now
  };
}

function createBlankDraft(state: ClaimsState): DraftForm {
  const firstGroup = sortClaimConfigItems(state.groups).find((group) => group.active);
  const firstCategory = sortClaimConfigItems(state.categories).find((category) => category.active);

  return {
    amountRequested: "",
    businessPurpose: "",
    categoryId: firstCategory?.id ?? "",
    currency: "SGD",
    groupId: firstGroup?.id ?? "",
    gstClaimable: "",
    gstShown: "",
    merchantName: "",
    notes: "",
    paymentMethod: "",
    receipt: null,
    receiptNumber: "",
    subtotal: "",
    totalSpent: "",
    transactionDate: ""
  };
}

function applyReceiptExtraction(
  draft: DraftForm,
  extraction: ExtractedReceiptDetails
): DraftForm {
  const totalSpent = cleanExtractedValue(extraction.totalSpent);
  const gstShown = cleanExtractedValue(extraction.gstShown);

  return {
    ...draft,
    amountRequested:
      cleanExtractedValue(extraction.amountRequested) || totalSpent || draft.amountRequested,
    currency: cleanExtractedValue(extraction.currency) || draft.currency,
    gstClaimable: cleanExtractedValue(extraction.gstClaimable) || gstShown || draft.gstClaimable,
    gstShown: gstShown || draft.gstShown,
    merchantName: cleanExtractedValue(extraction.merchantName) || draft.merchantName,
    paymentMethod: cleanExtractedValue(extraction.paymentMethod) || draft.paymentMethod,
    receiptNumber: cleanExtractedValue(extraction.receiptNumber) || draft.receiptNumber,
    subtotal: cleanExtractedValue(extraction.subtotal) || draft.subtotal,
    totalSpent: totalSpent || draft.totalSpent,
    transactionDate: cleanExtractedValue(extraction.transactionDate) || draft.transactionDate
  };
}

function clearExtractedDraftFields(draft: DraftForm): DraftForm {
  return {
    ...draft,
    amountRequested: "",
    currency: draft.currency || "SGD",
    gstClaimable: "",
    gstShown: "",
    merchantName: "",
    paymentMethod: "",
    receiptNumber: "",
    subtotal: "",
    totalSpent: "",
    transactionDate: ""
  };
}

function cleanExtractedValue(value: string | null | undefined) {
  return value?.trim() || "";
}

function getReceiptExtractionSuccessMessage(extraction: ExtractedReceiptDetails) {
  const summary = getReceiptFieldStatusSummary(extraction.fieldStatuses);

  if (summary.missing > 0) {
    return `Filled visible fields. ${summary.missing} ${pluralizeField(
      summary.missing
    )} not found. Please review before submitting.`;
  }

  if (summary.verify > 0) {
    return `Filled visible fields. ${summary.verify} ${
      summary.verify === 1 ? "field needs" : "fields need"
    } review before submitting.`;
  }

  return "Filled visible fields. Please review before submitting.";
}

const receiptFieldOrder: ReceiptFieldKey[] = [
  "merchantName",
  "receiptNumber",
  "transactionDate",
  "subtotal",
  "gstShown",
  "totalSpent",
  "paymentMethod"
];

const receiptFieldLabels: Record<ReceiptFieldKey, string> = {
  gstShown: "GST",
  merchantName: "Merchant",
  paymentMethod: "Payment",
  receiptNumber: "Receipt no.",
  subtotal: "Subtotal",
  totalSpent: "Total",
  transactionDate: "Date"
};

function createConfirmedReceiptFieldStatuses(): ReceiptFieldStatuses {
  return receiptFieldOrder.reduce((statuses, key) => {
    statuses[key] = "confirmed";
    return statuses;
  }, {} as ReceiptFieldStatuses);
}

function getReceiptStatusItems(fieldStatuses: ReceiptFieldStatuses) {
  return receiptFieldOrder.map((key) => ({
    key,
    label: receiptFieldLabels[key],
    status: fieldStatuses[key]
  }));
}

function getReceiptFieldStatusLabel(status: ReceiptFieldStatus) {
  switch (status) {
    case "confirmed":
      return "Confidently extracted";
    case "verify":
      return "Please verify";
    case "missing":
      return "Not found";
  }
}

function getReceiptFieldStatusClasses(status: ReceiptFieldStatus) {
  switch (status) {
    case "confirmed":
      return "border-emerald-200 bg-emerald-100 text-emerald-900";
    case "verify":
      return "border-amber-200 bg-amber-100 text-amber-950";
    case "missing":
      return "border-red-200 bg-red-100 text-red-800";
  }
}

function getReceiptExtractionHeading(status: ReceiptExtractionState["status"]) {
  switch (status) {
    case "uploading":
      return "Uploading receipt";
    case "extracting":
      return "Reading receipt";
    case "filling":
      return "Filling claim";
    case "completed":
      return "Ready to review";
    case "failed":
      return "Extraction needs review";
    case "idle":
      return "";
  }
}

function isReceiptExtractionBusy(status: ReceiptExtractionState["status"]) {
  return status === "uploading" || status === "extracting" || status === "filling";
}

function getReceiptFieldStatusSummary(fieldStatuses: ReceiptFieldStatuses) {
  return Object.values(fieldStatuses).reduce(
    (summary, status) => ({
      confirmed: summary.confirmed + (status === "confirmed" ? 1 : 0),
      missing: summary.missing + (status === "missing" ? 1 : 0),
      verify: summary.verify + (status === "verify" ? 1 : 0)
    }),
    { confirmed: 0, missing: 0, verify: 0 }
  );
}

function pluralizeField(count: number) {
  return count === 1 ? "field was" : "fields were";
}

function parseDraftFinancials(draft: DraftForm) {
  return {
    amountRequestedCents: decimalToCents(draft.amountRequested),
    approvedAmountCents: decimalToCents(draft.amountRequested),
    gstClaimableCents: decimalToCents(draft.gstClaimable),
    gstShownCents: decimalToCents(draft.gstShown),
    subtotalCents: decimalToCents(draft.subtotal),
    totalSpentCents: decimalToCents(draft.totalSpent)
  };
}

function getClaimsSummary(claims: ClaimRecord[]) {
  return claims.reduce(
    (summary, claim) => ({
      approvedUnpaidCents:
        summary.approvedUnpaidCents +
        (claim.status === "Approved" ? claim.approvedAmountCents ?? claim.amountRequestedCents : 0),
      awaitingReview:
        summary.awaitingReview + (claim.status === "Submitted" || claim.status === "Under Review" ? 1 : 0),
      gstClaimableCents: summary.gstClaimableCents + claim.gstClaimableCents,
      requestedCents: summary.requestedCents + claim.amountRequestedCents
    }),
    {
      approvedUnpaidCents: 0,
      awaitingReview: 0,
      gstClaimableCents: 0,
      requestedCents: 0
    }
  );
}

function getGroupName(groups: ClaimGroup[], groupId: string) {
  return groups.find((group) => group.id === groupId)?.name ?? groupId;
}

function getCategoryName(categories: ExpenseCategory[], categoryId: string) {
  return categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

function getStaffDisplayName(staffProfile: StaffProfile) {
  return staffProfile.fullName || staffProfile.coachName || staffProfile.email;
}

function sortClaimsByUpdatedDesc(first: ClaimRecord, second: ClaimRecord) {
  return second.updatedAt.localeCompare(first.updatedAt);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getMimeTypeFromExtension(extension: string) {
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  return "image/jpeg";
}

function hasExtractedReceiptFields(extraction: ExtractedReceiptDetails) {
  return Boolean(
    extraction.amountRequested ||
      extraction.gstShown ||
      extraction.merchantName ||
      extraction.receiptNumber ||
      extraction.totalSpent ||
      extraction.transactionDate
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getUniqueConfigId(name: string, items: ClaimConfigItem[]) {
  const baseId = slugifyClaimConfig(name);
  let id = baseId;
  let counter = 2;

  while (items.some((item) => item.id === id)) {
    id = `${baseId}-${counter}`;
    counter += 1;
  }

  return id;
}

function getNextSortOrder(items: ClaimConfigItem[]) {
  return Math.max(0, ...items.map((item) => item.sortOrder)) + 10;
}

function downloadClaimsCsv(claims: ClaimRecord[], groups: ClaimGroup[], categories: ExpenseCategory[]) {
  const headers = [
    "Claim reference",
    "Claimant",
    "Group",
    "Expense category",
    "Merchant",
    "Receipt number",
    "Transaction date",
    "Currency",
    "Subtotal",
    "GST shown",
    "GST claimable",
    "Total spent",
    "Amount requested",
    "Approved amount",
    "Status",
    "Submission date",
    "Paid date",
    "Receipt attachment"
  ];
  const rows = claims.map((claim) => [
    claim.id,
    claim.claimantName,
    getGroupName(groups, claim.groupId),
    getCategoryName(categories, claim.categoryId),
    claim.merchantName,
    claim.receiptNumber,
    claim.transactionDate,
    claim.currency,
    centsToDecimal(claim.subtotalCents),
    centsToDecimal(claim.gstShownCents),
    centsToDecimal(claim.gstClaimableCents),
    centsToDecimal(claim.totalSpentCents),
    centsToDecimal(claim.amountRequestedCents),
    claim.approvedAmountCents == null ? "" : centsToDecimal(claim.approvedAmountCents),
    claim.status,
    claim.submittedAt ?? "",
    claim.paidAt ?? "",
    claim.receipt?.safeName ?? ""
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `rdp-claims-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

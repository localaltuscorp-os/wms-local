package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/reimbursements[?view=archived] — the signed-in user's OWN
 * reimbursement claims (owner-scoped) with the KPIs the web `/reimbursements`
 * page folds over the loaded rows: total claimed, pending, approved · paid, and
 * the claim / rejected count.
 *
 * Mirrors the live route exactly (app/api/mobile/reimbursements/route.ts).
 * Read-only on mobile — claims are filed on the web.
 */
@Serializable
data class ReimbursementsDto(
    /** "active" | "archived" — which shelf this payload covers. */
    val view: String = "active",
    val ownerName: String = "",
    val totals: ReimbursementTotalsDto = ReimbursementTotalsDto(),
    val claims: List<ReimbursementClaimDto> = emptyList(),
)

@Serializable
data class ReimbursementTotalsDto(
    /** ₹ across every claim on this shelf. */
    val totalClaimed: Double = 0.0,
    val pendingAmount: Double = 0.0,
    val approvedAmount: Double = 0.0,
    val claimCount: Int = 0,
    val pendingCount: Int = 0,
    val approvedCount: Int = 0,
    /** Approved claims the admin has actually settled (payment_date logged). */
    val paidCount: Int = 0,
    val rejectedCount: Int = 0,
    /** approvedAmount / totalClaimed, or null when nothing claimed. */
    val approvedShare: Double? = null,
)

/** One reimbursement claim. */
@Serializable
data class ReimbursementClaimDto(
    val id: String = "",
    /** The "Expense For" headline. */
    val title: String = "",
    /** Claim amount in ₹ (parsed from the stored string). */
    val amount: Double = 0.0,
    /** Raw "YYYY-MM-DD" expense date (or "" when unset) — formatted on-device. */
    val expenseDate: String = "",
    val product: String? = null,
    val billUrl: String? = null,
    val notes: String? = null,
    /** Raw status token: "pending" | "approved" | "rejected". */
    val status: String = "",
    /** Display label for [status] ("Pending" | "Approved" | "Rejected"). */
    val statusLabel: String = "",
    /** True when approved AND the admin logged a payment date (settled). */
    val isPaid: Boolean = false,
    /** Raw "YYYY-MM-DD" payment date the admin logged (or null). */
    val paymentDate: String? = null,
    /** The expense head the admin booked it against, if any. */
    val expenseHead: String? = null,
    /** ISO-8601 instant the claim was filed. */
    val createdAt: String = "",
)

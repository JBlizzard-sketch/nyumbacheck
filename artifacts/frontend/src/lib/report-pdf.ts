import jsPDF from "jspdf";

type FraudSignal = {
  label: string;
  description: string;
  contribution?: number;
  score?: number;
};

type DuplicateListing = {
  platform: string;
  url: string;
  priceKsh?: number | null;
  agentPhone?: string | null;
};

export type ReportPdfData = {
  id: number;
  status: string;
  inputUrl?: string | null;
  inputAddress?: string | null;
  email?: string;
  createdAt?: string;
  fraudScore?: {
    score: number;
    riskLevel: string;
    summary: string;
    signals?: FraudSignal[];
  };
  duplicateListings?: DuplicateListing[];
  platformCount?: number | null;
  priceRangeKsh?: { min: number; max: number } | null;
};

const BRAND = {
  primary: [26, 58, 42] as [number, number, number],
  light: [240, 248, 244] as [number, number, number],
  text: [26, 42, 34] as [number, number, number],
  muted: [102, 119, 108] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const RISK_COLORS: Record<string, [number, number, number]> = {
  low: [34, 197, 94],
  medium: [245, 158, 11],
  high: [249, 115, 22],
  critical: [239, 68, 68],
};

function formatKsh(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `KSh ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `KSh ${(val / 1_000).toFixed(0)}K`;
  return `KSh ${val.toLocaleString()}`;
}

export function generateReportPdf(report: ReportPdfData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const marginL = 16;
  const marginR = 16;
  const contentW = W - marginL - marginR;
  let y = 0;

  // ── Header banner ──────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, W, 30, "F");

  doc.setTextColor(...BRAND.white);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("NyumbaCheck", marginL, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Fraud Analysis Report", marginL, 20);
  doc.text(`Report #${report.id}`, W - marginR, 20, { align: "right" });

  const now = new Date();
  doc.setFontSize(8);
  doc.text(
    `Generated: ${now.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    W - marginR,
    27,
    { align: "right" }
  );

  y = 38;

  // ── Property section ───────────────────────────────────────────────────────
  const input = report.inputUrl || report.inputAddress || "—";

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(marginL, y, contentW, 22, 2, 2, "F");

  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PROPERTY", marginL + 5, y + 7);

  doc.setTextColor(...BRAND.text);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const inputLine = doc.splitTextToSize(input, contentW - 10);
  doc.text(inputLine[0] as string, marginL + 5, y + 14);

  if (report.email) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.muted);
    doc.text(`Report sent to: ${report.email}`, marginL + 5, y + 20);
  }

  y += 28;

  // ── Fraud score section ────────────────────────────────────────────────────
  if (report.fraudScore) {
    const { score, riskLevel, summary, signals } = report.fraudScore;
    const riskColor = RISK_COLORS[riskLevel] ?? RISK_COLORS.medium;
    const riskLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);

    // Score box
    doc.setFillColor(...BRAND.primary);
    doc.roundedRect(marginL, y, 42, 42, 3, 3, "F");

    doc.setTextColor(...BRAND.white);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text(String(Math.round(score)), marginL + 21, y + 22, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("out of 100", marginL + 21, y + 30, { align: "center" });

    // Risk badge
    doc.setFillColor(...riskColor);
    doc.roundedRect(marginL, y + 34, 42, 7, 2, 2, "F");
    doc.setTextColor(...BRAND.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${riskLabel} Risk`, marginL + 21, y + 39.5, { align: "center" });

    // Summary
    const summaryX = marginL + 48;
    const summaryW = contentW - 48;

    doc.setTextColor(...BRAND.text);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("ANALYSIS SUMMARY", summaryX, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    const summaryLines = doc.splitTextToSize(summary, summaryW);
    doc.text(summaryLines, summaryX, y + 14);

    y += 52;

    // ── Fraud Signals table ──────────────────────────────────────────────────
    if (signals && signals.length > 0) {
      doc.setTextColor(...BRAND.text);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Fraud Signals", marginL, y);
      y += 6;

      // Header row
      doc.setFillColor(...BRAND.primary);
      doc.rect(marginL, y, contentW, 7, "F");
      doc.setTextColor(...BRAND.white);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Signal", marginL + 3, y + 5);
      doc.text("Details", marginL + 58, y + 5);
      doc.text("Score", W - marginR - 3, y + 5, { align: "right" });
      y += 7;

      let rowAlt = false;
      for (const signal of signals) {
        const contribution = Math.round(signal.contribution ?? signal.score ?? 0);
        const descLines = doc.splitTextToSize(signal.description, contentW - 75);
        const rowH = Math.max(10, descLines.length * 4.5 + 4);

        if (rowAlt) {
          doc.setFillColor(248, 250, 252);
          doc.rect(marginL, y, contentW, rowH, "F");
        }

        doc.setTextColor(...BRAND.text);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const labelLines = doc.splitTextToSize(signal.label, 52);
        doc.text(labelLines, marginL + 3, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(...BRAND.muted);
        doc.text(descLines, marginL + 58, y + 5);

        // Contribution bar
        const barW = Math.min(contribution * 1.5, 20);
        if (contribution > 0) {
          doc.setFillColor(...riskColor);
          doc.roundedRect(W - marginR - 22, y + 3, barW, 3, 1, 1, "F");
        }
        doc.setTextColor(...BRAND.text);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(String(contribution), W - marginR - 3, y + 5, { align: "right" });

        // Border line
        doc.setDrawColor(...BRAND.border);
        doc.line(marginL, y + rowH, marginL + contentW, y + rowH);

        y += rowH;
        rowAlt = !rowAlt;
      }

      y += 8;
    }
  }

  // ── Duplicate listings table ───────────────────────────────────────────────
  if (report.duplicateListings && report.duplicateListings.length > 0) {
    // New page if not enough space
    if (y > 230) {
      doc.addPage();
      y = 20;
    }

    doc.setTextColor(...BRAND.text);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Duplicate Listings Found (${report.duplicateListings.length})`, marginL, y);

    if (report.platformCount != null) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.muted);
      doc.text(
        `Detected across ${report.platformCount} platforms${report.priceRangeKsh ? ` · Price range: ${formatKsh(report.priceRangeKsh.min)} – ${formatKsh(report.priceRangeKsh.max)}` : ""}`,
        marginL,
        y + 6
      );
    }

    y += 12;

    // Header
    doc.setFillColor(...BRAND.primary);
    doc.rect(marginL, y, contentW, 7, "F");
    doc.setTextColor(...BRAND.white);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Platform", marginL + 3, y + 5);
    doc.text("Price", marginL + 40, y + 5);
    doc.text("Agent Phone", marginL + 75, y + 5);
    doc.text("URL", marginL + 115, y + 5);
    y += 7;

    let rowAlt = false;
    for (const dup of report.duplicateListings) {
      const rowH = 8;
      if (rowAlt) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginL, y, contentW, rowH, "F");
      }
      doc.setTextColor(...BRAND.text);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(dup.platform ?? "—", marginL + 3, y + 5);
      doc.text(formatKsh(dup.priceKsh), marginL + 40, y + 5);
      doc.text(dup.agentPhone ?? "—", marginL + 75, y + 5);

      const urlShort = dup.url.length > 40 ? dup.url.slice(0, 38) + "…" : dup.url;
      doc.setTextColor(26, 58, 42);
      doc.text(urlShort, marginL + 115, y + 5);

      doc.setDrawColor(...BRAND.border);
      doc.line(marginL, y + rowH, marginL + contentW, y + rowH);
      y += rowH;
      rowAlt = !rowAlt;
    }

    y += 10;
  }

  // ── Recommendations section ───────────────────────────────────────────────
  if (report.fraudScore) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    const riskLevel = report.fraudScore.riskLevel;
    const recommendations: string[] = {
      low: [
        "This listing appears legitimate based on our analysis.",
        "Still recommended: view the property in person before paying any deposit.",
        "Verify that the person showing you the property is the actual owner or licensed agent.",
        "Never pay a deposit before signing a lease agreement.",
      ],
      medium: [
        "Exercise caution — moderate risk signals were detected.",
        "Request to meet the landlord/agent in person at the property.",
        "Ask for proof of ownership (title deed or lease assignment).",
        "Do not transfer money via M-Pesa to an individual without a signed agreement.",
        "Search the agent's phone number on NyumbaCheck before proceeding.",
      ],
      high: [
        "HIGH RISK — do not pay any money until you have independently verified this listing.",
        "Cross-check the property address with official county records.",
        "Reverse-search any photos using Google Images before visiting.",
        "If the agent refuses to meet in person or requests advance payment only — walk away.",
        "Report this listing to NyumbaCheck Scammer Registry.",
      ],
      critical: [
        "CRITICAL RISK — this listing has strong indicators of fraud.",
        "Do NOT send any money, personal documents, or payment of any kind.",
        "Report this agent's phone number to Safaricom and the Directorate of Criminal Investigations.",
        "Share this report with friends and family to prevent others from being scammed.",
        "File a report at your nearest police station with this document as evidence.",
      ],
    }[riskLevel] ?? [];

    if (recommendations.length > 0) {
      doc.setTextColor(...BRAND.text);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Recommendations", marginL, y);
      y += 7;

      const riskColor = RISK_COLORS[riskLevel] ?? RISK_COLORS.medium;
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2], 0.08);
      doc.setDrawColor(...riskColor);
      const recBoxH = recommendations.length * 6 + 8;
      doc.roundedRect(marginL, y, contentW, recBoxH, 2, 2, "FD");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.text);

      for (let i = 0; i < recommendations.length; i++) {
        doc.text(`• ${recommendations[i]}`, marginL + 5, y + 7 + i * 6);
      }

      y += recBoxH + 8;
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFillColor(...BRAND.primary);
    doc.rect(0, pageH - 14, W, 14, "F");

    doc.setTextColor(...BRAND.white);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      "NyumbaCheck · Protecting Nairobi real estate from fraud · nyumbacheck.co.ke",
      marginL,
      pageH - 6
    );
    doc.text(`Page ${i} of ${pageCount}`, W - marginR, pageH - 6, { align: "right" });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const filename = `nyumbacheck-report-${report.id}-${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * NyumbaCheck email delivery via Resend
 *
 * Graceful no-op when RESEND_API_KEY is not configured.
 * Set the secret to enable email delivery.
 */

import { logger } from "./logger";

type FraudSignal = {
  label: string;
  description: string;
  contribution?: number;
};

type ReportEmailData = {
  to: string;
  reportId: number;
  inputUrl?: string | null;
  inputAddress?: string | null;
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  signals?: FraudSignal[];
  platformCount?: number | null;
};

const RISK_COLORS = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const RISK_LABELS = {
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "CRITICAL RISK",
};

function buildReportEmail(data: ReportEmailData): { subject: string; html: string } {
  const color = RISK_COLORS[data.riskLevel];
  const label = RISK_LABELS[data.riskLevel];
  const input = data.inputUrl ?? data.inputAddress ?? "Property";
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "nyumbacheck.co.ke";
  const reportUrl = `https://${domain}/reports/${data.reportId}`;

  const signalsHtml = (data.signals ?? [])
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <strong style="color:#1e293b;font-size:13px;">${s.label}</strong><br>
          <span style="color:#64748b;font-size:12px;">${s.description}</span>
        </td>
        <td style="padding:8px 0 8px 16px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;">
          <span style="font-family:monospace;font-size:12px;color:#94a3b8;">${Math.round(s.contribution ?? 0)}</span>
        </td>
      </tr>`,
    )
    .join("");

  const subject = `NyumbaCheck Report #${data.reportId} — ${label} (${Math.round(data.score)}/100)`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:#1a3a2a;padding:28px 32px;text-align:center;">
      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">NyumbaCheck</span>
      <p style="color:#86efac;margin:4px 0 0;font-size:13px;">Property Fraud Detection · Nairobi</p>
    </div>

    <!-- Score banner -->
    <div style="background:${color}15;border-left:4px solid ${color};padding:20px 32px;margin:0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="background:${color};color:#fff;border-radius:50%;width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;flex-shrink:0;text-align:center;line-height:56px;">
          ${Math.round(data.score)}
        </div>
        <div>
          <p style="margin:0;font-size:18px;font-weight:700;color:${color};">${label}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Fraud Risk Score: ${Math.round(data.score)} / 100</p>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Property Checked</p>
      <p style="margin:0 0 20px;font-size:14px;color:#1e293b;word-break:break-all;">${input}</p>

      <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">${data.summary}</p>

      ${
        signalsHtml
          ? `<h3 style="margin:0 0 12px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Fraud Signals</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${signalsHtml}
      </table>
      <div style="height:20px;"></div>`
          : ""
      }

      ${
        data.platformCount != null && data.platformCount > 1
          ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
          <p style="margin:0;font-size:14px;color:#92400e;">⚠️ Found across <strong>${data.platformCount} platforms</strong> — cross-platform duplication is a key fraud indicator.</p>
        </div>`
          : ""
      }

      <a href="${reportUrl}" style="display:block;text-align:center;background:#1a3a2a;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
        View Full Report →
      </a>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
        NyumbaCheck · Property fraud detection for Nairobi renters &amp; buyers<br>
        This report was generated automatically. Report #${data.reportId}.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

// ── Price alert email ─────────────────────────────────────────────────────────

type PriceAlertEmailData = {
  to: string;
  neighbourhood: string;
  listingType: "rent" | "sale";
  maxPriceKsh?: number | null;
  minBedrooms?: number | null;
  matchCount: number;
  listings: Array<{
    url: string;
    title: string;
    priceKsh?: number | null;
    neighbourhood: string;
  }>;
};

function formatKsh(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `KSh ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `KSh ${(val / 1_000).toFixed(0)}K`;
  return `KSh ${val.toLocaleString()}`;
}

export async function sendPriceAlertEmail(data: PriceAlertEmailData): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];

  if (!apiKey) {
    logger.info({ to: data.to, neighbourhood: data.neighbourhood }, "alert_email.skipped_no_api_key");
    return;
  }

  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "nyumbacheck.co.ke";
  const marketUrl = `https://${domain}/market`;
  const hood = data.neighbourhood.charAt(0).toUpperCase() + data.neighbourhood.slice(1);

  const listingsHtml = data.listings
    .map(
      (l) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <a href="${l.url}" style="color:#1a3a2a;font-weight:600;font-size:14px;text-decoration:none;">${l.title}</a><br>
        <span style="color:#64748b;font-size:12px;">${l.neighbourhood} · ${formatKsh(l.priceKsh)}</span>
      </td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;">
        <a href="${l.url}" style="color:#1a3a2a;font-size:12px;font-weight:600;">View →</a>
      </td>
    </tr>`,
    )
    .join("");

  const criteriaHtml = [
    data.listingType === "rent" ? "For Rent" : "For Sale",
    data.maxPriceKsh ? `Max ${formatKsh(data.maxPriceKsh)}` : null,
    data.minBedrooms ? `${data.minBedrooms}+ bedrooms` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const subject = `🏠 ${data.matchCount} new listing${data.matchCount > 1 ? "s" : ""} in ${hood} match your alert`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#1a3a2a;padding:28px 32px;text-align:center;">
      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">NyumbaCheck</span>
      <p style="color:#86efac;margin:4px 0 0;font-size:13px;">Price Alert · ${hood}</p>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e293b;">
        ${data.matchCount} new listing${data.matchCount > 1 ? "s" : ""} matched your alert
      </h2>
      <p style="margin:0 0 20px;font-size:14px;color:#64748b;">
        Criteria: ${criteriaHtml}
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${listingsHtml}
      </table>
      <div style="height:20px;"></div>
      <a href="${marketUrl}" style="display:block;text-align:center;background:#1a3a2a;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
        View Market Intelligence →
      </a>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
        NyumbaCheck · Property fraud detection for Nairobi renters &amp; buyers<br>
        You're receiving this because you set a price alert. Alerts trigger at most once per 24 hours.
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: "NyumbaCheck <reports@nyumbacheck.co.ke>",
      to: data.to,
      subject,
      html,
    });
    logger.info({ to: data.to, neighbourhood: data.neighbourhood, id: result.data?.id }, "alert_email.sent");
  } catch (err) {
    logger.error({ err, to: data.to }, "alert_email.send_error");
  }
}

export async function sendReportEmail(data: ReportEmailData): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];

  if (!apiKey) {
    logger.info({ reportId: data.reportId, to: data.to }, "email.skipped_no_api_key");
    return;
  }

  const { subject, html } = buildReportEmail(data);

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from: "NyumbaCheck <reports@nyumbacheck.co.ke>",
      to: data.to,
      subject,
      html,
    });

    logger.info({ reportId: data.reportId, to: data.to, id: result.data?.id }, "email.sent");
  } catch (err) {
    logger.error({ err, reportId: data.reportId }, "email.send_error");
  }
}

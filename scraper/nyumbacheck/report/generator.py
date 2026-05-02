"""
HTML fraud report generator.

Produces a clean, self-contained HTML report that can be:
- Emailed directly (inline styles, no external deps)
- Viewed in a browser
- Printed to PDF via headless Chrome
"""

from datetime import datetime
from typing import Any

RISK_COLOURS = {
    "low": "#16a34a",
    "medium": "#d97706",
    "high": "#dc2626",
    "critical": "#7c3aed",
}

RISK_BG = {
    "low": "#f0fdf4",
    "medium": "#fffbeb",
    "high": "#fef2f2",
    "critical": "#f5f3ff",
}

RISK_LABELS = {
    "low": "LOW RISK",
    "medium": "MEDIUM RISK",
    "high": "HIGH RISK",
    "critical": "CRITICAL RISK",
}


def _score_bar(score: float, max_score: float = 100) -> str:
    pct = min(int(score / max_score * 100), 100)
    if score < 25:
        colour = "#16a34a"
    elif score < 50:
        colour = "#d97706"
    elif score < 75:
        colour = "#dc2626"
    else:
        colour = "#7c3aed"
    return f"""
    <div style="background:#e5e7eb;border-radius:4px;height:10px;width:100%;margin-top:4px;">
      <div style="background:{colour};border-radius:4px;height:10px;width:{pct}%;transition:width 0.3s;"></div>
    </div>"""


def generate_html_report(
    report_id: int,
    input_url: str | None,
    input_address: str | None,
    listing: dict | None,
    duplicates: list[dict],
    fraud_result: Any,
    generated_at: datetime,
) -> str:
    """Generate a complete HTML fraud report."""

    score = fraud_result.score
    risk_level = fraud_result.risk_level
    risk_colour = RISK_COLOURS.get(risk_level, "#6b7280")
    risk_bg = RISK_BG.get(risk_level, "#f9fafb")
    risk_label = RISK_LABELS.get(risk_level, "UNKNOWN")
    summary = fraud_result.summary

    # Property subject
    subject_url = input_url or ""
    subject_address = input_address or (listing or {}).get("raw_address") or "Not provided"
    neighbourhood = (listing or {}).get("neighbourhood") or "Unknown"
    price_ksh = (listing or {}).get("price_ksh")
    price_str = f"Ksh {price_ksh:,.0f}" if price_ksh else "Not available"
    bedrooms = (listing or {}).get("bedrooms")
    platform = (listing or {}).get("platform_slug", "Unknown")

    # Duplicate listings table rows
    dup_rows = ""
    for dup in duplicates[:15]:
        dup_price = dup.get("price_ksh")
        dup_price_str = f"Ksh {dup_price:,.0f}" if dup_price else "—"
        dup_phone = dup.get("agent_raw_phone") or "—"
        dup_platform = dup.get("platform_slug", "—")
        dup_url = dup.get("url", "")
        link = f'<a href="{dup_url}" style="color:#2563eb;word-break:break-all;">{dup_url[:60]}{"..." if len(dup_url)>60 else ""}</a>' if dup_url else "—"
        dup_rows += f"""
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">{dup_platform}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">{link}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">{dup_price_str}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">{dup_phone}</td>
        </tr>"""

    if not dup_rows:
        dup_rows = '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;">No duplicate listings found in our database</td></tr>'

    # Signal breakdown rows
    signal_rows = ""
    for sig in fraud_result.signals:
        sig_colour = RISK_COLOURS.get(
            "critical" if sig.score >= 75 else
            "high" if sig.score >= 50 else
            "medium" if sig.score >= 25 else "low",
            "#6b7280"
        )
        signal_rows += f"""
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-weight:600;">{sig.label}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">{sig.description}</td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <span style="background:{sig_colour};color:white;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:700;">
              {sig.score:.0f}/100
            </span>
          </td>
        </tr>"""

    gen_date = generated_at.strftime("%d %B %Y at %H:%M UTC")
    bedrooms_str = f"{bedrooms} bed" if bedrooms else "Unknown"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>NyumbaCheck Fraud Report #{report_id}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f3f4f6; color: #111827; line-height: 1.6; }}
    .container {{ max-width: 780px; margin: 32px auto; background: white;
                  border-radius: 12px; overflow: hidden;
                  box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
    .header {{ background: #111827; color: white; padding: 32px; }}
    .header h1 {{ font-size: 22px; font-weight: 700; }}
    .header p {{ color: #9ca3af; font-size: 14px; margin-top: 4px; }}
    .badge {{ display:inline-block; padding:4px 10px; border-radius:6px;
              font-size:11px; font-weight:700; letter-spacing:0.05em; }}
    section {{ padding: 28px 32px; border-bottom: 1px solid #e5e7eb; }}
    section:last-child {{ border-bottom: none; }}
    h2 {{ font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 16px; }}
    table {{ width:100%; border-collapse:collapse; font-size:14px; }}
    th {{ background:#f9fafb; padding:10px 12px; text-align:left;
          font-size:12px; font-weight:600; color:#6b7280;
          text-transform:uppercase; letter-spacing:0.05em; }}
    .footer {{ background:#f9fafb; padding:20px 32px; font-size:12px; color:#6b7280; }}
    .kv {{ display:flex; gap:8px; margin-bottom:8px; font-size:14px; }}
    .kv .k {{ color:#6b7280; width:140px; flex-shrink:0; }}
    .kv .v {{ font-weight:600; }}
  </style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h1>🏠 NyumbaCheck</h1>
        <p>Property Fraud Detection Report #{report_id}</p>
      </div>
      <span class="badge" style="background:{risk_colour};color:white;font-size:13px;padding:6px 14px;">
        {risk_label}
      </span>
    </div>
  </div>

  <!-- Fraud Score -->
  <section style="background:{risk_bg};">
    <h2>Fraud Risk Score</h2>
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
      <div style="text-align:center;">
        <div style="font-size:64px;font-weight:800;color:{risk_colour};line-height:1;">
          {score:.0f}
        </div>
        <div style="font-size:13px;color:#6b7280;">out of 100</div>
      </div>
      <div style="flex:1;min-width:200px;">
        {_score_bar(score)}
        <p style="margin-top:16px;font-size:14px;color:#374151;">{summary}</p>
      </div>
    </div>
  </section>

  <!-- Property Details -->
  <section>
    <h2>Property Analysed</h2>
    <div class="kv"><span class="k">Source URL</span>
      <span class="v">
        {"<a href='" + subject_url + "' style='color:#2563eb;'>" + subject_url[:70] + ("..." if len(subject_url)>70 else "") + "</a>" if subject_url else "Not provided"}
      </span>
    </div>
    <div class="kv"><span class="k">Address</span><span class="v">{subject_address}</span></div>
    <div class="kv"><span class="k">Neighbourhood</span><span class="v">{neighbourhood}</span></div>
    <div class="kv"><span class="k">Listed Price</span><span class="v">{price_str}</span></div>
    <div class="kv"><span class="k">Bedrooms</span><span class="v">{bedrooms_str}</span></div>
    <div class="kv"><span class="k">Platform Found On</span><span class="v">{platform}</span></div>
  </section>

  <!-- Signal Breakdown -->
  <section>
    <h2>Signal Breakdown</h2>
    <p style="font-size:13px;color:#6b7280;margin-bottom:16px;">
      Each signal contributes to the overall fraud score. Higher signal scores indicate more suspicious behaviour.
    </p>
    <table>
      <thead>
        <tr>
          <th>Signal</th>
          <th>Detail</th>
          <th style="text-align:center;">Score</th>
        </tr>
      </thead>
      <tbody>
        {signal_rows}
      </tbody>
    </table>
  </section>

  <!-- Duplicate Listings -->
  <section>
    <h2>Duplicate Listings Found ({len(duplicates)})</h2>
    {"<p style='font-size:13px;color:#6b7280;margin-bottom:16px;'>These listings appear to be the same property, listed across multiple platforms at different prices.</p>" if duplicates else ""}
    <table>
      <thead>
        <tr>
          <th>Platform</th>
          <th>URL</th>
          <th>Price</th>
          <th>Agent Phone</th>
        </tr>
      </thead>
      <tbody>
        {dup_rows}
      </tbody>
    </table>
  </section>

  <!-- What This Means -->
  <section>
    <h2>What Does This Mean?</h2>
    <div style="font-size:14px;color:#374151;line-height:1.7;">
      {"<p><strong>✅ Low risk:</strong> This listing appears legitimate based on our available data. Always verify directly with the landlord and inspect the property in person.</p>" if risk_level == "low" else ""}
      {"<p><strong>⚠️ Medium risk:</strong> Some suspicious signals were detected. Proceed with caution — ask the agent for documentation and do not pay any fees without viewing the property first.</p>" if risk_level == "medium" else ""}
      {"<p><strong>🚨 High risk:</strong> Multiple fraud signals detected. This listing shows strong characteristics of a ghost or duplicate listing. Do not pay any fees. Verify the property exists and that the agent has authorisation to let/sell it.</p>" if risk_level == "high" else ""}
      {"<p><strong>🔴 Critical risk:</strong> This listing is highly likely to be fraudulent. It appears across multiple platforms with significant price inconsistencies and/or is linked to an agent with a history of suspicious behaviour. We strongly advise not engaging with this listing.</p>" if risk_level == "critical" else ""}
      <p style="margin-top:12px;color:#6b7280;font-size:13px;">
        <strong>Remember:</strong> Never pay viewing fees. Never transfer money before signing a tenancy agreement.
        Always verify ownership via the local land registry before any transaction.
      </p>
    </div>
  </section>

  <!-- Footer -->
  <div class="footer">
    <p><strong>NyumbaCheck</strong> — Nairobi Real Estate Fraud Detection</p>
    <p style="margin-top:4px;">Report generated: {gen_date} | Report ID: #{report_id}</p>
    <p style="margin-top:4px;">
      This report is based on publicly available listing data and automated analysis.
      It is not a legal opinion. Always conduct your own due diligence.
    </p>
    <p style="margin-top:8px;">
      <a href="https://nyumbacheck.co.ke" style="color:#2563eb;">nyumbacheck.co.ke</a>
    </p>
  </div>

</div>
</body>
</html>"""

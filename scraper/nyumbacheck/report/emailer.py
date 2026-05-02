"""
Email delivery for fraud reports via Resend.

Falls back to logging the email content when RESEND_API_KEY is not set,
which is useful in development.
"""

import json
import urllib.request
import urllib.error
from nyumbacheck.utils.config import settings
from nyumbacheck.utils.logger import get_logger

log = get_logger(__name__)

RISK_EMOJI = {
    "low": "✅",
    "medium": "⚠️",
    "high": "🚨",
    "critical": "🔴",
}

RISK_LABEL = {
    "low": "Low Risk",
    "medium": "Medium Risk",
    "high": "High Risk",
    "critical": "Critical Risk",
}


async def send_report_email(
    to_email: str,
    report_id: int,
    report_html: str,
    fraud_score: float,
    risk_level: str,
    summary: str,
) -> bool:
    """
    Send a fraud report to the user via email.

    Returns True if sent successfully, False otherwise.
    """
    if not settings.resend_api_key:
        log.warning(
            "emailer.no_api_key",
            report_id=report_id,
            to=to_email,
            note="Set RESEND_API_KEY to enable email delivery",
        )
        log.info("emailer.would_send", to=to_email, subject=_subject(report_id, fraud_score, risk_level))
        return False

    payload = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": _subject(report_id, fraud_score, risk_level),
        "html": _wrap_email(report_html, fraud_score, risk_level, summary, report_id),
    }

    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=body,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_data = json.loads(resp.read())
            log.info("emailer.sent", report_id=report_id, to=to_email, resend_id=resp_data.get("id"))
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        log.error("emailer.http_error", status=e.code, body=body[:300], report_id=report_id)
        return False
    except Exception as exc:
        log.error("emailer.failed", error=str(exc), report_id=report_id)
        return False


def _subject(report_id: int, score: float, risk_level: str) -> str:
    emoji = RISK_EMOJI.get(risk_level, "🏠")
    label = RISK_LABEL.get(risk_level, "Unknown")
    return f"{emoji} NyumbaCheck Report #{report_id} — {label} ({score:.0f}/100)"


def _wrap_email(
    report_html: str,
    fraud_score: float,
    risk_level: str,
    summary: str,
    report_id: int,
) -> str:
    """Wrap the full report HTML in an email-safe outer container with a preview banner."""
    risk_colour = {
        "low": "#16a34a",
        "medium": "#d97706",
        "high": "#dc2626",
        "critical": "#7c3aed",
    }.get(risk_level, "#6b7280")

    emoji = RISK_EMOJI.get(risk_level, "🏠")
    label = RISK_LABEL.get(risk_level, "Unknown")

    banner = f"""
    <div style="background:{risk_colour};color:white;padding:16px 24px;font-family:sans-serif;">
      <div style="font-size:20px;font-weight:800;">{emoji} {label} — Score {fraud_score:.0f}/100</div>
      <div style="margin-top:4px;font-size:14px;opacity:0.9;">{summary[:200]}</div>
    </div>
    <div style="background:#f3f4f6;padding:12px 24px;font-family:sans-serif;font-size:13px;color:#6b7280;">
      Your NyumbaCheck fraud report is attached below. Report ID: #{report_id}
    </div>
    """

    # Inject banner after <body> tag
    if "<body>" in report_html:
        return report_html.replace("<body>", f"<body>{banner}", 1)
    return banner + report_html

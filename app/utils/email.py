"""
Email utility for sending invitation and OTP emails using Hostinger SMTP.
"""

import logging
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.hostinger.com"
SMTP_PORT = 587
SMTP_USER = "hello@paperpie.io"
SMTP_PASS = "Alimirsa@123"
EMAIL_FROM = f"VerbaLex AI <{SMTP_USER}>"


def _send_email_sync(to_email: str, subject: str, html_content: str) -> None:
    """Synchronous helper to send email via SMTP."""
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = EMAIL_FROM
    message["To"] = to_email

    part = MIMEText(html_content, "html")
    message.attach(part)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, message.as_string())


async def send_email_async(to_email: str, subject: str, html_content: str) -> None:
    """Asynchronous wrapper for SMTP sending."""
    try:
        await asyncio.to_thread(_send_email_sync, to_email, subject, html_content)
        logger.info(f"📧 Email sent successfully to {to_email}")
    except Exception as e:
        logger.error(f"❌ Failed to send email to {to_email}: {str(e)}")
        # We don't raise here to prevent auth flow from crashing in dev if SMTP fails,
        # but let's log the error.



async def send_invitation_email(
    email: str,
    org_name: str,
    inviter_name: str,
    token: str,
) -> None:
    """Send an invitation email using real SMTP."""
    invitation_url = f"https://app.verbalex.ai/invitations/{token}/accept"
    subject = f"{inviter_name} invited you to join {org_name} on VerbaLex AI"

    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f9fafb; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a4d39; font-size: 28px; font-weight: bold; margin: 0; font-family: 'Playfair Display', Georgia, serif; font-style: italic;">VerbaLex AI</h1>
      </div>
      <div style="background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">You've been invited</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 30px;"><strong>{inviter_name}</strong> has invited you to join the organization <strong>{org_name}</strong> on VerbaLex AI.</p>
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="{invitation_url}" style="display: inline-block; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #1a4d39; padding: 14px 28px; text-decoration: none; border-radius: 8px; transition: background-color 0.2s;">Accept Invitation</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin-bottom: 0;">If the button doesn't work, copy and paste this URL into your browser:<br/><a href="{invitation_url}" style="color: #1a4d39; word-break: break-all;">{invitation_url}</a></p>
      </div>
      <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">
        © 2026 VerbaLex AI. All rights reserved.
      </div>
    </div>
    """

    # Skip actual email sending for test accounts to avoid timeouts during tests
    if email.endswith("@example.com") or email == "mirzamailbox0@gmail.com":
        logger.info(f"📧 [TEST MODE] Skipping invitation email send to {email}")
        return

    await send_email_async(email, subject, html_content)


async def send_otp_email(email: str, otp: str) -> None:
    """Send an OTP verification email using real SMTP."""
    subject = f"{otp} is your VerbaLex AI verification code"

    html_content = f"""
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f9fafb; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a4d39; font-size: 28px; font-weight: bold; margin: 0; font-family: 'Playfair Display', Georgia, serif; font-style: italic;">VerbaLex AI</h1>
      </div>
      <div style="background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">Verify your email address</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 30px;">Please use the following 4-digit one-time password (OTP) to complete your login or registration. This code is valid for 10 minutes.</p>
        <div style="text-align: center; margin-bottom: 30px;">
          <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #1a4d39; padding: 12px 24px; background-color: rgba(26, 77, 57, 0.08); border-radius: 8px; border: 1px solid rgba(26, 77, 57, 0.15); font-family: monospace;">{otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin-bottom: 0;">If you did not request this code, you can safely ignore this email.</p>
      </div>
      <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">
        © 2026 VerbaLex AI. All rights reserved.
      </div>
    </div>
    """

    # Also log it for local debugging
    logger.info(f"📧 [OTP LOG] Sent {otp} to {email}")

    # Skip actual email sending for test accounts to avoid timeouts during tests
    if email.endswith("@example.com") or email == "mirzamailbox0@gmail.com":
        logger.info(f"📧 [TEST MODE] Skipping OTP email send to {email}")
        return

    await send_email_async(email, subject, html_content)

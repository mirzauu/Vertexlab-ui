"""
HelpMessage service.
"""

import asyncio
from uuid import UUID
from sqlalchemy import select

from app.repositories.help_repo import HelpRepository
from app.models.help_message import HelpMessage
from app.models.organization import Organization
from app.utils.email import send_email_async
from app.config import settings


class HelpService:
    def __init__(self, help_repo: HelpRepository, db):
        self.help_repo = help_repo
        self.db = db

    async def get_messages(self, org_id: UUID) -> list[HelpMessage]:
        """Get help messages for an organization."""
        messages = await self.help_repo.get_by_organization(org_id)
        return list(messages)

    async def send_message(
        self, org_id: UUID, user_id: UUID, user_name: str, content: str, sender_type: str = "user"
    ) -> HelpMessage:
        """Create a help message and trigger an email notification if sent by user."""
        message = HelpMessage(
            organization_id=org_id,
            user_id=user_id,
            content=content,
            sender_type=sender_type,
        )
        message = await self.help_repo.create(message)
        
        # Load user relationship to avoid LazyLoadingError on read serialization
        await self.db.refresh(message, ["user"])

        # Send email notification to technician if sent by user
        if sender_type == "user":
            result = await self.db.execute(select(Organization.name).where(Organization.id == org_id))
            org_name = result.scalar_one_or_none() or "Unknown Organization"
            asyncio.create_task(self._notify_support(org_id, org_name, user_name, content))
        # Send email notification to user if replied by technician
        elif sender_type == "support":
            if message.user and message.user.email:
                result = await self.db.execute(select(Organization.name).where(Organization.id == org_id))
                org_name = result.scalar_one_or_none() or "Unknown Organization"
                asyncio.create_task(
                    self._notify_user(
                        user_email=message.user.email,
                        org_name=org_name,
                        technician_name=user_name,
                        content=content
                    )
                )

        return message

    async def _notify_support(self, org_id: UUID, org_name: str, user_name: str, content: str) -> None:
        """Helper to send support notification email."""
        subject = f"[VerbaLex Support] New message from {user_name} ({org_name})"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #5B44E9; margin-top: 0;">New Support Ticket Message</h2>
          <p><strong>From:</strong> {user_name}</p>
          <p><strong>Organization:</strong> {org_name} (ID: {org_id})</p>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #5B44E9; font-size: 15px; color: #1f2937;">
            {content.replace('\n', '<br/>')}
          </div>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 12px; color: #9ca3af;">This is an automated notification from VerbaLex AI Support System.</p>
        </div>
        """

        support_email = settings.SUPPORT_EMAIL
        if support_email:
            await send_email_async(support_email, subject, html_content)

    async def _notify_user(self, user_email: str, org_name: str, technician_name: str, content: str) -> None:
        """Helper to send support reply notification email to the user."""
        subject = f"[VerbaLex Support] New message from {technician_name}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #5B44E9; margin-top: 0;">New Support Reply</h2>
          <p>Hi,</p>
          <p>Our support technician has replied to your support ticket for <strong>{org_name}</strong>:</p>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #5B44E9; font-size: 15px; color: #1f2937;">
            {content.replace('\n', '<br/>')}
          </div>
          <p>You can view this message and reply by visiting the Help section in your dashboard.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 12px; color: #9ca3af;">This is an automated notification from VerbaLex AI Support System.</p>
        </div>
        """
        await send_email_async(user_email, subject, html_content)


    async def generate_ai_response(self, org_id: UUID, user_id: UUID, user_message: str) -> HelpMessage:
        """Call OpenAI to generate a support response and save it as an AI reply."""
        from openai import AsyncOpenAI

        # Fetch recent chat history for context (up to 10 messages)
        history = await self.get_messages(org_id)
        recent_history = history[-10:] if history else []

        messages_payload = [
            {
                "role": "system",
                "content": (
                    "You are the VerbaLex AI Support Assistant. Your job is to help users with their questions, "
                    "suggestions, feedback, and technical issues related to the VerbaLex platform.\n\n"
                    "Here is what you need to know about the VerbaLex platform:\n"
                    "- VerbaLex is an AI legal transcription platform designed for high-accuracy legal audio speech-to-text.\n"
                    "- Sidebar Sections / Views:\n"
                    "  1. Dashboard: Provides MRR metrics, active subscriptions, performant usage list, task pipeline funnel "
                    "(stages: queued, in progress, completed, failed), and recent activity logs.\n"
                    "  2. Scopist: Has a 'New Task' creator to upload audio/video deposition files. Audio files are transcribed "
                    "using Deepgram Nova-3. If a PDF document is uploaded, it can be split into Cover and Examination pages manually "
                    "by specifying a start page.\n"
                    "  3. Review and Edit: A human-in-the-loop workstation where users edit speakers, correct transcripts, align "
                    "timestamps, and listen to synchronized audio.\n"
                    "  4. Usage: Tracks processed pages (priced at $1.00/page), monthly statements, amounts paid, and outstanding balances.\n"
                    "  5. Help: This support chat (you are responding here!).\n"
                    "  6. Organization (Admin): Manage organization settings, timezone, invite team members, and view active user list.\n"
                    "  7. Settings: Manage notifications, weekly email reports, and toggle light/dark modes.\n\n"
                    "Behavioral Guidelines:\n"
                    "- ALWAYS be extremely polite, professional, and concise.\n"
                    "- CATEGORIZATION & RESPONSE PROTOCOLS:\n"
                    "  1. SUGGESTIONS / FEEDBACK: If the user provides a suggestion, improvement, or feedback (e.g. 'add Excel export', "
                    "'improve loading speed', 'I suggest...'), thank them warmly and end your message with: 'Thank you for your valuable feedback!'\n"
                    "  2. TECHNICAL ISSUES / COMPLAINTS / QUESTIONS: \n"
                    "     - If the user reports a bug, error, or technical problem, gather all required information "
                    "(e.g. specific task ID, filename, error message, page range).\n"
                    "     - Once you have the info, or if you can answer their question, write a helpful response and always end "
                    "your message with: 'Our technical team has been notified. A technician will contact you soon.'\n"
                )
            }
        ]

        # Feed recent chat history
        for msg in recent_history:
            role = "user" if msg.sender_type == "user" else "assistant"
            messages_payload.append({"role": role, "content": msg.content})

        # Add current user message if it is not already in recent history
        if not recent_history or recent_history[-1].content != user_message:
            messages_payload.append({"role": "user", "content": user_message})

        try:
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages_payload,
                temperature=0.3,
                max_tokens=500,
            )
            reply_content = response.choices[0].message.content.strip()
        except Exception as e:
            reply_content = (
                "Our automated support assistant is temporarily offline, but our technical team has "
                "received your request. A technician will contact you soon."
            )

        # Save AI reply to database
        ai_message = HelpMessage(
            organization_id=org_id,
            user_id=user_id,
            content=reply_content,
            sender_type="ai",
        )
        ai_message = await self.help_repo.create(ai_message)

        # Load user relationship to avoid lazy loading issues
        await self.db.refresh(ai_message, ["user"])
        return ai_message

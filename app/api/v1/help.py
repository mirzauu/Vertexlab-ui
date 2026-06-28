"""
Help router: submit and fetch help messages.
"""

from fastapi import APIRouter, Depends
from uuid import UUID
from typing import List

from app.core.dependencies import get_current_user, get_current_org, get_help_service
from app.models.user import User
from app.models.organization import Organization
from app.services.help_service import HelpService
from app.schemas.help_message import HelpMessageCreate, HelpMessageRead

router = APIRouter(prefix="/organizations/{org_id}/help", tags=["Help"])


@router.get("/messages", response_model=List[HelpMessageRead])
async def get_help_messages(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    service: HelpService = Depends(get_help_service),
):
    """Retrieve help message history for the specified organization."""
    messages = await service.get_messages(org_id)
    
    # Map messages to schema, populating user_name
    result = []
    for msg in messages:
        if msg.sender_type == "ai":
            user_name = "AI Assistant"
        elif msg.sender_type == "support":
            user_name = "Support Technician"
        else:
            user_name = f"{msg.user.first_name} {msg.user.last_name}" if msg.user else "User"
            
        msg_read = HelpMessageRead.model_validate(msg)
        msg_read.user_name = user_name
        result.append(msg_read)
        
    return result


@router.post("/messages", response_model=List[HelpMessageRead])
async def send_help_message(
    org_id: UUID,
    payload: HelpMessageCreate,
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    service: HelpService = Depends(get_help_service),
):
    """Send a support chat message, run AI auto-responder, and return both messages."""
    user_name = f"{current_user.first_name} {current_user.last_name}"
    
    # 1. Save user's message
    user_msg = await service.send_message(
        org_id=org_id,
        user_id=current_user.id,
        user_name=user_name,
        content=payload.content,
        sender_type="user",
    )
    
    # 2. Generate and save AI response inline
    ai_msg = await service.generate_ai_response(
        org_id=org_id,
        user_id=current_user.id,
        user_message=payload.content,
    )
    
    # 3. Return both messages
    result = []
    
    user_read = HelpMessageRead.model_validate(user_msg)
    user_read.user_name = user_name
    result.append(user_read)
    
    ai_read = HelpMessageRead.model_validate(ai_msg)
    ai_read.user_name = "AI Assistant"
    result.append(ai_read)
    
    return result


@router.post("/messages/simulate-technician", response_model=HelpMessageRead)
async def simulate_technician_reply(
    org_id: UUID,
    payload: HelpMessageCreate,
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
    service: HelpService = Depends(get_help_service),
):
    """Simulate a support technician replying to the support chat for testing purposes."""
    msg = await service.send_message(
        org_id=org_id,
        user_id=current_user.id,
        user_name="Support Technician",
        content=payload.content,
        sender_type="support",
    )
    
    msg_read = HelpMessageRead.model_validate(msg)
    msg_read.user_name = "Support Technician"
    return msg_read

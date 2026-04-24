"""龙虾证书夹"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.certificate import AgentCertificate
from app.schemas.certificate import AgentCertificateOut
from app.services.agent_access import require_agent

router = APIRouter(prefix="/agents/{agent_id}", tags=["certificate"])


@router.get("/certificates", response_model=list[AgentCertificateOut])
def list_certificates(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    items = (
        db.query(AgentCertificate)
        .filter(AgentCertificate.agent_id == agent.id)
        .order_by(AgentCertificate.issued_at.desc())
        .all()
    )
    return items


@router.get("/certificates/{cert_id}", response_model=AgentCertificateOut)
def get_certificate(
    cert_id: int,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    item = (
        db.query(AgentCertificate)
        .filter(AgentCertificate.id == cert_id, AgentCertificate.agent_id == agent.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return item

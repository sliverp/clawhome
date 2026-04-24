"""异常告警 列表 / 手动恢复"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.alert import Alert
from app.schemas.alert import AlertOut
from app.services.agent_access import require_agent

router = APIRouter(prefix="/agents/{agent_id}", tags=["alerts"])


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
    resolved: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    q = db.query(Alert).filter(Alert.agent_id == agent.id)
    if resolved is not None:
        q = q.filter(Alert.resolved.is_(resolved))
    return q.order_by(Alert.raised_at.desc()).limit(limit).all()


@router.patch("/alerts/{alert_id}/resolve", response_model=AlertOut)
def resolve_alert(
    alert_id: int,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id, Alert.agent_id == agent.id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if not alert.resolved:
        alert.resolved = True
        alert.resolved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(alert)
    return alert

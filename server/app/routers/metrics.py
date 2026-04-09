from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.agent import Agent
from app.models.metric import Metric, MetricDefinition
from app.models.user import User
from app.schemas.metric import MetricDefinitionOut, MetricLatest, MetricPoint

router = APIRouter(tags=["metrics"])


def _get_agent_or_404(agent_id: int, user_id: int, db: Session) -> Agent:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("/agents/{agent_id}/metrics", response_model=list[MetricPoint])
def get_metrics(
    agent_id: int,
    metric_key: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(500, le=5000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_agent_or_404(agent_id, current_user.id, db)
    q = db.query(Metric).filter(Metric.agent_id == agent_id)
    if metric_key:
        q = q.filter(Metric.metric_key == metric_key)
    if start:
        q = q.filter(Metric.recorded_at >= start)
    if end:
        q = q.filter(Metric.recorded_at <= end)
    return q.order_by(desc(Metric.recorded_at)).limit(limit).all()


@router.get("/agents/{agent_id}/metrics/latest", response_model=MetricLatest)
def get_latest_metrics(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_agent_or_404(agent_id, current_user.id, db)

    # Get the latest value for each metric_key
    subq = (
        db.query(
            Metric.metric_key,
            db.query(Metric.value)
            .filter(Metric.agent_id == agent_id, Metric.metric_key == Metric.metric_key)
            .order_by(desc(Metric.recorded_at))
            .limit(1)
            .scalar_subquery(),
        )
        .filter(Metric.agent_id == agent_id)
        .distinct(Metric.metric_key)
        .all()
    )

    # Simpler: fetch latest row per key using a single query approach
    rows = (
        db.query(Metric)
        .filter(Metric.agent_id == agent_id)
        .order_by(Metric.metric_key, desc(Metric.recorded_at))
        .all()
    )
    seen: set[str] = set()
    metrics: dict[str, float] = {}
    last_recorded: datetime | None = None
    for row in rows:
        if row.metric_key not in seen:
            seen.add(row.metric_key)
            metrics[row.metric_key] = row.value
            if last_recorded is None or row.recorded_at > last_recorded:
                last_recorded = row.recorded_at

    return MetricLatest(agent_id=agent_id, metrics=metrics, recorded_at=last_recorded)


@router.get("/metric-definitions", response_model=list[MetricDefinitionOut])
def get_metric_definitions(
    agent_type: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(MetricDefinition)
    if agent_type:
        q = q.filter(MetricDefinition.agent_type == agent_type)
    return q.all()

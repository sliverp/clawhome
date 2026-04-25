from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.agent import Agent
from app.models.metric import Metric, MetricDefinition
from app.models.user import User
from app.schemas.metric import (
    MetricBreakdown,
    MetricBucket,
    MetricDefinitionOut,
    MetricLatest,
    MetricPoint,
)

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


# ===== 聚合接口（阶段 6） =====

def _bucket_key_day(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def _bucket_key_week(dt: datetime) -> str:
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _aggregate_bucketed(
    db: Session,
    agent_id: int,
    metric_key: str,
    start: datetime,
    end: datetime,
    key_fn,
) -> list[MetricBucket]:
    """把 [start, end] 范围内的指标按 key_fn 分桶，取每桶最大值作为快照，
    再与前一桶差分得到该桶内的"用量"。适用于累计型指标（token_total 等）。"""
    rows = (
        db.query(Metric.recorded_at, Metric.value)
        .filter(
            Metric.agent_id == agent_id,
            Metric.metric_key == metric_key,
            Metric.recorded_at >= start,
            Metric.recorded_at <= end,
        )
        .order_by(Metric.recorded_at.asc())
        .all()
    )
    bucket_max: dict[str, float] = {}
    bucket_last: dict[str, datetime] = {}
    for ts, val in rows:
        key = key_fn(ts)
        bucket_max[key] = max(bucket_max.get(key, 0.0), float(val))
        bucket_last[key] = ts

    sorted_keys = sorted(bucket_max.keys())
    result: list[MetricBucket] = []
    prev_val = 0.0
    for k in sorted_keys:
        v = bucket_max[k]
        delta = max(0.0, v - prev_val)
        result.append(MetricBucket(bucket=k, value=v, delta=delta))
        prev_val = v
    return result


@router.get(
    "/agents/{agent_id}/metrics/daily",
    response_model=list[MetricBucket],
)
def get_daily_metrics(
    agent_id: int,
    metric_key: str = Query("token_total", description="聚合的指标名"),
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """最近 N 天按日聚合。value=当天最新累计值，delta=相对昨天的增量（约等于当天用量）。"""
    _get_agent_or_404(agent_id, current_user.id, db)
    end = datetime.now(timezone.utc).replace(tzinfo=None)
    start = end - timedelta(days=days)
    return _aggregate_bucketed(db, agent_id, metric_key, start, end, _bucket_key_day)


@router.get(
    "/agents/{agent_id}/metrics/weekly",
    response_model=list[MetricBucket],
)
def get_weekly_metrics(
    agent_id: int,
    metric_key: str = Query("token_total"),
    weeks: int = Query(4, ge=1, le=26),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """最近 N 周按 ISO 周聚合"""
    _get_agent_or_404(agent_id, current_user.id, db)
    end = datetime.now(timezone.utc).replace(tzinfo=None)
    start = end - timedelta(weeks=weeks)
    return _aggregate_bucketed(db, agent_id, metric_key, start, end, _bucket_key_week)


@router.get(
    "/agents/{agent_id}/metrics/breakdown",
    response_model=MetricBreakdown,
)
def get_token_breakdown(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Token 结构分布：dialog / execution / tool 最新快照"""
    _get_agent_or_404(agent_id, current_user.id, db)

    def _latest(key: str) -> tuple[float, datetime | None]:
        row = (
            db.query(Metric.value, Metric.recorded_at)
            .filter(Metric.agent_id == agent_id, Metric.metric_key == key)
            .order_by(desc(Metric.recorded_at))
            .first()
        )
        return (float(row[0]), row[1]) if row else (0.0, None)

    dialog, ts1 = _latest("token_dialog")
    execution, ts2 = _latest("token_execution")
    tool, ts3 = _latest("token_tool")
    total = dialog + execution + tool
    recorded = max([t for t in (ts1, ts2, ts3) if t is not None], default=None)
    return MetricBreakdown(
        agent_id=agent_id,
        dialog=dialog,
        execution=execution,
        tool=tool,
        total=total,
        recorded_at=recorded,
    )

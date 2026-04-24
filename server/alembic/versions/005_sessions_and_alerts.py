"""create exam_sessions / study_sessions / work_sessions / alerts

Revision ID: 005_sessions_and_alerts
Revises: 004_lobster_profile
Create Date: 2026-04-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_sessions_and_alerts"
down_revision: Union[str, None] = "004_lobster_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _common_session_cols(extra: list[sa.Column]) -> list[sa.Column]:
    """exam/study/work_sessions 共用列"""
    return [
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="waiting"),
        *extra,
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("request_id"),
    ]


def upgrade() -> None:
    # ── exam_sessions ──
    op.create_table(
        "exam_sessions",
        *_common_session_cols([
            sa.Column("exam_type", sa.String(50), nullable=False, server_default="basic"),
            sa.Column("score", sa.Integer(), nullable=True),
        ]),
    )
    op.create_index("idx_exam_agent_status", "exam_sessions", ["agent_id", "status"])

    # ── study_sessions ──
    op.create_table(
        "study_sessions",
        *_common_session_cols([
            sa.Column("skill_key", sa.String(50), nullable=True),
            sa.Column("skill_name", sa.String(50), nullable=True),
            sa.Column("exp_gained", sa.Integer(), nullable=True),
        ]),
    )
    op.create_index("idx_study_agent_status", "study_sessions", ["agent_id", "status"])

    # ── work_sessions ──
    op.create_table(
        "work_sessions",
        *_common_session_cols([
            sa.Column("task_description", sa.Text(), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
        ]),
    )
    op.create_index("idx_work_agent_status", "work_sessions", ["agent_id", "status"])

    # ── alerts ──
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("alert_type", sa.String(30), nullable=False),
        sa.Column("level", sa.String(10), nullable=False, server_default="warn"),
        sa.Column("message", sa.String(255), nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raised_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_alert_agent_resolved", "alerts", ["agent_id", "resolved"])


def downgrade() -> None:
    op.drop_index("idx_alert_agent_resolved", table_name="alerts")
    op.drop_table("alerts")
    op.drop_index("idx_work_agent_status", table_name="work_sessions")
    op.drop_table("work_sessions")
    op.drop_index("idx_study_agent_status", table_name="study_sessions")
    op.drop_table("study_sessions")
    op.drop_index("idx_exam_agent_status", table_name="exam_sessions")
    op.drop_table("exam_sessions")

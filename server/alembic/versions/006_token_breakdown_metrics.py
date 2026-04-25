"""add token_dialog / token_execution / token_tool metric definitions

Revision ID: 006_token_breakdown_metrics
Revises: 005_sessions_and_alerts
Create Date: 2026-04-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_token_breakdown_metrics"
down_revision: Union[str, None] = "005_sessions_and_alerts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    rows = [
        ("openclaw", "token_dialog",    "对话 Token",    "tokens", "line"),
        ("openclaw", "token_execution", "执行 Token",    "tokens", "line"),
        ("openclaw", "token_tool",      "工具 Token",    "tokens", "line"),
    ]
    op.bulk_insert(
        sa.table(
            "metric_definitions",
            sa.column("agent_type", sa.String),
            sa.column("metric_key", sa.String),
            sa.column("display_name", sa.String),
            sa.column("unit", sa.String),
            sa.column("chart_type", sa.String),
        ),
        [
            {"agent_type": r[0], "metric_key": r[1], "display_name": r[2],
             "unit": r[3], "chart_type": r[4]}
            for r in rows
        ],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM metric_definitions WHERE agent_type = 'openclaw' "
        "AND metric_key IN ('token_dialog', 'token_execution', 'token_tool')"
    )

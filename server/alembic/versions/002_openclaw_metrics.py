"""update openclaw metric definitions

Revision ID: 002_openclaw_metrics
Revises: 001_init
Create Date: 2026-04-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002_openclaw_metrics"
down_revision: Union[str, None] = "001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove old incorrect openclaw metric definitions
    op.execute(
        "DELETE FROM metric_definitions WHERE agent_type = 'openclaw'"
    )

    # Insert correct openclaw metric definitions based on actual data source
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
            {"agent_type": "openclaw", "metric_key": "cpu_percent",       "display_name": "CPU 使用率",     "unit": "%",      "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "memory_mb",         "display_name": "内存使用",       "unit": "MB",     "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "uptime",            "display_name": "运行时长",       "unit": "s",      "chart_type": "gauge"},
            {"agent_type": "openclaw", "metric_key": "token_input",       "display_name": "Input Tokens",   "unit": "tokens", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "token_output",      "display_name": "Output Tokens",  "unit": "tokens", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "token_total",       "display_name": "总 Token 消耗",  "unit": "tokens", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "token_cache_read",  "display_name": "Cache 命中",     "unit": "tokens", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "conversation_count","display_name": "对话次数",       "unit": "次",     "chart_type": "bar"},
            {"agent_type": "openclaw", "metric_key": "session_count",     "display_name": "Session 数",     "unit": "个",     "chart_type": "bar"},
            {"agent_type": "openclaw", "metric_key": "cost_usd_total",    "display_name": "累计费用",       "unit": "USD",    "chart_type": "line"},
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM metric_definitions WHERE agent_type = 'openclaw'")

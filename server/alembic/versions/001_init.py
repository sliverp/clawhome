"""init: create all tables

Revision ID: 001_init
Revises:
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("instance_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=False, server_default="generic"),
        sa.Column("hostname", sa.String(255), nullable=True),
        sa.Column("bind_token", sa.String(255), nullable=True),
        sa.Column("bind_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("access_token", sa.String(255), nullable=True),
        sa.Column("local_port", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("offline", "online", "error"),
            nullable=False,
            server_default="offline",
        ),
        sa.Column("last_seen", sa.DateTime(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("instance_id"),
        sa.UniqueConstraint("bind_token"),
        sa.UniqueConstraint("access_token"),
    )
    op.create_index("ix_agents_user_id", "agents", ["user_id"])

    op.create_table(
        "metric_definitions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=False, server_default="generic"),
        sa.Column("metric_key", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("chart_type", sa.String(20), nullable=False, server_default="line"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_type", "metric_key", name="uq_type_key"),
    )

    op.create_table(
        "metrics",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("metric_key", sa.String(100), nullable=False),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_agent_metric_time", "metrics", ["agent_id", "metric_key", "recorded_at"]
    )

    # Seed built-in metric definitions
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
            {"agent_type": "generic", "metric_key": "cpu_percent", "display_name": "CPU 使用率", "unit": "%", "chart_type": "line"},
            {"agent_type": "generic", "metric_key": "memory_mb", "display_name": "内存使用", "unit": "MB", "chart_type": "line"},
            {"agent_type": "generic", "metric_key": "uptime", "display_name": "运行时长", "unit": "s", "chart_type": "gauge"},
            {"agent_type": "openclaw", "metric_key": "cpu_percent", "display_name": "CPU 使用率", "unit": "%", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "memory_mb", "display_name": "内存使用", "unit": "MB", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "uptime", "display_name": "运行时长", "unit": "s", "chart_type": "gauge"},
            {"agent_type": "openclaw", "metric_key": "token_count", "display_name": "Token 消耗", "unit": "tokens", "chart_type": "line"},
            {"agent_type": "openclaw", "metric_key": "conversation_count", "display_name": "对话次数", "unit": "次", "chart_type": "bar"},
        ],
    )


def downgrade() -> None:
    op.drop_table("metrics")
    op.drop_table("metric_definitions")
    op.drop_table("agents")
    op.drop_table("users")

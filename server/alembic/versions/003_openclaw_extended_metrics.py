"""add extended openclaw metric definitions

Revision ID: 003_openclaw_extended_metrics
Revises: 002_openclaw_metrics
Create Date: 2026-04-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003_openclaw_extended_metrics"
down_revision: Union[str, None] = "002_openclaw_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use INSERT IGNORE to skip already-existing definitions
    rows = [
        ('openclaw', 'token_cache_write',  'Cache Write',        'tokens', 'line'),
        ('openclaw', 'token_fresh',        'Fresh Input Tokens', 'tokens', 'line'),
        ('openclaw', 'cache_hit_pct',      'Cache Hit Rate',     '%',      'line'),
        ('openclaw', 'compaction_count',   'Compaction 次数',    '次',     'bar'),
        ('openclaw', 'runtime_seconds',    '累计运行时长',        's',      'line'),
        ('openclaw', 'assistant_turns',    'Assistant 回复数',   '次',     'bar'),
        ('openclaw', 'tool_call_count',    '工具调用次数',        '次',     'bar'),
        ('openclaw', 'error_count',        '错误次数',            '次',     'bar'),
        ('openclaw', 'context_tokens',     '当前 Context 大小',  'tokens', 'gauge'),
    ]
    for agent_type, metric_key, display_name, unit, chart_type in rows:
        op.execute(
            f"INSERT IGNORE INTO metric_definitions (agent_type, metric_key, display_name, unit, chart_type) "
            f"VALUES ('{agent_type}', '{metric_key}', '{display_name}', '{unit}', '{chart_type}')"
        )


def downgrade() -> None:
    keys = [
        'token_cache_write', 'token_fresh', 'cache_hit_pct', 'cost_usd_total',
        'compaction_count', 'runtime_seconds', 'assistant_turns',
        'tool_call_count', 'error_count', 'context_tokens',
    ]
    op.execute(
        f"DELETE FROM metric_definitions WHERE agent_type = 'openclaw' AND metric_key IN ({','.join(repr(k) for k in keys)})"
    )

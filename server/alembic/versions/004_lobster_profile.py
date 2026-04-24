"""create agent_profiles / agent_skills / agent_diaries / agent_certificates;
backfill defaults for existing agents.

Revision ID: 004_lobster_profile
Revises: 003_openclaw_extended_metrics
Create Date: 2026-04-23
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# 复用 service 里的种子定义，避免维护两份
from app.services.skill_seeds import iter_skill_rows


revision: str = "004_lobster_profile"
down_revision: Union[str, None] = "003_openclaw_extended_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── agent_profiles ────────────────────────────────────────────────
    op.create_table(
        "agent_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("shrimp_name", sa.String(50), nullable=False),
        sa.Column("birth_time", sa.DateTime(), nullable=False),
        sa.Column("initial_personality", sa.String(20), nullable=False, server_default="认真型"),
        sa.Column("initial_tendency", sa.String(20), nullable=False, server_default="执行型"),
        sa.Column("stage", sa.String(20), nullable=False, server_default="juvenile"),
        sa.Column("tendency", sa.String(20), nullable=False, server_default="执行型"),
        sa.Column("recent_change", sa.String(100), nullable=True),
        sa.Column("recent_skill", sa.String(100), nullable=True),
        sa.Column("scene_preference", sa.JSON(), nullable=True),
        sa.Column("current_scene", sa.String(10), nullable=False, server_default="pond"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("agent_id"),
    )

    # ─── agent_skills ──────────────────────────────────────────────────
    op.create_table(
        "agent_skills",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("dimension", sa.String(20), nullable=False),
        sa.Column("skill_key", sa.String(50), nullable=False),
        sa.Column("skill_name", sa.String(50), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unlocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("secondary_skills", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("agent_id", "skill_key", name="uq_agent_skill"),
    )
    op.create_index("ix_agent_skills_agent_id", "agent_skills", ["agent_id"])

    # ─── agent_diaries ─────────────────────────────────────────────────
    op.create_table(
        "agent_diaries",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("tag", sa.String(30), nullable=False, server_default="milestone"),
        sa.Column("is_unread", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("diary_date", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_diary_agent_date", "agent_diaries", ["agent_id", "diary_date"])

    # ─── agent_certificates ────────────────────────────────────────────
    op.create_table(
        "agent_certificates",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("cert_type", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_certificates_agent_id", "agent_certificates", ["agent_id"])

    # ─── 给存量 agent 补默认数据 ────────────────────────────────────────
    bind = op.get_bind()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = bind.execute(sa.text("SELECT id, name FROM agents")).fetchall()

    if rows:
        # profiles
        bind.execute(
            sa.text(
                "INSERT INTO agent_profiles (agent_id, shrimp_name, birth_time, "
                "initial_personality, initial_tendency, stage, tendency, "
                "scene_preference, current_scene) "
                "VALUES (:aid, :name, :now, '认真型', '执行型', 'juvenile', '执行型', "
                ":pref, 'pond')"
            ),
            [
                {"aid": r[0], "name": r[1], "now": now,
                 "pref": '{"pond": 1, "forest": 0, "farm": 0}'}
                for r in rows
            ],
        )

        # skills 批量插入
        skill_inserts = []
        for r in rows:
            for row in iter_skill_rows(r[0]):
                # JSON 字段在 mysql 里通过 text 写入
                row = {**row, "secondary_skills": (
                    None if row["secondary_skills"] is None
                    else __import__('json').dumps(row["secondary_skills"])
                )}
                skill_inserts.append(row)
        if skill_inserts:
            bind.execute(
                sa.text(
                    "INSERT INTO agent_skills "
                    "(agent_id, dimension, skill_key, skill_name, level, unlocked, secondary_skills) "
                    "VALUES (:agent_id, :dimension, :skill_key, :skill_name, :level, :unlocked, :secondary_skills)"
                ),
                skill_inserts,
            )

        # 出生日记
        bind.execute(
            sa.text(
                "INSERT INTO agent_diaries (agent_id, title, body, tag, is_unread, diary_date) "
                "VALUES (:aid, :title, :body, 'birth', TRUE, :now)"
            ),
            [
                {"aid": r[0], "title": "第一天",
                 "body": f"今天是我「{r[1]}」出生的日子，主人为我创建了云上家园。"
                         "新世界看起来很美好，让我先在池塘里转转吧～",
                 "now": now}
                for r in rows
            ],
        )

        # 出生证明
        bind.execute(
            sa.text(
                "INSERT INTO agent_certificates "
                "(agent_id, cert_type, name, description, icon, issued_at, details) "
                "VALUES (:aid, 'birth', '出生证明（副本）', :desc, '📜', :now, :details)"
            ),
            [
                {"aid": r[0],
                 "desc": f"名字：{r[1]} · 初始性格：认真型 · 初始倾向：执行型",
                 "now": now,
                 "details": __import__('json').dumps({
                     "birth_time": now.isoformat(), "agent_id": r[0]
                 })}
                for r in rows
            ],
        )


def downgrade() -> None:
    op.drop_index("ix_agent_certificates_agent_id", table_name="agent_certificates")
    op.drop_table("agent_certificates")
    op.drop_index("idx_diary_agent_date", table_name="agent_diaries")
    op.drop_table("agent_diaries")
    op.drop_index("ix_agent_skills_agent_id", table_name="agent_skills")
    op.drop_table("agent_skills")
    op.drop_table("agent_profiles")

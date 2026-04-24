"""新建 Agent 时同步初始化龙虾的成长档案、技能树、出生日记和出生证明"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.certificate import AgentCertificate
from app.models.diary import AgentDiary
from app.models.profile import AgentProfile
from app.models.skill import AgentSkill
from app.services.skill_seeds import iter_skill_rows


def init_lobster_profile(db: Session, agent: Agent) -> AgentProfile:
    """为新 agent 创建龙虾档案 + 技能树 + 出生日记 + 出生证书。

    调用方需在最后自行 db.commit()。
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 1) profile
    profile = AgentProfile(
        agent_id=agent.id,
        shrimp_name=agent.name,  # 默认使用 agent name 作为龙虾名字
        birth_time=now,
        initial_personality="认真型",
        initial_tendency="执行型",
        stage="juvenile",
        tendency="执行型",
        scene_preference={"pond": 1, "forest": 0, "farm": 0},
        current_scene="pond",
    )
    db.add(profile)

    # 2) skills（批量插入）
    db.bulk_insert_mappings(AgentSkill, iter_skill_rows(agent.id))

    # 3) 出生日记
    diary = AgentDiary(
        agent_id=agent.id,
        title="第一天",
        body=(
            f"今天是我「{agent.name}」出生的日子，主人为我创建了云上家园。"
            "新世界看起来很美好，让我先在池塘里转转吧～"
        ),
        tag="birth",
        is_unread=True,
        diary_date=now,
    )
    db.add(diary)

    # 4) 出生证明
    cert = AgentCertificate(
        agent_id=agent.id,
        cert_type="birth",
        name="出生证明（副本）",
        description=f"名字：{agent.name} · 初始性格：认真型 · 初始倾向：执行型",
        icon="📜",
        issued_at=now,
        details={"birth_time": now.isoformat(), "agent_id": agent.id},
    )
    db.add(cert)

    return profile

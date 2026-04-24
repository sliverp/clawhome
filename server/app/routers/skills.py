"""GET 7 维度技能树"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.skill import AgentSkill
from app.schemas.skill import AgentSkillOut, SkillDimensionOut
from app.services.agent_access import require_agent
from app.services.skill_seeds import DIMENSION_META

router = APIRouter(prefix="/agents/{agent_id}", tags=["skills"])


@router.get("/skills", response_model=list[SkillDimensionOut])
def list_skills(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    """按维度分组返回技能树"""
    skills = (
        db.query(AgentSkill)
        .filter(AgentSkill.agent_id == agent.id)
        .order_by(AgentSkill.id.asc())
        .all()
    )

    grouped: dict[str, list[AgentSkillOut]] = {}
    for s in skills:
        grouped.setdefault(s.dimension, []).append(AgentSkillOut.model_validate(s))

    # 按 DIMENSION_META 的固定顺序输出
    result: list[SkillDimensionOut] = []
    for dim_key, meta in DIMENSION_META.items():
        if dim_key in grouped:
            result.append(SkillDimensionOut(
                dimension=dim_key,
                icon=meta["icon"],
                name=meta["name"],
                skills=grouped[dim_key],
            ))
    return result

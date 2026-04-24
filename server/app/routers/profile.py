"""GET/PATCH 龙虾出生证明 + 当前成长状态"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.agent import Agent
from app.models.profile import AgentProfile
from app.schemas.profile import AgentProfileOut, AgentProfileUpdate, SceneUpdate
from app.services.agent_access import require_agent

router = APIRouter(prefix="/agents/{agent_id}", tags=["profile"])

VALID_SCENES = {"pond", "forest", "farm"}


def _get_or_404(db: Session, agent_id: int) -> AgentProfile:
    profile = db.query(AgentProfile).filter(AgentProfile.agent_id == agent_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.get("/profile", response_model=AgentProfileOut)
def get_profile(
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    return _get_or_404(db, agent.id)


@router.patch("/profile", response_model=AgentProfileOut)
def update_profile(
    body: AgentProfileUpdate,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    profile = _get_or_404(db, agent.id)
    if body.shrimp_name is not None:
        profile.shrimp_name = body.shrimp_name.strip() or profile.shrimp_name
    if body.initial_personality is not None:
        profile.initial_personality = body.initial_personality
    if body.initial_tendency is not None:
        profile.initial_tendency = body.initial_tendency
    db.commit()
    db.refresh(profile)
    return profile


@router.post("/scene", response_model=AgentProfileOut)
def update_scene(
    body: SceneUpdate,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    """用户在龙虾界面切换场景时上报"""
    if body.scene not in VALID_SCENES:
        raise HTTPException(status_code=400, detail=f"Invalid scene: {body.scene}")
    profile = _get_or_404(db, agent.id)
    profile.current_scene = body.scene

    # 同时更新 scene_preference 计数
    pref = dict(profile.scene_preference or {})
    pref[body.scene] = int(pref.get(body.scene, 0)) + 1
    profile.scene_preference = pref

    db.commit()
    db.refresh(profile)
    return profile

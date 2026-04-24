"""session_dispatch: exam / study / work unified dispatcher."""
from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.ws_manager import ws_manager
from app.models.agent import Agent
from app.models.certificate import AgentCertificate
from app.models.diary import AgentDiary
from app.models.profile import AgentProfile
from app.models.session import ExamSession, StudySession, WorkSession
from app.models.skill import AgentSkill
from app.services.prompt_templates import (
    build_exam_prompt,
    build_study_prompt,
    build_work_prompt,
)

logger = logging.getLogger(__name__)
_REQUEST_MAP: dict[str, Tuple[str, int]] = {}

KIND_EXAM = "exam"
KIND_STUDY = "study"
KIND_WORK = "work"


# ===== Helpers =====

async def _dispatch_chat(agent, request_id: str, message: str, agent_name: str) -> bool:
    return await ws_manager.send_to_agent(agent.id, {
        "type": "command",
        "data": {
            "cmd": "chat",
            "request_id": request_id,
            "args": {"message": message, "agent_name": agent_name},
        },
    })


async def _broadcast(agent, kind: str, session_obj, phase: str, extra: Optional[dict] = None):
    type_map = {
        KIND_EXAM: "exam_status",
        KIND_STUDY: "study_status",
        KIND_WORK: "work_status",
    }
    msg_type = type_map[kind]
    payload: dict = {
        "agent_id": agent.id,
        "session_id": session_obj.id,
        "phase": phase,
    }
    if kind == KIND_EXAM:
        payload["exam_id"] = session_obj.id
        if session_obj.score is not None:
            payload["score"] = session_obj.score
        if session_obj.details is not None:
            payload["details"] = session_obj.details
    elif kind == KIND_STUDY:
        payload["study_id"] = session_obj.id
        if session_obj.skill_key:
            payload["skill"] = session_obj.skill_key
        if session_obj.exp_gained is not None:
            payload["exp"] = session_obj.exp_gained
    elif kind == KIND_WORK:
        payload["work_id"] = session_obj.id
        if session_obj.summary:
            payload["summary"] = session_obj.summary
    if extra:
        payload.update(extra)
    await ws_manager.broadcast_to_user(
        agent.user_id,
        {"type": msg_type, "data": payload},
        agent_id=agent.id,
    )


async def _diary_new_broadcast(agent, diary):
    await ws_manager.broadcast_to_user(
        agent.user_id,
        {"type": "diary_new", "data": {
            "agent_id": agent.id, "diary_id": diary.id,
            "title": diary.title, "tag": diary.tag,
        }},
        agent_id=agent.id,
    )


def _extract_json_block(text: str) -> Optional[dict]:
    """从 LLM 输出里抽取 ```json ... ``` 块；找不到返回 None"""
    if not text:
        return None
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not m:
        # 退化：尝试整体当 JSON 解析
        try:
            return json.loads(text)
        except Exception:
            return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None



# ===== Start endpoints =====

async def start_exam(db, agent, exam_type="basic"):
    rid = "req_" + secrets.token_urlsafe(8)
    s = ExamSession(agent_id=agent.id, request_id=rid,
                    exam_type=exam_type, status="waiting")
    db.add(s); db.commit(); db.refresh(s)
    _REQUEST_MAP[rid] = (KIND_EXAM, s.id)
    sent = await _dispatch_chat(agent, rid, build_exam_prompt(exam_type), "exam")
    s.status = "running" if sent else "interrupted"
    db.commit(); db.refresh(s)
    extra = None if sent else {"reason": "agent offline"}
    await _broadcast(agent, KIND_EXAM, s,
                     "running" if sent else "interrupted", extra)
    return s


async def start_study(db, agent, skill_key):
    skill_name = None
    if skill_key:
        sk = (db.query(AgentSkill)
              .filter(AgentSkill.agent_id == agent.id,
                      AgentSkill.skill_key == skill_key)
              .first())
        skill_name = sk.skill_name if sk else None
    rid = "req_" + secrets.token_urlsafe(8)
    s = StudySession(agent_id=agent.id, request_id=rid,
                     skill_key=skill_key, skill_name=skill_name,
                     status="waiting")
    db.add(s); db.commit(); db.refresh(s)
    _REQUEST_MAP[rid] = (KIND_STUDY, s.id)
    prompt = build_study_prompt(skill_key, skill_name)
    sent = await _dispatch_chat(agent, rid, prompt, "study")
    s.status = "running" if sent else "interrupted"
    db.commit(); db.refresh(s)
    extra = None if sent else {"reason": "agent offline"}
    await _broadcast(agent, KIND_STUDY, s,
                     "running" if sent else "interrupted", extra)
    return s


async def start_work(db, agent, task_description):
    rid = "req_" + secrets.token_urlsafe(8)
    s = WorkSession(agent_id=agent.id, request_id=rid,
                    task_description=task_description, status="waiting")
    db.add(s); db.commit(); db.refresh(s)
    _REQUEST_MAP[rid] = (KIND_WORK, s.id)
    prompt = build_work_prompt(task_description)
    sent = await _dispatch_chat(agent, rid, prompt, "work")
    s.status = "running" if sent else "interrupted"
    db.commit(); db.refresh(s)
    extra = None if sent else {"reason": "agent offline"}
    await _broadcast(agent, KIND_WORK, s,
                     "running" if sent else "interrupted", extra)
    return s


# ===== Result handler (called from /ws/agent on command_result) =====

async def handle_command_result(db, agent, request_id, output):
    """Process command_result for exam/study/work; ignored for other request_ids."""
    pair = _REQUEST_MAP.get(request_id)
    if not pair:
        return False
    kind, sid = pair
    text = ""
    if isinstance(output, dict):
        text = output.get("text", "") or ""
    elif isinstance(output, str):
        text = output
    parsed = _extract_json_block(text)

    if kind == KIND_EXAM:
        s = db.get(ExamSession, sid)
        if not s:
            return False
        s.status = "completed"
        s.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        s.score = int(parsed.get("score", 0)) if isinstance(parsed, dict) else 0
        s.details = parsed
        db.commit(); db.refresh(s)
        # diary
        diary = AgentDiary(
            agent_id=agent.id,
            title=f"参加了考试 (得分 {s.score})",
            body=text[:1000] or "考试结果", tag="exam",
            is_unread=True,
            diary_date=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(diary)
        # cert
        cert = AgentCertificate(
            agent_id=agent.id,
            cert_type="exam_basic",
            name=f"考试证书 · {s.score}/100",
            description=f"完成 {s.exam_type} 评测，得分 {s.score}",
            icon="🎓",
            issued_at=datetime.now(timezone.utc).replace(tzinfo=None),
            details=parsed,
        )
        db.add(cert)
        db.commit(); db.refresh(diary)
        await _broadcast(agent, KIND_EXAM, s, "completed")
        await _diary_new_broadcast(agent, diary)

    elif kind == KIND_STUDY:
        s = db.get(StudySession, sid)
        if not s:
            return False
        s.status = "completed"
        s.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if isinstance(parsed, dict):
            s.exp_gained = int(parsed.get("experience", 0))
            s.details = parsed
        db.commit(); db.refresh(s)
        # bump skill level
        if s.skill_key:
            sk = (db.query(AgentSkill)
                  .filter(AgentSkill.agent_id == agent.id,
                          AgentSkill.skill_key == s.skill_key)
                  .first())
            if sk:
                sk.level = (sk.level or 0) + 1
                sk.unlocked = True
                db.commit()
        # diary
        diary = AgentDiary(
            agent_id=agent.id,
            title=f"学习了 {s.skill_name or s.skill_key or '新技能'}",
            body=text[:1000] or "学习完成", tag="study",
            is_unread=True,
            diary_date=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(diary); db.commit(); db.refresh(diary)
        await _broadcast(agent, KIND_STUDY, s, "completed")
        await _diary_new_broadcast(agent, diary)

    elif kind == KIND_WORK:
        s = db.get(WorkSession, sid)
        if not s:
            return False
        s.status = "completed"
        s.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if isinstance(parsed, dict):
            s.summary = parsed.get("summary", "")
            s.details = parsed
        db.commit(); db.refresh(s)
        diary = AgentDiary(
            agent_id=agent.id,
            title="完成了一个长任务",
            body=(s.summary or text[:1000] or "任务完成"), tag="work",
            is_unread=True,
            diary_date=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(diary); db.commit(); db.refresh(diary)
        await _broadcast(agent, KIND_WORK, s, "completed")
        await _diary_new_broadcast(agent, diary)

    _REQUEST_MAP.pop(request_id, None)
    return True

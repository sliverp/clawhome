"""
WebSocket endpoints:
- /ws/agent   : agent client connections (auth via access_token in query param)
- /ws/dashboard : browser connections (auth via JWT in query param)
"""

import json
import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decode_token
from app.core.ws_manager import ws_manager
from app.models.agent import Agent
from app.models.metric import Metric
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


def _get_db() -> Session:
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


# ── Agent WebSocket ──────────────────────────────────────────────────────────

@router.websocket("/ws/agent")
async def agent_ws(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    agent: Agent | None = None

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps({"type": "error", "data": {"code": "invalid_json", "message": "Invalid JSON"}})
                )
                continue

            msg_type = msg.get("type")
            data = msg.get("data", {})

            # ── bind (first-time setup) ──────────────────────────────────────
            if msg_type == "bind":
                bind_token = data.get("bind_token")
                found: Agent | None = db.query(Agent).filter(Agent.bind_token == bind_token).first()
                if not found:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "data": {"code": "invalid_bind_token", "message": "Invalid bind token"},
                    }))
                    continue
                if found.bind_token_expires_at and datetime.now(timezone.utc) > found.bind_token_expires_at.replace(tzinfo=timezone.utc):
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "data": {"code": "expired_bind_token", "message": "Bind token expired"},
                    }))
                    continue

                # Assign access_token and update agent metadata
                access_token = secrets.token_urlsafe(32)
                found.access_token = access_token
                found.bind_token = None  # one-time use
                found.bind_token_expires_at = None
                found.agent_type = data.get("agent_type", found.agent_type)
                found.hostname = data.get("hostname", found.hostname)
                found.local_port = data.get("local_port", found.local_port)
                if data.get("name"):
                    found.name = data["name"]
                found.status = "online"
                found.last_seen = datetime.now(timezone.utc)
                db.commit()
                db.refresh(found)
                agent = found

                ws_manager.connect_agent(agent.id, websocket)
                await websocket.send_text(json.dumps({
                    "type": "bind_ok",
                    "data": {"access_token": access_token, "agent_id": agent.id},
                }))
                await ws_manager.broadcast_agent_status(agent.user_id, agent.id, "online")

            # ── auth (reconnect with existing access_token) ──────────────────
            elif msg_type == "auth":
                access_token = data.get("access_token")
                found = db.query(Agent).filter(Agent.access_token == access_token).first()
                if not found:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "data": {"code": "invalid_access_token", "message": "Invalid access token"},
                    }))
                    continue

                found.status = "online"
                found.last_seen = datetime.now(timezone.utc)
                db.commit()
                agent = found

                ws_manager.connect_agent(agent.id, websocket)
                await websocket.send_text(json.dumps({
                    "type": "auth_ok",
                    "data": {"agent_id": agent.id, "agent_name": agent.name},
                }))
                await ws_manager.broadcast_agent_status(agent.user_id, agent.id, "online")

            # ── ping ─────────────────────────────────────────────────────────
            elif msg_type == "ping":
                if agent:
                    agent.last_seen = datetime.now(timezone.utc)
                    db.commit()
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "data": {"ts": data.get("ts")},
                }))

            # ── metrics ──────────────────────────────────────────────────────
            elif msg_type == "metrics":
                if agent is None:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "data": {"code": "not_authenticated", "message": "Not authenticated"},
                    }))
                    continue

                agent.last_seen = datetime.now(timezone.utc)
                now = datetime.now(timezone.utc)
                for key, value in data.items():
                    if isinstance(value, (int, float)):
                        db.add(Metric(agent_id=agent.id, metric_key=key, value=float(value), recorded_at=now))
                db.commit()

                await ws_manager.broadcast_agent_metrics(agent.user_id, agent.id, data)

            # ── command_result ───────────────────────────────────────────────
            elif msg_type == "command_result":
                logger.info("Command result from agent %s: %s", agent.id if agent else "?", data)
                if agent:
                    await ws_manager.broadcast_to_user(
                        agent.user_id,
                        {"type": "command_result", "data": {"agent_id": agent.id, **data}},
                    )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Agent WS error: %s", e)
    finally:
        if agent:
            ws_manager.disconnect_agent(agent.id)
            agent.status = "offline"
            db.commit()
            await ws_manager.broadcast_agent_status(agent.user_id, agent.id, "offline")
        db.close()


# ── Browser WebSocket ────────────────────────────────────────────────────────

@router.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket, token: str = Query(...)):
    await websocket.accept()
    db = SessionLocal()
    user: User | None = None

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
        user = db.get(User, int(user_id))
        if not user:
            await websocket.close(code=4001)
            return

        ws_manager.connect_browser(user.id, websocket)

        # Keep alive - browser sends ping, we send pong
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Dashboard WS error: %s", e)
    finally:
        if user:
            ws_manager.disconnect_browser(user.id, websocket)
        db.close()

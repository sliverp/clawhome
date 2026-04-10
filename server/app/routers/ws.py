"""
WebSocket endpoints:
- /ws/agent   : agent client connections (auth via access_token in query param)
- /ws/dashboard : browser connections (auth via JWT in query param)
"""

import asyncio
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone
from time import monotonic

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

from app.core.database import SessionLocal
from app.core.security import decode_token
from app.core.ws_manager import ws_manager
from app.models.agent import Agent
from app.models.metric import Metric
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ws", tags=["websocket"])

SERVER_PING_INTERVAL_SECONDS = 20
CLIENT_PONG_TIMEOUT_SECONDS = 45


def _get_db() -> Session:
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


# ── Agent WebSocket ──────────────────────────────────────────────────────────

@router.websocket("/agent")
async def agent_ws(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    agent: Agent | None = None
    last_client_pong = monotonic()
    server_ping_task: asyncio.Task[None] | None = None
    closing = False

    async def safe_send_json(payload: dict) -> bool:
        if (
            websocket.application_state is not WebSocketState.CONNECTED
            or websocket.client_state is not WebSocketState.CONNECTED
        ):
            return False
        try:
            await websocket.send_text(json.dumps(payload))
            return True
        except RuntimeError:
            return False
        except WebSocketDisconnect:
            return False

    async def start_server_heartbeat():
        nonlocal server_ping_task, last_client_pong, closing
        if server_ping_task and not server_ping_task.done():
            return
        last_client_pong = monotonic()

        async def _heartbeat():
            while True:
                await asyncio.sleep(SERVER_PING_INTERVAL_SECONDS)
                if agent is None:
                    continue
                if ws_manager.agent_connections.get(agent.id) is not websocket:
                    return
                if monotonic() - last_client_pong > CLIENT_PONG_TIMEOUT_SECONDS:
                    logger.warning("Agent %s missed server heartbeat pong, closing socket", agent.id)
                    closing = True
                    await websocket.close(code=1011, reason="heartbeat timeout")
                    return
                sent = await safe_send_json({
                    "type": "ping",
                    "data": {"ts": int(datetime.now(timezone.utc).timestamp() * 1000)},
                })
                if not sent:
                    return

        server_ping_task = asyncio.create_task(_heartbeat())

    try:
        while True:
            try:
                raw = await websocket.receive_text()
            except RuntimeError as exc:
                if "WebSocket is not connected" in str(exc):
                    logger.info("Agent WS closed while waiting for message")
                    break
                raise
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await safe_send_json({"type": "error", "data": {"code": "invalid_json", "message": "Invalid JSON"}})
                continue

            msg_type = msg.get("type")
            data = msg.get("data", {})

            # ── bind (first-time setup) ──────────────────────────────────────
            if msg_type == "bind":
                bind_token = data.get("bind_token")
                found: Agent | None = db.query(Agent).filter(Agent.bind_token == bind_token).first()
                if not found:
                    await safe_send_json({
                        "type": "error",
                        "data": {"code": "invalid_bind_token", "message": "Invalid bind token"},
                    })
                    continue
                if found.bind_token_expires_at and datetime.now(timezone.utc) > found.bind_token_expires_at.replace(tzinfo=timezone.utc):
                    await safe_send_json({
                        "type": "error",
                        "data": {"code": "expired_bind_token", "message": "Bind token expired"},
                    })
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
                await start_server_heartbeat()
                await safe_send_json({
                    "type": "bind_ok",
                    "data": {"access_token": access_token, "agent_id": agent.id},
                })
                await ws_manager.broadcast_agent_status(agent.user_id, agent.id, "online")

            # ── auth (reconnect with existing access_token) ──────────────────
            elif msg_type == "auth":
                access_token = data.get("access_token")
                found = db.query(Agent).filter(Agent.access_token == access_token).first()
                if not found:
                    await safe_send_json({
                        "type": "error",
                        "data": {"code": "invalid_access_token", "message": "Invalid access token"},
                    })
                    continue

                found.status = "online"
                found.last_seen = datetime.now(timezone.utc)
                db.commit()
                agent = found

                ws_manager.connect_agent(agent.id, websocket)
                await start_server_heartbeat()
                await safe_send_json({
                    "type": "auth_ok",
                    "data": {"agent_id": agent.id, "agent_name": agent.name},
                })
                await ws_manager.broadcast_agent_status(agent.user_id, agent.id, "online")

            # ── ping ─────────────────────────────────────────────────────────
            elif msg_type == "ping":
                if agent:
                    agent.last_seen = datetime.now(timezone.utc)
                    db.commit()
                if closing:
                    continue
                await safe_send_json({
                    "type": "pong",
                    "data": {"ts": data.get("ts")},
                })

            # ── pong (response to server heartbeat) ──────────────────────────
            elif msg_type == "pong":
                last_client_pong = monotonic()
                if agent:
                    agent.last_seen = datetime.now(timezone.utc)
                    db.commit()

            # ── metrics ──────────────────────────────────────────────────────
            elif msg_type == "metrics":
                if agent is None:
                    await safe_send_json({
                        "type": "error",
                        "data": {"code": "not_authenticated", "message": "Not authenticated"},
                    })
                    continue

                agent.last_seen = datetime.now(timezone.utc)
                now = datetime.now(timezone.utc)
                for key, value in data.items():
                    if isinstance(value, (int, float)):
                        db.add(Metric(agent_id=agent.id, metric_key=key, value=float(value), recorded_at=now))
                db.commit()

                await ws_manager.broadcast_agent_metrics(agent.user_id, agent.id, data)

            # ── agent_state ──────────────────────────────────────────────────
            elif msg_type == "agent_state":
                if agent is None:
                    await safe_send_json({
                        "type": "error",
                        "data": {"code": "not_authenticated", "message": "Not authenticated"},
                    })
                    continue
                if not isinstance(data, dict):
                    await safe_send_json({
                        "type": "error",
                        "data": {"code": "invalid_state", "message": "State payload must be an object"},
                    })
                    continue

                logger.info("Agent state from agent %s: %s", agent.id, data)
                metadata = dict(agent.metadata_) if isinstance(agent.metadata_, dict) else {}
                metadata.update(data)
                agent.metadata_ = metadata
                agent.last_seen = datetime.now(timezone.utc)
                db.commit()

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
        if server_ping_task and not server_ping_task.done():
            server_ping_task.cancel()
            try:
                await server_ping_task
            except asyncio.CancelledError:
                pass
        if agent:
            if ws_manager.agent_connections.get(agent.id) is websocket:
                ws_manager.disconnect_agent(agent.id, websocket)
                agent.status = "offline"
                db.commit()
                await ws_manager.broadcast_agent_status(agent.user_id, agent.id, "offline")
        db.close()


# ── Browser WebSocket ────────────────────────────────────────────────────────

@router.websocket("/dashboard")
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

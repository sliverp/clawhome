"""
WebSocket connection manager.

Maintains two pools:
- agent_connections: {agent_id -> WebSocket}  (agent client connections)
- browser_connections: {user_id -> set[WebSocket]}  (dashboard browser connections)
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WSManager:
    def __init__(self):
        # agent_id -> WebSocket
        self.agent_connections: dict[int, WebSocket] = {}
        # user_id -> set of WebSocket
        self.browser_connections: dict[int, set[WebSocket]] = {}

    # ── Agent connections ────────────────────────────────────────────────────

    def connect_agent(self, agent_id: int, ws: WebSocket):
        self.agent_connections[agent_id] = ws
        logger.info("Agent %d connected", agent_id)

    def disconnect_agent(self, agent_id: int, ws: WebSocket | None = None):
        current = self.agent_connections.get(agent_id)
        if ws is not None and current is not ws:
            return
        self.agent_connections.pop(agent_id, None)
        logger.info("Agent %d disconnected", agent_id)

    def is_agent_online(self, agent_id: int) -> bool:
        return agent_id in self.agent_connections

    async def send_to_agent(self, agent_id: int, message: dict) -> bool:
        ws = self.agent_connections.get(agent_id)
        if ws is None:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception:
            self.disconnect_agent(agent_id)
            return False

    # ── Browser connections ──────────────────────────────────────────────────

    def connect_browser(self, user_id: int, ws: WebSocket):
        self.browser_connections.setdefault(user_id, set()).add(ws)
        logger.info("Browser connected for user %d", user_id)

    def disconnect_browser(self, user_id: int, ws: WebSocket):
        conns = self.browser_connections.get(user_id, set())
        conns.discard(ws)
        if not conns:
            self.browser_connections.pop(user_id, None)
        logger.info("Browser disconnected for user %d", user_id)

    async def broadcast_to_user(self, user_id: int, message: dict):
        conns = self.browser_connections.get(user_id, set())
        if not conns:
            return
        data = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in list(conns):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_browser(user_id, ws)

    async def broadcast_agent_metrics(
        self, user_id: int, agent_id: int, metrics: dict[str, Any]
    ):
        await self.broadcast_to_user(
            user_id,
            {"type": "agent_metrics", "data": {"agent_id": agent_id, "metrics": metrics}},
        )

    async def broadcast_agent_status(self, user_id: int, agent_id: int, status: str):
        await self.broadcast_to_user(
            user_id,
            {"type": "agent_status", "data": {"agent_id": agent_id, "status": status}},
        )


ws_manager = WSManager()

"""
WebSocket connection manager.

Maintains three pools:
- agent_connections: {agent_id -> WebSocket}  (agent client connections)
- browser_connections: {user_id -> set[WebSocket]}  (all dashboard browser connections for a user)
- ws_subscriptions: {WebSocket -> set[int]}  (optional per-connection agent_id filter)

If a browser connection has subscriptions, it only receives events whose
agent_id is in the subscription set. No subscription means "receive all
events for this user" (legacy Vue Dashboard behaviour).
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
        # WebSocket -> set of agent_ids (optional filter; empty/missing = subscribe-all)
        self.ws_subscriptions: dict[WebSocket, set[int]] = {}

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
        self.ws_subscriptions.pop(ws, None)
        logger.info("Browser disconnected for user %d", user_id)

    def subscribe_agent(self, ws: WebSocket, agent_id: int):
        """让某个 browser WebSocket 订阅指定 agent 的消息"""
        self.ws_subscriptions.setdefault(ws, set()).add(agent_id)
        logger.info("Browser subscribed to agent %d", agent_id)

    def unsubscribe_agent(self, ws: WebSocket, agent_id: int):
        subs = self.ws_subscriptions.get(ws)
        if subs:
            subs.discard(agent_id)
            if not subs:
                self.ws_subscriptions.pop(ws, None)

    def _ws_wants_agent(self, ws: WebSocket, agent_id: int) -> bool:
        """判断某个 ws 是否关心这个 agent_id 的消息

        没有订阅过任何 agent（即 subscribe-all 模式）→ 收所有
        有订阅 → 只收订阅集内的
        """
        subs = self.ws_subscriptions.get(ws)
        if not subs:
            return True
        return agent_id in subs

    async def broadcast_to_user(
        self, user_id: int, message: dict, agent_id: int | None = None
    ):
        """广播消息给某个用户的所有 dashboard 连接。

        如果给出 agent_id，会按 ws 订阅过滤：
        - 只订阅了其它 agent 的连接不会收到
        - 没订阅过（subscribe-all）的连接照常收到
        """
        conns = self.browser_connections.get(user_id, set())
        if not conns:
            return
        data = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in list(conns):
            if agent_id is not None and not self._ws_wants_agent(ws, agent_id):
                continue
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
            agent_id=agent_id,
        )

    async def broadcast_agent_status(self, user_id: int, agent_id: int, status: str):
        await self.broadcast_to_user(
            user_id,
            {"type": "agent_status", "data": {"agent_id": agent_id, "status": status}},
            agent_id=agent_id,
        )


ws_manager = WSManager()

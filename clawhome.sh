#!/usr/bin/env bash
# ClawHome 管理脚本
# 用法：./clawhome.sh [start|stop|restart|status|pull|logs]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/web"

SERVER_PID_FILE="/tmp/clawhome-server.pid"
WEB_PID_FILE="/tmp/clawhome-web.pid"
SERVER_LOG="/tmp/clawhome-server.log"
WEB_LOG="/tmp/clawhome-web.log"

# ── 颜色输出 ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[clawhome]${NC} $*"; }
success() { echo -e "${GREEN}[clawhome]${NC} $*"; }
warn()    { echo -e "${YELLOW}[clawhome]${NC} $*"; }
error()   { echo -e "${RED}[clawhome]${NC} $*"; }

# ── 工具函数 ────────────────────────────────────────────────────────────────
is_running() {
    local pid_file="$1"
    [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

stop_process() {
    local name="$1" pid_file="$2"
    if is_running "$pid_file"; then
        local pid
        pid=$(cat "$pid_file")
        kill "$pid" 2>/dev/null && rm -f "$pid_file"
        # 等待进程退出
        for _ in {1..10}; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.5
        done
        kill -9 "$pid" 2>/dev/null || true
        success "$name 已停止 (PID $pid)"
    else
        warn "$name 未在运行"
        rm -f "$pid_file"
    fi
}

wait_for_port() {
    local port="$1" name="$2" retries=20
    while ((retries-- > 0)); do
        if curl -sf "http://localhost:$port/health" >/dev/null 2>&1 || \
           curl -sf "http://localhost:$port/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

# ── pull ────────────────────────────────────────────────────────────────────
do_pull() {
    info "拉取最新代码..."
    cd "$ROOT_DIR"
    git pull
    success "代码更新完成"

    info "更新后端依赖..."
    cd "$SERVER_DIR" && uv sync --quiet
    success "后端依赖更新完成"

    info "更新前端依赖..."
    cd "$WEB_DIR" && npm install --silent
    success "前端依赖更新完成"
}

# ── start ───────────────────────────────────────────────────────────────────
do_start() {
    # ── 后端 ────────────────────────────────────────────────────────────────
    if is_running "$SERVER_PID_FILE"; then
        warn "后端已在运行 (PID $(cat "$SERVER_PID_FILE"))"
    else
        info "执行数据库迁移..."
        if ! cd "$SERVER_DIR" && uv run alembic upgrade head 2>&1; then
            error "数据库迁移失败，请检查 .env 中的数据库配置"
            return 1
        fi

        info "启动后端 (port 8000)..."
        cd "$SERVER_DIR"
        nohup uv run uvicorn app.main:app \
            --host 0.0.0.0 --port 8000 \
            --root-path /api \
            >> "$SERVER_LOG" 2>&1 &
        echo $! > "$SERVER_PID_FILE"

        if wait_for_port 8000 "后端"; then
            success "后端启动成功 → http://localhost:8000  (docs: http://localhost:8000/docs)"
        else
            error "后端启动失败，查看日志: tail -f $SERVER_LOG"
            return 1
        fi
    fi

    # ── 前端 ────────────────────────────────────────────────────────────────
    if is_running "$WEB_PID_FILE"; then
        warn "前端已在运行 (PID $(cat "$WEB_PID_FILE"))"
    else
        info "构建前端..."
        cd "$WEB_DIR" && npm run build --silent

        info "启动前端 (port 5173)..."
        cd "$WEB_DIR"
        nohup npm run dev -- --host 0.0.0.0 \
            >> "$WEB_LOG" 2>&1 &
        echo $! > "$WEB_PID_FILE"

        if wait_for_port 5173 "前端"; then
            success "前端启动成功 → http://localhost:5173"
        else
            error "前端启动失败，查看日志: tail -f $WEB_LOG"
            return 1
        fi
    fi
}

# ── stop ────────────────────────────────────────────────────────────────────
do_stop() {
    stop_process "后端" "$SERVER_PID_FILE"
    stop_process "前端" "$WEB_PID_FILE"
}

# ── status ───────────────────────────────────────────────────────────────────
do_status() {
    echo ""
    if is_running "$SERVER_PID_FILE"; then
        success "后端  ● 运行中  PID=$(cat "$SERVER_PID_FILE")  → http://localhost:8000"
    else
        error   "后端  ○ 未运行"
    fi

    if is_running "$WEB_PID_FILE"; then
        success "前端  ● 运行中  PID=$(cat "$WEB_PID_FILE")  → http://localhost:5173"
    else
        error   "前端  ○ 未运行"
    fi
    echo ""
}

# ── logs ─────────────────────────────────────────────────────────────────────
do_logs() {
    local target="${2:-all}"
    case "$target" in
        server|backend) tail -f "$SERVER_LOG" ;;
        web|frontend)   tail -f "$WEB_LOG" ;;
        *)
            info "=== 后端日志 (最近 20 行) ==="
            tail -20 "$SERVER_LOG" 2>/dev/null || echo "(暂无日志)"
            echo ""
            info "=== 前端日志 (最近 20 行) ==="
            tail -20 "$WEB_LOG" 2>/dev/null || echo "(暂无日志)"
            echo ""
            info "实时跟踪: ./clawhome.sh logs server  或  ./clawhome.sh logs web"
            ;;
    esac
}

# ── 入口 ────────────────────────────────────────────────────────────────────
CMD="${1:-help}"
case "$CMD" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_stop; sleep 1; do_start ;;
    status)  do_status ;;
    pull)    do_pull ;;
    deploy)  do_pull; do_stop; sleep 1; do_start ;;  # pull + restart
    logs)    do_logs "$@" ;;
    *)
        echo ""
        echo "用法: $0 <命令>"
        echo ""
        echo "  start    启动前后端服务（自动执行 DB 迁移）"
        echo "  stop     停止前后端服务"
        echo "  restart  重启前后端服务"
        echo "  status   查看运行状态"
        echo "  pull     拉取最新代码 + 更新依赖"
        echo "  deploy   pull + restart（一键更新部署）"
        echo "  logs     查看最近日志（logs server / logs web）"
        echo ""
        ;;
esac

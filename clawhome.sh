#!/usr/bin/env bash
# ClawHome 管理脚本
# 用法：./clawhome.sh [start|stop|restart|status|pull|deploy|logs|check|nginx]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/web"

SERVER_PID_FILE="/tmp/clawhome-server.pid"
WEB_PID_FILE="/tmp/clawhome-web.pid"
SERVER_LOG="/tmp/clawhome-server.log"
WEB_LOG="/tmp/clawhome-web.log"

# Lobster 静态资源目录（阶段1已迁入）
LOBSTER_STATIC_DIR="$SERVER_DIR/static/lobster"

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
    local port="$1" retries=20
    while ((retries-- > 0)); do
        if curl -sf "http://localhost:$port/health" >/dev/null 2>&1 || \
           curl -sf "http://localhost:$port/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

# ── check：启动前的自检 ────────────────────────────────────────────────────
do_check() {
    local ok=1
    info "自检 lobster 静态资源..."
    if [[ -f "$LOBSTER_STATIC_DIR/index.html" && -f "$LOBSTER_STATIC_DIR/lobster-api.js" ]]; then
        success "lobster 静态资源就绪 ($LOBSTER_STATIC_DIR)"
    else
        error "lobster 静态资源缺失：$LOBSTER_STATIC_DIR"
        ok=0
    fi

    info "自检后端依赖..."
    if (cd "$SERVER_DIR" && uv run python -c "import fastapi, sqlalchemy" >/dev/null 2>&1); then
        success "后端依赖就绪"
    else
        warn "后端依赖未就绪，将在 deploy/start 时自动 uv sync"
    fi

    info "自检前端依赖..."
    if [[ -d "$WEB_DIR/node_modules" ]]; then
        success "前端依赖就绪"
    else
        warn "前端依赖未安装，将在 deploy/start 时自动 npm install"
    fi

    info "自检 nginx 配置..."
    if command -v nginx >/dev/null 2>&1; then
        if sudo nginx -t >/dev/null 2>&1; then
            success "nginx 配置语法正确"
        else
            warn "nginx 配置语法错误，运行 'sudo nginx -t' 查看详情"
        fi
    else
        warn "未安装 nginx，跳过"
    fi

    [[ $ok -eq 1 ]] && success "自检通过" || { error "自检失败"; return 1; }
}

# ── nginx：测试并 reload ───────────────────────────────────────────────────
do_nginx() {
    local action="${2:-reload}"
    case "$action" in
        test)
            info "测试 nginx 配置..."
            sudo nginx -t
            ;;
        reload)
            info "测试 nginx 配置..."
            if sudo nginx -t; then
                sudo nginx -s reload
                success "nginx 已重载"
            else
                error "nginx 配置有误，未 reload"
                return 1
            fi
            ;;
        *)
            echo "用法: $0 nginx [test|reload]"
            ;;
    esac
}

# ── pull ────────────────────────────────────────────────────────────────────
do_pull() {
    info "拉取最新代码..."
    (cd "$ROOT_DIR" && git pull)
    success "代码更新完成"

    info "更新后端依赖..."
    (cd "$SERVER_DIR" && uv sync --quiet)
    success "后端依赖更新完成"

    info "更新前端依赖..."
    (cd "$WEB_DIR" && npm install --silent)
    success "前端依赖更新完成"
}

# ── start ───────────────────────────────────────────────────────────────────
do_start() {
    # ── 后端 ────────────────────────────────────────────────────────────────
    if is_running "$SERVER_PID_FILE"; then
        warn "后端已在运行 (PID $(cat "$SERVER_PID_FILE"))"
    else
        info "执行数据库迁移..."
        if ! (cd "$SERVER_DIR" && uv run alembic upgrade head 2>&1); then
            error "数据库迁移失败，请检查 .env 中的数据库配置"
            return 1
        fi

        info "启动后端 (port 8000)..."
        (
            cd "$SERVER_DIR"
            nohup uv run uvicorn app.main:app \
                --host 0.0.0.0 --port 8000 \
                >> "$SERVER_LOG" 2>&1 &
            echo $! > "$SERVER_PID_FILE"
        )

        if wait_for_port 8000; then
            success "后端启动成功 → http://localhost:8000  (docs: http://localhost:8000/docs)"
            info "  · lobster 静态页 → http://localhost:8000/lobster/"
        else
            error "后端启动失败，查看日志: tail -f $SERVER_LOG"
            return 1
        fi
    fi

    # ── 前端 ────────────────────────────────────────────────────────────────
    if is_running "$WEB_PID_FILE"; then
        warn "前端已在运行 (PID $(cat "$WEB_PID_FILE"))"
    else
        info "构建前端（生成 dist 用于线上校验）..."
        (cd "$WEB_DIR" && npm run build --silent)

        info "启动前端 dev server (port 5173)..."
        (
            cd "$WEB_DIR"
            nohup npm run dev -- --host 0.0.0.0 \
                >> "$WEB_LOG" 2>&1 &
            echo $! > "$WEB_PID_FILE"
        )

        if wait_for_port 5173; then
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
        info   "       lobster → http://localhost:8000/lobster/"
    else
        error   "后端  ○ 未运行"
    fi

    if is_running "$WEB_PID_FILE"; then
        success "前端  ● 运行中  PID=$(cat "$WEB_PID_FILE")  → http://localhost:5173"
    else
        error   "前端  ○ 未运行"
    fi

    if command -v nginx >/dev/null 2>&1; then
        if pgrep -x nginx >/dev/null 2>&1; then
            success "nginx ● 运行中"
        else
            warn   "nginx ○ 未运行"
        fi
    fi
    echo ""
}

# ── logs ─────────────────────────────────────────────────────────────────────
do_logs() {
    local target="${2:-all}"
    case "$target" in
        server|backend) tail -f "$SERVER_LOG" ;;
        web|frontend)   tail -f "$WEB_LOG" ;;
        nginx)          sudo tail -f /var/log/nginx/error.log /var/log/nginx/access.log ;;
        *)
            info "=== 后端日志 (最近 20 行) ==="
            tail -20 "$SERVER_LOG" 2>/dev/null || echo "(暂无日志)"
            echo ""
            info "=== 前端日志 (最近 20 行) ==="
            tail -20 "$WEB_LOG" 2>/dev/null || echo "(暂无日志)"
            echo ""
            info "实时跟踪: ./clawhome.sh logs [server|web|nginx]"
            ;;
    esac
}

# ── deploy：完整的"拉代码 → 装依赖 → 重启服务 → reload nginx" ──────────────
do_deploy() {
    info "═════ 开始一键部署 ═════"
    do_pull
    do_stop
    sleep 1
    do_start

    # nginx reload（保证 /lobster/ 新规则生效）
    if command -v nginx >/dev/null 2>&1; then
        if sudo nginx -t >/dev/null 2>&1; then
            sudo nginx -s reload && success "nginx 已重载"
        else
            warn "nginx 配置有误，未 reload（运行 sudo nginx -t 查看详情）"
        fi
    fi

    do_status
    success "═════ 部署完成 ═════"
    info "访问：https://www.clawhome.fans/"
}

# ── 入口 ────────────────────────────────────────────────────────────────────
CMD="${1:-help}"
case "$CMD" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_stop; sleep 1; do_start ;;
    status)  do_status ;;
    pull)    do_pull ;;
    deploy)  do_deploy ;;
    check)   do_check ;;
    nginx)   do_nginx "$@" ;;
    logs)    do_logs "$@" ;;
    *)
        echo ""
        echo "用法: $0 <命令>"
        echo ""
        echo "  start    启动前后端服务（自动执行 DB 迁移）"
        echo "  stop     停止前后端服务"
        echo "  restart  重启前后端服务"
        echo "  status   查看运行状态"
        echo "  check    启动前自检（资源/依赖/nginx 配置）"
        echo "  nginx    nginx 操作（nginx test / nginx reload）"
        echo "  pull     拉取最新代码 + 更新依赖"
        echo "  deploy   一键部署：pull + restart + nginx reload"
        echo "  logs     查看日志（logs server / logs web / logs nginx）"
        echo ""
        ;;
esac

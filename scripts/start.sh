#!/bin/bash

set -e

echo "=========================================="
echo "中央厨房排产系统 - 启动脚本"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "[1/5] 检查Docker环境..."
if ! command -v docker &> /dev/null; then
    echo "✗ Docker未安装，请先安装Docker"
    exit 1
fi
echo "✓ Docker已安装"

if ! command -v docker-compose &> /dev/null; then
    if ! docker compose version &> /dev/null; then
        echo "✗ Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi
echo "✓ Docker Compose已安装"

echo ""
echo "[2/5] 加载环境变量..."
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✓ 环境变量已加载"
    echo "  - API端口: ${API_PORT}"
    echo "  - Web端口: ${WEB_PORT}"
    echo "  - DB端口: ${DB_PORT}"
else
    echo "⚠ 未找到.env文件，使用默认值"
fi

echo ""
echo "[3/5] 停止并清理现有容器..."
$DOCKER_COMPOSE down -v 2>/dev/null || true
echo "✓ 清理完成"

echo ""
echo "[4/5] 构建并启动服务..."
$DOCKER_COMPOSE up -d --build

echo ""
echo "[5/5] 等待服务启动..."
echo ""
echo "等待PostgreSQL启动..."
for i in {1..30}; do
    if docker exec -it ${COMPOSE_PROJECT_NAME:-wangxt_832_1}-postgres-1 pg_isready -U postgres > /dev/null 2>&1; then
        echo "✓ PostgreSQL已启动"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""
echo "等待后端API启动..."
for i in {1..40}; do
    if curl -s -f "http://localhost:${API_PORT}/api/health" > /dev/null 2>&1; then
        echo "✓ 后端API已启动"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""
echo "等待前端启动..."
for i in {1..20}; do
    if curl -s -f "http://localhost:${WEB_PORT}/" > /dev/null 2>&1; then
        echo "✓ 前端已启动"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""
echo "=========================================="
echo "✓ 所有服务启动完成！"
echo "=========================================="
echo ""
echo "服务地址："
echo "  - 前端应用: http://localhost:${WEB_PORT}"
echo "  - 后端API:  http://localhost:${API_PORT}/api"
echo "  - 数据库:   localhost:${DB_PORT}"
echo ""
echo "验证命令："
echo "  冒烟测试:   bash scripts/smoke.sh"
echo "  场景测试:   bash scripts/test_insufficient_material.sh"
echo ""
echo "常用命令："
echo "  查看日志:   $DOCKER_COMPOSE logs -f"
echo "  停止服务:   $DOCKER_COMPOSE down"
echo "  重启服务:   $DOCKER_COMPOSE restart"
echo ""

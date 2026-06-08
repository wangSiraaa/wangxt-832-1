#!/bin/bash

API_BASE_URL="${API_BASE_URL:-http://localhost:19132/api}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

check_api_health() {
    print_header "检查API服务状态"
    for i in {1..30}; do
        if curl -s -f "$API_BASE_URL/health" > /dev/null 2>&1; then
            print_success "API服务已启动"
            return 0
        fi
        print_info "等待API服务启动... ($i/30)"
        sleep 2
    done
    print_error "API服务启动超时"
    exit 1
}

test_insufficient_material_scenario() {
    print_header "场景测试：原料不足时确认排产被拒绝"

    echo ""
    print_info "测试目标：验证当原料库存不足时，后端拒绝排产确认，并且库存不发生变化"
    echo ""

    echo "=== 步骤1：查询当前原料库存 ==="
    MATERIALS=$(curl -s "$API_BASE_URL/raw-materials")
    echo "$MATERIALS" | jq -c '.[] | {id, code, name, unit}' 2>/dev/null || echo "$MATERIALS"

    BEEF_ID=$(echo "$MATERIALS" | jq -r '.[] | select(.code == "RM003") | .id')
    BEEF_NAME=$(echo "$MATERIALS" | jq -r '.[] | select(.code == "RM003") | .name')
    echo ""
    print_info "目标原料：$BEEF_NAME (ID: $BEEF_ID)"

    echo ""
    echo "=== 步骤2：查询牛肉当前库存量 ==="
    INVENTORY=$(curl -s "$API_BASE_URL/inventory")
    BEEF_INV=$(echo "$INVENTORY" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id)')
    BEEF_QTY=$(echo "$BEEF_INV" | jq -r '.quantity')
    echo "牛肉当前库存: $BEEF_QTY kg"
    print_info "注意：种子数据中牛肉库存只有 5kg"

    echo ""
    echo "=== 步骤3：查询门店列表 ==="
    STORES=$(curl -s "$API_BASE_URL/stores")
    STORE_ID=$(echo "$STORES" | jq -r '.[0].id')
    STORE_NAME=$(echo "$STORES" | jq -r '.[0].name')
    echo "选择门店: $STORE_NAME (ID: $STORE_ID)"

    echo ""
    echo "=== 步骤4：查询菜品列表 ==="
    DISHES=$(curl -s "$API_BASE_URL/dishes")
    BEEF_NOODLES_ID=$(echo "$DISHES" | jq -r '.[] | select(.code == "D002") | .id')
    BEEF_NOODLES_NAME=$(echo "$DISHES" | jq -r '.[] | select(.code == "D002") | .name')
    echo "选择菜品: $BEEF_NOODLES_NAME (ID: $BEEF_NOODLES_ID)"
    
    RECIPE=$(echo "$DISHES" | jq -r --arg id "$BEEF_NOODLES_ID" '.[] | select(.id == $id) | .recipeItems[] | select(.rawMaterial.code == "RM003")')
    BEEF_PER_DISH=$(echo "$RECIPE" | jq -r '.quantity')
    print_info "每份$BEEF_NOODLES_NAME 需要牛肉: $BEEF_PER_DISH kg"

    echo ""
    echo "=== 步骤5：创建大额订单（故意超过库存） ==="
    ORDER_QTY=100
    REQUIRED_BEEF=$(awk "BEGIN {print $ORDER_QTY * $BEEF_PER_DISH}")
    print_info "订购数量: $ORDER_QTY 份 $BEEF_NOODLES_NAME"
    print_info "需要牛肉: $REQUIRED_BEEF kg"
    print_info "现有牛肉: $BEEF_QTY kg"
    print_info "缺口: $(awk "BEGIN {print $REQUIRED_BEEF - $BEEF_QTY}") kg"

    ORDER_NO="TEST-$(date +%s)"
    ORDER_DATE=$(date +%Y-%m-%d)
    
    ORDER_RESPONSE=$(curl -s -X POST "$API_BASE_URL/store-orders" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeId\": \"$STORE_ID\",
            \"orderNo\": \"$ORDER_NO\",
            \"orderDate\": \"$ORDER_DATE\",
            \"items\": [
                {
                    \"dishId\": \"$BEEF_NOODLES_ID\",
                    \"quantity\": $ORDER_QTY
                }
            ]
        }")
    
    ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.id')
    
    if [ "$ORDER_ID" != "null" ] && [ -n "$ORDER_ID" ]; then
        print_success "订单创建成功 (ID: $ORDER_ID, 订单号: $ORDER_NO)"
    else
        print_error "订单创建失败"
        echo "响应: $ORDER_RESPONSE"
        exit 1
    fi

    echo ""
    echo "=== 步骤6：创建排产计划并进行原料校验 ==="
    SCHEDULE_NO="SCH-$(date +%s)"
    SCHEDULE_DATE=$(date +%Y-%m-%d)
    
    SCHEDULE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/production-schedules" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeOrderId\": \"$ORDER_ID\",
            \"scheduleNo\": \"$SCHEDULE_NO\",
            \"scheduleDate\": \"$SCHEDULE_DATE\",
            \"items\": [
                {
                    \"dishId\": \"$BEEF_NOODLES_ID\",
                    \"plannedQuantity\": $ORDER_QTY
                }
            ]
        }")
    
    SCHEDULE_ID=$(echo "$SCHEDULE_RESPONSE" | jq -r '.id')
    
    if [ "$SCHEDULE_ID" != "null" ] && [ -n "$SCHEDULE_ID" ]; then
        print_success "排产计划创建成功 (ID: $SCHEDULE_ID, 编号: $SCHEDULE_NO)"
        echo ""
        echo "原料校验结果:"
        echo "$SCHEDULE_RESPONSE" | jq -c '.materialChecks[] | {name: .rawMaterial.name, required: .requiredQuantity, available: .availableQuantity, isSufficient: .isSufficient}' 2>/dev/null || echo "$SCHEDULE_RESPONSE"
    else
        print_error "排产计划创建失败"
        echo "响应: $SCHEDULE_RESPONSE"
        exit 1
    fi

    echo ""
    echo "=== 步骤7：尝试确认排产（预期被拒绝） ==="
    print_info "调用排产确认接口，预期返回 400 错误和原料不足信息..."
    echo ""

    BEFORE_INV=$(curl -s "$API_BASE_URL/inventory" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id) | .quantity')
    print_info "确认排产前牛肉库存: $BEFORE_INV kg"

    CONFIRM_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE_URL/production-schedules/$SCHEDULE_ID/confirm" \
        -H "Content-Type: application/json")

    HTTP_BODY=$(echo "$CONFIRM_RESPONSE" | sed -e 's/HTTP_STATUS:.*//g')
    HTTP_CODE=$(echo "$CONFIRM_RESPONSE" | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)

    echo ""
    echo "HTTP 状态码: $HTTP_CODE"
    echo "响应内容:"
    echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"

    AFTER_INV=$(curl -s "$API_BASE_URL/inventory" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id) | .quantity')
    print_info "确认排产后牛肉库存: $AFTER_INV kg"

    echo ""
    echo "=== 验证结果 ==="
    
    TEST_PASSED=true

    if [ "$HTTP_CODE" = "400" ]; then
        print_success "✓ 正确返回 HTTP 400 状态码"
    else
        print_error "✗ 预期返回 400，实际返回 $HTTP_CODE"
        TEST_PASSED=false
    fi

    ERROR_CODE=$(echo "$HTTP_BODY" | jq -r '.code' 2>/dev/null || echo "")
    if [ "$ERROR_CODE" = "INSUFFICIENT_MATERIALS" ]; then
        print_success "✓ 正确返回错误码 INSUFFICIENT_MATERIALS"
    else
        print_error "✗ 预期错误码 INSUFFICIENT_MATERIALS，实际返回 $ERROR_CODE"
        TEST_PASSED=false
    fi

    INSUFFICIENT=$(echo "$HTTP_BODY" | jq -r '.insufficientMaterials' 2>/dev/null || echo "")
    if [ "$INSUFFICIENT" != "null" ] && [ -n "$INSUFFICIENT" ]; then
        print_success "✓ 返回了不足原料的详细信息"
        echo "$INSUFFICIENT" | jq -c '.[] | {name, code, required, available, shortage, unit}' 2>/dev/null || echo "$INSUFFICIENT"
    else
        print_error "✗ 未返回不足原料的详细信息"
        TEST_PASSED=false
    fi

    if [ "$BEFORE_INV" = "$AFTER_INV" ]; then
        print_success "✓ 库存没有发生变化（正确，排产失败不应扣减库存）"
    else
        print_error "✗ 库存发生了变化！排产失败不应扣减库存"
        print_error "  变化前: $BEFORE_INV kg, 变化后: $AFTER_INV kg"
        TEST_PASSED=false
    fi

    echo ""
    echo "=== 测试总结 ==="
    if [ "$TEST_PASSED" = true ]; then
        print_success "所有测试通过！原料不足时确认排产被正确拒绝，库存未发生变化。"
        echo ""
        print_info "测试验证了以下业务规则："
        print_info "1. 排产确认前进行原料充足性校验"
        print_info "2. 原料不足时，后端拒绝排产确认请求"
        print_info "3. 返回具体的原料不足信息（名称、需求量、现存量、缺口量）"
        print_info "4. 排产确认失败时，原料库存不发生扣减"
        echo ""
        return 0
    else
        print_error "部分测试未通过，请检查后端逻辑。"
        echo ""
        return 1
    fi
}

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          中央厨房排产系统 - 原料不足场景测试脚本            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    print_info "API Base URL: $API_BASE_URL"
    echo ""

    check_api_health
    test_insufficient_material_scenario

    local exit_code=$?
    echo ""
    if [ $exit_code -eq 0 ]; then
        print_success "测试脚本执行完成，所有验证通过！"
        exit 0
    else
        print_error "测试脚本执行完成，但存在验证失败。"
        exit 1
    fi
}

main "$@"

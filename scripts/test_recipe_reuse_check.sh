#!/bin/bash

API_BASE_URL="${API_BASE_URL:-http://localhost:19132/api}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_step() {
    echo -e "${BLUE}→ $1${NC}"
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

setup_test_data() {
    print_header "准备测试数据：创建历史排产记录"

    echo ""
    print_info "为了测试配方复用检查，我们先创建一些历史排产记录"
    echo ""

    echo "=== 步骤1：查询原料库存 ==="
    MATERIALS=$(curl -s "$API_BASE_URL/raw-materials")
    BEEF_ID=$(echo "$MATERIALS" | jq -r '.[] | select(.code == "RM003") | .id')
    FLOUR_ID=$(echo "$MATERIALS" | jq -r '.[] | select(.code == "RM001") | .id')
    PORK_ID=$(echo "$MATERIALS" | jq -r '.[] | select(.code == "RM002") | .id')
    print_success "获取到原料ID"

    echo ""
    echo "=== 步骤2：调整牛肉库存，确保后续测试能出现缺料 ==="
    INVENTORY=$(curl -s "$API_BASE_URL/inventory")
    BEEF_INV=$(echo "$INVENTORY" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id)')
    BEEF_INV_ID=$(echo "$BEEF_INV" | jq -r '.id')
    echo "当前牛肉库存: $(echo "$BEEF_INV" | jq -r '.quantity') kg"

    curl -s -X POST "$API_BASE_URL/inventory/adjust" \
        -H "Content-Type: application/json" \
        -d "{
            \"inventoryId\": \"$BEEF_INV_ID\",
            \"quantity\": 3,
            \"remark\": \"测试调整\"
        }" > /dev/null

    INVENTORY=$(curl -s "$API_BASE_URL/inventory")
    BEEF_QTY=$(echo "$INVENTORY" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id) | .quantity')
    print_info "调整后牛肉库存: $BEEF_QTY kg"

    echo ""
    echo "=== 步骤3：查询门店和菜品 ==="
    STORES=$(curl -s "$API_BASE_URL/stores")
    STORE_ID=$(echo "$STORES" | jq -r '.[0].id')
    print_success "门店ID: $STORE_ID"

    DISHES=$(curl -s "$API_BASE_URL/dishes")
    DUMPLING_ID=$(echo "$DISHES" | jq -r '.[] | select(.code == "D001") | .id')
    NOODLE_ID=$(echo "$DISHES" | jq -r '.[] | select(.code == "D002") | .id')
    print_success "菜品ID - 猪肉白菜饺子: $DUMPLING_ID, 牛肉面: $NOODLE_ID"

    echo ""
    echo "=== 步骤4：创建历史订单1（用于产生复用记录） ==="
    HIST_ORDER_NO1="HIST-$(date +%s)-1"
    HIST_ORDER1=$(curl -s -X POST "$API_BASE_URL/store-orders" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeId\": \"$STORE_ID\",
            \"orderNo\": \"$HIST_ORDER_NO1\",
            \"orderDate\": \"2026-01-01\",
            \"items\": [
                { \"dishId\": \"$DUMPLING_ID\", \"quantity\": 50 },
                { \"dishId\": \"$NOODLE_ID\", \"quantity\": 10 }
            ]
        }")
    HIST_ORDER_ID1=$(echo "$HIST_ORDER1" | jq -r '.id')
    print_success "历史订单1创建成功: $HIST_ORDER_NO1 (ID: $HIST_ORDER_ID1)"

    echo ""
    echo "=== 步骤5：创建历史排产1 ==="
    HIST_SCHEDULE_NO1="HSCH-$(date +%s)-1"
    curl -s -X POST "$API_BASE_URL/production-schedules" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeOrderId\": \"$HIST_ORDER_ID1\",
            \"scheduleNo\": \"$HIST_SCHEDULE_NO1\",
            \"scheduleDate\": \"2026-01-02\",
            \"items\": [
                { \"dishId\": \"$DUMPLING_ID\", \"plannedQuantity\": 50 },
                { \"dishId\": \"$NOODLE_ID\", \"plannedQuantity\": 10 }
            ],
            \"checkedBy\": \"test_operator\"
        }" > /dev/null
    print_success "历史排产1创建成功: $HIST_SCHEDULE_NO1"

    echo ""
    echo "=== 步骤6：确认历史排产1（扣减库存） ==="
    HIST_SCHEDULE1=$(curl -s "$API_BASE_URL/production-schedules?storeOrderId=$HIST_ORDER_ID1")
    HIST_SCHEDULE_ID1=$(echo "$HIST_SCHEDULE1" | jq -r '.[0].id')

    curl -s -X POST "$API_BASE_URL/production-schedules/$HIST_SCHEDULE_ID1/confirm" \
        -H "Content-Type: application/json" > /dev/null
    print_success "历史排产1已确认，库存已扣减"

    echo ""
    echo "=== 步骤7：创建历史订单2 ==="
    HIST_ORDER_NO2="HIST-$(date +%s)-2"
    HIST_ORDER2=$(curl -s -X POST "$API_BASE_URL/store-orders" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeId\": \"$STORE_ID\",
            \"orderNo\": \"$HIST_ORDER_NO2\",
            \"orderDate\": \"2026-01-03\",
            \"items\": [
                { \"dishId\": \"$DUMPLING_ID\", \"quantity\": 30 }
            ]
        }")
    HIST_ORDER_ID2=$(echo "$HIST_ORDER2" | jq -r '.id')
    print_success "历史订单2创建成功: $HIST_ORDER_NO2 (ID: $HIST_ORDER_ID2)"

    echo ""
    echo "=== 步骤8：创建历史排产2 ==="
    HIST_SCHEDULE_NO2="HSCH-$(date +%s)-2"
    curl -s -X POST "$API_BASE_URL/production-schedules" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeOrderId\": \"$HIST_ORDER_ID2\",
            \"scheduleNo\": \"$HIST_SCHEDULE_NO2\",
            \"scheduleDate\": \"2026-01-04\",
            \"items\": [
                { \"dishId\": \"$DUMPLING_ID\", \"plannedQuantity\": 30 }
            ],
            \"checkedBy\": \"test_operator\"
        }" > /dev/null
    print_success "历史排产2创建成功: $HIST_SCHEDULE_NO2"

    echo ""
    echo "=== 步骤9：确认历史排产2 ==="
    HIST_SCHEDULE2=$(curl -s "$API_BASE_URL/production-schedules?storeOrderId=$HIST_ORDER_ID2")
    HIST_SCHEDULE_ID2=$(echo "$HIST_SCHEDULE2" | jq -r '.[0].id')

    curl -s -X POST "$API_BASE_URL/production-schedules/$HIST_SCHEDULE_ID2/confirm" \
        -H "Content-Type: application/json" > /dev/null
    print_success "历史排产2已确认"

    echo ""
    INVENTORY=$(curl -s "$API_BASE_URL/inventory")
    BEEF_QTY=$(echo "$INVENTORY" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id) | .quantity')
    print_info "当前牛肉库存: $BEEF_QTY kg"

    export TEST_STORE_ID="$STORE_ID"
    export TEST_DUMPLING_ID="$DUMPLING_ID"
    export TEST_NOODLE_ID="$NOODLE_ID"
    export TEST_BEEF_ID="$BEEF_ID"
    export TEST_BEEF_QTY="$BEEF_QTY"
}

test_recipe_reuse_scenario() {
    print_header "验收测试：配方复用检查 + 缺料阻止排产"

    echo ""
    print_info "测试目标："
    print_info "1. 提交包含重复配方的门店订单"
    print_info "2. 查看时间线出现复用记录"
    print_info "3. 确认缺料订单仍被拒绝"
    echo ""

    STORE_ID="$TEST_STORE_ID"
    DUMPLING_ID="$TEST_DUMPLING_ID"
    NOODLE_ID="$TEST_NOODLE_ID"
    BEEF_ID="$TEST_BEEF_ID"
    BEEF_QTY="$TEST_BEEF_QTY"

    echo ""
    print_step "步骤1：创建测试门店订单（包含复用配方菜品）"
    echo ""

    ORDER_QTY_DUMPLING=100
    ORDER_QTY_NOODLE=50

    DUMPLING_RECIPE=$(curl -s "$API_BASE_URL/dishes" | jq -r --arg id "$DUMPLING_ID" '.[] | select(.id == $id) | .recipeItems[] | select(.rawMaterial.code == "RM002")')
    PORK_PER_DUMPLING=$(echo "$DUMPLING_RECIPE" | jq -r '.quantity')

    NOODLE_RECIPE=$(curl -s "$API_BASE_URL/dishes" | jq -r --arg id "$NOODLE_ID" '.[] | select(.id == $id) | .recipeItems[] | select(.rawMaterial.code == "RM003")')
    BEEF_PER_NOODLE=$(echo "$NOODLE_RECIPE" | jq -r '.quantity')
    REQUIRED_BEEF=$(awk "BEGIN {print $ORDER_QTY_NOODLE * $BEEF_PER_NOODLE}")

    print_info "订单内容："
    print_info "  - 猪肉白菜饺子: $ORDER_QTY_DUMPLING 份 (v1→v2 配方复用)"
    print_info "  - 牛肉面: $ORDER_QTY_NOODLE 份 (v1→v2 配方复用)"
    print_info "牛肉面需要牛肉: $REQUIRED_BEEF kg, 现有库存: $BEEF_QTY kg"
    print_info "缺口: $(awk "BEGIN {print $REQUIRED_BEEF - $BEEF_QTY}") kg (故意造成缺料)"

    echo ""
    ORDER_NO="TEST-REUSE-$(date +%s)"
    ORDER_DATE=$(date +%Y-%m-%d)

    ORDER_RESPONSE=$(curl -s -X POST "$API_BASE_URL/store-orders" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeId\": \"$STORE_ID\",
            \"orderNo\": \"$ORDER_NO\",
            \"orderDate\": \"$ORDER_DATE\",
            \"items\": [
                { \"dishId\": \"$DUMPLING_ID\", \"quantity\": $ORDER_QTY_DUMPLING },
                { \"dishId\": \"$NOODLE_ID\", \"quantity\": $ORDER_QTY_NOODLE }
            ]
        }")

    ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.id')

    if [ "$ORDER_ID" != "null" ] && [ -n "$ORDER_ID" ]; then
        print_success "测试订单创建成功 (ID: $ORDER_ID, 订单号: $ORDER_NO)"
    else
        print_error "测试订单创建失败"
        echo "响应: $ORDER_RESPONSE"
        exit 1
    fi

    echo ""
    print_step "步骤2：执行配方复用检查API"
    echo ""

    CHECK_RESPONSE=$(curl -s -X POST "$API_BASE_URL/recipe-reuse-check/check/$ORDER_ID" \
        -H "Content-Type: application/json" \
        -d "{ \"checkedBy\": \"acceptance_test\" }")

    echo "检查响应:"
    echo "$CHECK_RESPONSE" | jq '.' 2>/dev/null || echo "$CHECK_RESPONSE"

    echo ""
    HAS_REUSE=$(echo "$CHECK_RESPONSE" | jq -r '.data.hasReusedRecipes')
    REUSED_COUNT=$(echo "$CHECK_RESPONSE" | jq -r '.data.reusedDishes | length')

    TEST_PASSED=true

    if [ "$HAS_REUSE" = "true" ]; then
        print_success "✓ 正确检测到配方复用"
    else
        print_error "✗ 未检测到配方复用"
        TEST_PASSED=false
    fi

    if [ "$REUSED_COUNT" = "2" ]; then
        print_success "✓ 正确识别出 2 个复用配方的菜品"
    else
        print_error "✗ 预期识别 2 个菜品，实际识别 $REUSED_COUNT 个"
        TEST_PASSED=false
    fi

    CHECKED_BY=$(echo "$CHECK_RESPONSE" | jq -r '.data.checkedBy')
    if [ "$CHECKED_BY" = "acceptance_test" ]; then
        print_success "✓ 处理人已正确记录: $CHECKED_BY"
    else
        print_error "✗ 处理人未正确记录，预期: acceptance_test, 实际: $CHECKED_BY"
        TEST_PASSED=false
    fi

    MATERIAL_IMPACT_COUNT=$(echo "$CHECK_RESPONSE" | jq -r '.data.materialImpact | length')
    if [ "$MATERIAL_IMPACT_COUNT" -gt 0 ]; then
        print_success "✓ 正确计算出原料额外消耗，涉及 $MATERIAL_IMPACT_COUNT 种原料"
        echo "  原料影响详情:"
        echo "$CHECK_RESPONSE" | jq -c '.data.materialImpact[] | {name: .rawMaterialName, extra: .extraTotal, unit: .unit}' 2>/dev/null
    else
        print_error "✗ 未计算出原料额外消耗"
        TEST_PASSED=false
    fi

    echo ""
    print_step "步骤3：查询并验证时间线记录"
    echo ""

    TIMELINE_RESPONSE=$(curl -s "$API_BASE_URL/recipe-reuse-check/$ORDER_ID/timeline")
    echo "时间线响应:"
    echo "$TIMELINE_RESPONSE" | jq '.' 2>/dev/null || echo "$TIMELINE_RESPONSE"

    EVENT_COUNT=$(echo "$TIMELINE_RESPONSE" | jq -r '.data | length')

    if [ "$EVENT_COUNT" -gt 0 ]; then
        print_success "✓ 时间线包含 $EVENT_COUNT 条记录"
    else
        print_error "✗ 时间线没有记录"
        TEST_PASSED=false
    fi

    DISH_REUSED_EVENTS=$(echo "$TIMELINE_RESPONSE" | jq -r '[.data[] | select(.eventType == "DISH_REUSED")] | length')
    if [ "$DISH_REUSED_EVENTS" -ge 2 ]; then
        print_success "✓ 时间线包含配方复用事件"
    else
        print_error "✗ 时间线缺少配方复用事件"
        TEST_PASSED=false
    fi

    MATERIAL_EVENTS=$(echo "$TIMELINE_RESPONSE" | jq -r '[.data[] | select(.eventType == "MATERIAL_IMPACT")] | length')
    if [ "$MATERIAL_EVENTS" -ge 1 ]; then
        print_success "✓ 时间线包含原料影响事件"
    else
        print_error "✗ 时间线缺少原料影响事件"
        TEST_PASSED=false
    fi

    HISTORICAL_EVENTS=$(echo "$TIMELINE_RESPONSE" | jq -r '[.data[] | select(.eventType == "HISTORICAL_SOURCE")] | length')
    if [ "$HISTORICAL_EVENTS" -ge 2 ]; then
        print_success "✓ 时间线包含历史来源事件"
    else
        print_error "✗ 时间线缺少历史来源事件"
        TEST_PASSED=false
    fi

    echo ""
    print_step "步骤4：查看历史来源详情"
    echo ""

    HIST_RESPONSE=$(curl -s "$API_BASE_URL/recipe-reuse-check/$ORDER_ID/historical/$DUMPLING_ID")
    echo "历史来源响应:"
    echo "$HIST_RESPONSE" | jq '.data | {dish: .dish.name, historicalCount: (.historicalUsage | length), diffCount: (.materialDiff | length)}' 2>/dev/null

    HIST_COUNT=$(echo "$HIST_RESPONSE" | jq -r '.data.historicalUsage | length')
    if [ "$HIST_COUNT" -ge 2 ]; then
        print_success "✓ 可查询到 $HIST_COUNT 条历史使用记录"
    else
        print_error "✗ 历史使用记录不足"
        TEST_PASSED=false
    fi

    DIFF_COUNT=$(echo "$HIST_RESPONSE" | jq -r '.data.materialDiff | length')
    if [ "$DIFF_COUNT" -ge 1 ]; then
        print_success "✓ 可查询到配方差异，共 $DIFF_COUNT 项"
    else
        print_error "✗ 未查询到配方差异"
        TEST_PASSED=false
    fi

    echo ""
    print_step "步骤5：创建排产计划（自动执行复用检查）"
    echo ""

    SCHEDULE_NO="SCH-TEST-$(date +%s)"
    SCHEDULE_DATE=$(date +%Y-%m-%d)

    BEFORE_INV=$(curl -s "$API_BASE_URL/inventory" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id) | .quantity')
    print_info "确认排产前牛肉库存: $BEFORE_INV kg"

    SCHEDULE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/production-schedules" \
        -H "Content-Type: application/json" \
        -d "{
            \"storeOrderId\": \"$ORDER_ID\",
            \"scheduleNo\": \"$SCHEDULE_NO\",
            \"scheduleDate\": \"$SCHEDULE_DATE\",
            \"items\": [
                { \"dishId\": \"$DUMPLING_ID\", \"plannedQuantity\": $ORDER_QTY_DUMPLING },
                { \"dishId\": \"$NOODLE_ID\", \"plannedQuantity\": $ORDER_QTY_NOODLE }
            ],
            \"checkedBy\": \"acceptance_test\"
        }")

    SCHEDULE_ID=$(echo "$SCHEDULE_RESPONSE" | jq -r '.id')

    if [ "$SCHEDULE_ID" != "null" ] && [ -n "$SCHEDULE_ID" ]; then
        print_success "排产计划创建成功 (ID: $SCHEDULE_ID, 编号: $SCHEDULE_NO)"

        REUSE_IN_RESULT=$(echo "$SCHEDULE_RESPONSE" | jq -r '.recipeReuseCheck.hasReusedRecipes')
        if [ "$REUSE_IN_RESULT" = "true" ]; then
            print_success "✓ 排产创建结果包含配方复用检查信息"
        else
            print_error "✗ 排产创建结果缺少配方复用检查信息"
            TEST_PASSED=false
        fi
    else
        print_error "排产计划创建失败"
        echo "响应: $SCHEDULE_RESPONSE"
        exit 1
    fi

    echo ""
    print_step "步骤6：尝试确认排产（预期因缺料被拒绝）"
    echo ""
    print_info "调用排产确认接口，预期返回 400 错误和原料不足信息..."
    echo ""

    CONFIRM_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE_URL/production-schedules/$SCHEDULE_ID/confirm" \
        -H "Content-Type: application/json")

    HTTP_BODY=$(echo "$CONFIRM_RESPONSE" | sed -e 's/HTTP_STATUS:.*//g')
    HTTP_CODE=$(echo "$CONFIRM_RESPONSE" | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)

    AFTER_INV=$(curl -s "$API_BASE_URL/inventory" | jq -r --arg id "$BEEF_ID" '.[] | select(.rawMaterialId == $id) | .quantity')
    print_info "确认排产后牛肉库存: $AFTER_INV kg"

    echo ""
    echo "HTTP 状态码: $HTTP_CODE"
    echo "响应内容:"
    echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"

    echo ""
    print_step "步骤7：验证缺料阻止逻辑"
    echo ""

    if [ "$HTTP_CODE" = "400" ]; then
        print_success "✓ 正确返回 HTTP 400 状态码（排产被拒绝）"
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
    print_step "步骤8：再次查询时间线，确认复用记录已持久化"
    echo ""

    TIMELINE_RESPONSE2=$(curl -s "$API_BASE_URL/recipe-reuse-check/$ORDER_ID/timeline")
    EVENT_COUNT2=$(echo "$TIMELINE_RESPONSE2" | jq -r '.data | length')

    if [ "$EVENT_COUNT2" = "$EVENT_COUNT" ]; then
        print_success "✓ 时间线记录已正确持久化，共 $EVENT_COUNT2 条"
    else
        print_error "✗ 时间线记录数量不一致，创建前: $EVENT_COUNT, 创建后: $EVENT_COUNT2"
        TEST_PASSED=false
    fi

    echo ""
    print_header "测试总结"

    echo ""
    echo "测试订单号: $ORDER_NO"
    echo "排产编号: $SCHEDULE_NO"
    echo "处理人: acceptance_test"
    echo ""

    if [ "$TEST_PASSED" = true ]; then
        print_success "════════════════════════════════════════════"
        print_success "  所有验收测试通过！"
        print_success "════════════════════════════════════════════"
        echo ""
        print_info "已验证的业务规则："
        print_info "1. ✓ 门店订单进入排产前，自动执行配方复用检查"
        print_info "2. ✓ 正确识别沿用旧配方的菜品（猪肉白菜饺子、牛肉面）"
        print_info "3. ✓ 正确计算新配方额外占用的原料数量"
        print_info "4. ✓ 检查结果和处理人已写入数据库"
        print_info "5. ✓ 配方复用时可查看完整时间线和历史来源"
        print_info "6. ✓ 可点击查看具体菜品的历史来源详情"
        print_info "7. ✓ 原料不足时，排产确认被正确拒绝（HTTP 400）"
        print_info "8. ✓ 排产拒绝时，返回具体的原料不足信息"
        print_info "9. ✓ 排产拒绝时，原料库存不发生扣减"
        print_info "10. ✓ 配方复用检查记录已持久化，可随时查询"
        echo ""
        return 0
    else
        print_error "════════════════════════════════════════════"
        print_error "  部分测试未通过，请检查相关逻辑"
        print_error "════════════════════════════════════════════"
        echo ""
        return 1
    fi
}

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║     中央厨房排产系统 - 配方复用检查验收测试脚本                  ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    print_info "API Base URL: $API_BASE_URL"
    echo ""

    check_api_health
    setup_test_data
    test_recipe_reuse_scenario

    local exit_code=$?
    echo ""
    if [ $exit_code -eq 0 ]; then
        print_success "验收脚本执行完成，所有验证通过！"
        exit 0
    else
        print_error "验收脚本执行完成，但存在验证失败。"
        exit 1
    fi
}

main "$@"

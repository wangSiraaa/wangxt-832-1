import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Tag, Modal, Form, InputNumber,
  DatePicker, message, Alert, List, Progress, Typography,
  Timeline, Descriptions, Tooltip, Empty
} from 'antd'
import {
  PlayCircleOutlined, CheckCircleOutlined, EyeOutlined,
  ExclamationCircleOutlined, ReloadOutlined,
  WarningOutlined, HistoryOutlined, ClockCircleOutlined,
  RiseOutlined, InfoCircleOutlined
} from '@ant-design/icons'
import {
  storeOrderApi, productionScheduleApi, dishApi, recipeReuseCheckApi
} from '../api'
import dayjs from 'dayjs'

const { Title, Text, Paragraph } = Typography

function ProductionSchedule() {
  const [schedules, setSchedules] = useState([])
  const [orders, setOrders] = useState([])
  const [dishes, setDishes] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [checkModalVisible, setCheckModalVisible] = useState(false)
  const [reuseCheckModalVisible, setReuseCheckModalVisible] = useState(false)
  const [timelineModalVisible, setTimelineModalVisible] = useState(false)
  const [historicalModalVisible, setHistoricalModalVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedDish, setSelectedDish] = useState(null)
  const [scheduleItems, setScheduleItems] = useState([])
  const [materialCheckResult, setMaterialCheckResult] = useState(null)
  const [reuseCheckResult, setReuseCheckResult] = useState(null)
  const [timelineData, setTimelineData] = useState([])
  const [historicalData, setHistoricalData] = useState(null)
  const [scheduleDate, setScheduleDate] = useState(dayjs())
  const [confirming, setConfirming] = useState(false)
  const [showReuseWarning, setShowReuseWarning] = useState(false)
  const [checkedBy, setCheckedBy] = useState('operator')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [scheduleList, orderList, dishList] = await Promise.all([
        productionScheduleApi.getAll(),
        storeOrderApi.getAll({ status: 'SUBMITTED' }),
        dishApi.getAll()
      ])
      setSchedules(scheduleList)
      setOrders(orderList)
      setDishes(dishList)
    } catch (e) {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSchedule = async (order) => {
    setSelectedOrder(order)
    const items = order.items.map(item => ({
      dishId: item.dishId,
      dishCode: item.dish.code,
      dishName: item.dish.name,
      plannedQuantity: item.quantity,
      maxQuantity: item.quantity
    }))
    setScheduleItems(items)
    setScheduleDate(dayjs())
    setShowReuseWarning(false)
    setReuseCheckResult(null)

    try {
      setLoading(true)
      const result = await recipeReuseCheckApi.check(order.id, checkedBy)
      if (result.success && result.data.hasReusedRecipes) {
        setReuseCheckResult(result.data)
        setShowReuseWarning(true)
      }
    } catch (e) {
      console.warn('配方复用检查失败:', e)
    } finally {
      setLoading(false)
    }

    setCreateModalVisible(true)
  }

  const handleViewTimeline = async () => {
    if (!selectedOrder) return
    try {
      setLoading(true)
      const result = await recipeReuseCheckApi.getTimeline(selectedOrder.id)
      if (result.success) {
        setTimelineData(result.data)
        setTimelineModalVisible(true)
      }
    } catch (e) {
      message.error('获取时间线失败')
    } finally {
      setLoading(false)
    }
  }

  const handleViewHistorical = async (dishId, dishName) => {
    if (!selectedOrder) return
    try {
      setLoading(true)
      setSelectedDish({ id: dishId, name: dishName })
      const result = await recipeReuseCheckApi.getHistorical(selectedOrder.id, dishId)
      if (result.success) {
        setHistoricalData(result.data)
        setHistoricalModalVisible(true)
      }
    } catch (e) {
      message.error('获取历史来源失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckMaterials = async () => {
    if (!selectedOrder || scheduleItems.length === 0) return

    try {
      setLoading(true)
      const result = await productionScheduleApi.checkMaterials({
        storeOrderId: selectedOrder.id,
        items: scheduleItems.map(item => ({
          dishId: item.dishId,
          plannedQuantity: item.plannedQuantity
        }))
      })
      setMaterialCheckResult(result)
      setCheckModalVisible(true)
    } catch (e) {
      message.error(e.message || '原料校验失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAndCheck = async () => {
    if (!selectedOrder || scheduleItems.length === 0) return

    try {
      setLoading(true)
      const materialResult = await productionScheduleApi.checkMaterials({
        storeOrderId: selectedOrder.id,
        items: scheduleItems.map(item => ({
          dishId: item.dishId,
          plannedQuantity: item.plannedQuantity
        }))
      })
      setMaterialCheckResult(materialResult)

      const scheduleNo = `SCH${Date.now()}`
      const createResult = await productionScheduleApi.create({
        storeOrderId: selectedOrder.id,
        scheduleNo,
        scheduleDate: scheduleDate.format('YYYY-MM-DD'),
        items: scheduleItems.map(item => ({
          dishId: item.dishId,
          plannedQuantity: item.plannedQuantity
        })),
        checkedBy
      })

      if (createResult.recipeReuseCheck?.hasReusedRecipes) {
        setReuseCheckResult(createResult.recipeReuseCheck)
        setReuseCheckModalVisible(true)
      } else {
        message.success('排产创建成功，原料校验完成')
      }

      setCreateModalVisible(false)
      loadData()
    } catch (e) {
      message.error(e.message || '创建排产失败')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmSchedule = async (schedule) => {
    Modal.confirm({
      title: '确认排产',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确认后将扣减原料库存，是否继续？</p>
          {schedule.materialChecks.some(m => !m.isSufficient) && (
            <Alert
              type="error"
              showIcon
              message="原料不足"
              description="存在原料不足，将无法确认排产！"
              style={{ marginTop: 12 }}
            />
          )}
        </div>
      ),
      onOk: async () => {
        try {
          setConfirming(true)
          await productionScheduleApi.confirm(schedule.id)
          message.success('排产确认成功，库存已扣减！')
          loadData()
        } catch (e) {
          if (e.code === 'INSUFFICIENT_MATERIALS') {
            Modal.error({
              title: '排产确认失败',
              content: (
                <div>
                  <p><b>原料不足，无法确认排产！</b></p>
                  <List
                    dataSource={e.insufficientMaterials}
                    renderItem={item => (
                      <List.Item>
                        <List.Item.Meta
                          title={item.name}
                          description={`${item.code} - 需求: ${item.required.toFixed(2)} ${item.unit}, 现有: ${item.available.toFixed(2)} ${item.unit}, 缺口: ${item.shortage.toFixed(2)} ${item.unit}`}
                        />
                      </List.Item>
                    )}
                  />
                </div>
              ),
              okText: '知道了'
            })
          } else {
            message.error(e.message || '确认失败')
          }
        } finally {
          setConfirming(false)
        }
      }
    })
  }

  const handleQuantityChange = (dishId, value) => {
    setScheduleItems(scheduleItems.map(item =>
      item.dishId === dishId ? { ...item, plannedQuantity: value } : item
    ))
  }

  const getStatusTag = (status) => {
    const map = {
      PENDING: { color: 'default', text: '待处理' },
      MATERIAL_CHECKED: { color: 'purple', text: '原料已校验' },
      CONFIRMED: { color: 'cyan', text: '已确认排产' },
      PRODUCTION: { color: 'orange', text: '生产中' },
      QUALITY_CHECKED: { color: 'green', text: '品控通过' },
      DELIVERED: { color: 'success', text: '已配送' }
    }
    const info = map[status] || { color: 'default', text: status }
    return <Tag color={info.color}>{info.text}</Tag>
  }

  const columns = [
    { title: '排产编号', dataIndex: 'scheduleNo', key: 'scheduleNo' },
    { title: '关联订单', dataIndex: ['storeOrder', 'orderNo'], key: 'orderNo' },
    { title: '门店', dataIndex: ['storeOrder', 'store', 'name'], key: 'store' },
    {
      title: '排产项数',
      key: 'items',
      render: (_, r) => r.items?.length || 0
    },
    {
      title: '原料状态',
      key: 'materialStatus',
      render: (_, record) => {
        if (!record.materialChecks || record.materialChecks.length === 0) {
          return <Tag color="default">未校验</Tag>
        }
        const allSufficient = record.materialChecks.every(m => m.isSufficient)
        return allSufficient
          ? <Tag color="green">原料充足</Tag>
          : <Tag color="red">原料不足</Tag>
      }
    },
    { title: '状态', dataIndex: 'status', key: 'status', render: getStatusTag },
    { title: '排产日期', dataIndex: 'scheduleDate', key: 'scheduleDate', render: d => dayjs(d).format('YYYY-MM-DD') },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />}>查看</Button>
          {(record.status === 'MATERIAL_CHECKED' || record.status === 'PENDING') && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleConfirmSchedule(record)}
              loading={confirming}
            >
              确认排产
            </Button>
          )}
        </Space>
      )
    }
  ]

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'DISH_REUSED': return <WarningOutlined style={{ color: '#faad14' }} />
      case 'MATERIAL_IMPACT': return <RiseOutlined style={{ color: '#fa8c16' }} />
      case 'HISTORICAL_SOURCE': return <HistoryOutlined style={{ color: '#1890ff' }} />
      default: return <ClockCircleOutlined />
    }
  }

  const getEventColor = (eventType) => {
    switch (eventType) {
      case 'DISH_REUSED': return 'gold'
      case 'MATERIAL_IMPACT': return 'orange'
      case 'HISTORICAL_SOURCE': return 'blue'
      default: return 'gray'
    }
  }

  const orderColumns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo' },
    { title: '门店', dataIndex: ['store', 'name'], key: 'store' },
    { title: '订单项数', key: 'items', render: (_, r) => r.items?.length || 0 },
    { title: '总数量', key: 'total', render: (_, r) => r.items?.reduce((s, i) => s + i.quantity, 0) || 0 },
    { title: '日期', dataIndex: 'orderDate', key: 'orderDate', render: d => dayjs(d).format('YYYY-MM-DD') },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleCreateSchedule(record)}
          >
            创建排产
          </Button>
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={async () => {
              setSelectedOrder(record)
              await handleViewTimeline()
            }}
          >
            时间线
          </Button>
        </Space>
      )
    }
  ]

  const itemColumns = [
    { title: '菜品编码', dataIndex: 'dishCode', key: 'code' },
    { title: '菜品名称', dataIndex: 'dishName', key: 'name' },
    {
      title: '计划生产数量',
      key: 'planned',
      render: (_, record) => (
        <InputNumber
          min={1}
          max={record.maxQuantity}
          value={record.plannedQuantity}
          onChange={(v) => handleQuantityChange(record.dishId, v)}
        />
      )
    }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="待排产订单"
        className="card-container"
        loading={loading}
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        }
      >
        <Table
          columns={orderColumns}
          dataSource={orders}
          rowKey="id"
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: '暂无待排产订单' }}
        />
      </Card>

      <Card title="排产计划列表" className="card-container" loading={loading}>
        <Table
          columns={columns}
          dataSource={schedules}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无排产计划' }}
        />
      </Card>

      <Modal
        title="创建排产计划"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={handleCreateAndCheck}
        okText="创建并校验原料"
        cancelText="取消"
        width={800}
        confirmLoading={loading}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {showReuseWarning && reuseCheckResult && (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="检测到配方复用"
              description={
                <div>
                  <Paragraph style={{ marginBottom: 8 }}>
                    以下菜品沿用了历史配方，新配方将增加部分原料的消耗：
                  </Paragraph>
                  <List
                    size="small"
                    dataSource={reuseCheckResult.reusedDishes || []}
                    renderItem={dish => (
                      <List.Item
                        actions={[
                          <Button
                            type="link"
                            size="small"
                            icon={<HistoryOutlined />}
                            onClick={() => handleViewHistorical(dish.dishId, dish.dishName)}
                          >
                            查看历史来源
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              {dish.dishName}
                              <Tag color="gold">v{dish.oldVersion} → v{dish.newVersion}</Tag>
                              <Tag color="blue">数量: {dish.quantity}</Tag>
                            </Space>
                          }
                          description={
                            dish.totalExtraUsage?.length > 0 && (
                              <Space size="small" wrap>
                                {dish.totalExtraUsage.map((u, idx) => (
                                  <Tag key={idx} color="orange">
                                    {u.rawMaterialName}: +{u.extraTotal.toFixed(2)} {u.unit}
                                  </Tag>
                                ))}
                              </Space>
                            )
                          }
                        />
                      </List.Item>
                    )}
                  />
                  {reuseCheckResult.materialImpact?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <Text strong type="warning">
                        <RiseOutlined /> 原料额外消耗汇总：
                      </Text>
                      <List
                        size="small"
                        style={{ marginTop: 8 }}
                        dataSource={reuseCheckResult.materialImpact}
                        renderItem={mat => (
                          <List.Item>
                            <List.Item.Meta
                              title={mat.rawMaterialName}
                              description={
                                <Space>
                                  <span>额外消耗: <b style={{ color: '#fa8c16' }}>+{mat.extraTotal.toFixed(2)} {mat.unit}</b></span>
                                  <span>影响菜品: {mat.affectedDishes?.map(d => d.dishName).join(', ')}</span>
                                </Space>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Button
                      size="small"
                      icon={<ClockCircleOutlined />}
                      onClick={handleViewTimeline}
                    >
                      查看完整时间线
                    </Button>
                  </div>
                </div>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <div>
            <Text strong>订单信息</Text>
            <p style={{ margin: '8px 0' }}>
              订单号: {selectedOrder?.orderNo} | 门店: {selectedOrder?.store?.name} | 处理人: {checkedBy}
            </p>
          </div>

          <div>
            <Text strong>排产日期</Text>
            <DatePicker
              style={{ width: '100%', marginTop: 8 }}
              value={scheduleDate}
              onChange={setScheduleDate}
            />
          </div>

          <div>
            <Text strong>生产计划</Text>
            <Table
              style={{ marginTop: 8 }}
              columns={itemColumns}
              dataSource={scheduleItems}
              rowKey="dishId"
              pagination={false}
              size="small"
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="原料校验结果"
        open={checkModalVisible}
        onCancel={() => setCheckModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setCheckModalVisible(false)}>关闭</Button>
        ]}
        width={600}
      >
        {materialCheckResult && (
          <div>
            <Alert
              type={materialCheckResult.allSufficient ? 'success' : 'error'}
              showIcon
              message={materialCheckResult.allSufficient ? '原料充足，可以排产' : '原料不足，无法排产'}
              style={{ marginBottom: 16 }}
            />
            <Title level={5}>原料明细</Title>
            <List
              dataSource={materialCheckResult.materialChecks}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        {item.rawMaterialName}
                        {item.isSufficient
                          ? <Tag color="green">充足</Tag>
                          : <Tag color="red">不足</Tag>
                        }
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <span>需求: {item.requiredQuantity.toFixed(2)} {item.unit} | 现有: {item.availableQuantity.toFixed(2)} {item.unit}</span>
                        {!item.isSufficient && (
                          <Progress
                            percent={item.availableQuantity > 0 ? Math.min(100, (item.availableQuantity / item.requiredQuantity) * 100) : 0}
                            status="exception"
                            size="small"
                          />
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>

      <Modal
        title="配方复用检查结果"
        open={reuseCheckModalVisible}
        onCancel={() => setReuseCheckModalVisible(false)}
        width={700}
        footer={[
          <Button key="timeline" icon={<ClockCircleOutlined />} onClick={handleViewTimeline}>
            查看时间线
          </Button>,
          <Button key="close" type="primary" onClick={() => {
            setReuseCheckModalVisible(false)
            message.success('排产创建成功，已记录配方复用检查结果')
          }}>
            确定
          </Button>
        ]}
      >
        {reuseCheckResult && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="已检测到配方复用"
              description={`本次排产涉及 ${reuseCheckResult.reusedDishes?.length || 0} 个沿用历史配方的菜品，新配方将额外消耗部分原料。`}
            />

            <Title level={5}>沿用旧配方的菜品</Title>
            <List
              dataSource={reuseCheckResult.reusedDishes || []}
              renderItem={dish => (
                <List.Item
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      icon={<HistoryOutlined />}
                      onClick={() => handleViewHistorical(dish.dishId, dish.dishName)}
                    >
                      查看历史来源
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {dish.dishName}
                        <Tag color="gold">v{dish.oldVersion} → v{dish.newVersion}</Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <p>数量: {dish.quantity}</p>
                        {dish.totalExtraUsage?.length > 0 && (
                          <Space wrap>
                            {dish.totalExtraUsage.map((u, idx) => (
                              <Tag key={idx} color={u.isIncrease ? 'orange' : 'green'}>
                                {u.rawMaterialName}: {u.isIncrease ? '+' : ''}{u.difference.toFixed(3)}/份 = {u.extraTotal.toFixed(2)} {u.unit}
                              </Tag>
                            ))}
                          </Space>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />

            {reuseCheckResult.materialImpact?.length > 0 && (
              <>
                <Title level={5}>新配方额外占用原料</Title>
                <List
                  dataSource={reuseCheckResult.materialImpact}
                  renderItem={mat => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            {mat.rawMaterialName}
                            <Tag color="orange">
                              +{mat.extraTotal.toFixed(2)} {mat.unit}
                            </Tag>
                          </Space>
                        }
                        description={
                          <span>
                            影响菜品: {mat.affectedDishes?.map(d => d.dishName).join(', ')}
                          </span>
                        }
                      />
                    </List.Item>
                  )}
                />
              </>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="配方复用时间线"
        open={timelineModalVisible}
        onCancel={() => setTimelineModalVisible(false)}
        width={650}
        footer={[
          <Button key="close" onClick={() => setTimelineModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        <Timeline
          mode="left"
          items={timelineData.map(event => ({
            color: getEventColor(event.eventType),
            dot: getEventIcon(event.eventType),
            children: (
              <div>
                <Space>
                  <Tag color={getEventColor(event.eventType)}>
                    {event.eventType === 'DISH_REUSED' ? '配方复用' :
                     event.eventType === 'MATERIAL_IMPACT' ? '原料影响' :
                     event.eventType === 'HISTORICAL_SOURCE' ? '历史来源' : event.eventType}
                  </Tag>
                  {event.dishName && <Text strong>{event.dishName}</Text>}
                  {event.materialName && <Text strong>{event.materialName}</Text>}
                </Space>
                <p style={{ marginTop: 4, marginBottom: 0 }}>{event.remark}</p>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(event.happenedAt).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
              </div>
            )
          }))}
        />
        {timelineData.length === 0 && (
          <Empty description="暂无时间线记录" />
        )}
      </Modal>

      <Modal
        title={`历史来源 - ${selectedDish?.name || ''}`}
        open={historicalModalVisible}
        onCancel={() => setHistoricalModalVisible(false)}
        width={750}
        footer={[
          <Button key="close" onClick={() => setHistoricalModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {historicalData && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions title="配方版本对比" size="small" bordered column={1}>
              <Descriptions.Item label="菜品">
                {historicalData.dish?.name} ({historicalData.dish?.code})
              </Descriptions.Item>
              <Descriptions.Item label="当前版本">
                v{historicalData.dish?.currentRecipeVersion}
              </Descriptions.Item>
            </Descriptions>

            {historicalData.materialDiff?.length > 0 && (
              <>
                <Title level={5}>配方差异</Title>
                <Table
                  size="small"
                  dataSource={historicalData.materialDiff}
                  rowKey="rawMaterialId"
                  pagination={false}
                  columns={[
                    { title: '原料', dataIndex: 'rawMaterialName', key: 'name' },
                    { title: '旧配方用量', dataIndex: 'oldQuantity', key: 'old', render: v => `${v.toFixed(3)}/${historicalData.dish?.name}` },
                    { title: '新配方用量', dataIndex: 'newQuantity', key: 'new', render: v => `${v.toFixed(3)}/${historicalData.dish?.name}` },
                    { title: '差异', dataIndex: 'difference', key: 'diff', render: (v, r) => (
                      <Tag color={r.isIncrease ? 'orange' : 'green'}>
                        {r.isIncrease ? '+' : ''}{v.toFixed(3)}
                      </Tag>
                    )}
                  ]}
                />
              </>
            )}

            {historicalData.historicalUsage?.length > 0 && (
              <>
                <Title level={5}>历史排产记录</Title>
                <Table
                  size="small"
                  dataSource={historicalData.historicalUsage}
                  rowKey="scheduleId"
                  pagination={false}
                  columns={[
                    { title: '订单号', dataIndex: 'orderNo', key: 'order' },
                    { title: '排产编号', dataIndex: 'scheduleNo', key: 'schedule' },
                    { title: '排产日期', dataIndex: 'scheduleDate', key: 'date', render: d => dayjs(d).format('YYYY-MM-DD') },
                    { title: '数量', dataIndex: 'quantity', key: 'qty' },
                    { title: '状态', dataIndex: 'status', key: 'status', render: s => <Tag>{s}</Tag> }
                  ]}
                />
              </>
            )}

            {historicalData.historicalUsage?.length === 0 && (
              <Empty description="暂无历史排产记录" />
            )}
          </Space>
        )}
      </Modal>
    </Space>
  )
}

export default ProductionSchedule

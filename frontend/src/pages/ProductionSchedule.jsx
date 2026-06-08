import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Tag, Modal, Form, InputNumber,
  DatePicker, message, Alert, List, Progress, Typography
} from 'antd'
import {
  PlayCircleOutlined, CheckCircleOutlined, EyeOutlined,
  ExclamationCircleOutlined, ReloadOutlined
} from '@ant-design/icons'
import {
  storeOrderApi, productionScheduleApi, dishApi
} from '../api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

function ProductionSchedule() {
  const [schedules, setSchedules] = useState([])
  const [orders, setOrders] = useState([])
  const [dishes, setDishes] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [checkModalVisible, setCheckModalVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [scheduleItems, setScheduleItems] = useState([])
  const [materialCheckResult, setMaterialCheckResult] = useState(null)
  const [scheduleDate, setScheduleDate] = useState(dayjs())
  const [confirming, setConfirming] = useState(false)

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
    setCreateModalVisible(true)
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
      const result = await productionScheduleApi.checkMaterials({
        storeOrderId: selectedOrder.id,
        items: scheduleItems.map(item => ({
          dishId: item.dishId,
          plannedQuantity: item.plannedQuantity
        }))
      })
      setMaterialCheckResult(result)

      const scheduleNo = `SCH${Date.now()}`
      await productionScheduleApi.create({
        storeOrderId: selectedOrder.id,
        scheduleNo,
        scheduleDate: scheduleDate.format('YYYY-MM-DD'),
        items: scheduleItems.map(item => ({
          dishId: item.dishId,
          plannedQuantity: item.plannedQuantity
        }))
      })

      message.success('排产创建成功，原料校验完成')
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
        <Button
          type="primary"
          size="small"
          icon={<PlayCircleOutlined />}
          onClick={() => handleCreateSchedule(record)}
        >
          创建排产
        </Button>
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
        width={700}
        confirmLoading={loading}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>订单信息</Text>
            <p style={{ margin: '8px 0' }}>
              订单号: {selectedOrder?.orderNo} | 门店: {selectedOrder?.store?.name}
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
    </Space>
  )
}

export default ProductionSchedule

import React, { useState, useEffect } from 'react'
import { Card, Table, Statistic, Row, Col, Tag, Space } from 'antd'
import { ShoppingCartOutlined, ScheduleOutlined, CheckCircleOutlined, TruckOutlined, AlertOutlined } from '@ant-design/icons'
import { storeOrderApi, productionScheduleApi, alertApi } from '../api'
import dayjs from 'dayjs'

function Dashboard() {
  const [stats, setStats] = useState({
    orders: 0,
    pendingSchedules: 0,
    completed: 0,
    delivered: 0,
    alerts: 0
  })
  const [recentOrders, setRecentOrders] = useState([])
  const [recentSchedules, setRecentSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [orders, schedules, alerts] = await Promise.all([
        storeOrderApi.getAll(),
        productionScheduleApi.getAll(),
        alertApi.getInventoryAlerts(10)
      ])

      setStats({
        orders: orders.length,
        pendingSchedules: schedules.filter(s => s.status === 'MATERIAL_CHECKED' || s.status === 'PENDING').length,
        completed: schedules.filter(s => s.status === 'CONFIRMED' || s.status === 'QUALITY_CHECKED').length,
        delivered: schedules.filter(s => s.status === 'DELIVERED').length,
        alerts: alerts.totalAlerts || 0
      })

      setRecentOrders(orders.slice(0, 5))
      setRecentSchedules(schedules.slice(0, 5))
    } catch (e) {
      console.error('加载仪表盘数据失败', e)
    } finally {
      setLoading(false)
    }
  }

  const getStatusTag = (status) => {
    const statusMap = {
      SUBMITTED: { color: 'blue', text: '已提交' },
      PRODUCTION: { color: 'orange', text: '生产中' },
      DELIVERED: { color: 'green', text: '已配送' },
      PENDING: { color: 'default', text: '待处理' },
      MATERIAL_CHECKED: { color: 'purple', text: '原料已校验' },
      CONFIRMED: { color: 'cyan', text: '已确认排产' },
      QUALITY_CHECKED: { color: 'green', text: '品控通过' },
      QUALITY_FAILED: { color: 'red', text: '品控未通过' }
    }
    const info = statusMap[status] || { color: 'default', text: status }
    return <Tag color={info.color}>{info.text}</Tag>
  }

  const orderColumns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo' },
    { title: '门店', dataIndex: ['store', 'name'], key: 'store' },
    { title: '订单项数', key: 'items', render: (_, r) => r.items?.length || 0 },
    { title: '状态', dataIndex: 'status', key: 'status', render: getStatusTag },
    { title: '日期', dataIndex: 'orderDate', key: 'orderDate', render: d => dayjs(d).format('YYYY-MM-DD') }
  ]

  const scheduleColumns = [
    { title: '排产编号', dataIndex: 'scheduleNo', key: 'scheduleNo' },
    { title: '关联订单', dataIndex: ['storeOrder', 'orderNo'], key: 'orderNo' },
    { title: '门店', dataIndex: ['storeOrder', 'store', 'name'], key: 'store' },
    { title: '状态', dataIndex: 'status', key: 'status', render: getStatusTag },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: d => dayjs(d).format('MM-DD HH:mm') }
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={4.8}>
          <Card>
            <Statistic title="订单总数" value={stats.orders} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col span={4.8}>
          <Card>
            <Statistic title="待排产" value={stats.pendingSchedules} prefix={<ScheduleOutlined />} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={4.8}>
          <Card>
            <Statistic title="生产中" value={stats.completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={4.8}>
          <Card>
            <Statistic title="已配送" value={stats.delivered} prefix={<TruckOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4.8}>
          <Card>
            <Statistic title="库存预警" value={stats.alerts} prefix={<AlertOutlined />} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="最近订单" loading={loading}>
            <Table
              columns={orderColumns}
              dataSource={recentOrders}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近排产" loading={loading}>
            <Table
              columns={scheduleColumns}
              dataSource={recentSchedules}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard

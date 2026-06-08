import React, { useState, useEffect } from 'react'
import { Card, Table, DatePicker, Button, Space, Tag, message, Progress } from 'antd'
import { ReloadOutlined, FileTextOutlined } from '@ant-design/icons'
import { orderSummaryApi, inventoryApi } from '../api'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

function OrderSummary() {
  const [dateRange, setDateRange] = useState(null)
  const [summary, setSummary] = useState(null)
  const [materialRequirements, setMaterialRequirements] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const params = {}
      if (dateRange && dateRange.length === 2) {
        params.startDate = dateRange[0].format('YYYY-MM-DD')
        params.endDate = dateRange[1].format('YYYY-MM-DD')
      }
      const [summaryData, materialData] = await Promise.all([
        orderSummaryApi.getSummary(params),
        orderSummaryApi.getMaterialRequirements(params)
      ])
      setSummary(summaryData)
      setMaterialRequirements(materialData)
    } catch (e) {
      message.error('加载汇总数据失败')
    } finally {
      setLoading(false)
    }
  }

  const dishColumns = [
    { title: '菜品编码', dataIndex: 'dishCode', key: 'dishCode' },
    { title: '菜品名称', dataIndex: 'dishName', key: 'dishName' },
    { title: '总需求量', dataIndex: 'totalQuantity', key: 'totalQuantity', render: v => <b>{v}</b> },
    { title: '涉及门店数', dataIndex: 'orderCount', key: 'orderCount' },
    {
      title: '各门店需求',
      key: 'stores',
      render: (_, record) => (
        <Space size={[8, 8]} wrap>
          {record.stores.map((s, i) => (
            <Tag key={i} color="blue">{s.storeName}: {s.quantity}</Tag>
          ))}
        </Space>
      )
    }
  ]

  const materialColumns = [
    { title: '原料编码', dataIndex: 'rawMaterialCode', key: 'code' },
    { title: '原料名称', dataIndex: 'rawMaterialName', key: 'name' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '需用量',
      dataIndex: 'requiredQuantity',
      key: 'required',
      render: v => <b>{v.toFixed(2)}</b>
    },
    {
      title: '库存量',
      dataIndex: 'availableQuantity',
      key: 'available',
      render: v => <b>{v.toFixed(2)}</b>
    },
    {
      title: '充足情况',
      key: 'status',
      render: (_, record) => {
        const percent = record.availableQuantity > 0
          ? Math.min(100, (record.availableQuantity / record.requiredQuantity) * 100)
          : 0
        return (
          <Space direction="vertical" size="small" style={{ width: 200 }}>
            <Progress
              percent={percent}
              status={record.isSufficient ? 'success' : 'exception'}
              size="small"
            />
            <span className={record.isSufficient ? 'sufficient' : 'insufficient'}>
              {record.isSufficient ? '✓ 充足' : `✗ 缺料 ${record.shortage.toFixed(2)} ${record.unit}`}
            </span>
          </Space>
        )
      }
    }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="card-container" extra={
        <Space>
          <RangePicker value={dateRange} onChange={setDateRange} />
          <Button type="primary" icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
        </Space>
      }>
        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-value">{summary?.totalOrders || 0}</div>
            <div className="stat-label">订单总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary?.totalDishes || 0}</div>
            <div className="stat-label">菜品种类</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#f5222d' }}>
              {materialRequirements.filter(m => !m.isSufficient).length}
            </div>
            <div className="stat-label">原料不足</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#52c41a' }}>
              {materialRequirements.filter(m => m.isSufficient).length}
            </div>
            <div className="stat-label">原料充足</div>
          </div>
        </div>
      </Card>

      <Card title={<><FileTextOutlined /> 菜品需求汇总</>} className="card-container" loading={loading}>
        <Table
          columns={dishColumns}
          dataSource={summary?.dishSummary || []}
          rowKey="dishId"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Card title={<><FileTextOutlined /> 原料需求计算</>} className="card-container" loading={loading}>
        <Table
          columns={materialColumns}
          dataSource={materialRequirements}
          rowKey="rawMaterialId"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </Space>
  )
}

export default OrderSummary

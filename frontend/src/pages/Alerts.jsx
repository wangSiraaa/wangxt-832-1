import React, { useState, useEffect } from 'react'
import { Card, Table, Space, Tag, Button, Alert, message } from 'antd'
import { AlertOutlined, ReloadOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { alertApi } from '../api'

function Alerts() {
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(10)

  useEffect(() => {
    loadData()
  }, [threshold])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await alertApi.getInventoryAlerts(threshold)
      setAlerts(data)
    } catch (e) {
      message.error('加载预警数据失败')
    } finally {
      setLoading(false)
    }
  }

  const lowStockColumns = [
    { title: '原料编码', dataIndex: 'rawMaterialCode', key: 'code' },
    { title: '原料名称', dataIndex: 'rawMaterialName', key: 'name' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '当前库存',
      dataIndex: 'currentQuantity',
      key: 'current',
      render: v => <b style={{ color: '#f5222d' }}>{v.toFixed(2)}</b>
    },
    {
      title: '预警阈值',
      dataIndex: 'threshold',
      key: 'threshold'
    },
    {
      title: '状态',
      key: 'status',
      render: () => <Tag color="red"><WarningOutlined /> 库存不足</Tag>
    }
  ]

  const shortageColumns = [
    { title: '排产编号', dataIndex: 'scheduleNo', key: 'scheduleNo' },
    { title: '原料名称', dataIndex: 'rawMaterialName', key: 'name' },
    {
      title: '需用量',
      dataIndex: 'required',
      key: 'required',
      render: v => v.toFixed(2)
    },
    {
      title: '库存量',
      dataIndex: 'available',
      key: 'available',
      render: v => v.toFixed(2)
    },
    {
      title: '缺口',
      dataIndex: 'shortage',
      key: 'shortage',
      render: v => <b style={{ color: '#f5222d' }}>{v.toFixed(2)}</b>
    },
    {
      title: '状态',
      key: 'status',
      render: () => <Tag color="red"><ExclamationCircleOutlined /> 缺料</Tag>
    }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={<><AlertOutlined /> 库存预警总览</>}
        className="card-container"
        loading={loading}
        extra={
          <Space>
            <span>预警阈值:</span>
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ padding: '4px 8px' }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          </Space>
        }
      >
        <Alert
          type={alerts?.totalAlerts > 0 ? 'warning' : 'success'}
          showIcon
          message={alerts?.totalAlerts > 0 ? `存在 ${alerts?.totalAlerts} 条预警信息，请及时处理` : '一切正常，无预警信息'}
          style={{ marginBottom: 16 }}
        />

        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#f5222d' }}>{alerts?.lowStock?.length || 0}</div>
            <div className="stat-label">低库存预警</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#fa8c16' }}>{alerts?.upcomingShortages?.length || 0}</div>
            <div className="stat-label">预计缺料</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#52c41a' }}>{alerts?.totalAlerts || 0}</div>
            <div className="stat-label">预警总数</div>
          </div>
        </div>
      </Card>

      <Card title={<><WarningOutlined style={{ color: '#f5222d' }} /> 低库存原料</>} className="card-container">
        <Table
          columns={lowStockColumns}
          dataSource={alerts?.lowStock || []}
          rowKey="rawMaterialId"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无低库存原料' }}
        />
      </Card>

      <Card title={<><ExclamationCircleOutlined style={{ color: '#fa8c16' }} /> 排产缺料预警</>} className="card-container">
        <Table
          columns={shortageColumns}
          dataSource={alerts?.upcomingShortages || []}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无排产缺料预警' }}
        />
      </Card>
    </Space>
  )
}

export default Alerts

import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, message } from 'antd'
import { TruckOutlined, ReloadOutlined } from '@ant-design/icons'
import { deliveryApi } from '../api'
import dayjs from 'dayjs'

function Delivery() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [deliverModalVisible, setDeliverModalVisible] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await deliveryApi.getAll()
      setSchedules(data)
    } catch (e) {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDeliver = (schedule) => {
    setSelectedSchedule(schedule)
    form.resetFields()
    setDeliverModalVisible(true)
  }

  const handleSubmitDeliver = async (values) => {
    try {
      setLoading(true)
      await deliveryApi.deliver(selectedSchedule.id, values)
      message.success('配送完成')
      setDeliverModalVisible(false)
      loadData()
    } catch (e) {
      message.error(e.message || '配送失败')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { title: '排产编号', dataIndex: 'scheduleNo', key: 'scheduleNo' },
    { title: '关联订单', dataIndex: ['storeOrder', 'orderNo'], key: 'orderNo' },
    { title: '门店', dataIndex: ['storeOrder', 'store', 'name'], key: 'store' },
    { title: '门店地址', dataIndex: ['storeOrder', 'store', 'address'], key: 'address' },
    {
      title: '配送项',
      key: 'items',
      render: (_, r) => r.items?.map(i => `${i.dish.name}×${i.plannedQuantity}`).join(', ')
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const map = {
          QUALITY_CHECKED: { color: 'green', text: '待配送' },
          DELIVERED: { color: 'success', text: '已配送' }
        }
        const info = map[status] || { color: 'default', text: status }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    { title: '品控时间', dataIndex: 'qualityCheckedAt', key: 'qualityCheckedAt', render: d => d ? dayjs(d).format('MM-DD HH:mm') : '-' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        record.status === 'QUALITY_CHECKED' ? (
          <Button type="primary" size="small" icon={<TruckOutlined />} onClick={() => handleDeliver(record)}>
            配送
          </Button>
        ) : null
      )
    }
  ]

  return (
    <Card
      title="配送管理"
      className="card-container"
      loading={loading}
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
      }
    >
      <Table
        columns={columns}
        dataSource={schedules}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="确认配送"
        open={deliverModalVisible}
        onCancel={() => setDeliverModalVisible(false)}
        footer={null}
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <p><b>排产编号:</b> {selectedSchedule?.scheduleNo}</p>
          <p><b>门店:</b> {selectedSchedule?.storeOrder?.store?.name}</p>
          <p><b>地址:</b> {selectedSchedule?.storeOrder?.store?.address}</p>
        </div>

        <Form form={form} layout="vertical" onFinish={handleSubmitDeliver}>
          <Form.Item name="deliveryPerson" label="配送人">
            <Input placeholder="请输入配送人姓名" />
          </Form.Item>
          <Form.Item name="vehicle" label="配送车辆">
            <Input placeholder="请输入配送车辆信息" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDeliverModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit" icon={<TruckOutlined />}>
                确认配送
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default Delivery

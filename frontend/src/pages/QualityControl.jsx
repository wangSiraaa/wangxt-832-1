import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, InputNumber, Input, Select, message, Alert } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { qualityControlApi } from '../api'
import dayjs from 'dayjs'

function QualityControl() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkModalVisible, setCheckModalVisible] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await qualityControlApi.getAll()
      setSchedules(data)
    } catch (e) {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCheck = (schedule) => {
    setSelectedSchedule(schedule)
    const qualityItems = schedule.items.map(item => ({
      dishId: item.dishId,
      dishName: item.dish.name,
      actualQuantity: item.plannedQuantity
    }))
    form.setFieldsValue({ qualityItems })
    setCheckModalVisible(true)
  }

  const handleSubmitCheck = async (values) => {
    try {
      setLoading(true)
      await qualityControlApi.check(selectedSchedule.id, {
        qualityItems: values.qualityItems,
        remark: values.remark,
        passed: values.passed
      })
      message.success(`品控${values.passed ? '通过' : '未通过'}`)
      setCheckModalVisible(false)
      loadData()
    } catch (e) {
      message.error(e.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { title: '排产编号', dataIndex: 'scheduleNo', key: 'scheduleNo' },
    { title: '关联订单', dataIndex: ['storeOrder', 'orderNo'], key: 'orderNo' },
    { title: '门店', dataIndex: ['storeOrder', 'store', 'name'], key: 'store' },
    {
      title: '生产项',
      key: 'items',
      render: (_, r) => r.items?.map(i => `${i.dish.name}×${i.plannedQuantity}`).join(', ')
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const map = {
          CONFIRMED: { color: 'cyan', text: '待品控' },
          QUALITY_CHECKED: { color: 'green', text: '品控通过' },
          QUALITY_FAILED: { color: 'red', text: '品控未通过' }
        }
        const info = map[status] || { color: 'default', text: status }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    { title: '确认时间', dataIndex: 'confirmedAt', key: 'confirmedAt', render: d => d ? dayjs(d).format('MM-DD HH:mm') : '-' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        record.status === 'CONFIRMED' ? (
          <Space>
            <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleCheck(record)}>
              品控
            </Button>
          </Space>
        ) : null
      )
    }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="品控确认"
        className="card-container"
        loading={loading}
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        }
      >
        <Alert
          type="info"
          showIcon
          message="品控说明"
          description="对已确认排产的产品进行质量检验，检验通过后方可配送。"
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={columns}
          dataSource={schedules}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="品控检验"
        open={checkModalVisible}
        onCancel={() => setCheckModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitCheck}>
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <p><b>排产编号:</b> {selectedSchedule?.scheduleNo}</p>
            <p><b>门店:</b> {selectedSchedule?.storeOrder?.store?.name}</p>
          </div>

          <Form.List name="qualityItems">
            {(fields) => (
              <div>
                {fields.map((field) => (
                  <div key={field.key} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'dishName']}
                      style={{ flex: 1, marginBottom: 0 }}
                    >
                      <span style={{ fontWeight: 'bold' }}>{form.getFieldValue(['qualityItems', field.name, 'dishName'])}</span>
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'actualQuantity']}
                      label="实际数量"
                      rules={[{ required: true, message: '请输入实际数量' }]}
                      style={{ width: 180, marginBottom: 0 }}
                    >
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                ))}
              </div>
            )}
          </Form.List>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>

          <Form.Item name="passed" label="检验结果" hidden>
            <Select />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setCheckModalVisible(false)}>取消</Button>
              <Button
                type="primary"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => {
                  form.setFieldsValue({ passed: false })
                  form.submit()
                }}
              >
                不通过
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  form.setFieldsValue({ passed: true })
                  form.submit()
                }}
              >
                通过
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}

export default QualityControl

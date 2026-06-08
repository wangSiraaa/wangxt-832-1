import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Modal, Form, Select, InputNumber, message, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { inventoryApi, rawMaterialApi } from '../api'
import dayjs from 'dayjs'

function Inventory() {
  const [inventory, setInventory] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [adjustModalVisible, setAdjustModalVisible] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [invData, matData] = await Promise.all([
        inventoryApi.getAll(),
        rawMaterialApi.getAll()
      ])
      setInventory(invData)
      setMaterials(matData)
    } catch (e) {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdjust = () => {
    form.resetFields()
    form.setFieldsValue({ type: 'ADD' })
    setAdjustModalVisible(true)
  }

  const handleSubmitAdjust = async (values) => {
    try {
      setLoading(true)
      await inventoryApi.adjust(values)
      message.success('库存调整成功')
      setAdjustModalVisible(false)
      loadData()
    } catch (e) {
      message.error(e.message || '调整失败')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { title: '原料编码', dataIndex: ['rawMaterial', 'code'], key: 'code' },
    { title: '原料名称', dataIndex: ['rawMaterial', 'name'], key: 'name' },
    { title: '单位', dataIndex: ['rawMaterial', 'unit'], key: 'unit', width: 80 },
    {
      title: '当前库存',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (v, record) => {
        const num = parseFloat(v)
        return (
          <Space>
            <b style={{ fontSize: 16 }}>{num.toFixed(2)}</b>
            {num < 10 && <Tag color="red">库存低</Tag>}
          </Space>
        )
      }
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', render: d => dayjs(d).format('YYYY-MM-DD HH:mm') }
  ]

  return (
    <Card
      title="库存管理"
      className="card-container"
      loading={loading}
      extra={
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdjust}>
            调整库存
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={inventory}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="调整库存"
        open={adjustModalVisible}
        onCancel={() => setAdjustModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitAdjust}>
          <Form.Item
            name="rawMaterialId"
            label="选择原料"
            rules={[{ required: true, message: '请选择原料' }]}
          >
            <Select placeholder="请选择原料">
              {materials.map(m => (
                <Select.Option key={m.id} value={m.id}>
                  {m.code} - {m.name} ({m.unit})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="type"
            label="调整类型"
            rules={[{ required: true, message: '请选择调整类型' }]}
          >
            <Select>
              <Select.Option value="ADD">
                <Space><ArrowUpOutlined style={{ color: '#52c41a' }} /> 入库（增加）</Space>
              </Select.Option>
              <Select.Option value="SUBTRACT">
                <Space><ArrowDownOutlined style={{ color: '#f5222d' }} /> 出库（减少）</Space>
              </Select.Option>
              <Select.Option value="SET">
                <Space>设置当前数量</Space>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="数量"
            rules={[{ required: true, message: '请输入数量' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="请输入数量" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAdjustModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认调整</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default Inventory

import React, { useState, useEffect } from 'react'
import { Card, Form, Select, Input, InputNumber, Button, Table, Space, message, Modal } from 'antd'
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import { storeApi, dishApi, storeOrderApi } from '../api'
import dayjs from 'dayjs'

function StoreOrder() {
  const [form] = Form.useForm()
  const [stores, setStores] = useState([])
  const [dishes, setDishes] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedDish, setSelectedDish] = useState(null)
  const [itemQuantity, setItemQuantity] = useState(1)
  const [dishModalVisible, setDishModalVisible] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [storeList, dishList, orderList] = await Promise.all([
        storeApi.getAll(),
        dishApi.getAll(),
        storeOrderApi.getAll()
      ])
      setStores(storeList)
      setDishes(dishList)
      setOrders(orderList)
    } catch (e) {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDish = () => {
    if (!selectedDish || itemQuantity <= 0) {
      message.warning('请选择菜品并输入数量')
      return
    }

    const existing = orderItems.find(item => item.dishId === selectedDish)
    if (existing) {
      setOrderItems(orderItems.map(item =>
        item.dishId === selectedDish
          ? { ...item, quantity: item.quantity + itemQuantity }
          : item
      ))
    } else {
      const dish = dishes.find(d => d.id === selectedDish)
      setOrderItems([...orderItems, {
        dishId: selectedDish,
        dishName: dish.name,
        dishCode: dish.code,
        quantity: itemQuantity
      }])
    }
    setSelectedDish(null)
    setItemQuantity(1)
    setDishModalVisible(false)
  }

  const handleRemoveItem = (dishId) => {
    setOrderItems(orderItems.filter(item => item.dishId !== dishId))
  }

  const handleSubmit = async (values) => {
    if (orderItems.length === 0) {
      message.warning('请至少添加一个菜品')
      return
    }

    try {
      setSubmitting(true)
      const orderNo = `ORD${Date.now()}`
      await storeOrderApi.create({
        ...values,
        orderNo,
        orderDate: dayjs().format('YYYY-MM-DD'),
        items: orderItems.map(item => ({
          dishId: item.dishId,
          quantity: item.quantity
        }))
      })
      message.success('订单提交成功！')
      form.resetFields()
      setOrderItems([])
      loadData()
    } catch (e) {
      message.error(e.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const itemColumns = [
    { title: '菜品编码', dataIndex: 'dishCode', key: 'dishCode' },
    { title: '菜品名称', dataIndex: 'dishName', key: 'dishName' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 120 },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.dishId)}>
          删除
        </Button>
      )
    }
  ]

  const orderColumns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo' },
    { title: '门店', dataIndex: ['store', 'name'], key: 'store' },
    { title: '订单项数', key: 'items', render: (_, r) => r.items?.length || 0 },
    { title: '总数量', key: 'total', render: (_, r) => r.items?.reduce((s, i) => s + i.quantity, 0) || 0 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const map = {
          SUBMITTED: { color: 'blue', text: '已提交' },
          PRODUCTION: { color: 'orange', text: '生产中' },
          DELIVERED: { color: 'green', text: '已配送' }
        }
        const info = map[status] || { color: 'default', text: status }
        return <Space><span className={`status-badge status-${status.toLowerCase()}`}>{info.text}</span></Space>
      }
    },
    { title: '日期', dataIndex: 'orderDate', key: 'orderDate', render: d => dayjs(d).format('YYYY-MM-DD') }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="门店订货员 - 提交订单" className="card-container">
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="storeId"
            label="选择门店"
            rules={[{ required: true, message: '请选择门店' }]}
          >
            <Select placeholder="请选择门店">
              {stores.map(store => (
                <Select.Option key={store.id} value={store.id}>
                  {store.code} - {store.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 'bold' }}>菜品清单</span>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setDishModalVisible(true)}>
                添加菜品
              </Button>
            </div>
            <Table
              columns={itemColumns}
              dataSource={orderItems}
              rowKey="dishId"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无菜品，请点击"添加菜品"按钮添加' }}
            />
          </div>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} icon={<SaveOutlined />} size="large">
              提交订单
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="历史订单" className="card-container" loading={loading}>
        <Table
          columns={orderColumns}
          dataSource={orders}
          rowKey="id"
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <Modal
        title="添加菜品"
        open={dishModalVisible}
        onCancel={() => setDishModalVisible(false)}
        onOk={handleAddDish}
        okText="确认添加"
        cancelText="取消"
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>选择菜品</label>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择菜品"
              value={selectedDish}
              onChange={setSelectedDish}
              showSearch
              optionFilterProp="children"
            >
              {dishes.map(dish => (
                <Select.Option key={dish.id} value={dish.id}>
                  {dish.code} - {dish.name} (¥{dish.price})
                </Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>数量</label>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              value={itemQuantity}
              onChange={setItemQuantity}
              placeholder="请输入数量"
            />
          </div>
        </Space>
      </Modal>
    </Space>
  )
}

export default StoreOrder

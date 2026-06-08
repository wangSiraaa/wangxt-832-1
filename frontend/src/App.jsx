import React, { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Layout, Menu, Badge, message } from 'antd'
import {
  ShopOutlined,
  ShoppingCartOutlined,
  OrderedListOutlined,
  ScheduleOutlined,
  CheckCircleOutlined,
  TruckOutlined,
  AlertOutlined,
  DashboardOutlined,
  DatabaseOutlined
} from '@ant-design/icons'
import Dashboard from './pages/Dashboard'
import StoreOrder from './pages/StoreOrder'
import OrderSummary from './pages/OrderSummary'
import ProductionSchedule from './pages/ProductionSchedule'
import QualityControl from './pages/QualityControl'
import Delivery from './pages/Delivery'
import Alerts from './pages/Alerts'
import Inventory from './pages/Inventory'
import { alertApi } from './api'

const { Header, Sider, Content } = Layout

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const location = useLocation()

  useEffect(() => {
    loadAlertCount()
    const interval = setInterval(loadAlertCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadAlertCount = async () => {
    try {
      const data = await alertApi.getInventoryAlerts(10)
      setAlertCount(data.totalAlerts || 0)
    } catch (e) {
      console.error('加载预警失败', e)
    }
  }

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/store-order', icon: <ShoppingCartOutlined />, label: '门店订货' },
    { key: '/order-summary', icon: <OrderedListOutlined />, label: '订货汇总' },
    { key: '/production-schedule', icon: <ScheduleOutlined />, label: '排产管理' },
    { key: '/quality-control', icon: <CheckCircleOutlined />, label: '品控确认' },
    { key: '/delivery', icon: <TruckOutlined />, label: '配送管理' },
    { key: '/inventory', icon: <DatabaseOutlined />, label: '库存管理' },
    { key: '/alerts', icon: <AlertOutlined />, label: (
      <Badge count={alertCount} size="small" offset={[8, -2]}>
        库存预警
      </Badge>
    )}
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 14 : 18,
          fontWeight: 'bold',
          background: 'rgba(255,255,255,0.1)'
        }}>
          {collapsed ? '中央厨房' : '中央厨房排产系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems.map(item => ({
            ...item,
            label: <Link to={item.key}>{item.label}</Link>
          }))}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            {menuItems.find(m => m.key === location.pathname)?.label?.props?.children || 
             menuItems.find(m => m.key === location.pathname)?.label || '仪表盘'}
          </h2>
        </Header>
        <Content className="site-layout-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/store-order" element={<StoreOrder />} />
            <Route path="/order-summary" element={<OrderSummary />} />
            <Route path="/production-schedule" element={<ProductionSchedule />} />
            <Route path="/quality-control" element={<QualityControl />} />
            <Route path="/delivery" element={<Delivery />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/alerts" element={<Alerts />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App

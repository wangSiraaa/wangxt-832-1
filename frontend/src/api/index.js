import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message || '请求失败'
    return Promise.reject({ ...error, message })
  }
)

export const storeApi = {
  getAll: () => api.get('/stores'),
  getById: (id) => api.get(`/stores/${id}`),
  create: (data) => api.post('/stores', data)
}

export const dishApi = {
  getAll: () => api.get('/dishes'),
  create: (data) => api.post('/dishes', data)
}

export const rawMaterialApi = {
  getAll: () => api.get('/raw-materials'),
  create: (data) => api.post('/raw-materials', data)
}

export const inventoryApi = {
  getAll: () => api.get('/inventory'),
  adjust: (data) => api.post('/inventory/adjust', data),
  getLowStock: (threshold) => api.get(`/inventory/low-stock?threshold=${threshold}`)
}

export const storeOrderApi = {
  getAll: (params) => api.get('/store-orders', { params }),
  getById: (id) => api.get(`/store-orders/${id}`),
  create: (data) => api.post('/store-orders', data)
}

export const orderSummaryApi = {
  getSummary: (params) => api.get('/order-summary', { params }),
  getMaterialRequirements: (params) => api.get('/order-summary/material-requirements', { params })
}

export const productionScheduleApi = {
  getAll: (params) => api.get('/production-schedules', { params }),
  getById: (id) => api.get(`/production-schedules/${id}`),
  create: (data) => api.post('/production-schedules', data),
  checkMaterials: (data) => api.post('/production-schedules/check-materials', data),
  confirm: (id) => api.post(`/production-schedules/${id}/confirm`)
}

export const recipeReuseCheckApi = {
  check: (orderId, checkedBy) => api.post(`/recipe-reuse-check/check/${orderId}`, { checkedBy }),
  getCheck: (orderId) => api.get(`/recipe-reuse-check/${orderId}`),
  getTimeline: (orderId) => api.get(`/recipe-reuse-check/${orderId}/timeline`),
  getHistorical: (orderId, dishId) => api.get(`/recipe-reuse-check/${orderId}/historical/${dishId}`)
}

export const qualityControlApi = {
  getAll: (params) => api.get('/quality-control', { params }),
  check: (id, data) => api.post(`/quality-control/${id}/check`, data)
}

export const deliveryApi = {
  getAll: (params) => api.get('/delivery', { params }),
  deliver: (id, data) => api.post(`/delivery/${id}/deliver`, data)
}

export const alertApi = {
  getInventoryAlerts: (threshold) => api.get(`/alerts/inventory?threshold=${threshold}`)
}

export const healthApi = {
  check: () => api.get('/health')
}

export default api

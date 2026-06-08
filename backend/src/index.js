const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

const storeRoutes = require('./routes/stores');
const dishRoutes = require('./routes/dishes');
const rawMaterialRoutes = require('./routes/rawMaterials');
const inventoryRoutes = require('./routes/inventory');
const storeOrderRoutes = require('./routes/storeOrders');
const orderSummaryRoutes = require('./routes/orderSummary');
const productionScheduleRoutes = require('./routes/productionSchedules');
const qualityControlRoutes = require('./routes/qualityControl');
const deliveryRoutes = require('./routes/delivery');
const alertRoutes = require('./routes/alerts');
const recipeReuseCheckRoutes = require('./routes/recipeReuseCheck');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.API_PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/stores', storeRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/raw-materials', rawMaterialRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/store-orders', storeOrderRoutes);
app.use('/api/order-summary', orderSummaryRoutes);
app.use('/api/production-schedules', productionScheduleRoutes);
app.use('/api/quality-control', qualityControlRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/recipe-reuse-check', recipeReuseCheckRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR'
  });
});

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { storeId, status } = req.query;
    const where = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;

    const orders = await req.prisma.storeOrder.findMany({
      where,
      include: {
        store: true,
        items: { include: { dish: true } }
      },
      orderBy: { orderDate: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { storeId, orderNo, orderDate, remark, items } = req.body;

    if (!storeId || !orderNo || !orderDate || !items || items.length === 0) {
      return res.status(400).json({ error: '门店ID、订单号、订单日期和订单项不能为空', code: 'INVALID_INPUT' });
    }

    const order = await req.prisma.$transaction(async (prisma) => {
      const orderDateObj = new Date(orderDate);
      const newOrder = await prisma.storeOrder.create({
        data: {
          storeId,
          orderNo,
          orderDate: orderDateObj,
          status: 'SUBMITTED',
          remark
        }
      });

      for (const item of items) {
        if (!item.dishId || !item.quantity || item.quantity <= 0) {
          const error = new Error('订单项必须包含有效菜品和数量');
          error.status = 400;
          error.code = 'INVALID_ORDER_ITEM';
          throw error;
        }
        await prisma.orderItem.create({
          data: {
            storeOrderId: newOrder.id,
            dishId: item.dishId,
            quantity: item.quantity
          }
        });
      }

      return prisma.storeOrder.findUnique({
        where: { id: newOrder.id },
        include: {
          store: true,
          items: { include: { dish: true } }
        }
      });
    });

    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await req.prisma.storeOrder.findUnique({
      where: { id: req.params.id },
      include: {
        store: true,
        items: { include: { dish: true } },
        schedules: { include: { items: { include: { dish: true } } } }
      }
    });
    if (!order) {
      return res.status(404).json({ error: '订单不存在', code: 'NOT_FOUND' });
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

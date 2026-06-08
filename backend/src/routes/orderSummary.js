const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { startDate, endDate, status } = req.query;

    const where = {};
    if (startDate) {
      where.orderDate = { ...where.orderDate, gte: new Date(startDate) };
    }
    if (endDate) {
      where.orderDate = { ...where.orderDate, lte: new Date(endDate) };
    }
    if (status) {
      where.status = status;
    }

    const orders = await req.prisma.storeOrder.findMany({
      where,
      include: {
        store: true,
        items: { include: { dish: true } }
      },
      orderBy: { orderDate: 'desc' }
    });

    const dishSummary = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const key = item.dishId;
        if (!dishSummary[key]) {
          dishSummary[key] = {
            dishId: item.dishId,
            dishCode: item.dish.code,
            dishName: item.dish.name,
            totalQuantity: 0,
            orderCount: 0,
            stores: []
          };
        }
        dishSummary[key].totalQuantity += item.quantity;
        if (!dishSummary[key].stores.find(s => s.storeId === order.storeId)) {
          dishSummary[key].stores.push({
            storeId: order.storeId,
            storeName: order.store.name,
            quantity: item.quantity
          });
        } else {
          const storeEntry = dishSummary[key].stores.find(s => s.storeId === order.storeId);
          storeEntry.quantity += item.quantity;
        }
        dishSummary[key].orderCount++;
      });
    });

    const summaryList = Object.values(dishSummary).sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.json({
      orders,
      dishSummary: summaryList,
      totalOrders: orders.length,
      totalDishes: summaryList.length
    });
  } catch (error) {
    next(error);
  }
});

router.get('/material-requirements', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const where = { status: 'SUBMITTED' };
    if (startDate) {
      where.orderDate = { ...where.orderDate, gte: new Date(startDate) };
    }
    if (endDate) {
      where.orderDate = { ...where.orderDate, lte: new Date(endDate) };
    }

    const orders = await req.prisma.storeOrder.findMany({
      where,
      include: {
        items: {
          include: {
            dish: {
              include: {
                recipeItems: {
                  include: { rawMaterial: true }
                }
              }
            }
          }
        }
      }
    });

    const materialRequirements = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        const quantity = item.quantity;
        item.dish.recipeItems.forEach(recipeItem => {
          const matId = recipeItem.rawMaterialId;
          const required = parseFloat(recipeItem.quantity) * quantity;

          if (!materialRequirements[matId]) {
            materialRequirements[matId] = {
              rawMaterialId: matId,
              rawMaterialCode: recipeItem.rawMaterial.code,
              rawMaterialName: recipeItem.rawMaterial.name,
              unit: recipeItem.rawMaterial.unit,
              requiredQuantity: 0
            };
          }
          materialRequirements[matId].requiredQuantity += required;
        });
      });
    });

    const inventory = await req.prisma.inventory.findMany({
      include: { rawMaterial: true }
    });

    const invMap = {};
    inventory.forEach(inv => {
      invMap[inv.rawMaterialId] = parseFloat(inv.quantity);
    });

    const result = Object.values(materialRequirements).map(req => {
      const available = invMap[req.rawMaterialId] || 0;
      return {
        ...req,
        availableQuantity: available,
        isSufficient: available >= req.requiredQuantity,
        shortage: Math.max(0, req.requiredQuantity - available)
      };
    });

    res.json(result.sort((a, b) => b.shortage - a.shortage));
  } catch (error) {
    next(error);
  }
});

module.exports = router;

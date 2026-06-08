const express = require('express');
const router = express.Router();
const { checkRecipeReuse } = require('./recipeReuseCheck');

async function checkMaterialsForSchedule(prisma, orderId, scheduleItems) {
  const order = await prisma.storeOrder.findUnique({
    where: { id: orderId },
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

  if (!order) {
    throw Object.assign(new Error('订单不存在'), { status: 404, code: 'ORDER_NOT_FOUND' });
  }

  const orderItemMap = {};
  order.items.forEach(item => {
    orderItemMap[item.dishId] = item.quantity;
  });

  const materialRequirements = {};
  scheduleItems.forEach(item => {
    const orderQty = orderItemMap[item.dishId] || 0;
    const plannedQty = item.plannedQuantity || orderQty;

    const dish = order.items.find(i => i.dishId === item.dishId)?.dish;
    if (!dish) {
      throw Object.assign(new Error(`菜品 ${item.dishId} 不在订单中`), { status: 400, code: 'INVALID_DISH' });
    }

    dish.recipeItems.forEach(recipeItem => {
      const matId = recipeItem.rawMaterialId;
      const required = parseFloat(recipeItem.quantity) * plannedQty;

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

  const inventory = await prisma.inventory.findMany({
    include: { rawMaterial: true }
  });

  const invMap = {};
  inventory.forEach(inv => {
    invMap[inv.rawMaterialId] = parseFloat(inv.quantity);
  });

  const materialChecks = [];
  let allSufficient = true;

  Object.values(materialRequirements).forEach(req => {
    const available = invMap[req.rawMaterialId] || 0;
    const isSufficient = available >= req.requiredQuantity;
    if (!isSufficient) allSufficient = false;

    materialChecks.push({
      rawMaterialId: req.rawMaterialId,
      rawMaterialCode: req.rawMaterialCode,
      rawMaterialName: req.rawMaterialName,
      unit: req.unit,
      requiredQuantity: req.requiredQuantity,
      availableQuantity: available,
      isSufficient,
      shortage: Math.max(0, req.requiredQuantity - available)
    });
  });

  return {
    allSufficient,
    materialChecks,
    order
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { status, storeOrderId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (storeOrderId) where.storeOrderId = storeOrderId;

    const schedules = await req.prisma.productionSchedule.findMany({
      where,
      include: {
        storeOrder: { include: { store: true } },
        items: { include: { dish: true } },
        materialChecks: { include: { rawMaterial: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(schedules);
  } catch (error) {
    next(error);
  }
});

router.post('/check-materials', async (req, res, next) => {
  try {
    const { storeOrderId, items } = req.body;

    if (!storeOrderId || !items || items.length === 0) {
      return res.status(400).json({ error: '订单ID和排产项不能为空', code: 'INVALID_INPUT' });
    }

    const result = await checkMaterialsForSchedule(req.prisma, storeOrderId, items);

    res.json({
      allSufficient: result.allSufficient,
      materialChecks: result.materialChecks
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { storeOrderId, scheduleNo, scheduleDate, remark, items, checkedBy } = req.body;

    if (!storeOrderId || !scheduleNo || !scheduleDate || !items || items.length === 0) {
      return res.status(400).json({ error: '订单ID、排产编号、排产日期和排产项不能为空', code: 'INVALID_INPUT' });
    }

    const reuseCheckResult = await checkRecipeReuse(req.prisma, storeOrderId, checkedBy);
    const materialResult = await checkMaterialsForSchedule(req.prisma, storeOrderId, items);

    const schedule = await req.prisma.$transaction(async (prisma) => {
      const scheduleDateObj = new Date(scheduleDate);
      const newSchedule = await prisma.productionSchedule.create({
        data: {
          scheduleNo,
          storeOrderId,
          scheduleDate: scheduleDateObj,
          status: 'MATERIAL_CHECKED',
          remark
        }
      });

      for (const item of items) {
        await prisma.scheduleItem.create({
          data: {
            productionScheduleId: newSchedule.id,
            dishId: item.dishId,
            plannedQuantity: item.plannedQuantity
          }
        });
      }

      for (const check of materialResult.materialChecks) {
        await prisma.materialCheck.create({
          data: {
            productionScheduleId: newSchedule.id,
            rawMaterialId: check.rawMaterialId,
            requiredQuantity: check.requiredQuantity,
            availableQuantity: check.availableQuantity,
            isSufficient: check.isSufficient
          }
        });
      }

      return prisma.productionSchedule.findUnique({
        where: { id: newSchedule.id },
        include: {
          storeOrder: { include: { store: true } },
          items: { include: { dish: true } },
          materialChecks: { include: { rawMaterial: true } }
        }
      });
    });

    res.status(201).json({
      ...schedule,
      recipeReuseCheck: {
        hasReusedRecipes: reuseCheckResult.hasReusedRecipes,
        reusedDishes: reuseCheckResult.reusedDishes || [],
        materialImpact: reuseCheckResult.materialImpact || []
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/confirm', async (req, res, next) => {
  try {
    const scheduleId = req.params.id;

    const schedule = await req.prisma.productionSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        storeOrder: {
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
        },
        items: { include: { dish: true } },
        materialChecks: { include: { rawMaterial: true } }
      }
    });

    if (!schedule) {
      return res.status(404).json({ error: '排产计划不存在', code: 'NOT_FOUND' });
    }

    if (schedule.status === 'CONFIRMED' || schedule.status === 'PRODUCTION') {
      return res.status(400).json({ error: '排产计划已确认', code: 'ALREADY_CONFIRMED' });
    }

    if (schedule.status === 'DELIVERED') {
      return res.status(400).json({ error: '排产计划已配送完成', code: 'ALREADY_DELIVERED' });
    }

    const allSufficient = schedule.materialChecks.every(m => m.isSufficient);
    if (!allSufficient) {
      const insufficientMaterials = schedule.materialChecks
        .filter(m => !m.isSufficient)
        .map(m => ({
          name: m.rawMaterial.name,
          code: m.rawMaterial.code,
          required: m.requiredQuantity,
          available: m.availableQuantity,
          shortage: m.requiredQuantity - m.availableQuantity,
          unit: m.rawMaterial.unit
        }));

      return res.status(400).json({
        error: '原料不足，无法确认排产',
        code: 'INSUFFICIENT_MATERIALS',
        insufficientMaterials
      });
    }

    const result = await req.prisma.$transaction(async (prisma) => {
      for (const item of schedule.items) {
        const dish = schedule.storeOrder.items.find(i => i.dishId === item.dishId)?.dish;
        if (dish) {
          for (const recipeItem of dish.recipeItems) {
            const usageAmount = parseFloat(recipeItem.quantity) * item.plannedQuantity;

            const inventory = await prisma.inventory.findUnique({
              where: { rawMaterialId: recipeItem.rawMaterialId }
            });

            if (!inventory) {
              const error = new Error(`原料 ${recipeItem.rawMaterial.name} 库存记录不存在`);
              error.status = 400;
              error.code = 'INVENTORY_NOT_FOUND';
              throw error;
            }

            const newQuantity = parseFloat(inventory.quantity) - usageAmount;
            if (newQuantity < 0) {
              const error = new Error(`原料 ${recipeItem.rawMaterial.name} 库存不足`);
              error.status = 400;
              error.code = 'INSUFFICIENT_INVENTORY';
              throw error;
            }

            await prisma.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: newQuantity,
                updatedAt: new Date()
              }
            });
          }
        }
      }

      return prisma.productionSchedule.update({
        where: { id: scheduleId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date()
        },
        include: {
          storeOrder: { include: { store: true } },
          items: { include: { dish: true } },
          materialChecks: { include: { rawMaterial: true } }
        }
      });
    });

    await req.prisma.storeOrder.update({
      where: { id: schedule.storeOrderId },
      data: { status: 'PRODUCTION' }
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const schedule = await req.prisma.productionSchedule.findUnique({
      where: { id: req.params.id },
      include: {
        storeOrder: { include: { store: true, items: { include: { dish: true } } } },
        items: { include: { dish: true } },
        materialChecks: { include: { rawMaterial: true } }
      }
    });
    if (!schedule) {
      return res.status(404).json({ error: '排产计划不存在', code: 'NOT_FOUND' });
    }
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

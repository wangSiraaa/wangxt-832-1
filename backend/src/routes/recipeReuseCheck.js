const express = require('express');
const router = express.Router();

async function findHistoricalRecipeUsage(prisma, dishId, currentVersion, excludeOrderId) {
  const historicalSchedules = await prisma.productionSchedule.findMany({
    where: {
      storeOrderId: { not: excludeOrderId },
      items: {
        some: { dishId }
      }
    },
    include: {
      storeOrder: true,
      items: {
        where: { dishId },
        include: { dish: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const reusedSchedules = [];
  for (const schedule of historicalSchedules) {
    const item = schedule.items.find(i => i.dishId === dishId);
    if (item && item.plannedQuantity > 0) {
      reusedSchedules.push({
        scheduleId: schedule.id,
        scheduleNo: schedule.scheduleNo,
        orderId: schedule.storeOrderId,
        orderNo: schedule.storeOrder.orderNo,
        scheduleDate: schedule.scheduleDate,
        quantity: item.plannedQuantity,
        recipeVersion: schedule.recipeVersion || 1,
        status: schedule.status
      });
    }
  }

  return reusedSchedules;
}

async function calculateMaterialDifference(prisma, dishId, oldVersion, newVersion) {
  const oldVersionItems = await prisma.recipeVersionItem.findMany({
    where: {
      recipeVersion: {
        dishId,
        version: oldVersion
      }
    },
    include: { rawMaterial: true }
  });

  const newVersionItems = await prisma.recipeVersionItem.findMany({
    where: {
      recipeVersion: {
        dishId,
        version: newVersion
      }
    },
    include: { rawMaterial: true }
  });

  const oldMap = {};
  oldVersionItems.forEach(item => {
    oldMap[item.rawMaterialId] = {
      ...item.rawMaterial,
      quantity: parseFloat(item.quantity)
    };
  });

  const newMap = {};
  newVersionItems.forEach(item => {
    newMap[item.rawMaterialId] = {
      ...item.rawMaterial,
      quantity: parseFloat(item.quantity)
    };
  });

  const allMaterialIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  const differences = [];

  for (const matId of allMaterialIds) {
    const oldQty = oldMap[matId]?.quantity || 0;
    const newQty = newMap[matId]?.quantity || 0;
    const diff = newQty - oldQty;

    if (diff !== 0) {
      const material = newMap[matId] || oldMap[matId];
      differences.push({
        rawMaterialId: matId,
        rawMaterialCode: material.code,
        rawMaterialName: material.name,
        unit: material.unit,
        oldQuantity: oldQty,
        newQuantity: newQty,
        difference: diff,
        isIncrease: diff > 0
      });
    }
  }

  return differences;
}

async function checkRecipeReuse(prisma, storeOrderId, checkedBy = 'system') {
  const order = await prisma.storeOrder.findUnique({
    where: { id: storeOrderId },
    include: {
      items: {
        include: {
          dish: {
            include: {
              recipeVersions: {
                orderBy: { version: 'desc' },
                include: { items: { include: { rawMaterial: true } } }
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

  const reusedDishes = [];
  const materialImpact = {};
  const events = [];

  for (const orderItem of order.items) {
    const dish = orderItem.dish;
    const currentVersion = dish.currentRecipeVersion;

    if (dish.recipeVersions && dish.recipeVersions.length > 1) {
      const oldVersion = Math.min(...dish.recipeVersions.map(v => v.version));
      const historicalUsage = await findHistoricalRecipeUsage(
        prisma, dish.id, currentVersion, storeOrderId
      );

      if (historicalUsage.length > 0) {
        const materialDiff = await calculateMaterialDifference(
          prisma, dish.id, oldVersion, currentVersion
        );

        const totalExtraUsage = {};
        materialDiff.forEach(diff => {
          if (diff.isIncrease) {
            const extra = diff.difference * orderItem.quantity;
            totalExtraUsage[diff.rawMaterialId] = {
              ...diff,
              extraTotal: extra,
              affectedDishes: []
            };
          }
        });

        reusedDishes.push({
          dishId: dish.id,
          dishCode: dish.code,
          dishName: dish.name,
          oldVersion,
          newVersion: currentVersion,
          quantity: orderItem.quantity,
          historicalUsage,
          materialDiff,
          totalExtraUsage: Object.values(totalExtraUsage)
        });

        events.push({
          eventType: 'DISH_REUSED',
          dishId: dish.id,
          dishName: dish.name,
          oldVersion,
          newVersion: currentVersion,
          remark: `菜品 ${dish.name} 沿用了历史配方，已从 v${oldVersion} 更新到 v${currentVersion}`
        });

        Object.entries(totalExtraUsage).forEach(([matId, data]) => {
          if (!materialImpact[matId]) {
            materialImpact[matId] = {
              rawMaterialId: matId,
              rawMaterialCode: data.rawMaterialCode,
              rawMaterialName: data.rawMaterialName,
              unit: data.unit,
              extraTotal: 0,
              affectedDishes: []
            };
          }
          materialImpact[matId].extraTotal += data.extraTotal;
          materialImpact[matId].affectedDishes.push({
            dishId: dish.id,
            dishName: dish.name,
            extraPerUnit: data.difference,
            quantity: orderItem.quantity,
            extraTotal: data.extraTotal
          });

          events.push({
            eventType: 'MATERIAL_IMPACT',
            materialId: matId,
            materialName: data.rawMaterialName,
            extraUsage: data.extraTotal,
            remark: `新配方导致 ${data.rawMaterialName} 多消耗 ${data.extraTotal.toFixed(2)} ${data.unit}`
          });
        });
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingCheck = await tx.recipeReuseCheck.findUnique({
      where: { storeOrderId }
    });

    if (existingCheck) {
      await tx.recipeReuseEvent.deleteMany({
        where: { recipeReuseCheckId: existingCheck.id }
      });
      await tx.recipeReuseCheck.delete({
        where: { id: existingCheck.id }
      });
    }

    const check = await tx.recipeReuseCheck.create({
      data: {
        storeOrderId,
        checkedBy,
        hasReusedRecipes: reusedDishes.length > 0,
        reuseDetails: { reusedDishes },
        materialImpact: { materialImpact: Object.values(materialImpact) }
      }
    });

    for (const event of events) {
      await tx.recipeReuseEvent.create({
        data: {
          recipeReuseCheckId: check.id,
          ...event
        }
      });
    }

    for (const dish of reusedDishes) {
      for (const usage of dish.historicalUsage) {
        await tx.recipeReuseEvent.create({
          data: {
            recipeReuseCheckId: check.id,
            eventType: 'HISTORICAL_SOURCE',
            dishId: dish.dishId,
            dishName: dish.dishName,
            oldVersion: dish.oldVersion,
            newVersion: dish.newVersion,
            sourceOrderNo: usage.orderNo,
            sourceScheduleNo: usage.scheduleNo,
            remark: `历史来源：订单 ${usage.orderNo}，排产 ${usage.scheduleNo}，数量 ${usage.quantity}`
          }
        });
      }
    }

    return tx.recipeReuseCheck.findUnique({
      where: { id: check.id },
      include: {
        events: {
          orderBy: { happenedAt: 'desc' }
        },
        storeOrder: {
          include: { store: true }
        }
      }
    });
  });

  return {
    ...result,
    reusedDishes,
    materialImpact: Object.values(materialImpact)
  };
}

router.post('/check/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { checkedBy } = req.body;

    const result = await checkRecipeReuse(req.prisma, orderId, checkedBy);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const check = await req.prisma.recipeReuseCheck.findUnique({
      where: { storeOrderId: orderId },
      include: {
        events: {
          orderBy: { happenedAt: 'desc' }
        },
        storeOrder: {
          include: { store: true, items: { include: { dish: true } } }
        }
      }
    });

    if (!check) {
      return res.status(404).json({
        error: '未找到配方复用检查记录',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        ...check,
        reusedDishes: check.reuseDetails?.reusedDishes || [],
        materialImpact: check.materialImpact?.materialImpact || []
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:orderId/timeline', async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const check = await req.prisma.recipeReuseCheck.findUnique({
      where: { storeOrderId: orderId },
      include: {
        events: {
          orderBy: { happenedAt: 'desc' }
        }
      }
    });

    if (!check) {
      return res.status(404).json({
        error: '未找到配方复用检查记录',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: check.events
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:orderId/historical/:dishId', async (req, res, next) => {
  try {
    const { orderId, dishId } = req.params;

    const dish = await req.prisma.dish.findUnique({
      where: { id: dishId },
      include: {
        recipeVersions: {
          orderBy: { version: 'desc' },
          include: { items: { include: { rawMaterial: true } } }
        }
      }
    });

    if (!dish) {
      return res.status(404).json({ error: '菜品不存在', code: 'NOT_FOUND' });
    }

    const historicalUsage = await findHistoricalRecipeUsage(
      req.prisma, dishId, dish.currentRecipeVersion, orderId
    );

    let materialDiff = [];
    if (dish.recipeVersions.length > 1) {
      const oldVersion = Math.min(...dish.recipeVersions.map(v => v.version));
      materialDiff = await calculateMaterialDifference(
        req.prisma, dishId, oldVersion, dish.currentRecipeVersion
      );
    }

    res.json({
      success: true,
      data: {
        dish,
        historicalUsage,
        materialDiff
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.checkRecipeReuse = checkRecipeReuse;

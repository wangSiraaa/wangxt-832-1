const express = require('express');
const router = express.Router();

router.get('/inventory', async (req, res, next) => {
  try {
    const threshold = parseFloat(req.query.threshold || '10');

    const inventory = await req.prisma.inventory.findMany({
      where: {
        quantity: {
          lt: threshold
        }
      },
      include: { rawMaterial: true },
      orderBy: { quantity: 'asc' }
    });

    const pendingSchedules = await req.prisma.productionSchedule.findMany({
      where: {
        status: {
          in: ['MATERIAL_CHECKED', 'CONFIRMED']
        }
      },
      include: {
        materialChecks: { include: { rawMaterial: true } }
      }
    });

    const upcomingShortages = [];
    pendingSchedules.forEach(schedule => {
      schedule.materialChecks
        .filter(m => !m.isSufficient)
        .forEach(m => {
          upcomingShortages.push({
            scheduleId: schedule.id,
            scheduleNo: schedule.scheduleNo,
            rawMaterialId: m.rawMaterialId,
            rawMaterialName: m.rawMaterial.name,
            required: m.requiredQuantity,
            available: m.availableQuantity,
            shortage: m.requiredQuantity - m.availableQuantity
          });
        });
    });

    res.json({
      lowStock: inventory.map(i => ({
        rawMaterialId: i.rawMaterialId,
        rawMaterialCode: i.rawMaterial.code,
        rawMaterialName: i.rawMaterial.name,
        unit: i.rawMaterial.unit,
        currentQuantity: parseFloat(i.quantity),
        threshold
      })),
      upcomingShortages,
      totalAlerts: inventory.length + upcomingShortages.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { status: 'CONFIRMED' };
    if (status) where.status = status;

    const schedules = await req.prisma.productionSchedule.findMany({
      where,
      include: {
        storeOrder: { include: { store: true } },
        items: { include: { dish: true } }
      },
      orderBy: { confirmedAt: 'desc' }
    });
    res.json(schedules);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/check', async (req, res, next) => {
  try {
    const scheduleId = req.params.id;
    const { qualityItems, remark, passed } = req.body;

    const schedule = await req.prisma.productionSchedule.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule) {
      return res.status(404).json({ error: '排产计划不存在', code: 'NOT_FOUND' });
    }

    if (schedule.status !== 'CONFIRMED') {
      return res.status(400).json({ error: '排产计划尚未确认，不能进行品控', code: 'INVALID_STATUS' });
    }

    const result = await req.prisma.$transaction(async (prisma) => {
      if (qualityItems && qualityItems.length > 0) {
        for (const item of qualityItems) {
          await prisma.scheduleItem.updateMany({
            where: {
              productionScheduleId: scheduleId,
              dishId: item.dishId
            },
            data: {
              actualQuantity: item.actualQuantity
            }
          });
        }
      }

      return prisma.productionSchedule.update({
        where: { id: scheduleId },
        data: {
          status: passed ? 'QUALITY_CHECKED' : 'QUALITY_FAILED',
          qualityCheckedAt: new Date(),
          remark: remark || schedule.remark
        },
        include: {
          storeOrder: { include: { store: true } },
          items: { include: { dish: true } }
        }
      });
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

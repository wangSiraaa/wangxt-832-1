const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { status: 'QUALITY_CHECKED' };
    if (status) where.status = status;

    const schedules = await req.prisma.productionSchedule.findMany({
      where,
      include: {
        storeOrder: { include: { store: true } },
        items: { include: { dish: true } }
      },
      orderBy: { qualityCheckedAt: 'desc' }
    });
    res.json(schedules);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/deliver', async (req, res, next) => {
  try {
    const scheduleId = req.params.id;
    const { deliveryPerson, vehicle, remark } = req.body;

    const schedule = await req.prisma.productionSchedule.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule) {
      return res.status(404).json({ error: '排产计划不存在', code: 'NOT_FOUND' });
    }

    if (schedule.status !== 'QUALITY_CHECKED') {
      return res.status(400).json({ error: '排产计划品控未通过，不能配送', code: 'INVALID_STATUS' });
    }

    const result = await req.prisma.productionSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        remark: remark || schedule.remark
      },
      include: {
        storeOrder: { include: { store: true } },
        items: { include: { dish: true } }
      }
    });

    await req.prisma.storeOrder.update({
      where: { id: schedule.storeOrderId },
      data: { status: 'DELIVERED' }
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

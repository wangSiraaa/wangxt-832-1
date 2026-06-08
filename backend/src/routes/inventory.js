const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const inventory = await req.prisma.inventory.findMany({
      include: { rawMaterial: true },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

router.post('/adjust', async (req, res, next) => {
  try {
    const { rawMaterialId, quantity, type } = req.body;

    if (!rawMaterialId || quantity === undefined || !type) {
      return res.status(400).json({ error: '原料ID、数量和调整类型不能为空', code: 'INVALID_INPUT' });
    }

    const result = await req.prisma.$transaction(async (prisma) => {
      const existing = await prisma.inventory.findUnique({
        where: { rawMaterialId }
      });

      if (!existing) {
        return prisma.inventory.create({
          data: {
            rawMaterialId,
            quantity,
            updatedAt: new Date()
          },
          include: { rawMaterial: true }
        });
      }

      let newQuantity;
      if (type === 'ADD') {
        newQuantity = existing.quantity.plus(quantity);
      } else if (type === 'SUBTRACT') {
        newQuantity = existing.quantity.minus(quantity);
        if (newQuantity.lessThan(0)) {
          const error = new Error('库存不足');
          error.status = 400;
          error.code = 'INSUFFICIENT_INVENTORY';
          throw error;
        }
      } else if (type === 'SET') {
        newQuantity = quantity;
      } else {
        const error = new Error('无效的调整类型');
        error.status = 400;
        error.code = 'INVALID_TYPE';
        throw error;
      }

      return prisma.inventory.update({
        where: { id: existing.id },
        data: {
          quantity: newQuantity,
          updatedAt: new Date()
        },
        include: { rawMaterial: true }
      });
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/low-stock', async (req, res, next) => {
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
    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const stores = await req.prisma.store.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(stores);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, name, address } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: '门店编码和名称不能为空', code: 'INVALID_INPUT' });
    }
    const store = await req.prisma.store.create({
      data: { code, name, address }
    });
    res.status(201).json(store);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const store = await req.prisma.store.findUnique({
      where: { id: req.params.id }
    });
    if (!store) {
      return res.status(404).json({ error: '门店不存在', code: 'NOT_FOUND' });
    }
    res.json(store);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

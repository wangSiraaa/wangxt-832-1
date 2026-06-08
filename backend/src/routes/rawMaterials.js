const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const materials = await req.prisma.rawMaterial.findMany({
      include: { inventory: true },
      orderBy: { code: 'asc' }
    });
    res.json(materials);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, name, unit } = req.body;
    if (!code || !name || !unit) {
      return res.status(400).json({ error: '原料编码、名称和单位不能为空', code: 'INVALID_INPUT' });
    }
    const material = await req.prisma.rawMaterial.create({
      data: { code, name, unit }
    });
    res.status(201).json(material);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

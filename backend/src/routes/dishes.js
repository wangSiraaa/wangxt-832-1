const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const dishes = await req.prisma.dish.findMany({
      include: { recipeItems: { include: { rawMaterial: true } } },
      orderBy: { code: 'asc' }
    });
    res.json(dishes);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { code, name, description, price, recipeItems } = req.body;
    if (!code || !name || !price) {
      return res.status(400).json({ error: '菜品编码、名称和价格不能为空', code: 'INVALID_INPUT' });
    }

    const dish = await req.prisma.$transaction(async (prisma) => {
      const newDish = await prisma.dish.create({
        data: {
          code,
          name,
          description,
          price
        }
      });

      if (recipeItems && recipeItems.length > 0) {
        for (const item of recipeItems) {
          await prisma.recipeItem.create({
            data: {
              dishId: newDish.id,
              rawMaterialId: item.rawMaterialId,
              quantity: item.quantity
            }
          });
        }
      }

      return prisma.dish.findUnique({
        where: { id: newDish.id },
        include: { recipeItems: { include: { rawMaterial: true } } }
      });
    });

    res.status(201).json(dish);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

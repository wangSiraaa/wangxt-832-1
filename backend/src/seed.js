const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('开始初始化种子数据...');

  const stores = await prisma.store.createMany({
    data: [
      { code: 'ST001', name: '朝阳门店', address: '北京市朝阳区朝阳路1号' },
      { code: 'ST002', name: '海淀店', address: '北京市海淀区中关村大街1号' },
      { code: 'ST003', name: '西城店', address: '北京市西城区金融街1号' }
    ],
    skipDuplicates: true
  });
  console.log(`已创建 ${stores.count} 个门店`);

  const rawMaterials = await prisma.rawMaterial.createMany({
    data: [
      { code: 'RM001', name: '面粉', unit: 'kg' },
      { code: 'RM002', name: '猪肉', unit: 'kg' },
      { code: 'RM003', name: '牛肉', unit: 'kg' },
      { code: 'RM004', name: '白菜', unit: 'kg' },
      { code: 'RM005', name: '鸡蛋', unit: '个' },
      { code: 'RM006', name: '酱油', unit: 'L' },
      { code: 'RM007', name: '食用油', unit: 'L' },
      { code: 'RM008', name: '大米', unit: 'kg' }
    ],
    skipDuplicates: true
  });
  console.log(`已创建 ${rawMaterials.count} 种原料`);

  const allMaterials = await prisma.rawMaterial.findMany();
  const matMap = {};
  allMaterials.forEach(m => matMap[m.code] = m.id);

  const inventoryData = [
    { rawMaterialId: matMap['RM001'], quantity: 50 },
    { rawMaterialId: matMap['RM002'], quantity: 30 },
    { rawMaterialId: matMap['RM003'], quantity: 5 },
    { rawMaterialId: matMap['RM004'], quantity: 40 },
    { rawMaterialId: matMap['RM005'], quantity: 200 },
    { rawMaterialId: matMap['RM006'], quantity: 20 },
    { rawMaterialId: matMap['RM007'], quantity: 25 },
    { rawMaterialId: matMap['RM008'], quantity: 100 }
  ];

  for (const inv of inventoryData) {
    const existing = await prisma.inventory.findUnique({
      where: { rawMaterialId: inv.rawMaterialId }
    });
    if (!existing) {
      await prisma.inventory.create({
        data: {
          ...inv,
          updatedAt: new Date()
        }
      });
    }
  }
  console.log('已初始化库存数据');

  const dishes = [
    {
      code: 'D001',
      name: '猪肉白菜饺子',
      description: '经典手工水饺',
      price: 28,
      recipe: [
        { code: 'RM001', quantity: 0.2 },
        { code: 'RM002', quantity: 0.15 },
        { code: 'RM004', quantity: 0.1 }
      ]
    },
    {
      code: 'D002',
      name: '牛肉面',
      description: '红烧牛肉面',
      price: 35,
      recipe: [
        { code: 'RM001', quantity: 0.15 },
        { code: 'RM003', quantity: 0.1 },
        { code: 'RM006', quantity: 0.02 },
        { code: 'RM007', quantity: 0.03 }
      ]
    },
    {
      code: 'D003',
      name: '蛋炒饭',
      description: '扬州蛋炒饭',
      price: 22,
      recipe: [
        { code: 'RM008', quantity: 0.3 },
        { code: 'RM005', quantity: 2 },
        { code: 'RM007', quantity: 0.02 }
      ]
    },
    {
      code: 'D004',
      name: '牛肉包子',
      description: '牛肉大葱包子',
      price: 8,
      recipe: [
        { code: 'RM001', quantity: 0.1 },
        { code: 'RM003', quantity: 0.08 }
      ]
    }
  ];

  for (const dish of dishes) {
    const existingDish = await prisma.dish.findUnique({
      where: { code: dish.code }
    });
    if (!existingDish) {
      const newDish = await prisma.dish.create({
        data: {
          code: dish.code,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          currentRecipeVersion: 2
        }
      });

      for (const item of dish.recipe) {
        await prisma.recipeItem.create({
          data: {
            dishId: newDish.id,
            rawMaterialId: matMap[item.code],
            quantity: item.quantity
          }
        });
      }

      const oldRecipes = {
        'D001': [
          { code: 'RM001', quantity: 0.15 },
          { code: 'RM002', quantity: 0.1 },
          { code: 'RM004', quantity: 0.08 }
        ],
        'D002': [
          { code: 'RM001', quantity: 0.1 },
          { code: 'RM003', quantity: 0.08 },
          { code: 'RM006', quantity: 0.015 },
          { code: 'RM007', quantity: 0.02 }
        ]
      };

      const oldRecipe = oldRecipes[dish.code];
      if (oldRecipe) {
        const version1 = await prisma.recipeVersion.create({
          data: {
            dishId: newDish.id,
            version: 1,
            remark: '初始配方版本',
            createdBy: 'system'
          }
        });
        for (const item of oldRecipe) {
          await prisma.recipeVersionItem.create({
            data: {
              recipeVersionId: version1.id,
              rawMaterialId: matMap[item.code],
              quantity: item.quantity
            }
          });
        }
        console.log(`已创建 ${dish.name} 的旧配方版本 v1`);
      }

      const version2 = await prisma.recipeVersion.create({
        data: {
          dishId: newDish.id,
          version: 2,
          remark: '优化配方，调整原料比例',
          createdBy: 'chef_zhang'
        }
      });
      for (const item of dish.recipe) {
        await prisma.recipeVersionItem.create({
          data: {
            recipeVersionId: version2.id,
            rawMaterialId: matMap[item.code],
            quantity: item.quantity
          }
        });
      }
      console.log(`已创建菜品: ${dish.name}, 当前配方版本 v2`);
    }
  }

  console.log('种子数据初始化完成！');
  await prisma.$disconnect();
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

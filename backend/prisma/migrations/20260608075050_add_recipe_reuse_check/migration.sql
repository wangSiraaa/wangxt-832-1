-- AlterTable
ALTER TABLE "Dish" ADD COLUMN     "currentRecipeVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersionItem" (
    "id" TEXT NOT NULL,
    "recipeVersionId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "RecipeVersionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeReuseCheck" (
    "id" TEXT NOT NULL,
    "storeOrderId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedBy" TEXT,
    "hasReusedRecipes" BOOLEAN NOT NULL,
    "reuseDetails" JSONB,
    "materialImpact" JSONB,

    CONSTRAINT "RecipeReuseCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeReuseEvent" (
    "id" TEXT NOT NULL,
    "recipeReuseCheckId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dishId" TEXT,
    "dishName" TEXT,
    "oldVersion" INTEGER,
    "newVersion" INTEGER,
    "materialId" TEXT,
    "materialName" TEXT,
    "extraUsage" DECIMAL(65,30),
    "sourceOrderNo" TEXT,
    "sourceScheduleNo" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT,

    CONSTRAINT "RecipeReuseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersion_dishId_version_key" ON "RecipeVersion"("dishId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersionItem_recipeVersionId_rawMaterialId_key" ON "RecipeVersionItem"("recipeVersionId", "rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeReuseCheck_storeOrderId_key" ON "RecipeReuseCheck"("storeOrderId");

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersionItem" ADD CONSTRAINT "RecipeVersionItem_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersionItem" ADD CONSTRAINT "RecipeVersionItem_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeReuseCheck" ADD CONSTRAINT "RecipeReuseCheck_storeOrderId_fkey" FOREIGN KEY ("storeOrderId") REFERENCES "StoreOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeReuseEvent" ADD CONSTRAINT "RecipeReuseEvent_recipeReuseCheckId_fkey" FOREIGN KEY ("recipeReuseCheckId") REFERENCES "RecipeReuseCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

"use strict";

const FOOD_PROVIDER_DEFINITIONS = [
  {
    id: "wikimedia-commons",
    name: "Wikimedia Commons",
    regions: {
      beijing: [
        {
          foodId: "beijing-peking-duck",
          dish: "北京烤鸭",
          image: "/food/beijing-peking-duck.jpg",
          alt: "盘中片好的北京烤鸭示例图片",
          source: {
            title: "Peking duck with sugar scallion",
            author: "Mcyjerry",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Peking_duck_with_sugar_scallion.jpg",
          },
        },
        {
          foodId: "beijing-zhajiangmian",
          dish: "炸酱面",
          image: "/food/beijing-zhajiangmian.jpg",
          alt: "拌有黄瓜丝和肉酱的炸酱面示例图片",
          source: {
            title: "Noodles with diced meat soybean paste before stirring",
            author: "N509FZ",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Noodles_with_diced_meat_soybean_paste_before_stirring_(20210102181759).jpg",
          },
        },
        {
          foodId: "beijing-jianbing",
          dish: "煎饼",
          image: "/food/beijing-jianbing.jpg",
          alt: "盘中切开的中式煎饼示例图片",
          source: {
            title: "Jianbing on plate",
            author: "Alwaleed Khaled",
            license: "CC BY 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Jianbing_on_plate.jpg",
          },
        },
      ],
      shanghai: [
        {
          foodId: "shanghai-xiaolongbao",
          dish: "小笼包",
          image: "/food/shanghai-xiaolongbao.jpg",
          alt: "蒸笼里的小笼包示例图片",
          source: {
            title: "Xiao Long Bao by Junhao!",
            author: "Junhao!",
            license: "CC BY 2.0",
            licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
            url: "https://commons.wikimedia.org/wiki/File:Xiao_Long_Bao_by_Junhao!.jpg",
          },
        },
        {
          foodId: "shanghai-shengjian",
          dish: "生煎包",
          image: "/food/shanghai-shengjian.jpg",
          alt: "平底锅中撒有芝麻和葱花的生煎包示例图片",
          source: {
            title: "Shengjian mantou",
            author: "Pauloleong2002",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Shengjian_mantou.jpg",
          },
        },
        {
          foodId: "shanghai-scallion-noodles",
          dish: "葱油拌面",
          image: "/food/shanghai-scallion-noodles.jpg",
          alt: "铺有葱花的葱油拌面示例图片",
          source: {
            title: "葱花葱油拌面",
            author: "Suginami",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:%E8%91%B1%E8%8A%B1%E8%91%B1%E6%B2%B9%E6%8B%8C%E9%9D%A2.jpg",
          },
        },
      ],
      guangzhou: [
        {
          foodId: "guangzhou-dim-sum",
          dish: "广式点心",
          image: "/food/guangzhou-dim-sum.jpg",
          alt: "摆满蒸笼的广式点心示例图片",
          source: {
            title: "Dim Sum Breakfast",
            author: "afterdog",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Dim_Sum_Breakfast.jpg",
          },
        },
        {
          foodId: "guangzhou-white-cut-chicken",
          dish: "白切鸡",
          image: "/food/guangzhou-white-cut-chicken.jpg",
          alt: "白切鸡配青菜示例图片",
          source: {
            title: "BeiQieJi-WhiteCutChicken",
            author: "Sjschen",
            license: "CC BY-SA 3.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
            url: "https://commons.wikimedia.org/wiki/File:BeiQieJi-WhiteCutChicken.jpg",
          },
        },
        {
          foodId: "guangzhou-char-siu",
          dish: "叉烧",
          image: "/food/guangzhou-char-siu.jpg",
          alt: "炉中挂烤的叉烧示例图片",
          source: {
            title: "Charsiu",
            author: "Simon Shek",
            license: "CC BY-SA 3.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
            url: "https://commons.wikimedia.org/wiki/File:Charsiu.jpg",
          },
        },
      ],
      chengdu: [
        {
          foodId: "chengdu-hotpot",
          dish: "四川火锅",
          image: "/food/chengdu-hotpot.jpg",
          alt: "红汤四川火锅与配菜示例图片",
          source: {
            title: "Sichuan-style hotpot",
            author: "Fumikas Sagisavas",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Sichuan-style_hotpot.jpg",
          },
        },
        {
          foodId: "chengdu-dandan-noodles",
          dish: "担担面",
          image: "/food/chengdu-dandan-noodles.jpg",
          alt: "红油汤底的担担面示例图片",
          source: {
            title: "Dan Dan Noodles",
            author: "Fumikas Sagisavas",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Dan_Dan_Noodles.jpg",
          },
        },
        {
          foodId: "chengdu-red-oil-wontons",
          dish: "红油抄手",
          image: "/food/chengdu-red-oil-wontons.jpg",
          alt: "红油和葱花覆盖的抄手示例图片",
          source: {
            title: "Red Oil Wontons (红油抄手)",
            author: "NeoBatfreak",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Red_Oil_Wontons_(%E7%BA%A2%E6%B2%B9%E6%8A%84%E6%89%8B).jpg",
          },
        },
      ],
      xian: [
        {
          foodId: "xian-roujiamo",
          dish: "肉夹馍",
          image: "/food/xian-roujiamo.jpg",
          alt: "肉夹馍与豆腐汤示例图片",
          source: {
            title: "Roujiamo and Laoling Laodoufu",
            author: "Suginami",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Roujiamo_and_Laoling_Laodoufu.jpg",
          },
        },
        {
          foodId: "xian-liangpi",
          dish: "凉皮",
          image: "/food/xian-liangpi.jpg",
          alt: "拌有配菜的凉皮示例图片",
          source: {
            title: "LIANG PI",
            author: "Jucember",
            license: "CC BY-SA 3.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
            url: "https://commons.wikimedia.org/wiki/File:LIANG_PI.jpg",
          },
        },
        {
          foodId: "xian-yangrou-paomo",
          dish: "羊肉泡馍",
          image: "/food/xian-yangrou-paomo.jpg",
          alt: "一碗羊肉泡馍示例图片",
          source: {
            title: "Yangrou Paomo",
            author: "Danielinblue",
            license: "CC BY-SA 3.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
            url: "https://commons.wikimedia.org/wiki/File:Yangrou_Paomo.JPG",
          },
        },
      ],
      tokyo: [
        {
          foodId: "tokyo-sushi",
          dish: "寿司",
          image: "/food/tokyo-sushi.jpg",
          alt: "黑色餐盘上的寿司拼盘示例图片",
          source: {
            title: "Sushi Plate in Organic Sushi Prague 4",
            author: "Mojmir Churavy",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Sushi_Plate_in_Organic_Sushi_Prague_4.jpg",
          },
        },
        {
          foodId: "tokyo-ramen",
          dish: "拉面",
          image: "/food/tokyo-ramen.jpg",
          alt: "两碗拉面与配菜示例图片",
          source: {
            title: "Soy Milk Ramen and Tonkotsu Miso Ramen by Goemon Ramen Bar",
            author: "Andy Li",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Soy_Milk_Ramen_and_Tonkotsu_Miso_Ramen_by_Goemon_Ramen_Bar.jpg",
          },
        },
        {
          foodId: "tokyo-tempura",
          dish: "天妇罗",
          image: "/food/tokyo-tempura.jpg",
          alt: "盘中舞茸天妇罗示例图片",
          source: {
            title: "Maitake Mushroom Tempura 2021 Grifola frondosa 舞茸の天ぷら",
            author: "ウィキ太郎(WikiTaro)",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Maitake_Mushroom_Tempura_2021_Grifola_frondosa_%E8%88%9E%E8%8C%B8%E3%81%AE%E5%A4%A9%E3%81%B7%E3%82%89.jpg",
          },
        },
      ],
      singapore: [
        {
          foodId: "singapore-laksa",
          dish: "叻沙",
          image: "/food/singapore-laksa.jpg",
          alt: "一碗叻沙汤面示例图片",
          source: {
            title: "Noo.Meat Laksa - Noo.Me 2024-12-02",
            author: "Andy Li",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Noo.Meat_Laksa_-_Noo.Me_2024-12-02.jpg",
          },
        },
        {
          foodId: "singapore-hainanese-chicken-rice",
          dish: "海南鸡饭",
          image: "/food/singapore-hainanese-chicken-rice.jpg",
          alt: "海南鸡饭配黄瓜和米饭示例图片",
          source: {
            title: "Hainanese chicken rice in Singapore",
            author: "Pauloleong2002",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Hainanese_chicken_rice_in_Singapore.jpg",
          },
        },
        {
          foodId: "singapore-chili-crab",
          dish: "辣椒螃蟹",
          image: "/food/singapore-chili-crab.jpg",
          alt: "盘中辣椒螃蟹示例图片",
          source: {
            title: "Chili crab zz",
            author: "chensiyuan",
            license: "CC BY-SA 3.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
            url: "https://commons.wikimedia.org/wiki/File:Chili_crab_zz.jpg",
          },
        },
      ],
      berlin: [
        {
          foodId: "berlin-currywurst",
          dish: "咖喱肠",
          image: "/food/berlin-currywurst.jpg",
          alt: "咖喱肠配薯条示例图片",
          source: {
            title: "Currywurst 2019",
            author: "Jrcraft Yt",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Currywurst_2019.jpg",
          },
        },
        {
          foodId: "berlin-doner-kebab",
          dish: "旋转烤肉卷",
          image: "/food/berlin-doner-kebab.jpg",
          alt: "面包夹烤肉与蔬菜的旋转烤肉卷示例图片",
          source: {
            title: "Döner Kebab, Berlin, 2010 (01)",
            author: "AleGranholm",
            license: "CC BY 2.0",
            licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
            url: "https://commons.wikimedia.org/wiki/File:D%C3%B6ner_Kebab,_Berlin,_2010_(01).jpg",
          },
        },
        {
          foodId: "berlin-berliner-pfannkuchen",
          dish: "柏林果酱包",
          image: "/food/berlin-berliner-pfannkuchen.jpg",
          alt: "切开后可见果酱夹心的柏林果酱包示例图片",
          source: {
            title: "Berliner Pfannkuchen 5",
            author: "Sebastian Koppehel",
            license: "CC BY 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:Berliner_Pfannkuchen_5.jpg",
          },
        },
      ],
      "new-york": [
        {
          foodId: "new-york-bagel",
          dish: "贝果",
          image: "/food/new-york-bagel.jpg",
          alt: "夹烟熏三文鱼的芝麻贝果示例图片",
          source: {
            title: "Montreal bagel with lox",
            author: "Funknendai",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:Montreal_bagel_with_lox.jpg",
          },
        },
        {
          foodId: "new-york-pizza",
          dish: "纽约披萨",
          image: "/food/new-york-pizza.jpg",
          alt: "手拿纽约风格披萨切片示例图片",
          source: {
            title: "New York Style Pizza New Park",
            author: "Wil540 art",
            license: "CC BY-SA 4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
            url: "https://commons.wikimedia.org/wiki/File:New_York_Style_Pizza_New_Park.jpg",
          },
        },
        {
          foodId: "new-york-cheesecake",
          dish: "纽约芝士蛋糕",
          image: "/food/new-york-cheesecake.jpg",
          alt: "表面覆有红色果酱的纽约芝士蛋糕示例图片",
          source: {
            title: "New York cheesecake 3",
            author: "Muago",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            url: "https://commons.wikimedia.org/wiki/File:New_York_cheesecake_3.jpg",
          },
        },
      ],
    },
  },
];

function normalizeFood(regionId, provider, food) {
  const source = Object.freeze({
    providerId: provider.id,
    provider: provider.name,
    ...food.source,
  });

  return Object.freeze({
    ...food,
    regionId,
    providerId: provider.id,
    credit: `${source.provider} · ${source.license} · ${source.author} · resized`,
    source,
  });
}

function normalizeProvider(definition) {
  const regions = {};

  for (const [regionId, foods] of Object.entries(definition.regions)) {
    regions[regionId] = Object.freeze(
      foods.map((food) => normalizeFood(regionId, definition, food)),
    );
  }

  return Object.freeze({
    id: definition.id,
    name: definition.name,
    regions: Object.freeze(regions),
  });
}

const FOOD_PROVIDERS = Object.freeze(
  FOOD_PROVIDER_DEFINITIONS.map(normalizeProvider),
);

const foodByRegionId = new Map();
const providerById = new Map();

for (const provider of FOOD_PROVIDERS) {
  providerById.set(provider.id, provider);
  for (const [regionId, foods] of Object.entries(provider.regions)) {
    const candidates = foodByRegionId.get(regionId) || [];
    candidates.push(...foods);
    foodByRegionId.set(regionId, candidates);
  }
}

for (const [regionId, foods] of foodByRegionId) {
  foodByRegionId.set(regionId, Object.freeze(foods));
}

function getFoodProvider(providerId) {
  return providerById.get(providerId) || null;
}

function getFoodCandidatesForRegion(regionId) {
  return foodByRegionId.get(regionId) || Object.freeze([]);
}

function getFoodForRegion(regionId) {
  return getFoodCandidatesForRegion(regionId)[0] || null;
}

function assertCatalog(condition, message) {
  if (!condition) {
    throw new Error(`Invalid food catalog: ${message}`);
  }
}

function assertCatalogText(value, path) {
  assertCatalog(
    typeof value === "string" && value.trim().length > 0,
    `${path} must be a non-empty string`,
  );
}

function validateFoodProviders(providers, expectedRegionIds) {
  assertCatalog(Array.isArray(providers) && providers.length > 0, "providers must be a non-empty array");

  const providerIds = new Set();
  const foodIds = new Set();
  const allImagePaths = new Set();
  const providedRegionIds = new Set();

  for (const [providerIndex, provider] of providers.entries()) {
    const providerPath = `providers[${providerIndex}]`;
    assertCatalog(provider && typeof provider === "object", `${providerPath} must be an object`);
    assertCatalogText(provider.id, `${providerPath}.id`);
    assertCatalogText(provider.name, `${providerPath}.name`);
    assertCatalog(!providerIds.has(provider.id), `${providerPath}.id must be unique`);
    providerIds.add(provider.id);
    assertCatalog(
      provider.regions && typeof provider.regions === "object" && !Array.isArray(provider.regions),
      `${providerPath}.regions must be an object`,
    );

    for (const [regionId, foods] of Object.entries(provider.regions)) {
      providedRegionIds.add(regionId);
      const regionPath = `${providerPath}.regions.${regionId}`;
      assertCatalog(Array.isArray(foods) && foods.length >= 3, `${regionPath} must contain at least three foods`);
      const regionFoodIds = new Set();
      const regionDishes = new Set();
      const regionImages = new Set();

      for (const [foodIndex, food] of foods.entries()) {
        const foodPath = `${regionPath}[${foodIndex}]`;
        assertCatalog(food && typeof food === "object", `${foodPath} must be an object`);
        assertCatalogText(food.foodId, `${foodPath}.foodId`);
        assertCatalog(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(food.foodId),
          `${foodPath}.foodId must be a stable kebab-case id`,
        );
        assertCatalog(!foodIds.has(food.foodId), `${foodPath}.foodId must be globally unique`);
        assertCatalog(!regionFoodIds.has(food.foodId), `${foodPath}.foodId must be unique within a region`);
        foodIds.add(food.foodId);
        regionFoodIds.add(food.foodId);
        assertCatalog(food.regionId === regionId, `${foodPath}.regionId must match ${regionId}`);
        assertCatalog(food.providerId === provider.id, `${foodPath}.providerId must match ${provider.id}`);
        assertCatalogText(food.dish, `${foodPath}.dish`);
        assertCatalog(!regionDishes.has(food.dish), `${foodPath}.dish must be unique within a region`);
        regionDishes.add(food.dish);
        assertCatalog(
          typeof food.image === "string" && /^\/food\/[a-z0-9-]+\.jpg$/.test(food.image),
          `${foodPath}.image must be a local JPEG path`,
        );
        assertCatalog(!regionImages.has(food.image), `${foodPath}.image must be unique within a region`);
        assertCatalog(!allImagePaths.has(food.image), `${foodPath}.image must be globally unique`);
        regionImages.add(food.image);
        allImagePaths.add(food.image);
        assertCatalogText(food.alt, `${foodPath}.alt`);
        assertCatalogText(food.credit, `${foodPath}.credit`);
        assertCatalog(
          food.source && typeof food.source === "object",
          `${foodPath}.source is required`,
        );
        assertCatalog(
          food.source.providerId === provider.id,
          `${foodPath}.source.providerId must match ${provider.id}`,
        );
        assertCatalog(
          food.source.provider === provider.name,
          `${foodPath}.source.provider must match ${provider.name}`,
        );
        assertCatalogText(food.source.title, `${foodPath}.source.title`);
        assertCatalogText(food.source.author, `${foodPath}.source.author`);
        assertCatalogText(food.source.license, `${foodPath}.source.license`);
        assertCatalog(
          typeof food.source.licenseUrl === "string" &&
            food.source.licenseUrl.startsWith("https://creativecommons.org/"),
          `${foodPath}.source.licenseUrl must be an HTTPS Creative Commons URL`,
        );
        assertCatalog(
          typeof food.source.url === "string" &&
            food.source.url.startsWith("https://commons.wikimedia.org/wiki/File:"),
          `${foodPath}.source.url must be a Wikimedia Commons file page`,
        );
      }
    }
  }

  if (expectedRegionIds) {
    assertCatalog(Array.isArray(expectedRegionIds), "expectedRegionIds must be an array");
    const expected = new Set(expectedRegionIds);
    assertCatalog(expected.size === expectedRegionIds.length, "expectedRegionIds must be unique");
    assertCatalog(
      providedRegionIds.size === expected.size,
      `region coverage mismatch: expected ${expected.size}, got ${providedRegionIds.size}`,
    );
    for (const regionId of expected) {
      assertCatalog(providedRegionIds.has(regionId), `missing food candidates for ${regionId}`);
    }
  }

  return providers;
}

module.exports = {
  FOOD_PROVIDERS,
  getFoodCandidatesForRegion,
  getFoodForRegion,
  getFoodProvider,
  validateFoodProviders,
};

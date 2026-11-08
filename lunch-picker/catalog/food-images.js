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

module.exports = {
  FOOD_PROVIDERS,
  getFoodCandidatesForRegion,
  getFoodForRegion,
  getFoodProvider,
};

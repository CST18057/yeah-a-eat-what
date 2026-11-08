"use strict";

const foodByRegionId = Object.freeze({
  beijing: {
    dish: "北京烤鸭",
    image: "/food/beijing-peking-duck.jpg",
    alt: "盘中片好的北京烤鸭示例图片",
    credit: "Wikimedia Commons · CC BY-SA 4.0 · Mcyjerry",
    source: {
      provider: "Wikimedia Commons",
      title: "Peking duck with sugar scallion",
      author: "Mcyjerry",
      license: "CC BY-SA 4.0",
      url: "https://commons.wikimedia.org/wiki/File:Peking_duck_with_sugar_scallion.jpg",
    },
  },
  shanghai: {
    dish: "小笼包",
    image: "/food/shanghai-xiaolongbao.jpg",
    alt: "蒸笼里的小笼包示例图片",
    credit: "Wikimedia Commons · CC BY 2.0 · Junhao!",
    source: {
      provider: "Wikimedia Commons",
      title: "Xiao Long Bao by Junhao!",
      author: "Junhao!",
      license: "CC BY 2.0",
      url: "https://commons.wikimedia.org/wiki/File:Xiao_Long_Bao_by_Junhao!.jpg",
    },
  },
  guangzhou: {
    dish: "广式点心",
    image: "/food/guangzhou-dim-sum.jpg",
    alt: "摆满蒸笼的广式点心示例图片",
    credit: "Wikimedia Commons · CC0 · afterdog",
    source: {
      provider: "Wikimedia Commons",
      title: "Dim Sum Breakfast",
      author: "afterdog",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Dim_Sum_Breakfast.jpg",
    },
  },
  chengdu: {
    dish: "四川火锅",
    image: "/food/chengdu-hotpot.jpg",
    alt: "红汤四川火锅与配菜示例图片",
    credit: "Wikimedia Commons · CC0 · Fumikas Sagisavas",
    source: {
      provider: "Wikimedia Commons",
      title: "Sichuan-style hotpot",
      author: "Fumikas Sagisavas",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Sichuan-style_hotpot.jpg",
    },
  },
  xian: {
    dish: "肉夹馍",
    image: "/food/xian-roujiamo.jpg",
    alt: "肉夹馍与豆腐汤示例图片",
    credit: "Wikimedia Commons · CC0 · Suginami",
    source: {
      provider: "Wikimedia Commons",
      title: "Roujiamo and Laoling Laodoufu",
      author: "Suginami",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Roujiamo_and_Laoling_Laodoufu.jpg",
    },
  },
  tokyo: {
    dish: "寿司",
    image: "/food/tokyo-sushi.jpg",
    alt: "黑色餐盘上的寿司拼盘示例图片",
    credit: "Wikimedia Commons · CC0 · Mojmir Churavy",
    source: {
      provider: "Wikimedia Commons",
      title: "Sushi Plate in Organic Sushi Prague 4",
      author: "Mojmir Churavy",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Sushi_Plate_in_Organic_Sushi_Prague_4.jpg",
    },
  },
  singapore: {
    dish: "叻沙",
    image: "/food/singapore-laksa.jpg",
    alt: "一碗叻沙汤面示例图片",
    credit: "Wikimedia Commons · CC0 · Andy Li",
    source: {
      provider: "Wikimedia Commons",
      title: "Noo.Meat Laksa - Noo.Me 2024-12-02",
      author: "Andy Li",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Noo.Meat_Laksa_-_Noo.Me_2024-12-02.jpg",
    },
  },
  berlin: {
    dish: "咖喱肠",
    image: "/food/berlin-currywurst.jpg",
    alt: "咖喱肠配薯条示例图片",
    credit: "Wikimedia Commons · CC0 · Jrcraft Yt",
    source: {
      provider: "Wikimedia Commons",
      title: "Currywurst 2019",
      author: "Jrcraft Yt",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Currywurst_2019.jpg",
    },
  },
  "new-york": {
    dish: "贝果",
    image: "/food/new-york-bagel.jpg",
    alt: "夹烟熏三文鱼的芝麻贝果示例图片",
    credit: "Wikimedia Commons · CC0 · Funknendai",
    source: {
      provider: "Wikimedia Commons",
      title: "Montreal bagel with lox",
      author: "Funknendai",
      license: "CC0",
      url: "https://commons.wikimedia.org/wiki/File:Montreal_bagel_with_lox.jpg",
    },
  },
});

function getFoodForRegion(regionId) {
  return foodByRegionId[regionId] || null;
}

module.exports = {
  getFoodForRegion,
};

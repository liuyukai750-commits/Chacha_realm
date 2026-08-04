import type { CityId } from "../contracts";
import type { CityGeography, DistrictGeography, GeoBoundary, PublicSpotRecord } from "../lib/geo";

const rectangle = (
  south: number,
  west: number,
  north: number,
  east: number,
): GeoBoundary => ({
  outer: [
    { latitude: south, longitude: west },
    { latitude: south, longitude: east },
    { latitude: north, longitude: east },
    { latitude: north, longitude: west },
  ],
});

const districts = (entries: readonly (readonly [string, string])[]): readonly DistrictGeography[] =>
  entries.map(([id, name]) => ({ id, name }));

export const cities: readonly CityGeography[] = [
  {
    id: "changsha",
    name: "长沙",
    boundaries: [rectangle(27.85, 110.88, 28.68, 114.25)],
    districts: districts([
      ["cs-furong", "芙蓉区"], ["cs-tianxin", "天心区"], ["cs-yuelu", "岳麓区"],
      ["cs-kaifu", "开福区"], ["cs-yuhua", "雨花区"], ["cs-wangcheng", "望城区"],
      ["cs-changsha-county", "长沙县"], ["cs-liuyang", "浏阳市"], ["cs-ningxiang", "宁乡市"],
    ]),
  },
  {
    id: "beijing",
    name: "北京",
    boundaries: [rectangle(39.44, 115.42, 41.06, 117.5)],
    districts: districts([
      ["bj-dongcheng", "东城区"], ["bj-xicheng", "西城区"], ["bj-chaoyang", "朝阳区"],
      ["bj-fengtai", "丰台区"], ["bj-shijingshan", "石景山区"], ["bj-haidian", "海淀区"],
      ["bj-mentougou", "门头沟区"], ["bj-fangshan", "房山区"], ["bj-tongzhou", "通州区"],
      ["bj-shunyi", "顺义区"], ["bj-changping", "昌平区"], ["bj-daxing", "大兴区"],
      ["bj-huairou", "怀柔区"], ["bj-pinggu", "平谷区"], ["bj-miyun", "密云区"],
      ["bj-yanqing", "延庆区"],
    ]),
  },
  {
    id: "shanghai",
    name: "上海",
    boundaries: [rectangle(30.67, 120.85, 31.88, 122.2)],
    districts: districts([
      ["sh-huangpu", "黄浦区"], ["sh-xuhui", "徐汇区"], ["sh-changning", "长宁区"],
      ["sh-jingan", "静安区"], ["sh-putuo", "普陀区"], ["sh-hongkou", "虹口区"],
      ["sh-yangpu", "杨浦区"], ["sh-minhang", "闵行区"], ["sh-baoshan", "宝山区"],
      ["sh-jiading", "嘉定区"], ["sh-pudong", "浦东新区"], ["sh-jinshan", "金山区"],
      ["sh-songjiang", "松江区"], ["sh-qingpu", "青浦区"], ["sh-fengxian", "奉贤区"],
      ["sh-chongming", "崇明区"],
    ]),
  },
  {
    id: "guangzhou",
    name: "广州",
    boundaries: [rectangle(22.43, 112.95, 23.94, 114.06)],
    districts: districts([
      ["gz-yuexiu", "越秀区"], ["gz-haizhu", "海珠区"], ["gz-liwan", "荔湾区"],
      ["gz-tianhe", "天河区"], ["gz-baiyun", "白云区"], ["gz-huangpu", "黄埔区"],
      ["gz-huadu", "花都区"], ["gz-panyu", "番禺区"], ["gz-nansha", "南沙区"],
      ["gz-conghua", "从化区"], ["gz-zengcheng", "增城区"],
    ]),
  },
  {
    id: "shenzhen",
    name: "深圳",
    boundaries: [rectangle(22.44, 113.72, 22.86, 114.64)],
    districts: districts([
      ["sz-futian", "福田区"], ["sz-luohu", "罗湖区"], ["sz-nanshan", "南山区"],
      ["sz-yantian", "盐田区"], ["sz-baoan", "宝安区"], ["sz-longgang", "龙岗区"],
      ["sz-longhua", "龙华区"], ["sz-pingshan", "坪山区"], ["sz-guangming", "光明区"],
      ["sz-dapeng", "大鹏新区"],
    ]),
  },
] as const;

export const publicSpots: readonly PublicSpotRecord[] = [
  { id: "cs-orange-isle", cityId: "changsha", districtId: "cs-yuelu", name: "橘子洲", coordinates: { latitude: 28.1896845, longitude: 112.9561264 }, verification: "verified" },
  { id: "cs-yuelu-mountain", cityId: "changsha", districtId: "cs-yuelu", name: "岳麓山", coordinates: { latitude: 28.1869583, longitude: 112.9283216 }, verification: "verified" },
  { id: "cs-wuyi-square", cityId: "changsha", districtId: "cs-furong", name: "五一广场", coordinates: { latitude: 28.1985991, longitude: 112.9709227 }, verification: "verified" },
  { id: "cs-hunan-museum", cityId: "changsha", districtId: "cs-kaifu", name: "湖南博物院", coordinates: { latitude: 28.21526, longitude: 112.988 }, verification: "verified" },
  { id: "cs-tianxin-pavilion", cityId: "changsha", districtId: "cs-tianxin", name: "天心阁", coordinates: { latitude: 28.1871623, longitude: 112.9758666 }, verification: "verified" },

  { id: "bj-temple-of-heaven", cityId: "beijing", districtId: "bj-dongcheng", name: "天坛公园", coordinates: { latitude: 39.8799066, longitude: 116.4028716 }, verification: "verified" },
  { id: "bj-olympic-forest", cityId: "beijing", districtId: "bj-chaoyang", name: "奥林匹克森林公园", coordinates: { latitude: 40.0207203, longitude: 116.3849388 }, verification: "verified" },
  { id: "bj-summer-palace", cityId: "beijing", districtId: "bj-haidian", name: "颐和园", coordinates: { latitude: 39.9900983, longitude: 116.2647403 }, verification: "verified" },
  { id: "bj-zoo", cityId: "beijing", districtId: "bj-xicheng", name: "北京动物园", coordinates: { latitude: 39.941041, longitude: 116.3295423 }, verification: "verified" },
  { id: "bj-garden-expo", cityId: "beijing", districtId: "bj-fengtai", name: "北京园博园", coordinates: { latitude: 39.8744679, longitude: 116.1906716 }, verification: "verified" },

  { id: "sh-peoples-square", cityId: "shanghai", districtId: "sh-huangpu", name: "人民广场", coordinates: { latitude: 31.2349378, longitude: 121.4705704 }, verification: "verified" },
  { id: "sh-xujiahui-park", cityId: "shanghai", districtId: "sh-xuhui", name: "徐家汇公园", coordinates: { latitude: 31.2004153, longitude: 121.4383511 }, verification: "verified" },
  { id: "sh-zhongshan-park", cityId: "shanghai", districtId: "sh-changning", name: "中山公园", coordinates: { latitude: 31.2233192, longitude: 121.4156242 }, verification: "verified" },
  { id: "sh-natural-history-museum", cityId: "shanghai", districtId: "sh-jingan", name: "上海自然博物馆", coordinates: { latitude: 31.2368655, longitude: 121.4577002 }, verification: "verified" },
  { id: "sh-gongqing-forest-park", cityId: "shanghai", districtId: "sh-yangpu", name: "共青森林公园", coordinates: { latitude: 31.3208192, longitude: 121.5479883 }, verification: "verified" },

  { id: "gz-yuexiu-park", cityId: "guangzhou", districtId: "gz-yuexiu", name: "越秀公园", coordinates: { latitude: 23.1425136, longitude: 113.2604084 }, verification: "verified" },
  { id: "gz-shamian-park", cityId: "guangzhou", districtId: "gz-liwan", name: "沙面公园", coordinates: { latitude: 23.1083501, longitude: 113.2395608 }, verification: "verified" },
  { id: "gz-library", cityId: "guangzhou", districtId: "gz-tianhe", name: "广州图书馆", coordinates: { latitude: 23.1188425, longitude: 113.320569 }, verification: "verified" },
  { id: "gz-haizhu-lake", cityId: "guangzhou", districtId: "gz-haizhu", name: "海珠湖公园", coordinates: { latitude: 23.073, longitude: 113.323 }, verification: "prelaunch_review" },
  { id: "gz-baiyun-south-gate", cityId: "guangzhou", districtId: "gz-baiyun", name: "白云山南门（云台花园）", coordinates: { latitude: 23.1583491, longitude: 113.2888053 }, verification: "prelaunch_review" },

  { id: "sz-lianhuashan-park", cityId: "shenzhen", districtId: "sz-futian", name: "莲花山公园", coordinates: { latitude: 22.5566275, longitude: 114.0532386 }, verification: "verified" },
  { id: "sz-talent-park", cityId: "shenzhen", districtId: "sz-nanshan", name: "深圳人才公园", coordinates: { latitude: 22.5175, longitude: 113.9977 }, verification: "prelaunch_review" },
  { id: "sz-donghu-park", cityId: "shenzhen", districtId: "sz-luohu", name: "东湖公园", coordinates: { latitude: 22.5656286, longitude: 114.1436852 }, verification: "verified" },
  { id: "sz-baoan-park", cityId: "shenzhen", districtId: "sz-baoan", name: "宝安公园", coordinates: { latitude: 22.5892592, longitude: 113.8978036 }, verification: "prelaunch_review" },
  { id: "sz-longcheng-park", cityId: "shenzhen", districtId: "sz-longgang", name: "龙城公园", coordinates: { latitude: 22.70725, longitude: 114.21357 }, verification: "prelaunch_review" },
] as const;

export function getCity(cityId: CityId): CityGeography | undefined {
  return cities.find((city) => city.id === cityId);
}

export function getPublicSpot(spotId: string): PublicSpotRecord | undefined {
  return publicSpots.find((spot) => spot.id === spotId);
}

export function toPublicSpotSummary(spot: PublicSpotRecord) {
  return { id: spot.id, cityId: spot.cityId, districtId: spot.districtId, name: spot.name };
}

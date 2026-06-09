import type { GameEvent } from '../core/types.js';

export const EVENTS: GameEvent[] = [
  {
    id: 'good_harvest',
    type: 'seasonal',
    condition: 'season === autumn',
    probability: 0.3,
    season: 'autumn',
    narrative: { template: '今年风调雨顺，庄稼收成特别好，粮仓都堆满了。', severity: 'notable' },
  },
  {
    id: 'bad_weather',
    type: 'random',
    condition: 'true',
    probability: 0.2,
    narrative: { template: '天气骤变，狂风暴雨席卷了小镇，有些人受了风寒。', severity: 'dramatic' },
  },
  {
    id: 'festival',
    type: 'seasonal',
    condition: 'season === spring',
    probability: 0.15,
    season: 'spring',
    narrative: { template: '春暖花开，镇上举办了一年一度的春社，大家载歌载舞，喜气洋洋。', severity: 'peaceful' },
  },
  {
    id: 'merchant_arrival',
    type: 'random',
    condition: 'true',
    probability: 0.2,
    narrative: { template: '一队远方的商队路过桃源镇，带来了稀奇古怪的外地货物。', severity: 'notable' },
  },
  {
    id: 'epidemic',
    type: 'seasonal',
    condition: 'season === winter',
    probability: 0.1,
    season: 'winter',
    narrative: { template: '寒冬时节，镇上开始流传一种时疫，王大夫忙得脚不沾地。', severity: 'dramatic' },
  },
  {
    id: 'discovery',
    type: 'random',
    condition: 'true',
    probability: 0.15,
    narrative: { template: '有人在劳作中有了新的发现，兴奋地与邻居分享。', severity: 'notable' },
  },
  {
    id: 'fire',
    type: 'random',
    condition: 'true',
    probability: 0.05,
    narrative: { template: '夜里镇上发生了火灾，幸亏发现及时，大家齐心协力把火扑灭了。', severity: 'epochal' },
  },
  {
    id: 'wedding_boom',
    type: 'seasonal',
    condition: 'season === spring',
    probability: 0.1,
    season: 'spring',
    narrative: { template: '今年春天似乎特别适合谈情说爱，镇上有好几对年轻人成了亲。', severity: 'notable' },
  },
];

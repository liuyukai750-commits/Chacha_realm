insert into public.cities (id, name) values
  ('changsha', '长沙'),
  ('beijing', '北京'),
  ('shanghai', '上海'),
  ('guangzhou', '广州'),
  ('shenzhen', '深圳')
on conflict (id) do update set name = excluded.name;

insert into public.districts (id, city_id, name) values
  ('changsha-furong', 'changsha', '芙蓉区'),
  ('changsha-yuelu', 'changsha', '岳麓区'),
  ('changsha-tianxin', 'changsha', '天心区'),
  ('beijing-dongcheng', 'beijing', '东城区'),
  ('beijing-chaoyang', 'beijing', '朝阳区'),
  ('beijing-haidian', 'beijing', '海淀区'),
  ('shanghai-huangpu', 'shanghai', '黄浦区'),
  ('shanghai-xuhui', 'shanghai', '徐汇区'),
  ('shanghai-pudong', 'shanghai', '浦东新区'),
  ('guangzhou-yuexiu', 'guangzhou', '越秀区'),
  ('guangzhou-tianhe', 'guangzhou', '天河区'),
  ('guangzhou-haizhu', 'guangzhou', '海珠区'),
  ('shenzhen-futian', 'shenzhen', '福田区'),
  ('shenzhen-nanshan', 'shenzhen', '南山区'),
  ('shenzhen-luohu', 'shenzhen', '罗湖区')
on conflict (id) do update set city_id = excluded.city_id, name = excluded.name;

insert into public.public_spots (id, city_id, district_id, name, latitude, longitude) values
  ('10000000-0000-4000-8000-000000000001', 'changsha', 'changsha-furong', '五一广场', 28.19502, 112.97667),
  ('10000000-0000-4000-8000-000000000002', 'changsha', 'changsha-yuelu', '岳麓山北门', 28.18934, 112.93722),
  ('10000000-0000-4000-8000-000000000003', 'changsha', 'changsha-tianxin', '橘子洲头', 28.16691, 112.96026),
  ('20000000-0000-4000-8000-000000000001', 'beijing', 'beijing-dongcheng', '地坛公园南门', 39.95062, 116.41730),
  ('20000000-0000-4000-8000-000000000002', 'beijing', 'beijing-chaoyang', '朝阳公园南门', 39.92951, 116.47712),
  ('20000000-0000-4000-8000-000000000003', 'beijing', 'beijing-haidian', '海淀公园东门', 39.98992, 116.30028),
  ('30000000-0000-4000-8000-000000000001', 'shanghai', 'shanghai-huangpu', '人民公园南门', 31.23068, 121.46804),
  ('30000000-0000-4000-8000-000000000002', 'shanghai', 'shanghai-xuhui', '徐家汇公园', 31.19531, 121.43753),
  ('30000000-0000-4000-8000-000000000003', 'shanghai', 'shanghai-pudong', '世纪公园一号门', 31.21478, 121.55089),
  ('40000000-0000-4000-8000-000000000001', 'guangzhou', 'guangzhou-yuexiu', '越秀公园正门', 23.13769, 113.26436),
  ('40000000-0000-4000-8000-000000000002', 'guangzhou', 'guangzhou-tianhe', '天河公园南门', 23.12462, 113.36213),
  ('40000000-0000-4000-8000-000000000003', 'guangzhou', 'guangzhou-haizhu', '晓港公园北门', 23.09182, 113.27755),
  ('50000000-0000-4000-8000-000000000001', 'shenzhen', 'shenzhen-futian', '莲花山公园南门', 22.54761, 114.05558),
  ('50000000-0000-4000-8000-000000000002', 'shenzhen', 'shenzhen-nanshan', '深圳湾公园日出剧场', 22.50521, 113.94398),
  ('50000000-0000-4000-8000-000000000003', 'shenzhen', 'shenzhen-luohu', '东湖公园南门', 22.57251, 114.13954)
on conflict (id) do update set
  city_id = excluded.city_id,
  district_id = excluded.district_id,
  name = excluded.name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  active = true;

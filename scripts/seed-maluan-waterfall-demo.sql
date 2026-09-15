BEGIN;

INSERT INTO routes (
  route_id,
  route_slug,
  route_name,
  province_code,
  province_name,
  city_name,
  area_name,
  route_type,
  map_search_keyword,
  route_status,
  agent_prefill_status,
  map_sync_status,
  credibility_level,
  beginner_friendly_level,
  duration_minutes,
  distance_km,
  elevation_gain_m,
  max_altitude_m,
  best_season_text,
  start_point_name,
  end_point_name,
  transport_summary,
  route_logic_summary,
  exit_logic_summary,
  easiest_panic_point_text,
  not_for_whom_text,
  summary_short,
  beginner_fit_reason,
  created_by,
  updated_by,
  last_prefill_at,
  last_map_synced_at
) VALUES (
  'gd-shenzhen-maluan-waterfall-demo',
  'guangdong-shenzhen-maluan-waterfall-demo',
  '马峦山瀑布线',
  'gd',
  '广东',
  '深圳',
  '坪山',
  'out_and_back',
  '马峦山郊野公园碧岭片区入口',
  'draft',
  'completed',
  'completed',
  'A',
  'medium',
  180,
  4.6,
  240,
  320,
  '丰水期观瀑最佳，连续降雨或雷暴预警时不建议进入',
  '马峦山郊野公园-西北门(碧岭入口)',
  '马峦山郊野公园-九天瀑',
  '建议地铁14号线到坪山围/南约后换乘公交或打车到碧岭入口；周末自驾需尽早到场，停车后步行入园。',
  '从碧岭入口沿瀑布步道持续上行，前段是溪谷步道与栈道，中段开始连续爬升，终点到九天瀑后原路返回。',
  '优先使用原路返回策略；在瀑布入口和步道中段均可作为保守折返点，不建议在陌生岔路继续探入。',
  '连续石阶和湿滑水边是最容易让新手慌张的路段，建议把瀑布入口作为第一观察点，不适即刻折返。',
  '不适合穿平底休闲鞋、雨天硬上、携幼童强行冲顶或把这里当城市公园散步路线的人群。',
  '深圳更有“野感”的新手进阶样例：溪谷、瀑布、连续爬升和湿滑风险都更明显，适合验证结构化节点是否真的有用。',
  '路线成熟、步道清晰，但风险主要集中在湿滑石面和连续上坡，因此很适合做“新手可走但必须讲清楚”的结构化导航样例。',
  'seed_sql',
  'seed_sql',
  now(),
  now()
) ON CONFLICT (route_id)
DO UPDATE SET
  route_slug = EXCLUDED.route_slug,
  route_name = EXCLUDED.route_name,
  province_code = EXCLUDED.province_code,
  province_name = EXCLUDED.province_name,
  city_name = EXCLUDED.city_name,
  area_name = EXCLUDED.area_name,
  route_type = EXCLUDED.route_type,
  map_search_keyword = EXCLUDED.map_search_keyword,
  route_status = EXCLUDED.route_status,
  agent_prefill_status = EXCLUDED.agent_prefill_status,
  map_sync_status = EXCLUDED.map_sync_status,
  credibility_level = EXCLUDED.credibility_level,
  beginner_friendly_level = EXCLUDED.beginner_friendly_level,
  duration_minutes = EXCLUDED.duration_minutes,
  distance_km = EXCLUDED.distance_km,
  elevation_gain_m = EXCLUDED.elevation_gain_m,
  max_altitude_m = EXCLUDED.max_altitude_m,
  best_season_text = EXCLUDED.best_season_text,
  start_point_name = EXCLUDED.start_point_name,
  end_point_name = EXCLUDED.end_point_name,
  transport_summary = EXCLUDED.transport_summary,
  route_logic_summary = EXCLUDED.route_logic_summary,
  exit_logic_summary = EXCLUDED.exit_logic_summary,
  easiest_panic_point_text = EXCLUDED.easiest_panic_point_text,
  not_for_whom_text = EXCLUDED.not_for_whom_text,
  summary_short = EXCLUDED.summary_short,
  beginner_fit_reason = EXCLUDED.beginner_fit_reason,
  updated_by = EXCLUDED.updated_by,
  last_prefill_at = EXCLUDED.last_prefill_at,
  last_map_synced_at = EXCLUDED.last_map_synced_at,
  updated_at = now();

INSERT INTO route_geometries (
  route_id,
  geometry_version,
  route_polyline,
  start_point,
  end_point,
  overview_center,
  bounding_box,
  overview_zoom,
  elevation_profile_points,
  map_provider_hint,
  source_provider,
  synced_at
) VALUES (
  'gd-shenzhen-maluan-waterfall-demo',
  1,
  ST_GeomFromText(
    'LINESTRING(
      114.29896454384 22.66313017813,
      114.29906465703 22.663069483601,
      114.29925486554 22.662948187588,
      114.29947510345 22.66281672713,
      114.2998151751 22.661804498727,
      114.30029547379 22.660911572117,
      114.30034539156 22.660391257334,
      114.30022508249 22.659661917764,
      114.30058515061 22.657559809367,
      114.30091540237 22.655918019821,
      114.30097546242 22.655437708334,
      114.30075525334 22.654728870921,
      114.30038484774 22.654740916272,
      114.30021466817 22.654471900147,
      114.29990433063 22.654063760873,
      114.29865274915 22.653392109219,
      114.29843255052 22.652553740589,
      114.29860287298 22.652122510443,
      114.29901362147 22.651289644129,
      114.29873337769 22.650701639083,
      114.298473261 22.649803576439,
      114.2979827339 22.649167329384,
      114.29780270118 22.648478793425,
      114.29735268309 22.646792590011,
      114.29693224661 22.646226207879,
      114.29660180979 22.645949137755,
      114.29607115268 22.645364044922
    )',
    4326
  ),
  ST_GeomFromText('POINT(114.298973 22.663075)', 4326),
  ST_GeomFromText('POINT(114.296132 22.645339)', 4326),
  ST_GeomFromText('POINT(114.298523 22.654247)', 4326),
  ST_GeomFromText(
    'POLYGON((
      114.296071 22.645364,
      114.296071 22.663130,
      114.300975 22.663130,
      114.300975 22.645364,
      114.296071 22.645364
    ))',
    4326
  ),
  14,
  '[]'::jsonb,
  'baidu-walking',
  'baidu',
  now()
) ON CONFLICT (route_id)
DO UPDATE SET
  geometry_version = EXCLUDED.geometry_version,
  route_polyline = EXCLUDED.route_polyline,
  start_point = EXCLUDED.start_point,
  end_point = EXCLUDED.end_point,
  overview_center = EXCLUDED.overview_center,
  bounding_box = EXCLUDED.bounding_box,
  overview_zoom = EXCLUDED.overview_zoom,
  elevation_profile_points = EXCLUDED.elevation_profile_points,
  map_provider_hint = EXCLUDED.map_provider_hint,
  source_provider = EXCLUDED.source_provider,
  synced_at = EXCLUDED.synced_at,
  updated_at = now();

DELETE FROM route_nodes WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_nodes (
  node_id,
  route_id,
  node_type,
  node_name,
  point,
  stage_order,
  distance_from_start_m,
  trigger_radius_m,
  navigation_hint,
  wrong_choice_hint,
  display_priority
) VALUES
  (
    'maluan_start_gate',
    'gd-shenzhen-maluan-waterfall-demo',
    'start',
    '碧岭入口起步点',
    ST_GeomFromText('POINT(114.298973 22.663075)', 4326),
    1,
    0,
    35,
    '从西北门进园后沿主步道上行，前段基本是沿溪谷的宽步道，不要过早钻入支路。',
    NULL,
    10
  ),
  (
    'maluan_waterfall_entry',
    'gd-shenzhen-maluan-waterfall-demo',
    'checkpoint',
    '瀑布入口检查点',
    ST_GeomFromText('POINT(114.300785 22.656669)', 4326),
    1,
    900,
    30,
    '到这里开始进入连续观瀑和爬升路段，先补水、收好雨伞和手机，再继续上行。',
    '如果这里已经觉得闷热、腿软或鞋底开始打滑，建议把这里当折返点。',
    20
  ),
  (
    'maluan_galaxy_falls',
    'gd-shenzhen-maluan-waterfall-demo',
    'view',
    '银河瀑观景位',
    ST_GeomFromText('POINT(114.300354 22.654643)', 4326),
    2,
    1200,
    25,
    '这里适合短暂停留拍照，但脚下常有湿滑青苔，停留时先找平稳位置。',
    '不要为了贴近水边拍照离开主步道，雨后石面会比看起来更滑。',
    30
  ),
  (
    'maluan_mid_fork',
    'gd-shenzhen-maluan-waterfall-demo',
    'fork',
    '溪谷步道岔点',
    ST_GeomFromText('POINT(114.299014 22.651290)', 4326),
    2,
    1650,
    28,
    '继续跟着主栈道和瀑布方向上行，不要被看起来更“近”的野路分流。',
    '看见土路或无明显护栏的小径时不要拐入，原路回到木栈道再确认方向。',
    40
  ),
  (
    'maluan_end_waterfall',
    'gd-shenzhen-maluan-waterfall-demo',
    'end',
    '九天瀑折返点',
    ST_GeomFromText('POINT(114.296132 22.645339)', 4326),
    3,
    2270,
    35,
    '到九天瀑后以休整和补水为主，确认体力与天气后按原路完整返回。',
    NULL,
    50
  );

DELETE FROM route_exit_points WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_exit_points (
  exit_point_id,
  route_id,
  exit_name,
  point,
  stage_order,
  exit_type,
  exit_condition_text,
  exit_action_text,
  exit_priority
) VALUES
  (
    'maluan_exit_gate_return',
    'gd-shenzhen-maluan-waterfall-demo',
    '原路返回碧岭入口',
    ST_GeomFromText('POINT(114.298973 22.663075)', 4326),
    1,
    'return',
    '出发后 20-30 分钟内若体感闷热、装备不合适或同行人明显掉队，直接原路回到西北门。',
    '停止继续上行，沿已走过的主步道返回入口停车场或公交点。',
    'primary'
  ),
  (
    'maluan_exit_waterfall_entry',
    'gd-shenzhen-maluan-waterfall-demo',
    '瀑布入口保守折返点',
    ST_GeomFromText('POINT(114.300785 22.656669)', 4326),
    1,
    'safe_stop',
    '进入瀑布段前若发现鞋底抓地力不足、雷阵雨临近或队伍节奏明显失衡，应在此结束。',
    '在入口平台短整后掉头返回，不再进入更湿滑的连续爬升路段。',
    'secondary'
  );

DELETE FROM route_risk_points WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_risk_points (
  risk_point_id,
  route_id,
  risk_type,
  risk_level,
  point,
  stage_order,
  risk_title,
  risk_text,
  safe_action_text,
  trigger_radius_m
) VALUES
  (
    'maluan_risk_slippery_stone',
    'gd-shenzhen-maluan-waterfall-demo',
    'slippery_surface',
    'high',
    ST_GeomFromText('POINT(114.300354 22.654643)', 4326),
    2,
    '瀑布边石面湿滑',
    '银河瀑附近长期潮湿，雨后石阶和靠水边的岩面容易附着青苔，新手停留拍照时最容易打滑。',
    '放慢脚步、不要并排通行，不要离开主步道靠近裸露岩面；必要时直接折返到瀑布入口。',
    35
  ),
  (
    'maluan_risk_continuous_climb',
    'gd-shenzhen-maluan-waterfall-demo',
    'fatigue_climb',
    'medium',
    ST_GeomFromText('POINT(114.298473 22.649804)', 4326),
    2,
    '中段连续爬升容易掉速',
    '从瀑布段往上到九天瀑前，台阶和上坡会连续叠加，体力一般的新手在这里容易心率拉高、步频失控。',
    '采用短步慢走和固定休息节奏，若出现头晕、恶心或腿部发抖，立即停止上行并原路返回。',
    40
  );

DELETE FROM route_tags WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_tags (route_id, tag_group, tag_code, tag_name, is_core, sort_order) VALUES
  ('gd-shenzhen-maluan-waterfall-demo', 'experience', 'newbie_progression', '新手进阶', true, 10),
  ('gd-shenzhen-maluan-waterfall-demo', 'terrain', 'waterfall_trail', '瀑布溪谷步道', true, 20),
  ('gd-shenzhen-maluan-waterfall-demo', 'risk', 'slippery_after_rain', '雨后湿滑', true, 30),
  ('gd-shenzhen-maluan-waterfall-demo', 'scene', 'waterfall_view', '瀑布景观', false, 40)
ON CONFLICT (route_id, tag_code)
DO UPDATE SET
  tag_group = EXCLUDED.tag_group,
  tag_name = EXCLUDED.tag_name,
  is_core = EXCLUDED.is_core,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO route_checklist_profiles (
  route_id,
  duration_bucket,
  intensity_bucket,
  terrain_tags,
  weather_sensitive_tags,
  mandatory_supply_codes,
  optional_supply_codes,
  emergency_supply_codes,
  checklist_note_text
) VALUES (
  'gd-shenzhen-maluan-waterfall-demo',
  'half_day',
  'moderate',
  '["mountain_path","steps","streamside"]'::jsonb,
  '["rain","thunder","heat"]'::jsonb,
  '["water","non_slip_shoes","phone_power_bank"]'::jsonb,
  '["trekking_pole","quick_dry_towel","electrolyte"]'::jsonb,
  '["flashlight","basic_first_aid","rain_shell"]'::jsonb,
  '这条线不是纯公园散步，建议把“防滑鞋 + 充足饮水 + 雨天止损意识”作为最低配置。'
) ON CONFLICT (route_id)
DO UPDATE SET
  duration_bucket = EXCLUDED.duration_bucket,
  intensity_bucket = EXCLUDED.intensity_bucket,
  terrain_tags = EXCLUDED.terrain_tags,
  weather_sensitive_tags = EXCLUDED.weather_sensitive_tags,
  mandatory_supply_codes = EXCLUDED.mandatory_supply_codes,
  optional_supply_codes = EXCLUDED.optional_supply_codes,
  emergency_supply_codes = EXCLUDED.emergency_supply_codes,
  checklist_note_text = EXCLUDED.checklist_note_text,
  updated_at = now();

DELETE FROM route_weather_rules WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_weather_rules (
  weather_rule_id,
  route_id,
  scenario_type,
  severity,
  rule_text,
  action_text,
  threshold_config
) VALUES
  (
    'maluan_weather_rain',
    'gd-shenzhen-maluan-waterfall-demo',
    'rain',
    'avoid',
    '连续降雨或雨后未干时，瀑布边石阶湿滑风险明显上升。',
    '优先改期；若已到场，仅在入口平台活动，不进入连续观瀑上行段。',
    '{"hint":"rain > 0mm or trail still wet"}'::jsonb
  ),
  (
    'maluan_weather_thunder',
    'gd-shenzhen-maluan-waterfall-demo',
    'thunder',
    'avoid',
    '雷暴预警时山谷步道存在突发强降水和停留暴露风险。',
    '立即取消行程或从最近安全位置原路撤回入口，不在溪谷和空旷平台停留。',
    '{"hint":"thunder warning"}'::jsonb
  );

DELETE FROM route_faqs WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_faqs (
  faq_id,
  route_id,
  question,
  answer,
  source_basis,
  generated_by_ai,
  reviewed_by_human,
  display_order
) VALUES
  (
    'maluan_faq_001',
    'gd-shenzhen-maluan-waterfall-demo',
    '完全没爬过山的人能走吗？',
    '可以把它当“新手进阶线”而不是纯散步线。步道清晰，但湿滑和连续爬升更明显，建议穿防滑鞋、控制节奏，并把瀑布入口设成第一折返点。',
    '["官方公园介绍","步道游玩攻略"]'::jsonb,
    false,
    true,
    10
  ),
  (
    'maluan_faq_002',
    'gd-shenzhen-maluan-waterfall-demo',
    '雨后为什么反而不建议去？',
    '丰水期瀑布更壮观，但同样会放大石面湿滑、溪边打滑和突发降雨风险。对新手来说，安全优先级高于景观收益。',
    '["官方公园介绍","本地游玩提示"]'::jsonb,
    false,
    true,
    20
  );

DELETE FROM route_sources WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';
INSERT INTO route_sources (
  source_id,
  route_id,
  source_type,
  source_title,
  source_url,
  source_summary,
  credibility_score,
  used_for_fields,
  raw_text_excerpt,
  checked_at
) VALUES
  (
    'maluan_src_official',
    'gd-shenzhen-maluan-waterfall-demo',
    'official',
    '深圳市政府：马峦山郊野公园介绍',
    'https://www.sz.gov.cn/szzt2010/gysz/zrgy/content/post_10776168.html',
    '用于确认公园位置、瀑布群特征、开放信息与“观山听瀑”的官方描述。',
    95,
    '["summary_short","beginner_fit_reason","route_sources"]'::jsonb,
    '马峦山郊野公园拥有龙潭瀑布及榄核桥瀑布两大瀑布群，是深圳以远足登山、观山听瀑为特色的郊野公园。',
    now()
  ),
  (
    'maluan_src_local_guide',
    'gd-shenzhen-maluan-waterfall-demo',
    'travel_note',
    '深圳本地宝：碧岭瀑布群步道玩法与注意事项',
    'http://m.bendibao.com/show869153.html',
    '用于补充碧岭入口、3.05 公里步道、高差约 240 米，以及“走小门看瀑布”的实操提醒。',
    82,
    '["route_logic_summary","route_nodes","route_exit_points","route_risk_points"]'::jsonb,
    '碧岭瀑布群步道全长约 3.05 公里，登高约 240 米；看瀑布需从碧岭入口进入，雨后步道更湿滑。',
    now()
  ),
  (
    'maluan_src_baidu_map',
    'gd-shenzhen-maluan-waterfall-demo',
    'map',
    '百度地图检索与步行路线结果',
    NULL,
    '用于确认碧岭入口、九天瀑、瀑布入口等 POI 坐标，并生成当前演示用步行折线。',
    90,
    '["route_geometry","route_nodes","route_exit_points","route_risk_points"]'::jsonb,
    '使用百度 Place Search 与 DirectionLite 获取碧岭入口到九天瀑的演示级步行路线与关键点。',
    now()
  );

UPDATE routes
SET updated_at = now()
WHERE route_id = 'gd-shenzhen-maluan-waterfall-demo';

COMMIT;

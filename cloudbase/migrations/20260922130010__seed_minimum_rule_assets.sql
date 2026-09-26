BEGIN;

INSERT INTO supply_items (
  supply_code,
  supply_name,
  supply_group,
  default_required,
  description
)
VALUES
  ('water', '足量饮水', 'basic', true, '基础补水，所有路线默认必带。'),
  ('powerbank', '充电宝', 'basic', true, '导航与联络依赖手机电量，默认必带。'),
  ('light_rain_jacket', '轻便雨衣', 'weather', false, '天气不稳定或山地多变时建议携带。'),
  ('headlamp', '头灯', 'emergency', false, '晚归、弱光或突发停留时的应急照明。'),
  ('basic_first_aid', '基础急救包', 'emergency', false, '应对轻微擦伤、扭伤等常见情况。')
ON CONFLICT (supply_code) DO NOTHING;

INSERT INTO checklist_rule_templates (
  rule_code,
  rule_name,
  applicable_duration_bucket,
  applicable_intensity_bucket,
  applicable_weather_scenario,
  applicable_terrain_tag,
  supply_code,
  required_level,
  reason_template
)
VALUES
  (
    'rule_basic_water_half_day',
    '半日线路默认带水',
    'half_day',
    'easy',
    NULL,
    NULL,
    'water',
    'required',
    '沿途不应假设一定能稳定补水。'
  ),
  (
    'rule_basic_powerbank_all',
    '所有路线默认带充电宝',
    NULL,
    NULL,
    NULL,
    NULL,
    'powerbank',
    'required',
    '定位、导航与返程联络都依赖手机续航。'
  ),
  (
    'rule_weather_rain_jacket',
    '降雨场景建议雨衣',
    NULL,
    NULL,
    'rain',
    NULL,
    'light_rain_jacket',
    'recommended',
    '天气转差时，轻便防雨层可以显著降低不适与失温风险。'
  ),
  (
    'rule_emergency_headlamp_late_start',
    '晚出发建议带头灯',
    NULL,
    NULL,
    'late_start',
    NULL,
    'headlamp',
    'conditional',
    '若返程时间逼近傍晚，照明应作为底线保障。'
  ),
  (
    'rule_emergency_first_aid_trail',
    '成熟步道仍建议备基础急救',
    NULL,
    NULL,
    NULL,
    'mature_trail',
    'basic_first_aid',
    'recommended',
    '轻度擦伤、打滑和磨脚是新手更高频的风险。'
  )
ON CONFLICT (rule_code) DO NOTHING;

COMMIT;

# 样板线路 01 `route.json` 示例

## 1. 文档信息

- 状态：演示样例

- 日期：2026-09-02

- 对应样板线：`docs/requirements/route-entry-sample-01.md`

- 对应 manifest：`docs/requirements/route-entry-sample-01-manifest-example.md`

- 重要说明：本文件用于定义 `route.json` 的推荐结构，供前端、后台和内容生产共同对齐。示例中的坐标、距离、时长、阶段边界等均为演示占位，真实发布前必须替换为正式核验数据。

## 2. 目标

- 把线路内容从“文档表达”推进到“结构化数据表达”；

- 支撑路线详情页、在途页、分段页、节点卡片、岔路提醒、下撤提醒等前端消费场景；

- 为后台录入、打包生成和后续版本更新提供单一数据结构参考。

## 3. `route.json` 示例

```json
{
  "routeId": "zj-hz-jiuxi-longjing-demo-01",
  "status": "demo",
  "title": "杭州九溪烟树 - 龙井村轻徒步线",
  "subtitle": "一条让新手在杭州也能获得溪谷林荫轻成就感的入门路书",
  "location": {
    "province": "浙江",
    "city": "杭州",
    "area": "西湖风景名胜区周边"
  },
  "routeMeta": {
    "routeType": "out_and_back_with_optional_loop",
    "isMatureTrail": true,
    "difficultyLevel": "low",
    "durationMinutes": {
      "min": 150,
      "max": 210,
      "recommended": 180
    },
    "distanceKm": {
      "min": 6.0,
      "max": 8.0,
      "recommended": 7.0
    },
    "elevationGainMeters": {
      "min": 180,
      "max": 260,
      "recommended": 220
    },
    "bestSeasons": ["spring", "autumn", "early_winter"],
    "avoidConditions": ["heavy_rain", "thunderstorm", "midday_heat"]
  },
  "positioning": {
    "whyGoodForBeginners": "整体路线成熟，体能门槛较低，关键岔路可通过参照物清晰表达，适合作为第一次获得徒步完成感的样板线。",
    "labels": {
      "landscape": "溪谷感",
      "safety": "成熟步道",
      "achievement": "周末可完成"
    },
    "oneLinePitch": "先沿溪建立安全感，再完成一次简单方向判断，最后收获轻成就感。"
  },
  "transport": {
    "arrival": "打车或公共交通到九溪入口周边后步行入线",
    "recommendedStartTime": "08:30-10:00",
    "notes": [
      "建议避开夏季正午时段",
      "节假日需预留人流缓慢通行时间"
    ]
  },
  "userFit": {
    "suitableFor": [
      "首次徒步用户",
      "周末轻运动用户",
      "拍照型用户",
      "结伴轻出行用户"
    ],
    "notSuitableFor": [
      "追求高强度拉练用户",
      "需要极强挑战感用户",
      "雨天不愿走湿滑石板路用户"
    ]
  },
  "safetySummary": {
    "primaryAnxietyPoint": "从九溪主线转入上行步道时，用户容易怀疑是不是走错了",
    "primaryWrongTurnPoint": "靠近龙井村前的游客分流岔口",
    "signalNote": "整体城区周边信号通常可用，但局部山坳段可能出现短暂弱信号",
    "weatherNote": "暴雨后湿滑风险显著上升；雷雨和高温正午时段不建议入线",
    "generalRule": "始终停留在成熟步道，不离开主线进入溪边湿滑区域和非成熟小土路"
  },
  "startPoint": {
    "id": "start-01",
    "name": "九溪入口",
    "coordinate": {
      "lat": 30.000001,
      "lng": 120.000001
    }
  },
  "endPoint": {
    "id": "end-01",
    "name": "龙井村观景休息点",
    "coordinate": {
      "lat": 30.000999,
      "lng": 120.000999
    }
  },
  "stages": [
    {
      "id": "stage-1",
      "title": "九溪入口 - 溪谷缓行段",
      "orderIndex": 1,
      "startNodeId": "node-01",
      "endNodeId": "node-02",
      "estimatedMinutes": 45,
      "userGoal": "建立沿溪主线安全感",
      "primaryPrompt": "先沿成熟步道顺溪前进",
      "mapAsset": "images/stage-1-map.jpg"
    },
    {
      "id": "stage-2",
      "title": "溪谷上行 - 林荫过渡段",
      "orderIndex": 2,
      "startNodeId": "node-02",
      "endNodeId": "node-03",
      "estimatedMinutes": 55,
      "userGoal": "完成第一次关键方向变化",
      "primaryPrompt": "看到成熟上行步道时开始上行",
      "mapAsset": "images/stage-2-map.jpg"
    },
    {
      "id": "stage-3",
      "title": "上行转折 - 龙井接近段",
      "orderIndex": 3,
      "startNodeId": "node-03",
      "endNodeId": "node-05",
      "estimatedMinutes": 50,
      "userGoal": "避免被游客分流误导并抵达可完成节点",
      "primaryPrompt": "人多不等于方向对",
      "mapAsset": "images/stage-3-map.jpg"
    }
  ],
  "nodes": [
    {
      "id": "node-01",
      "name": "九溪入口",
      "type": "start",
      "orderIndex": 1,
      "stageId": "stage-1",
      "coordinate": {
        "lat": 30.000001,
        "lng": 120.000001
      },
      "landmarkImage": "images/landmark-01-entry.jpg",
      "whatUserSees": "入口步道和明显沿溪方向",
      "whatItMeans": "已经进入正确主线",
      "correctAction": "沿成熟主步道进入",
      "wrongAction": "在入口外围停车区或零散小路误入"
    },
    {
      "id": "node-02",
      "name": "沿溪石桥",
      "type": "landmark",
      "orderIndex": 2,
      "stageId": "stage-1",
      "coordinate": {
        "lat": 30.000201,
        "lng": 120.000201
      },
      "landmarkImage": "images/landmark-02-bridge.jpg",
      "whatUserSees": "低矮石桥、明显溪流、沿线游客主流方向",
      "whatItMeans": "仍在主线上",
      "correctAction": "继续沿既定主步道前进",
      "wrongAction": "离开成熟步道走到湿滑石面"
    },
    {
      "id": "node-03",
      "name": "上行转折口",
      "type": "fork",
      "orderIndex": 3,
      "stageId": "stage-2",
      "coordinate": {
        "lat": 30.000401,
        "lng": 120.000401
      },
      "landmarkImage": "images/landmark-03-uphill-turn.jpg",
      "whatUserSees": "成熟上行步道和方向转折",
      "whatItMeans": "这里要开始上行",
      "correctAction": "转入成熟上行步道",
      "wrongAction": "继续贴溪走向非目标支路",
      "forkHighlightId": "fork-a"
    },
    {
      "id": "node-04",
      "name": "龙井前游客分流岔路",
      "type": "fork",
      "orderIndex": 4,
      "stageId": "stage-3",
      "coordinate": {
        "lat": 30.000701,
        "lng": 120.000701
      },
      "landmarkImage": "images/landmark-04-longjing-fork.jpg",
      "whatUserSees": "村落边缘分流点和明显不同方向的人流",
      "whatItMeans": "不要盲目跟人流",
      "correctAction": "按路书指向前往休息点或常规下撤方向",
      "wrongAction": "盲目跟随游客人流进入非目标支路",
      "forkHighlightId": "fork-b"
    },
    {
      "id": "node-05",
      "name": "龙井村休息点",
      "type": "end",
      "orderIndex": 5,
      "stageId": "stage-3",
      "coordinate": {
        "lat": 30.000999,
        "lng": 120.000999
      },
      "landmarkImage": "images/landmark-05-rest-point.jpg",
      "whatUserSees": "可停留休息的开阔点位",
      "whatItMeans": "到达可完成节点，可准备返回或下撤",
      "correctAction": "补水休息，并按原路返回或常规道路下撤",
      "wrongAction": "继续临时加线进入未知支路"
    }
  ],
  "forkHighlights": [
    {
      "id": "fork-a",
      "name": "溪谷转上行岔路",
      "stageId": "stage-2",
      "coordinate": {
        "lat": 30.000401,
        "lng": 120.000401
      },
      "mapAsset": "images/fork-a-map.jpg",
      "riskLevel": "high",
      "correctDirection": "离开纯沿溪方向，转入成熟上行步道",
      "wrongDirection": "继续贴近溪边走小路",
      "whyEasyToMiss": "新手直觉会认为沿着水一直走更安全",
      "prompt": "看到成熟上行步道时，请开始上行"
    },
    {
      "id": "fork-b",
      "name": "龙井前游客分流岔路",
      "stageId": "stage-3",
      "coordinate": {
        "lat": 30.000701,
        "lng": 120.000701
      },
      "mapAsset": "images/fork-b-map.jpg",
      "riskLevel": "medium",
      "correctDirection": "按路书方向前往休息点或常规下撤方向",
      "wrongDirection": "盲目跟随人流进入非目标支路",
      "whyEasyToMiss": "用户会把人多误认为方向对",
      "prompt": "人多不等于方向对，以路书方向和参照物为准"
    }
  ],
  "forbiddenZones": [
    {
      "id": "forbidden-zone-1",
      "name": "溪边湿滑石面与非成熟小土路区域",
      "type": "slippery_and_non_recommended_path",
      "mapAsset": "images/forbidden-zone-map.jpg",
      "severity": "high",
      "reason": "湿滑、易摔倒、方向感弱，且不属于推荐成熟步道",
      "riskIfEntered": "可能摔倒、鞋袜湿透、路径判断失误并增加恐慌",
      "safeAlternative": "始终停留在成熟石板路、栈道或明确主步道上"
    }
  ],
  "exitPoints": [
    {
      "id": "exit-01",
      "name": "中段原路返回点",
      "coordinate": {
        "lat": 30.000450,
        "lng": 120.000450
      },
      "applicableWhen": ["fatigue", "rain_start", "companion_unwell"],
      "direction": "沿已通过的成熟步道原路返回九溪入口",
      "hasRoadAccess": true,
      "priority": 1
    },
    {
      "id": "exit-02",
      "name": "龙井村道路下撤点",
      "coordinate": {
        "lat": 30.000950,
        "lng": 120.000950
      },
      "applicableWhen": ["time_shortage", "weather_worsening", "need_fast_exit"],
      "direction": "从龙井村常规道路方向离开，不继续延伸徒步",
      "hasRoadAccess": true,
      "priority": 2
    }
  ],
  "onRoutePrompts": [
    {
      "id": "prompt-01",
      "trigger": "enter_stage_1",
      "copy": "这段先不用焦虑，先沿成熟步道顺溪前进。"
    },
    {
      "id": "prompt-02",
      "trigger": "approach_fork_a",
      "copy": "看到成熟上行步道时开始上行，不要继续贴溪走小路。"
    },
    {
      "id": "prompt-03",
      "trigger": "approach_fork_b",
      "copy": "接近龙井时，人多不等于方向对。"
    },
    {
      "id": "prompt-04",
      "trigger": "near_exit_time_threshold",
      "copy": "距离建议下撤还有 X 小时，请判断是否继续。"
    }
  ],
  "packDependencies": {
    "manifestFile": "manifest.json",
    "weatherFile": "weather.json",
    "checklistFile": "checklist.json",
    "emergencyFile": "emergency.json"
  },
  "qaNotes": [
    "当前 route.json 仅为演示样例，未绑定真实轨迹",
    "真实发布前需为 nodes、forkHighlights、exitPoints 补齐正式坐标",
    "stage 数量需与 manifest 中的 integrity.stageCount 保持一致"
  ]
}
```

## 4. 字段设计说明

### 4.1 顶层信息

- `routeId`、`title`、`location`、`routeMeta` 用于路线详情页和本地缓存概览

- `positioning` 用于给详情页提供“为什么适合新手”的产品语言

- `transport`、`userFit` 用于出发前决策

### 4.2 `safetySummary`

- 聚合最关键的安全边界信息

- 适合在详情页顶部、出发前提醒层和在途页摘要区域复用

### 4.3 `stages`

- 这是在途体验的主骨架

- 前端可以按阶段组织：

  - 阶段标题

  - 对应分段图

  - 本段用户目标

  - 本段核心提示

### 4.4 `nodes`

- `nodes` 是最细粒度的路书点位结构

- 既可支撑时间线式浏览，也可支撑卡片式浏览

- `type` 推荐控制在有限集合中，例如：

  - `start`

  - `landmark`

  - `fork`

  - `end`

### 4.5 `forkHighlights`

- `nodes` 负责通用点位结构

- `forkHighlights` 负责高风险岔路的强化信息

- 这样可以避免把普通节点和强提醒节点混成同一种展示权重

### 4.6 `forbiddenZones`

- 当前示例先保留文本 + 图片表达

- 未来若支持更精细的空间渲染，可扩展：

  - `polygon`

  - `boundaryPoints`

  - `nearbyNodeIds`

### 4.7 `exitPoints`

- 下撤点是独立结构，不附着在某一个普通节点上更利于复用

- 在途页、倒计时提醒、详情页都可能读取此结构

### 4.8 `onRoutePrompts`

- 用于前端触发轻量提醒

- MVP 阶段可以先做简单触发：

  - 进入某阶段

  - 接近岔路

  - 接近建议下撤时间

## 5. 前端消费建议

- 详情页优先消费：

  - `routeMeta`

  - `positioning`

  - `transport`

  - `userFit`

  - `safetySummary`

- 在途页优先消费：

  - `stages`

  - `nodes`

  - `forkHighlights`

  - `forbiddenZones`

  - `exitPoints`

  - `onRoutePrompts`

- 若某些坐标暂缺，可先以 `node.orderIndex` 和关联图片完成卡片式在途路书，避免完全依赖地图渲染

## 6. 后台录入建议

- 后台表单可以按以下模块录入：

  - 路线基础信息

  - 产品定位与标签

  - 交通与适合人群

  - 阶段配置

  - 节点配置

  - 岔路强化配置

  - 禁区配置

  - 下撤点配置

  - 在途提示配置

- `nodeId / stageId / forkHighlightId / exitPointId` 应由后台自动生成，避免手填出错

## 7. 当前仍是演示占位的字段

- 所有 `coordinate`

- 所有精确时长和距离

- 轨迹线实际绑定关系

- 阶段边界和下撤点优先级

- 正式枚举值定义

## 8. 完成定义

- 满足以下条件后，可认为 `route.json` 结构已能进入研发对齐：

  - 能支撑详情页和在途页的核心数据读取

  - 能和 manifest、图片资产建立明确映射

  - 后台录入模块可直接按此拆分

  - 用真实数据替换演示值后，不需要推翻结构本身

## 9. 下一步衔接建议

- 基于本 `route.json` 示例，下一份最值得产出的文档是：

  - `样板线路 01 checklist.json / weather.json / emergency.json 示例`

- 这样就能把离线路书包中除主路线和图片外的三个辅助 JSON 也补齐。


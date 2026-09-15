# 样板线路 01 离线路书包 Manifest 示例

## 1. 文档信息

- 状态：演示样例

- 日期：2026-09-02

- 对应样板线：`docs/requirements/route-entry-sample-01.md`

- 对应图像清单：`docs/requirements/route-entry-sample-01-image-production-checklist.md`

- 关联技术方案：`docs/decisions/technical-solution-v1.md`

- 重要说明：本文件用于把现有产品、内容、图像方案推进到研发可消费的数据结构层。示例中的 `routeId`、坐标、版本号、资源校验值等字段仍属于演示占位，真实发布前必须替换为正式数据。

## 2. 目标

- 定义一条线路离线路书包的最小可用 manifest 结构；

- 让前端、后台、内容生产对同一个包格式达成共识；

- 为后续真实样板线打包、下载、缓存和版本更新提供基准。

## 3. 建议目录结构

```text
route-pack/
├── manifest.json
├── route.json
├── weather.json
├── checklist.json
├── emergency.json
└── images/
    ├── overview-map.jpg
    ├── stage-1-map.jpg
    ├── stage-2-map.jpg
    ├── stage-3-map.jpg
    ├── fork-a-map.jpg
    ├── fork-b-map.jpg
    ├── forbidden-zone-map.jpg
    ├── landmark-01-entry.jpg
    ├── landmark-02-bridge.jpg
    ├── landmark-03-uphill-turn.jpg
    ├── landmark-04-longjing-fork.jpg
    └── landmark-05-rest-point.jpg
```

## 4. `manifest.json` 示例

```json
{
  "routeId": "zj-hz-jiuxi-longjing-demo-01",
  "version": "0.1.0-demo",
  "updatedAt": "2026-09-02T00:00:00+08:00",
  "title": "杭州九溪烟树 - 龙井村轻徒步线",
  "province": "浙江",
  "city": "杭州",
  "packType": "offline_route_book",
  "status": "demo",
  "sourceOfTruth": "docs/requirements/route-entry-sample-01.md",
  "summary": {
    "durationMinutes": 180,
    "distanceKm": 7.0,
    "elevationGainMeters": 220,
    "difficultyLevel": "low",
    "routeType": "out_and_back_with_optional_loop"
  },
  "labels": {
    "landscape": "溪谷感",
    "safety": "成熟步道",
    "achievement": "周末可完成"
  },
  "offlineAssets": {
    "overviewMap": "images/overview-map.jpg",
    "stageMaps": [
      "images/stage-1-map.jpg",
      "images/stage-2-map.jpg",
      "images/stage-3-map.jpg"
    ],
    "forkMaps": [
      "images/fork-a-map.jpg",
      "images/fork-b-map.jpg"
    ],
    "forbiddenZoneMap": "images/forbidden-zone-map.jpg",
    "landmarks": [
      "images/landmark-01-entry.jpg",
      "images/landmark-02-bridge.jpg",
      "images/landmark-03-uphill-turn.jpg",
      "images/landmark-04-longjing-fork.jpg",
      "images/landmark-05-rest-point.jpg"
    ]
  },
  "entryGate": {
    "requiresChecklist": true,
    "requiresOfflinePackConfirmation": true,
    "showSafetyReminderBeforeEnter": true
  },
  "stages": [
    {
      "id": "stage-1",
      "title": "九溪入口 - 溪谷缓行段",
      "mapAsset": "images/stage-1-map.jpg",
      "primaryGoal": "建立沿溪主线安全感",
      "userPrompt": "先沿成熟步道顺溪前进"
    },
    {
      "id": "stage-2",
      "title": "溪谷上行 - 林荫过渡段",
      "mapAsset": "images/stage-2-map.jpg",
      "primaryGoal": "完成第一次关键方向变化",
      "userPrompt": "看到成熟上行步道时开始上行"
    },
    {
      "id": "stage-3",
      "title": "上行转折 - 龙井接近段",
      "mapAsset": "images/stage-3-map.jpg",
      "primaryGoal": "避免被游客分流误导",
      "userPrompt": "人多不等于方向对"
    }
  ],
  "forkHighlights": [
    {
      "id": "fork-a",
      "title": "溪谷转上行岔路",
      "mapAsset": "images/fork-a-map.jpg",
      "riskLevel": "high",
      "prompt": "不要继续贴溪走小路"
    },
    {
      "id": "fork-b",
      "title": "龙井前游客分流岔路",
      "mapAsset": "images/fork-b-map.jpg",
      "riskLevel": "medium",
      "prompt": "以路书方向和参照物为准"
    }
  ],
  "forbiddenZones": [
    {
      "id": "forbidden-zone-1",
      "title": "溪边湿滑石面与非成熟小土路区域",
      "mapAsset": "images/forbidden-zone-map.jpg",
      "severity": "high",
      "prompt": "不要离开成熟步道进入湿滑区域"
    }
  ],
  "landmarkCards": [
    {
      "id": "landmark-01",
      "title": "九溪入口",
      "imageAsset": "images/landmark-01-entry.jpg",
      "whatToSee": "入口步道和明显沿溪方向",
      "whatItMeans": "你已经进入正确主线"
    },
    {
      "id": "landmark-02",
      "title": "沿溪石桥",
      "imageAsset": "images/landmark-02-bridge.jpg",
      "whatToSee": "低矮石桥、明显溪流、沿线游客主流方向",
      "whatItMeans": "你仍在主线上"
    },
    {
      "id": "landmark-03",
      "title": "上行转折口",
      "imageAsset": "images/landmark-03-uphill-turn.jpg",
      "whatToSee": "成熟上行步道和方向转折",
      "whatItMeans": "这里要开始上行"
    },
    {
      "id": "landmark-04",
      "title": "龙井前游客分流岔路",
      "imageAsset": "images/landmark-04-longjing-fork.jpg",
      "whatToSee": "村落边缘分流点和明显不同方向的人流",
      "whatItMeans": "不要盲目跟人流"
    },
    {
      "id": "landmark-05",
      "title": "龙井村休息点",
      "imageAsset": "images/landmark-05-rest-point.jpg",
      "whatToSee": "可停留休息的开阔点位",
      "whatItMeans": "到达可完成节点，可准备返回或下撤"
    }
  ],
  "weather": {
    "hasWeatherBanner": true,
    "weatherFile": "weather.json",
    "officialAlertMode": "link_or_webview",
    "fallbackPrompt": "雷雨、暴雨后湿滑、高温正午时段不建议入线"
  },
  "checklist": {
    "checklistFile": "checklist.json",
    "version": "demo-v1",
    "mandatoryBeforeEnter": true
  },
  "emergency": {
    "emergencyFile": "emergency.json",
    "showBeforeEnter": true,
    "showInOnRoutePage": true
  },
  "progressReminder": {
    "countdownEnabled": true,
    "countdownCopy": "距离建议下撤还有 X 小时",
    "exitPointCount": 2
  },
  "integrity": {
    "stageCount": 3,
    "forkCount": 2,
    "landmarkCount": 5,
    "hasForbiddenZone": true
  },
  "qaNotes": [
    "当前为演示样例，未绑定真实坐标",
    "真实上线前需补齐应急联系方式和轨迹数据",
    "所有图片资产应与图像制作清单中的文件名完全一致"
  ]
}
```

## 5. 字段解释

### 5.1 顶层基础字段

- `routeId`：路线唯一标识，建议由 `省份-城市-路线名-版本` 组成

- `version`：路书包版本，用于缓存更新提示

- `updatedAt`：内容更新时间，用于判断是否需要重新下载

- `packType`：固定标识为 `offline_route_book`

- `status`：当前示例为 `demo`，正式线路可使用 `draft / published / archived`

### 5.2 `summary`

- 提供列表页、下载页和本地缓存页会反复使用的摘要信息

- 尽量只放稳定字段，不要放长文说明

### 5.3 `labels`

- 对应产品主标签体系：

  - `landscape`

  - `safety`

  - `achievement`

- 小程序卡片和详情页可以直接消费

### 5.4 `offlineAssets`

- 明确所有本地图片资源路径；

- 前端下载完成后只需按相对路径读取；

- 内容生产和研发都必须遵守同一命名规则。

### 5.5 `entryGate`

- 定义用户进入在途路书前的强约束；

- 用来支撑：

  - 未完成 checklist 不允许进入；

  - 未确认已下载离线路书包不允许进入；

  - 必须先看安全提醒。

### 5.6 `stages`

- 前端用来构建分段视图；

- 每段至少需要：

  - 标题

  - 对应分段图

  - 一句本段核心任务

  - 一句用户提示

### 5.7 `forkHighlights`

- 提供岔路重点模块数据；

- `riskLevel` 用于控制展示权重；

- `prompt` 用于直接展示短句提醒。

### 5.8 `forbiddenZones`

- 禁区不只是一张图，也是一类风险结构；

- 后续如果支持更精细标绘，可以在此扩展 polygon 或坐标信息。

### 5.9 `landmarkCards`

- 这是把地图认知转成现场判断的关键结构；

- `whatToSee` 和 `whatItMeans` 是最值得稳定保留的两个文案字段。

### 5.10 `weather` / `checklist` / `emergency`

- 这些字段把非图片资产挂接到同一个 pack 中；

- 前端拿到 manifest 后即可知道是否需要额外读取对应 JSON。

### 5.11 `progressReminder`

- 用来支撑“距离建议下撤还有 X 小时”常驻提醒；

- 真正倒计时逻辑可以由前端结合当前时间和 route 规则计算。

### 5.12 `integrity`

- 这是轻量的包完整性检查；

- 小程序下载完成后可快速判断资源是否缺失。

## 6. 前端消费建议

- 下载完成后，优先读取 `manifest.json`；

- 依据 `offlineAssets` 渲染总览图、分段图、岔路图、禁区图、参照物卡片；

- 依据 `entryGate` 决定用户能否进入在途路书；

- 依据 `weather`、`checklist`、`emergency` 再按需加载其他 JSON；

- 若某个资产缺失，优先给出明确缺失提示，不静默降级为“空白页”。

## 7. 后台生产建议

- 后台发布时，应自动校验：

  - manifest 中声明的图片文件是否存在；

  - `stageCount / forkCount / landmarkCount` 是否与实际数组长度一致；

  - `checklist.json`、`weather.json`、`emergency.json` 是否齐全；

  - `status=published` 时不允许存在演示占位字段。

## 8. 当前仍是演示占位的字段

- `routeId`

- `version`

- `updatedAt`

- 所有真实坐标与空间信息

- 真实轨迹文件绑定

- 正式应急联系方式

- 资源校验值或文件 hash

## 9. 完成定义

- 满足以下条件后，可认为 manifest 结构已可进入研发对齐：

  - 能覆盖离线路书包中的核心图片与 JSON 资源；

  - 能支撑出发前、在途中、风险提醒三个关键场景；

  - 内容、设计、研发对字段含义不存在重大歧义；

  - 从演示样例替换为真实数据后，不需要推翻结构本身。

## 10. 下一步衔接建议

- 基于本 manifest，下一份最值得产出的文档是：

  - `样板线路 01 route.json 示例`

- 它会继续把路线摘要、阶段、节点、岔路、下撤点和禁区数据推进到更细粒度的结构层。


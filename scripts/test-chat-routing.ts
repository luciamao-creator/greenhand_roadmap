/**
 * test-chat-routing.ts —— route-chat-routing.ts 的表驱动单测（纯函数、零网络）
 *
 * 运行：node --experimental-strip-types scripts/test-chat-routing.ts
 * 用途：把「单一判定点」(resolveTurnIntent) 与「库外实体识别」(scanOutOfLibraryEntity)
 * 的决策用表锁死，毫秒级反馈，替代「遇到新口语就加词」的补丁驱动写法。
 */

import { resolveTurnIntent, scanOutOfLibraryEntity, type RouteAlias } from "../lib/server/services/route-chat-routing.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error("  ✗ FAIL:", name);
  }
}

// ── 1) 本轮意图：唯一判定点 ───────────────────────────────────────────────────
// 关键断言：
//  - 「什么/哪些/推荐/换线」→ 新检索（newRequest）
//  - 「为什么/为何」问原因 → 算延续（缺省主语追问）
//  - 「它/相比/注意/这条」→ 延续
//  - 两边都命中（相比…要注意什么）或缺省 → 默认延续（新话题通常另有地域/实体词拦下）
//  - 仅弱疑问词（什么/介绍…）→ newRequest=true 且 weakNewOnly=true：
//    已显式聚焦时服务端据此保留聚焦（如「有什么亮点」不退出聚焦）
const intentCases: Array<[string, { continuation: boolean; newRequest: boolean; weakNewOnly?: boolean }]> = [
  ["四姑娘山的推荐线路吗？", { continuation: false, newRequest: true }],
  ["什么线路适合带一家老小?", { continuation: false, newRequest: true, weakNewOnly: false }],
  ["换一条难一点的线", { continuation: false, newRequest: true }],
  ["推荐几条北京线路", { continuation: false, newRequest: true }],
  ["为什么新手的挑战大", { continuation: true, newRequest: false }],
  ["相比其他路线要注意什么", { continuation: true, newRequest: false }],
  ["那它有难度吗", { continuation: true, newRequest: false }],
  ["夏天去要注意什么", { continuation: true, newRequest: false }],
  ["它需要注意什么", { continuation: true, newRequest: false }],
  ["这条线累吗", { continuation: true, newRequest: false }],
  ["北京秋天看红叶的古道", { continuation: true, newRequest: false }],
  // 弱疑问词：聚焦下的属性追问（回归用例：截图 bug「有什么亮点」曾被打散聚焦）
  ["有什么亮点", { continuation: false, newRequest: true, weakNewOnly: true }],
  ["介绍一下", { continuation: false, newRequest: true, weakNewOnly: true }],
  ["有哪些新手线路", { continuation: false, newRequest: true, weakNewOnly: false }],
];
for (const [q, exp] of intentCases) {
  const r = resolveTurnIntent(q);
  check(
    `intent[${q}]`,
    r.continuation === exp.continuation &&
      r.newRequest === exp.newRequest &&
      (exp.weakNewOnly === undefined || r.weakNewOnly === exp.weakNewOnly),
  );
}

// ── 2) 库外实体识别：候选提取 + 边界字 + 泛化词黑名单 ──────────────────────
const aliasIndex: RouteAlias[] = [
  { alias: "青城山前山步道", route: { route_id: "r1" } as never },
  { alias: "青城山", route: { route_id: "r1" } as never },
  { alias: "小鱼山步道", route: { route_id: "r2" } as never },
  { alias: "小鱼山", route: { route_id: "r2" } as never },
];
const geoSet = new Set(["四川", "成都", "都江堰", "山东", "青岛", "市南区"]);

// 期望命中：库外山体（核心名从后缀向前回溯，遇边界字断开）
// 期望 null：泛化词（短途/新手/路线）、库内线路、地域词
const entityCases: Array<[string, string | null]> = [
  ["新手适合四姑娘山吗", "四姑娘"],
  ["有四姑娘山的推荐线路吗？", "四姑娘"],
  ["四姑娘山现在去怎么样", "四姑娘"],
  ["宝石山步道风景好吗", "宝石"], // 库外山体，正确识别
  ["短途线路有哪些", null], // 泛化词黑名单
  ["新手路线", null], // 「路」是边界字 → 名被截断为空
  ["青城山前山步道", null], // 库内线路，不当库外实体
  ["青岛的短途线路", null], // 地域词 + 泛化词
  ["去北京周边徒步", null], // 地域词
];
for (const [text, exp] of entityCases) {
  const got = scanOutOfLibraryEntity(text, aliasIndex, geoSet);
  check(`entity[${text}]`, got === exp);
}

console.log(`\nroute-chat-routing 单测：${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);

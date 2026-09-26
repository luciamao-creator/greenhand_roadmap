"use client";

/**
 * 高德 JS API（2.0）按需加载器。
 * 通过 CDN 注入脚本，避免引入额外 npm 依赖；安全密钥必须在脚本加载前写入 window。
 * 返回的 Promise 解析为全局 AMap 对象（类型用 any，避免引入官方类型包）。
 */

type AMapNS = any;

let loadingPromise: Promise<AMapNS> | null = null;

export function loadAMap(): Promise<AMapNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("AMap 只能在浏览器端加载"));
  }
  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  const security = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;

  if (!key) {
    return Promise.reject(new Error("缺少 NEXT_PUBLIC_AMAP_JS_KEY，请在 .env 配置高德 Web 端(JS API) Key"));
  }

  // 安全密钥必须早于脚本执行
  if (security && !(window as AMapNS)._AMapSecurityConfig) {
    (window as AMapNS)._AMapSecurityConfig = { securityJsCode: security };
  }

  const w = window as AMapNS;
  if (w.AMap) return Promise.resolve(w.AMap);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<AMapNS>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://webapi.amap.com/maps?v=2.0&key=" +
      encodeURIComponent(key) +
      "&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.Geolocation,AMap.ToolBar,AMap.Scale";
    script.async = true;
    script.onload = () => {
      if (w.AMap) resolve(w.AMap);
      else reject(new Error("高德地图脚本已加载，但 AMap 全局对象不存在"));
    };
    script.onerror = () => reject(new Error("高德地图脚本加载失败（检查 Key / 网络 / 安全密钥）"));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

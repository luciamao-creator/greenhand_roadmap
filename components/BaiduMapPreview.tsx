"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GeoPoint = {
  type?: string;
  coordinates?: [number, number];
};

type RouteNode = {
  node_id: string;
  node_type?: string;
  node_name?: string;
  point?: GeoPoint;
  stage_order?: number;
  navigation_hint?: string;
  wrong_choice_hint?: string;
  display_priority?: number;
};

type ExitPoint = {
  exit_point_id: string;
  exit_name?: string;
  point?: GeoPoint;
  stage_order?: number;
  exit_type?: string;
  exit_condition_text?: string;
  exit_action_text?: string;
  exit_priority?: number;
};

type RiskPoint = {
  risk_point_id: string;
  risk_type?: string;
  risk_level?: string;
  point?: GeoPoint;
  stage_order?: number;
  risk_title?: string;
  risk_text?: string;
  safe_action_text?: string;
};

type FocusItemKind = "start" | "end" | "node" | "risk" | "exit";
type MapPresentationMode = "overview" | "key_nodes" | "detail";
type ZoomTier = "far" | "mid" | "near";

type FocusItem = {
  key: string;
  kind: FocusItemKind;
  title: string;
  subtitle: string;
  point: [number, number];
  zoom: number;
};

function parseGeoPoint(input: unknown): [number, number] | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const point = input as GeoPoint;
  if (point.type !== "Point" || !Array.isArray(point.coordinates) || point.coordinates.length < 2) {
    return null;
  }

  const [lng, lat] = point.coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
}

function parseLineCoordinates(routePolyline: any): [number, number][] {
  if (!routePolyline || routePolyline.type !== "LineString" || !Array.isArray(routePolyline.coordinates)) {
    return [];
  }

  return routePolyline.coordinates
    .filter((coord: unknown) => Array.isArray(coord) && coord.length >= 2)
    .map((coord: number[]) => [coord[0], coord[1]] as [number, number])
    .filter((coord: [number, number]) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
}

function markerDataUri(kind: FocusItemKind) {
  const palette: Record<FocusItemKind, { fill: string; stroke: string }> = {
    start: { fill: "#16a34a", stroke: "#dcfce7" },
    end: { fill: "#FF7A45", stroke: "#ffe4d6" },
    node: { fill: "#0ea5e9", stroke: "#e0f2fe" },
    risk: { fill: "#dc2626", stroke: "#fee2e2" },
    exit: { fill: "#2563eb", stroke: "#dbeafe" },
  };
  const color = palette[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="9" fill="${color.fill}" stroke="${color.stroke}" stroke-width="4"/><circle cx="14" cy="14" r="2.6" fill="white"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function markerDataUriWithSize(kind: FocusItemKind, size: number, emphasized = false) {
  const palette: Record<FocusItemKind, { fill: string; stroke: string; glow: string }> = {
    start: { fill: "#16a34a", stroke: "#dcfce7", glow: "rgba(22,163,74,0.20)" },
    end: { fill: "#FF7A45", stroke: "#ffe4d6", glow: "rgba(255,122,69,0.22)" },
    node: { fill: "#0ea5e9", stroke: "#e0f2fe", glow: "rgba(14,165,233,0.20)" },
    risk: { fill: "#dc2626", stroke: "#fee2e2", glow: "rgba(220,38,38,0.20)" },
    exit: { fill: "#2563eb", stroke: "#dbeafe", glow: "rgba(37,99,235,0.20)" },
  };
  const color = palette[kind];
  const center = size / 2;
  const innerRadius = emphasized ? size * 0.28 : size * 0.24;
  const outerRadius = emphasized ? size * 0.38 : size * 0.34;
  const glowRadius = emphasized ? size * 0.46 : size * 0.41;
  const strokeWidth = emphasized ? Math.max(4, size * 0.14) : Math.max(3, size * 0.12);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${center}" cy="${center}" r="${glowRadius}" fill="${color.glow}" />
      <circle cx="${center}" cy="${center}" r="${outerRadius}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${strokeWidth}" />
      <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="white" fill-opacity="0.96" />
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getKindTheme(kind: FocusItemKind) {
  const palette: Record<
    FocusItemKind,
    {
      badgeBg: string;
      badgeColor: string;
      cardBg: string;
      border: string;
    }
  > = {
    start: {
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
      cardBg: "#f0fdf4",
      border: "rgba(22,163,74,0.22)",
    },
    end: {
      badgeBg: "#ffe7dc",
      badgeColor: "#c2410c",
      cardBg: "#fff7f2",
      border: "rgba(255,122,69,0.28)",
    },
    node: {
      badgeBg: "#e0f2fe",
      badgeColor: "#0369a1",
      cardBg: "#f0f9ff",
      border: "rgba(14,165,233,0.24)",
    },
    risk: {
      badgeBg: "#fee2e2",
      badgeColor: "#b91c1c",
      cardBg: "#fef2f2",
      border: "rgba(220,38,38,0.24)",
    },
    exit: {
      badgeBg: "#dbeafe",
      badgeColor: "#1d4ed8",
      cardBg: "#eff6ff",
      border: "rgba(37,99,235,0.24)",
    },
  };
  return palette[kind];
}

function createInfoHtml(item: FocusItem) {
  return `
    <div style="min-width:180px;font-family:Arial,sans-serif;">
      <div style="font-size:14px;font-weight:700;color:#111827;">${item.title}</div>
      <div style="margin-top:6px;font-size:12px;line-height:18px;color:#4b5563;">${item.subtitle}</div>
    </div>
  `;
}

function getItemWeight(item: FocusItem) {
  if (item.kind === "risk") return 100;
  if (item.kind === "start" || item.kind === "end") return 95;
  if (item.kind === "exit") return 88;
  return 80;
}

function getZoomTier(zoom: number): ZoomTier {
  if (zoom < 15) {
    return "far";
  }
  if (zoom < 17) {
    return "mid";
  }
  return "near";
}

function truncateTitle(title: string, maxLength = 10) {
  if (title.length <= maxLength) {
    return title;
  }
  return `${title.slice(0, maxLength)}…`;
}

function getPresentationItems(items: FocusItem[], zoomTier: ZoomTier, mode: MapPresentationMode) {
  const picked: FocusItem[] = [];
  const seen = new Set<string>();
  const pickUpTo = (matcher: (item: FocusItem) => boolean, limit: number) => {
    if (limit <= 0) return;
    for (const item of items) {
      if (seen.has(item.key) || !matcher(item)) {
        continue;
      }
      picked.push(item);
      seen.add(item.key);
      if (picked.filter((candidate) => matcher(candidate)).length >= limit) {
        break;
      }
    }
  };

  if (zoomTier === "far" && mode !== "key_nodes") {
    return items.filter((item) => item.kind === "start" || item.kind === "end");
  }

  if (zoomTier === "far" || zoomTier === "mid") {
    const nodeLimit = mode === "key_nodes" ? 3 : 2;
    const riskLimit = mode === "key_nodes" ? 2 : 1;
    const exitLimit = mode === "key_nodes" ? 2 : 1;

    pickUpTo((item) => item.kind === "start", 1);
    pickUpTo((item) => item.kind === "risk", riskLimit);
    pickUpTo((item) => item.kind === "node", nodeLimit);
    pickUpTo((item) => item.kind === "exit", exitLimit);
    pickUpTo((item) => item.kind === "end", 1);

    return picked;
  }

  return items;
}

function getMarkerPresentation(item: FocusItem, mode: MapPresentationMode, zoomTier: ZoomTier, selected: boolean) {
  if (zoomTier === "far") {
    return {
      size: selected ? 24 : 22,
      labelText: item.title,
      labelVariant: "subtle" as const,
      haloRadiusM: undefined,
      haloFillOpacity: 0,
      haloStrokeOpacity: 0,
    };
  }

  if (zoomTier === "mid") {
    const shouldShowLabel =
      selected || item.kind === "start" || item.kind === "end" || item.kind === "risk";
    return {
      size: selected ? 28 : item.kind === "risk" ? 27 : item.kind === "start" || item.kind === "end" ? 25 : 23,
      labelText: shouldShowLabel ? truncateTitle(item.title, item.kind === "risk" ? 8 : 10) : undefined,
      labelVariant: shouldShowLabel ? ("prominent" as const) : ("subtle" as const),
      haloRadiusM:
        item.kind === "risk" ? 60 : selected ? 42 : undefined,
      haloFillOpacity: item.kind === "risk" ? 0.1 : 0.08,
      haloStrokeOpacity: item.kind === "risk" ? 0.3 : 0.22,
    };
  }

  const shouldHighlight =
    selected ||
    item.kind === "risk" ||
    item.kind === "start" ||
    item.kind === "end" ||
    mode === "detail";
  return {
    size: shouldHighlight ? 28 : 24,
    labelText: shouldHighlight ? item.title : undefined,
    labelVariant: shouldHighlight ? ("prominent" as const) : ("subtle" as const),
    haloRadiusM: selected && item.kind !== "risk" ? 48 : item.kind === "risk" ? 62 : undefined,
    haloFillOpacity: 0.08,
    haloStrokeOpacity: 0.22,
  };
}

function formatSyncTime(value?: string) {
  if (!value) {
    return "未同步";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "已同步";
  }

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFocusItems({
  routePoints,
  routeNodes,
  routeExitPoints,
  routeRiskPoints,
  startPointName,
  endPointName,
}: {
  routePoints: [number, number][];
  routeNodes: RouteNode[];
  routeExitPoints: ExitPoint[];
  routeRiskPoints: RiskPoint[];
  startPointName?: string;
  endPointName?: string;
}) {
  const items: FocusItem[] = [];

  if (routePoints[0]) {
    items.push({
      key: "start",
      kind: "start",
      title: startPointName || "起点",
      subtitle: "路线入口",
      point: routePoints[0],
      zoom: 16,
    });
  }

  const sortedNodes = [...routeNodes].sort((a, b) => {
    const priorityDiff = (b.display_priority ?? 0) - (a.display_priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return (a.stage_order ?? 999) - (b.stage_order ?? 999);
  });

  sortedNodes.forEach((node, index) => {
    const point = parseGeoPoint(node.point);
    if (!point) return;
    items.push({
      key: node.node_id || `node-${index}`,
      kind: "node",
      title: node.node_name || `关键节点 ${index + 1}`,
      subtitle: node.navigation_hint || node.wrong_choice_hint || "途经关键节点",
      point,
      zoom: 17,
    });
  });

  routeRiskPoints.forEach((risk, index) => {
    const point = parseGeoPoint(risk.point);
    if (!point) return;
    items.push({
      key: risk.risk_point_id || `risk-${index}`,
      kind: "risk",
      title: risk.risk_title || "风险提醒",
      subtitle: risk.safe_action_text || risk.risk_text || `${risk.risk_level ?? "注意"}风险点`,
      point,
      zoom: 17,
    });
  });

  routeExitPoints.forEach((exitPoint, index) => {
    const point = parseGeoPoint(exitPoint.point);
    if (!point) return;
    items.push({
      key: exitPoint.exit_point_id || `exit-${index}`,
      kind: "exit",
      title: exitPoint.exit_name || "下撤点",
      subtitle: exitPoint.exit_action_text || exitPoint.exit_condition_text || "可在此下撤",
      point,
      zoom: 16,
    });
  });

  if (routePoints[routePoints.length - 1]) {
    items.push({
      key: "end",
      kind: "end",
      title: endPointName || "终点",
      subtitle: "路线完成点",
      point: routePoints[routePoints.length - 1],
      zoom: 16,
    });
  }

  return items;
}

export default function BaiduMapPreview({
  ak,
  routePolyline,
  overviewCenter,
  overviewZoom,
  routeNodes = [],
  routeExitPoints = [],
  routeRiskPoints = [],
  sourceProvider,
  syncedAt,
  startPointName,
  endPointName,
}: {
  ak: string;
  routePolyline: any;
  overviewCenter?: GeoPoint;
  overviewZoom?: number;
  routeNodes?: RouteNode[];
  routeExitPoints?: ExitPoint[];
  routeRiskPoints?: RiskPoint[];
  sourceProvider?: string;
  syncedAt?: string;
  startPointName?: string;
  endPointName?: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const classicRetryRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"gl" | "2d">("gl");
  const [selectedFocusKey, setSelectedFocusKey] = useState<string>("start");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [presentationMode, setPresentationMode] = useState<MapPresentationMode>("overview");
  const [currentZoom, setCurrentZoom] = useState<number>(typeof overviewZoom === "number" ? overviewZoom : 14);

  const routePoints = useMemo(() => parseLineCoordinates(routePolyline), [routePolyline]);
  const zoomTier = useMemo(() => getZoomTier(currentZoom), [currentZoom]);
  const focusItems = useMemo(
    () =>
      buildFocusItems({
        routePoints,
        routeNodes,
        routeExitPoints,
        routeRiskPoints,
        startPointName,
        endPointName,
      }),
    [endPointName, routeExitPoints, routeNodes, routePoints, routeRiskPoints, startPointName],
  );

  const clearMapContainer = () => {
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = "";
    }
    if (mapInstanceRef.current?.destroy) {
      mapInstanceRef.current.destroy();
    }
    mapInstanceRef.current = null;
  };

  const waitForContainerReady = (callback: () => void, retry = 0) => {
    const container = mapContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      callback();
      return;
    }

    if (retry > 20) {
      setLoadError("地图容器尺寸异常，初始化被中止。");
      return;
    }

    window.setTimeout(() => {
      waitForContainerReady(callback, retry + 1);
    }, 80);
  };

  const getIconSize = (api: any, size: number) => new api.Size(size, size);
  const getIconAnchor = (api: any, size: number) => new api.Size(size / 2, size / 2);

  const styleLabel = (label: any, kind: FocusItemKind, variant: "subtle" | "prominent") => {
    const theme = getKindTheme(kind);
    label.setStyle?.({
      color: variant === "prominent" ? theme.badgeColor : "#4b5563",
      fontSize: variant === "prominent" ? "12px" : "11px",
      fontWeight: variant === "prominent" ? "700" : "600",
      border: variant === "prominent" ? `1px solid ${theme.border}` : "1px solid rgba(209,213,219,0.9)",
      borderRadius: "999px",
      padding: variant === "prominent" ? "5px 9px" : "3px 7px",
      background: variant === "prominent" ? theme.cardBg : "rgba(255,255,255,0.96)",
      boxShadow: variant === "prominent" ? "0 4px 12px rgba(15,23,42,0.12)" : "0 1px 3px rgba(0,0,0,0.08)",
      whiteSpace: "nowrap",
    });
  };

  const applyOverviewGL = (BMapGL: any, map: any) => {
    const center = parseGeoPoint(overviewCenter);
    if (center && typeof overviewZoom === "number" && Number.isFinite(overviewZoom)) {
      const nextZoom = Math.max(13, Math.min(18, overviewZoom));
      setCurrentZoom(nextZoom);
      map.centerAndZoom(new BMapGL.Point(center[0], center[1]), nextZoom);
      return;
    }

    if (routePoints.length > 1) {
      map.setViewport(routePoints.map(([lng, lat]) => new BMapGL.Point(lng, lat)));
      const zoom = map.getZoom?.();
      if (typeof zoom === "number" && Number.isFinite(zoom)) {
        setCurrentZoom(zoom);
      }
    }
  };

  const applyOverview2D = (BMap: any, map: any) => {
    const center = parseGeoPoint(overviewCenter);
    if (center && typeof overviewZoom === "number" && Number.isFinite(overviewZoom)) {
      const nextZoom = Math.max(13, Math.min(18, overviewZoom));
      setCurrentZoom(nextZoom);
      map.centerAndZoom(new BMap.Point(center[0], center[1]), nextZoom);
      return;
    }

    if (routePoints.length > 1) {
      map.setViewport(routePoints.map(([lng, lat]) => new BMap.Point(lng, lat)));
      const zoom = map.getZoom?.();
      if (typeof zoom === "number" && Number.isFinite(zoom)) {
        setCurrentZoom(zoom);
      }
    }
  };

  const addGLMarker = (
    BMapGL: any,
    map: any,
    item: FocusItem,
    presentation: ReturnType<typeof getMarkerPresentation>,
    selected: boolean,
  ) => {
    const point = new BMapGL.Point(item.point[0], item.point[1]);
    const openItemInfo = () => {
      setSelectedFocusKey(item.key);
      setPresentationMode("detail");
      setIsSidebarCollapsed(false);
      const infoWindow = new BMapGL.InfoWindow(createInfoHtml(item), {
        width: 220,
        enableMessage: false,
      });
      map.openInfoWindow(infoWindow, point);
    };
    if (presentation.haloRadiusM) {
      const theme = getKindTheme(item.kind);
      const halo = new BMapGL.Circle(point, presentation.haloRadiusM, {
        strokeColor: theme.badgeColor,
        strokeWeight: selected ? 2 : 1,
        strokeOpacity: presentation.haloStrokeOpacity,
        fillColor: theme.badgeBg,
        fillOpacity: presentation.haloFillOpacity,
      });
      halo.addEventListener?.("click", openItemInfo);
      map.addOverlay(halo);
    }

    const marker = new BMapGL.Marker(point, {
      icon: new BMapGL.Icon(markerDataUriWithSize(item.kind, presentation.size, selected || presentationMode === "overview"), getIconSize(BMapGL, presentation.size), {
        anchor: getIconAnchor(BMapGL, presentation.size),
      }),
      title: item.title,
    });

    if (presentation.labelText) {
      const label = new BMapGL.Label(presentation.labelText, {
        offset: new BMapGL.Size(Math.round(presentation.size * 0.42), Math.round(-presentation.size * 0.4)),
      });
      styleLabel(label, item.kind, presentation.labelVariant);
      marker.setLabel(label);
    }

    marker.addEventListener("click", openItemInfo);

    map.addOverlay(marker);
  };

  const add2DMarker = (
    BMap: any,
    map: any,
    item: FocusItem,
    presentation: ReturnType<typeof getMarkerPresentation>,
    selected: boolean,
  ) => {
    const point = new BMap.Point(item.point[0], item.point[1]);
    const openItemInfo = () => {
      setSelectedFocusKey(item.key);
      setPresentationMode("detail");
      setIsSidebarCollapsed(false);
      const infoWindow = new BMap.InfoWindow(createInfoHtml(item), {
        width: 220,
        enableMessage: false,
      });
      map.openInfoWindow(infoWindow, point);
    };
    if (presentation.haloRadiusM) {
      const theme = getKindTheme(item.kind);
      const halo = new BMap.Circle(point, presentation.haloRadiusM, {
        strokeColor: theme.badgeColor,
        strokeWeight: selected ? 2 : 1,
        strokeOpacity: presentation.haloStrokeOpacity,
        fillColor: theme.badgeBg,
        fillOpacity: presentation.haloFillOpacity,
      });
      halo.addEventListener?.("click", openItemInfo);
      map.addOverlay(halo);
    }

    const marker = new BMap.Marker(point, {
      icon: new BMap.Icon(markerDataUriWithSize(item.kind, presentation.size, selected || presentationMode === "overview"), getIconSize(BMap, presentation.size), {
        anchor: getIconAnchor(BMap, presentation.size),
      }),
      title: item.title,
    });

    if (presentation.labelText) {
      const label = new BMap.Label(presentation.labelText, {
        offset: new BMap.Size(Math.round(presentation.size * 0.42), Math.round(-presentation.size * 0.4)),
      });
      styleLabel(label, item.kind, presentation.labelVariant);
      marker.setLabel(label);
    }

    marker.addEventListener("click", openItemInfo);

    map.addOverlay(marker);
  };

  const renderRouteGL = (BMapGL: any, preserveViewport = false) => {
    const map = mapInstanceRef.current;
    if (!map || routePoints.length === 0) return;

    map.clearOverlays();

    const points = routePoints.map(([lng, lat]) => new BMapGL.Point(lng, lat));

    const outerLine = new BMapGL.Polyline(points, {
      strokeColor: "#ffffff",
      strokeWeight: 14,
      strokeOpacity: 0.92,
    });

    const innerLine = new BMapGL.Polyline(points, {
      strokeColor: "#FF7A45",
      strokeWeight: 8,
      strokeOpacity: 0.96,
    });

    map.addOverlay(outerLine);
    map.addOverlay(innerLine);

    const itemsToRender = getPresentationItems(focusItems, zoomTier, presentationMode);
    itemsToRender.forEach((item) => {
      const selected = item.key === selectedFocusKey;
      const presentation = getMarkerPresentation(item, presentationMode, zoomTier, selected);
      addGLMarker(BMapGL, map, item, presentation, selected);
    });

    if (!preserveViewport) {
      applyOverviewGL(BMapGL, map);
    }
  };

  const renderRoute2D = (BMap: any, preserveViewport = false) => {
    const map = mapInstanceRef.current;
    if (!map || routePoints.length === 0) return;

    map.clearOverlays();

    const points = routePoints.map(([lng, lat]) => new BMap.Point(lng, lat));

    const outerLine = new BMap.Polyline(points, {
      strokeColor: "#ffffff",
      strokeWeight: 12,
      strokeOpacity: 0.92,
    });

    const innerLine = new BMap.Polyline(points, {
      strokeColor: "#FF7A45",
      strokeWeight: 6,
      strokeOpacity: 0.96,
    });

    map.addOverlay(outerLine);
    map.addOverlay(innerLine);

    const itemsToRender = getPresentationItems(focusItems, zoomTier, presentationMode);
    itemsToRender.forEach((item) => {
      const selected = item.key === selectedFocusKey;
      const presentation = getMarkerPresentation(item, presentationMode, zoomTier, selected);
      add2DMarker(BMap, map, item, presentation, selected);
    });

    if (!preserveViewport) {
      applyOverview2D(BMap, map);
    }
  };

  const focusRouteOverview = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setPresentationMode("overview");

    if (renderMode === "gl" && (window as any).BMapGL) {
      applyOverviewGL((window as any).BMapGL, map);
      return;
    }

    if (renderMode === "2d" && (window as any).BMap) {
      applyOverview2D((window as any).BMap, map);
    }
  };

  const focusKeyNodes = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setPresentationMode("key_nodes");
    setIsSidebarCollapsed(false);
    const keyItems = getPresentationItems(focusItems, "mid", "key_nodes");
    if (keyItems.length === 0) return;
    if (keyItems.length === 1) {
      setSelectedFocusKey(keyItems[0].key);
    }

    if (renderMode === "gl" && (window as any).BMapGL) {
      const BMapGL = (window as any).BMapGL;
      map.setViewport(keyItems.map((item) => new BMapGL.Point(item.point[0], item.point[1])));
      return;
    }

    if (renderMode === "2d" && (window as any).BMap) {
      const BMap = (window as any).BMap;
      map.setViewport(keyItems.map((item) => new BMap.Point(item.point[0], item.point[1])));
    }
  };

  const focusOnItem = (item: FocusItem) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setPresentationMode("detail");
    setIsSidebarCollapsed(false);
    setSelectedFocusKey(item.key);
    setCurrentZoom(item.zoom);

    if (renderMode === "gl" && (window as any).BMapGL) {
      const BMapGL = (window as any).BMapGL;
      map.centerAndZoom(new BMapGL.Point(item.point[0], item.point[1]), item.zoom);
      return;
    }

    if (renderMode === "2d" && (window as any).BMap) {
      const BMap = (window as any).BMap;
      map.centerAndZoom(new BMap.Point(item.point[0], item.point[1]), item.zoom);
    }
  };

  const initClassicMap = (akValue: string) => {
    const mountClassic = () => {
      const BMap = (window as any).BMap;
      if (!BMap || !mapContainerRef.current) {
        setLoadError("百度 2D 地图初始化失败。");
        return;
      }

      waitForContainerReady(() => {
        clearMapContainer();
        setRenderMode("2d");

        const map = new BMap.Map(mapContainerRef.current);
        mapInstanceRef.current = map;
        map.enableScrollWheelZoom(true);
        setCurrentZoom(typeof map.getZoom === "function" ? map.getZoom() : currentZoom);
        map.addEventListener?.("zoomend", () => {
          const zoom = map.getZoom?.();
          if (typeof zoom === "number" && Number.isFinite(zoom)) {
            setCurrentZoom(zoom);
          }
        });
        renderRoute2D(BMap);

        setTimeout(() => {
          map.checkResize?.();
        }, 80);
        setTimeout(() => {
          map.checkResize?.();
        }, 320);

        setTimeout(() => {
          const mask = mapContainerRef.current?.querySelector(".BMap_mask") as HTMLElement | null;
          const maskWidth = mask?.offsetWidth ?? 0;
          const maskHeight = mask?.offsetHeight ?? 0;
          if ((maskWidth === 0 || maskHeight === 0) && classicRetryRef.current < 1) {
            classicRetryRef.current += 1;
            initClassicMap(akValue);
          }
        }, 500);
      });
    };

    if ((window as any).BMap) {
      mountClassic();
      return;
    }

    const scriptId = "baidu-map-2d-script";
    const oldScript = document.getElementById(scriptId);
    if (oldScript) oldScript.remove();

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://api.map.baidu.com/api?v=3.0&ak=${akValue}&callback=initBaiduMap2D`;
    script.onerror = () => {
      setLoadError("百度 2D 地图脚本加载失败。");
    };
    (window as any).initBaiduMap2D = mountClassic;
    document.body.appendChild(script);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!ak) {
      setLoadError("未配置 `NEXT_PUBLIC_BAIDU_MAP_BROWSER_AK`，浏览器端地图无法加载。");
      return;
    }

    setLoadError(null);
    classicRetryRef.current = 0;

    const scriptId = "baidu-map-gl-script";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

    const originalAlert = window.alert;
    window.alert = (message?: string) => {
      const text = String(message ?? "");
      if (text.includes("APP不存在") || text.includes("AK有误") || text.includes("APP服务被禁用了")) {
        setLoadError(`百度地图鉴权失败：${text}`);
        return;
      }
      originalAlert(message);
    };

    const mountGLMap = () => {
      const BMapGL = (window as any).BMapGL;
      if (!BMapGL) {
        setLoadError("百度地图脚本已返回，但 `BMapGL` 未初始化成功。");
        return;
      }

      setRenderMode("gl");

      if (mapInstanceRef.current) {
        renderRouteGL(BMapGL);
        return;
      }

      waitForContainerReady(() => {
        const map = new BMapGL.Map(mapContainerRef.current);
        mapInstanceRef.current = map;
        map.enableScrollWheelZoom(true);
        map.setTilt(60);
        map.setHeading(32);
        setCurrentZoom(typeof map.getZoom === "function" ? map.getZoom() : currentZoom);
        map.addEventListener?.("zoomend", () => {
          const zoom = map.getZoom?.();
          if (typeof zoom === "number" && Number.isFinite(zoom)) {
            setCurrentZoom(zoom);
          }
        });
        renderRouteGL(BMapGL);

        window.setTimeout(() => {
          const hasCanvas = Boolean(mapContainerRef.current?.querySelector("canvas"));
          if (!hasCanvas) {
            initClassicMap(ak);
          }
        }, 1200);
      });
    };

    (window as any).initBaiduMap = mountGLMap;

    if (existingScript && (window as any).BMapGL === undefined) {
      existingScript.remove();
    }

    if ((window as any).BMapGL) {
      mountGLMap();
      return () => {
        window.alert = originalAlert;
      };
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${ak}&callback=initBaiduMap`;
      script.onerror = () => {
        setLoadError("百度地图脚本加载失败，请检查浏览器端 AK、白名单或网络请求。");
      };
      document.body.appendChild(script);
    }

    return () => {
      window.alert = originalAlert;
    };
  }, [ak]);

  useEffect(() => {
    const onResize = () => {
      const map = mapInstanceRef.current;
      if (map?.checkResize) {
        map.checkResize();
      }
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearMapContainer();
    };
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current) {
      if (renderMode === "gl" && (window as any).BMapGL) {
        renderRouteGL((window as any).BMapGL);
      } else if (renderMode === "2d" && (window as any).BMap) {
        renderRoute2D((window as any).BMap);
      }
    }
  }, [focusItems, overviewCenter, overviewZoom, renderMode, routePolyline]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    if (renderMode === "gl" && (window as any).BMapGL) {
      renderRouteGL((window as any).BMapGL, true);
    } else if (renderMode === "2d" && (window as any).BMap) {
      renderRoute2D((window as any).BMap, true);
    }
  }, [presentationMode, renderMode, selectedFocusKey, zoomTier]);

  const topItems = focusItems.slice(0, 5);

  return (
    <div className="flex h-full w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-inner">
      <div className="relative min-w-0 flex-1">
        <div
          ref={mapContainerRef}
          className="h-full w-full overflow-hidden"
          style={{ backgroundColor: "#e5e7eb" }}
        />

        {loadError ? (
          <div className="absolute inset-6 z-10 rounded-lg border border-red-300 bg-white/95 p-4 text-sm text-red-700 shadow-lg">
            <div className="font-semibold">地图加载失败</div>
            <div className="mt-2 leading-6">{loadError}</div>
            <div className="mt-3 text-xs text-red-600">
              当前页面依赖浏览器端百度地图 AK，且该 AK 必须允许 `localhost` 访问。
            </div>
          </div>
        ) : null}

        <div
          style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div className="rounded border border-gray-200 bg-white/90 px-4 py-2 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm">
            {renderMode === "gl" ? "3D 地形视角 · 百度 GL 叠加层" : "2D 地图回退模式 · 轨迹可见优先"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={focusRouteOverview}
              style={{
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
              }}
            >
              全程视角
            </button>
            <button
              type="button"
              onClick={focusKeyNodes}
              style={{
                border: "1px solid rgba(255,122,69,0.22)",
                background: "#fff7f2",
                color: "#c2410c",
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
              }}
            >
              关键节点
            </button>
          </div>
          <div
            className="rounded border border-orange-100 bg-white/92 px-3 py-2 text-xs text-gray-700 shadow-sm backdrop-blur-sm"
            style={{ maxWidth: 250 }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>
              {presentationMode === "overview" ? "总览态重点" : presentationMode === "key_nodes" ? "关键节点视角" : "单点细节视角"}
            </div>
            <div style={{ marginTop: 4, lineHeight: "18px" }}>
              {presentationMode === "overview"
                ? "只突出起终点、核心节点、主要风险和下撤点，先看路线决策信息。"
                : presentationMode === "key_nodes"
                  ? "关键节点与风险同时放大，适合快速判断该不该继续上行。"
                  : "进入单点细节后保留重点标签，避免把地图重新刷成数据面板。"}
            </div>
          </div>
        </div>
      </div>

      <aside
        style={{
          width: isSidebarCollapsed ? 56 : 320,
          transition: "width 180ms ease",
          borderLeft: "1px solid rgba(229,231,235,0.9)",
          background: "rgba(255,255,255,0.96)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isSidebarCollapsed ? "center" : "space-between",
            gap: 8,
            padding: isSidebarCollapsed ? "12px 8px" : "14px 14px 10px",
            borderBottom: "1px solid rgba(229,231,235,0.85)",
          }}
        >
          {!isSidebarCollapsed ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>关键节点清单</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280", lineHeight: "18px" }}>
                {sourceProvider ? `来源 ${sourceProvider}` : "百度地图同步"} · {formatSyncTime(syncedAt)}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280", lineHeight: "18px" }}>
                节点 {routeNodes.length} · 风险 {routeRiskPoints.length} · 下撤 {routeExitPoints.length}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            aria-label={isSidebarCollapsed ? "展开关键节点侧边栏" : "收起关键节点侧边栏"}
            title={isSidebarCollapsed ? "展开关键节点侧边栏" : "收起关键节点侧边栏"}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "1px solid rgba(229,231,235,0.95)",
              background: "#ffffff",
              color: "#4b5563",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {isSidebarCollapsed ? "<" : ">"}
          </button>
        </div>

        {isSidebarCollapsed ? (
          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 8px",
            }}
          >
            <div
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                color: "#374151",
              }}
            >
              关键节点
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div
                style={{
                  minWidth: 38,
                  borderRadius: 10,
                  background: "#f9fafb",
                  padding: "8px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#6b7280" }}>节点</div>
                <div style={{ marginTop: 2, fontSize: 14, fontWeight: 700, color: "#111827" }}>{routeNodes.length}</div>
              </div>
              <div
                style={{
                  minWidth: 38,
                  borderRadius: 10,
                  background: "#fef2f2",
                  padding: "8px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#b91c1c" }}>风险</div>
                <div style={{ marginTop: 2, fontSize: 14, fontWeight: 700, color: "#991b1b" }}>{routeRiskPoints.length}</div>
              </div>
              <div
                style={{
                  minWidth: 38,
                  borderRadius: 10,
                  background: "#eff6ff",
                  padding: "8px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 11, color: "#1d4ed8" }}>下撤</div>
                <div style={{ marginTop: 2, fontSize: 14, fontWeight: 700, color: "#1e3a8a" }}>{routeExitPoints.length}</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: 12, display: "grid", gap: 8 }}>
            {topItems.map((item) => {
              const active = item.key === selectedFocusKey;
              const theme = getKindTheme(item.kind);
              const kindLabel =
                item.kind === "start"
                  ? "起点"
                  : item.kind === "end"
                    ? "终点"
                    : item.kind === "risk"
                      ? "风险"
                      : item.kind === "exit"
                        ? "下撤"
                        : "节点";

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => focusOnItem(item)}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: active ? `1px solid ${theme.border}` : "1px solid rgba(229,231,235,0.95)",
                    background: active ? theme.cardBg : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{item.title}</div>
                    <span
                      style={{
                        fontSize: 11,
                        lineHeight: "16px",
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: active ? theme.badgeBg : "#f3f4f6",
                        color: active ? theme.badgeColor : "#6b7280",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {kindLabel}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, lineHeight: "18px", color: "#6b7280" }}>{item.subtitle}</div>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

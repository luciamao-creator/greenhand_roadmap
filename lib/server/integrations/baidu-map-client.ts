type Point = {
  lng: number;
  lat: number;
};

type GeocodeResult = {
  lng: number;
  lat: number;
  confidence?: number;
  comprehension?: number;
  precise?: boolean;
  level?: string;
};

export type PlaceSearchResult = {
  name: string;
  address?: string;
  lng: number;
  lat: number;
};

type WalkingRouteResult = {
  distance_m: number;
  duration_s: number;
  polyline_points: Point[];
  start_point: Point;
  end_point: Point;
  overview_center: Point;
  bounding_box: [number, number, number, number];
  overview_zoom: number;
};

type BaiduApiResponse<T> = {
  status: number;
  message?: string;
  result?: T;
};

type BaiduApiResponseWithResults<T> = {
  status: number;
  message?: string;
  results?: T[];
};

function getBaiduMapAk() {
  return process.env.BAIDU_MAP_AK;
}

export function isBaiduMapConfigured() {
  return Boolean(getBaiduMapAk());
}

function buildUrl(path: string, params: Record<string, string>) {
  const url = new URL(path, "https://api.map.baidu.com");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchBaiduPayload<T>(path: string, params: Record<string, string>) {
  const ak = getBaiduMapAk();
  if (!ak) {
    throw new Error("BAIDU_MAP_AK is not configured");
  }

  const response = await fetch(
    buildUrl(path, {
      ...params,
      ak,
      output: "json",
    }),
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`baidu map request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as T & { status?: number; message?: string };
  if (payload.status !== 0) {
    throw new Error(payload.message ?? `baidu map api error: ${payload.status}`);
  }

  return payload;
}

async function fetchBaiduJson<T>(path: string, params: Record<string, string>) {
  const payload = await fetchBaiduPayload<BaiduApiResponse<T>>(path, params);
  if (!payload.result) {
    throw new Error(payload.message ?? "baidu map api result is empty");
  }
  return payload.result;
}

export async function geocodeAddress(address: string, city?: string): Promise<GeocodeResult> {
  const result = await fetchBaiduJson<{
    location: Point;
    precise?: number;
    confidence?: number;
    comprehension?: number;
    level?: string;
  }>("/geocoding/v3/", {
    address,
    ret_coordtype: "gcj02ll",
    ...(city ? { city } : {}),
  });

  return {
    lng: result.location.lng,
    lat: result.location.lat,
    confidence: result.confidence,
    comprehension: result.comprehension,
    precise: result.precise === 1,
    level: result.level,
  };
}

export async function searchPlaces(query: string, region?: string): Promise<PlaceSearchResult[]> {
  const payload = await fetchBaiduPayload<
    BaiduApiResponseWithResults<{
      name?: string;
      address?: string;
      location?: Point;
    }>
  >("/place/v2/search", {
    query,
    scope: "1",
    page_size: "10",
    ...(region ? { region } : {}),
  });

  return (payload.results ?? [])
    .filter((item) => item.location && Number.isFinite(item.location.lng) && Number.isFinite(item.location.lat))
    .map((item) => ({
      name: item.name ?? query,
      address: item.address,
      lng: item.location?.lng ?? 0,
      lat: item.location?.lat ?? 0,
    }));
}

function parsePathSegment(pathValue: string) {
  return pathValue
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [lng, lat] = pair.split(",").map(Number);
      return {
        lng,
        lat,
      };
    })
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
}

function computeBoundingBox(points: Point[]): [number, number, number, number] {
  const lngs = points.map((item) => item.lng);
  const lats = points.map((item) => item.lat);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

function computeOverviewCenter(boundingBox: [number, number, number, number]): Point {
  return {
    lng: (boundingBox[0] + boundingBox[2]) / 2,
    lat: (boundingBox[1] + boundingBox[3]) / 2,
  };
}

function computeOverviewZoom(boundingBox: [number, number, number, number]) {
  const lngSpan = Math.max(boundingBox[2] - boundingBox[0], 0.0001);
  const latSpan = Math.max(boundingBox[3] - boundingBox[1], 0.0001);
  const maxSpan = Math.max(lngSpan, latSpan);

  if (maxSpan < 0.005) {
    return 16;
  }
  if (maxSpan < 0.02) {
    return 14;
  }
  if (maxSpan < 0.05) {
    return 12;
  }
  return 10;
}

export async function getWalkingRoute(origin: Point, destination: Point): Promise<WalkingRouteResult> {
  const result = await fetchBaiduJson<{
    routes?: Array<{
      distance?: number;
      duration?: number;
      steps?: Array<{ path?: string }>;
    }>;
  }>("/directionlite/v1/walking", {
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
  });

  const route = result.routes?.[0];
  if (!route) {
    throw new Error("baidu map walking route is empty");
  }

  const polylinePoints = (route.steps ?? [])
    .flatMap((step: { path?: string }) => (step.path ? parsePathSegment(step.path) : []))
    .filter((item: Point, index: number, array: Point[]) => {
      if (index === 0) {
        return true;
      }
      const previous = array[index - 1];
      return previous.lng !== item.lng || previous.lat !== item.lat;
    });

  const normalizedPoints =
    polylinePoints.length >= 2 ? polylinePoints : [origin, destination];
  const boundingBox = computeBoundingBox(normalizedPoints);

  return {
    distance_m: Number(route.distance ?? 0),
    duration_s: Number(route.duration ?? 0),
    polyline_points: normalizedPoints,
    start_point: normalizedPoints[0],
    end_point: normalizedPoints[normalizedPoints.length - 1],
    overview_center: computeOverviewCenter(boundingBox),
    bounding_box: boundingBox,
    overview_zoom: computeOverviewZoom(boundingBox),
  };
}

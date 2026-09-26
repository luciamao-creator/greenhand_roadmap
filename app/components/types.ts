export type RouteCardLite = {
  route_id: string;
  route_name: string | undefined;
  province_name: string | undefined;
  city_name: string | undefined;
  area_name: string | undefined;
  difficulty_band: string | undefined;
  difficulty_label: string | undefined;
  route_type: string | undefined;
  route_type_label: string | undefined;
  distance_km: number | null;
  duration_hours: number | null;
  ascent_m: number | null;
  summary_short: string | undefined;
  cover_image?: string | undefined;
};

export type RouteGeometry = {
  start_point?: { lng: number; lat: number } | null;
  end_point?: { lng: number; lat: number } | null;
  amap_walking_path?: { lng: number; lat: number }[];
  polyline?: { type?: string; coordinates?: [number, number][] } | null;
  note?: string | null;
};

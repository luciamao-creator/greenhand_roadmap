import type { ReportType, RouteType } from "./admin-routes";

export type SubmissionPointDTO = {
  lng: number;
  lat: number;
};

export type NamedSubmissionPointDTO = {
  point_name: string;
  point?: SubmissionPointDTO;
};

export type CreateRouteCandidateDTO = {
  route_name: string;
  province_name: string;
  city_name: string;
  area_name?: string;
  route_type: RouteType;
  start_point: NamedSubmissionPointDTO;
  end_point: NamedSubmissionPointDTO;
  waypoints: NamedSubmissionPointDTO[];
  user_description: string;
  submitter_name?: string;
  submitter_contact?: string;
};

export type CreatePublicUserReportDTO = {
  report_type: ReportType;
  suggestion_action: "add" | "modify" | "delete";
  proposal_title: string;
  proposal_text: string;
  proposal_point?: SubmissionPointDTO;
  reporter_name?: string;
};

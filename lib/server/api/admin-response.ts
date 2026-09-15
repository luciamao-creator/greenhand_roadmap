import { NextResponse } from "next/server";

type SuccessPayload<T> = {
  code: "OK";
  message: "success";
  request_id: string;
  data: T;
};

type ErrorPayload = {
  code: string;
  message: string;
  request_id: string;
  data: null;
};

function createRequestId(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

export function ok<T>(data: T, prefix = "req_admin"): NextResponse<SuccessPayload<T>> {
  return NextResponse.json({
    code: "OK",
    message: "success",
    request_id: createRequestId(prefix),
    data,
  });
}

export function error(code: string, message: string, status: number, prefix = "req_admin") {
  return NextResponse.json<ErrorPayload>(
    {
      code,
      message,
      request_id: createRequestId(prefix),
      data: null,
    },
    { status },
  );
}

export function notImplemented(feature: string) {
  return error("NOT_IMPLEMENTED", `${feature} is not implemented yet`, 501, "req_admin_todo");
}

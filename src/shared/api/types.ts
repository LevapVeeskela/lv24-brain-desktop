export interface ApiResponse {
  status: number;
  contentType: string;
  body: string;
}

export type InvokeFn = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export const LOCAL_API_ORIGIN = "http://localapi.invalid";

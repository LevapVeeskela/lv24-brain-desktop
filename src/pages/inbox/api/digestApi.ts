import { apiClient, toApiError } from "@/shared/api/client";
import { parseDigest, type Digest } from "../model/digest";

export interface DigestRequest {
  project?: string;
  write?: boolean;
}

export interface DigestSource {
  digest(request: DigestRequest): Promise<Digest>;
}

export const digestApi: DigestSource = {
  async digest(request) {
    const { data, error, response } = await apiClient.POST("/v1/digest", {
      body: jsonBody({
        project: request.project,
        write: request.write === true,
      }),
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseDigest(data);
  },
};

/**
 * This route documents an open JSON object, which openapi-typescript renders
 * as an empty record. The adapter still sends a typed object.
 */
function jsonBody(body: Record<string, unknown>): Record<string, never> {
  return body as unknown as Record<string, never>;
}

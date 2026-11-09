import { apiClient, toApiError } from "@/shared/api/client";
import type { Project } from "../model/types";

export const projectApi = {
  async list(): Promise<Project[]> {
    const { data, error, response } = await apiClient.GET("/v1/projects");
    if (error) {
      throw toApiError(response, error);
    }
    return parseProjects(data);
  },
};

export function parseProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) {
    throw new Error("local API returned a non-array projects response");
  }
  return value.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { id?: unknown }).id !== "string" ||
      typeof (item as { name?: unknown }).name !== "string"
    ) {
      throw new Error("local API returned an invalid project");
    }
    return {
      id: (item as { id: string }).id,
      name: (item as { name: string }).name,
    };
  });
}

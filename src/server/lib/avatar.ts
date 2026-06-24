import { getBaseUrl } from "@/lib/utils";

export function resolveAvatarUrl(
  userId: string,
  image: string | null | undefined,
): string | null {
  if (!image) return null;
  if (image.startsWith("avatars/")) {
    return `${getBaseUrl()}/api/users/${userId}/avatar`;
  }
  return image;
}

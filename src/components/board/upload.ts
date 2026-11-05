import { upload } from "@vercel/blob/client";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

/** An image file's size in pixels, or a stand-in if the browser can't read it. */
export async function imageSize(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth || 400, height: img.naturalHeight || 300 };
  } catch {
    return { width: 400, height: 300 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Uploads an image to blob storage under `folder` and returns its URL. `payload` tells the upload
 * route what it's for: a board's id, or BACKPACK_UPLOAD. Throws if it fails.
 */
export async function uploadImageFile(file: File, folder: string, payload: string) {
  const blob = await upload(`${folder}/${file.name.replace(/[^\w.-]+/g, "_")}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    clientPayload: payload,
  });
  return blob.url;
}

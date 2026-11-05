import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { BACKPACK_UPLOAD } from "@/components/board/backpack";
import { canAccessBoard } from "@/lib/boards";
import { getSession } from "@/lib/session";

// Issues short-lived tokens so the browser can upload images straight to Vercel Blob.
// `clientPayload` is the board the image is for, or BACKPACK_UPLOAD.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await getSession();
        if (!user) throw new Error("Not signed in");
        const forBackpack = clientPayload === BACKPACK_UPLOAD;
        if (!forBackpack && (!clientPayload || !(await canAccessBoard(clientPayload, user.userId)))) {
          throw new Error("You don't have access to this board");
        }
        return {
          allowedContentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

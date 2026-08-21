const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CommentCursor {
  createdAt: string;
  id: string;
}
export class CommentCursorError extends Error {
  constructor() {
    super("invalid_comment_cursor");
    this.name = "CommentCursorError";
  }
}

export function encodeCommentCursor(value: CommentCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: value.createdAt, id: value.id }), "utf8").toString("base64url");
}

export function decodeCommentCursor(value: string | null): CommentCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CommentCursor>;
    if (
      typeof decoded.createdAt !== "string" ||
      !Number.isFinite(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== "string" ||
      !uuidPattern.test(decoded.id)
    ) {
      throw new Error("invalid cursor");
    }
    return { createdAt: new Date(decoded.createdAt).toISOString(), id: decoded.id };
  } catch {
    throw new CommentCursorError();
  }
}

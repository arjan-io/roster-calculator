import crypto from "node:crypto";

const previews = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;

export function createImportPreview(payload) {
  cleanupExpiredPreviews();
  const token = crypto.randomUUID();
  previews.set(token, {
    ...payload,
    createdAt: Date.now()
  });
  return token;
}

export function getImportPreview(token) {
  cleanupExpiredPreviews();
  return previews.get(token) || null;
}

export function deleteImportPreview(token) {
  previews.delete(token);
}

function cleanupExpiredPreviews() {
  const cutoff = Date.now() - PREVIEW_TTL_MS;

  for (const [token, preview] of previews.entries()) {
    if (preview.createdAt < cutoff) {
      previews.delete(token);
    }
  }
}

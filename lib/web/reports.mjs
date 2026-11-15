// code/lib/web/reports.mjs: saved reports behind shareable ids. Local dev = files; Vercel = Blob (public JSON).
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const VALID_ID = /^[0-9a-f]{12}$/;
export const newReportId = () => randomBytes(6).toString("hex");
const blobPath = (id) => `reports/${id}.json`;

export function fileReportStore(dir) {
  return {
    async save(id, report) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(report, null, 2));
    },
    async get(id) {
      if (!VALID_ID.test(id)) return null;
      try { return JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")); } catch { return null; }
    },
  };
}

export function blobReportStore({ put, head, fetchFn = fetch }) {
  return {
    async save(id, report) {
      await put(blobPath(id), JSON.stringify(report, null, 2), { access: "public", contentType: "application/json", addRandomSuffix: false });
    },
    async get(id) {
      if (!VALID_ID.test(id)) return null;
      let meta;
      try { meta = await head(blobPath(id)); }
      catch (e) { if (e.name === "BlobNotFoundError") return null; throw e; }
      const res = await fetchFn(meta.url, { cache: "no-store" });
      return res.ok ? res.json() : null;
    },
  };
}

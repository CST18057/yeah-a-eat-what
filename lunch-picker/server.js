"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const {
  getRegions,
  getRegionById,
  getPlacesByRegionId,
  spinRegion,
} = require("./data");

const PUBLIC_DIR = path.join(__dirname, "public");
const LEAFLET_DIR = path.join(__dirname, "node_modules", "leaflet", "dist");
const MAX_JSON_BYTES = 16 * 1024;
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function setCommonHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  setCommonHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(res, status, code, message, extraHeaders = {}) {
  sendJson(res, status, { error: { code, message } }, extraHeaders);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk) => {
      if (tooLarge) {
        return;
      }

      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (tooLarge) {
        reject(new RequestError(413, "BODY_TOO_LARGE", "Request body is too large"));
        return;
      }

      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new RequestError(400, "INVALID_JSON", "Request body must be valid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function getRegionId(pathname) {
  const match = pathname.match(/^\/api\/regions\/([^/]+)\/places$/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new RequestError(400, "INVALID_REGION_ID", "Region id is not valid URL encoding");
  }
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (pathname === "/api/regions") {
    if (req.method !== "GET") {
      sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint", { Allow: "GET" });
      return true;
    }

    sendJson(res, 200, { regions: getRegions() });
    return true;
  }

  const regionId = getRegionId(pathname);
  if (regionId !== null) {
    if (req.method !== "GET") {
      sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint", { Allow: "GET" });
      return true;
    }

    const result = getPlacesByRegionId(regionId);
    if (!result) {
      sendError(res, 404, "REGION_NOT_FOUND", `Unknown region: ${regionId}`);
      return true;
    }

    sendJson(res, 200, result);
    return true;
  }

  if (pathname === "/api/spin") {
    if (req.method !== "POST") {
      sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint", { Allow: "POST" });
      return true;
    }

    const body = await readJson(req);
    if (!body || typeof body.regionId !== "string" || body.regionId.trim() === "") {
      throw new RequestError(400, "REGION_ID_REQUIRED", "regionId must be a non-empty string");
    }

    const regionIdFromBody = body.regionId.trim();
    if (!getRegionById(regionIdFromBody)) {
      sendError(res, 404, "REGION_NOT_FOUND", `Unknown region: ${regionIdFromBody}`);
      return true;
    }

    sendJson(res, 200, spinRegion(regionIdFromBody));
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendError(res, 404, "API_NOT_FOUND", "API endpoint not found");
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET or HEAD for static files", { Allow: "GET, HEAD" });
    return;
  }

  if (url.pathname === "/favicon.ico") {
    setCommonHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendError(res, 400, "INVALID_PATH", "Path is not valid URL encoding");
    return;
  }

  const leafletPrefix = "/vendor/leaflet/";
  const isLeafletAsset = pathname.startsWith(leafletPrefix);
  const staticRoot = isLeafletAsset ? LEAFLET_DIR : PUBLIC_DIR;
  const relativePath = isLeafletAsset
    ? pathname.slice(leafletPrefix.length)
    : pathname === "/"
      ? "index.html"
      : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(staticRoot, relativePath);
  const staticPrefix = `${path.resolve(staticRoot)}${path.sep}`;

  if (filePath !== path.resolve(staticRoot) && !filePath.startsWith(staticPrefix)) {
    sendError(res, 403, "FORBIDDEN", "Path is outside the public directory");
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      sendError(res, 404, "NOT_FOUND", "File not found");
      return;
    }
    throw error;
  }

  if (!stat.isFile()) {
    sendError(res, 404, "NOT_FOUND", "File not found");
    return;
  }

  setCommonHeaders(res);
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(res);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (await handleApi(req, res, url)) {
        return;
      }
      await serveStatic(req, res, url);
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }

      if (error instanceof RequestError) {
        sendError(res, error.status, error.code, error.message);
        return;
      }

      console.error(error);
      sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
    }
  });
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || "4173", 10);
  const host = process.env.HOST || "0.0.0.0";
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`Lunch Picker listening on http://${host}:${port}`);
  });
}

module.exports = {
  createServer,
};

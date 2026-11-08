"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const {
  getRegions,
  getRegionById,
  getPlacesByRegionId,
  spinRegion,
  getExplorePlaces,
} = require("./data");
const { normalizeExclude } = require("./spin-selector");

const PUBLIC_DIR = path.join(__dirname, "public");
const LEAFLET_DIR = path.join(__dirname, "node_modules", "leaflet", "dist");
const MAX_JSON_BYTES = 16 * 1024;
const EXPLORE_VERSION = "0.5.0";
const EXPLORE_DEFAULT_LIMIT = 40;
const EXPLORE_MAX_LIMIT = 100;
const EXPLORE_MAX_LNG_SPAN = 60;
const EXPLORE_MAX_LAT_SPAN = 30;
const EXPLORE_DEFAULT_TIMEOUT_MS = 4000;
const EXPLORE_RATE_LIMIT = 30;
const EXPLORE_RATE_WINDOW_MS = 60 * 1000;
const DECIMAL_NUMBER_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
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

function parseDecimalParameter(searchParams, name, errorCode) {
  const values = searchParams.getAll(name);
  if (values.length !== 1) {
    throw new RequestError(400, errorCode, `${name} must appear exactly once`);
  }

  const raw = values[0].trim();
  if (!DECIMAL_NUMBER_PATTERN.test(raw)) {
    throw new RequestError(400, errorCode, `${name} must be a finite decimal number`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new RequestError(400, errorCode, `${name} must be a finite decimal number`);
  }

  return value;
}

function parseExploreLimit(searchParams) {
  const values = searchParams.getAll("limit");
  if (values.length === 0) {
    return EXPLORE_DEFAULT_LIMIT;
  }

  if (values.length !== 1) {
    throw new RequestError(400, "INVALID_LIMIT", "limit must appear at most once");
  }

  const raw = values[0].trim();
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    throw new RequestError(400, "INVALID_LIMIT", "limit must be a positive integer");
  }

  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > EXPLORE_MAX_LIMIT) {
    throw new RequestError(
      400,
      "INVALID_LIMIT",
      `limit must be between 1 and ${EXPLORE_MAX_LIMIT}`,
    );
  }

  return limit;
}

function parseExploreQuery(searchParams) {
  const bounds = {
    west: parseDecimalParameter(searchParams, "west", "INVALID_BOUNDS"),
    south: parseDecimalParameter(searchParams, "south", "INVALID_BOUNDS"),
    east: parseDecimalParameter(searchParams, "east", "INVALID_BOUNDS"),
    north: parseDecimalParameter(searchParams, "north", "INVALID_BOUNDS"),
  };

  const validBounds =
    bounds.west >= -180 &&
    bounds.east <= 180 &&
    bounds.south >= -90 &&
    bounds.north <= 90 &&
    bounds.west < bounds.east &&
    bounds.south < bounds.north;

  if (!validBounds) {
    throw new RequestError(
      400,
      "INVALID_BOUNDS",
      "bounds must satisfy -180 <= west < east <= 180 and -90 <= south < north <= 90",
    );
  }

  if (
    bounds.east - bounds.west > EXPLORE_MAX_LNG_SPAN ||
    bounds.north - bounds.south > EXPLORE_MAX_LAT_SPAN
  ) {
    throw new RequestError(
      400,
      "REGION_TOO_LARGE",
      `region span must not exceed ${EXPLORE_MAX_LNG_SPAN} by ${EXPLORE_MAX_LAT_SPAN} degrees`,
    );
  }

  return {
    bounds,
    limit: parseExploreLimit(searchParams),
  };
}

function createExploreRateLimiter({
  max = EXPLORE_RATE_LIMIT,
  windowMs = EXPLORE_RATE_WINDOW_MS,
  now = Date.now,
} = {}) {
  const buckets = new Map();

  return {
    consume(key) {
      const currentTime = now();
      let bucket = buckets.get(key);

      if (!bucket || currentTime >= bucket.resetAt) {
        bucket = {
          count: 0,
          resetAt: currentTime + windowMs,
        };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      const allowed = bucket.count <= max;
      const remaining = Math.max(0, max - bucket.count);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - currentTime) / 1000),
      );

      return {
        allowed,
        limit: max,
        remaining,
        resetAt: bucket.resetAt,
        retryAfterSeconds,
      };
    },
  };
}

function normalizeIpAddress(value) {
  if (typeof value !== "string") {
    return null;
  }

  let address = value.trim();
  if (address.startsWith("::ffff:")) {
    address = address.slice(7);
  }

  return net.isIP(address) ? address : null;
}

function createClientIpResolver(trustedProxyCidrs = []) {
  const blockList = new net.BlockList();
  const configuredCidrs = Array.isArray(trustedProxyCidrs)
    ? trustedProxyCidrs
    : String(trustedProxyCidrs || "").split(",");

  for (const rawCidr of configuredCidrs) {
    const cidr = String(rawCidr).trim();
    if (!cidr) {
      continue;
    }

    const [address, prefixValue] = cidr.split("/");
    const ipVersion = net.isIP(address);
    if (!ipVersion) {
      continue;
    }

    const maxPrefix = ipVersion === 4 ? 32 : 128;
    const prefix = prefixValue === undefined ? maxPrefix : Number(prefixValue);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      continue;
    }

    blockList.addSubnet(address, prefix, ipVersion === 4 ? "ipv4" : "ipv6");
  }

  function isTrustedProxy(address) {
    if (!address) {
      return false;
    }
    return blockList.check(address, net.isIP(address) === 6 ? "ipv6" : "ipv4");
  }

  return function resolveClientIp(req) {
    const remoteAddress = normalizeIpAddress(req.socket.remoteAddress);
    if (!remoteAddress || !isTrustedProxy(remoteAddress)) {
      return remoteAddress || "unknown";
    }

    const cloudflareAddress = normalizeIpAddress(req.headers["cf-connecting-ip"]);
    if (cloudflareAddress) {
      return cloudflareAddress;
    }

    const forwardedAddresses = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map(normalizeIpAddress)
      .filter(Boolean);

    for (let index = forwardedAddresses.length - 1; index >= 0; index -= 1) {
      if (!isTrustedProxy(forwardedAddresses[index])) {
        return forwardedAddresses[index];
      }
    }

    if (forwardedAddresses.length > 0) {
      return forwardedAddresses[0];
    }

    return normalizeIpAddress(req.headers["x-real-ip"]) || remoteAddress;
  };
}

function rateLimitHeaders(rate) {
  return {
    "RateLimit-Limit": String(rate.limit),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout(task, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestError(504, "EXPLORE_TIMEOUT", "Region exploration timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function handleApi(req, res, url, options) {
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

  if (pathname === "/api/explore") {
    if (req.method !== "GET") {
      sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint", { Allow: "GET" });
      return true;
    }

    const rate = options.exploreRateLimiter.consume(options.resolveClientIp(req));
    const headers = rateLimitHeaders(rate);

    if (!rate.allowed) {
      sendJson(
        res,
        429,
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many region exploration requests",
          },
          retryAfterSeconds: rate.retryAfterSeconds,
        },
        {
          ...headers,
          "Retry-After": String(rate.retryAfterSeconds),
        },
      );
      return true;
    }

    const query = parseExploreQuery(url.searchParams);
    const result = await withTimeout(
      async () => {
        if (options.exploreProcessingDelayMs > 0) {
          await wait(options.exploreProcessingDelayMs);
        }
        return getExplorePlaces(query.bounds, query.limit);
      },
      options.exploreTimeoutMs,
    );

    sendJson(
      res,
      200,
      {
        version: EXPLORE_VERSION,
        bounds: query.bounds,
        limit: query.limit,
        total: result.total,
        returned: result.returned,
        truncated: result.truncated,
        places: result.places,
      },
      headers,
    );
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

    let exclude = [];
    try {
      exclude = normalizeExclude(body.exclude);
    } catch (error) {
      throw new RequestError(
        400,
        "INVALID_SPIN_EXCLUDE",
        error instanceof Error ? error.message : "exclude is invalid",
      );
    }

    sendJson(res, 200, spinRegion(regionIdFromBody, Math.random, { exclude }));
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

function createServer(options = {}) {
  const serverOptions = {
    exploreRateLimiter: createExploreRateLimiter(options.exploreRateLimit),
    exploreProcessingDelayMs: options.exploreProcessingDelayMs || 0,
    exploreTimeoutMs: options.exploreTimeoutMs || EXPLORE_DEFAULT_TIMEOUT_MS,
    resolveClientIp: createClientIpResolver(
      options.trustedProxyCidrs ?? process.env.TRUSTED_PROXY_CIDRS,
    ),
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (await handleApi(req, res, url, serverOptions)) {
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
  createExploreRateLimiter,
  createClientIpResolver,
  parseExploreQuery,
};

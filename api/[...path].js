export default async function handler(req, res) {
  const VPS_URL = process.env.VPS_BACKEND_URL || "https://ocr.vincentchan.uk";
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "";

  // Reconstruct subpath (e.g. /api/queue-job, /api/job-status/123, /api/download/123)
  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : req.query.path || "";

  const targetUrl = `${VPS_URL.replace(/\/+$/, "")}/api/${pathSegments}`;

  // Extract client IP to maintain accurate rate limiting
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket.remoteAddress ||
    "";

  try {
    const forwardHeaders = {
      "X-Internal-Secret": INTERNAL_SECRET,
      "X-Forwarded-For": clientIp,
      "X-Real-IP": clientIp,
    };

    const clientContentType = req.headers["content-type"];
    if (clientContentType) {
      forwardHeaders["Content-Type"] = clientContentType;
    }

    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders,
    };

    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      fetchOptions.body =
        typeof req.body === "object" ? JSON.stringify(req.body) : req.body;
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Relay Content-Type and Content-Disposition headers for SQLite .db downloads
    const resContentType = response.headers.get("content-type");
    if (resContentType) res.setHeader("Content-Type", resContentType);

    const resContentDisposition = response.headers.get("content-disposition");
    if (resContentDisposition) res.setHeader("Content-Disposition", resContentDisposition);

    res.status(response.status);

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Vercel Proxy Error:", error);
    return res.status(502).json({
      detail: "Bad Gateway: Could not establish connection to the backend orchestrator.",
    });
  }
}
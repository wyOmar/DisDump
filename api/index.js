// api/index.js
export default async function handler(req, res) {
  const VPS_URL = process.env.VPS_BACKEND_URL || "https://ocr.vincentchan.uk";
  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "";

  // req.url contains the full original path (e.g. "/api/queue-job" or "/api/job-status/...")
  const targetUrl = `${VPS_URL.replace(/\/+$/, "")}${req.url}`;

  // Extract client IP for rate limiting
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
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

    // Forward response headers (Content-Type & Content-Disposition for .db downloads)
    const resContentType = response.headers.get("content-type");
    if (resContentType) res.setHeader("Content-Type", resContentType);

    const resContentDisposition = response.headers.get("content-disposition");
    if (resContentDisposition) res.setHeader("Content-Disposition", resContentDisposition);

    res.status(response.status);

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(502).json({
      detail: "Bad Gateway: Failed to contact backend orchestrator.",
    });
  }
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("请求体不是合法的 JSON。"));
      }
    });

    req.on("error", reject);
  });
}

function sendError(res, status, code, message, details) {
  sendJson(res, status, {
    success: false,
    error: {
      code,
      message,
      details: details || null,
    },
  });
}

module.exports = {
  readJson,
  sendError,
  sendJson,
};

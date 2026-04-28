const { readJson, sendError, sendJson } = require("../_lib/http");
const { testMailboxConnection } = require("../_lib/imap-skeleton");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请使用 POST 调用此接口。");
    return;
  }

  try {
    const body = await readJson(req);
    const result = await testMailboxConnection(body);
    sendJson(res, 200, result);
  } catch (error) {
    const status = error.code === "INVALID_MAILBOX_CONFIG" ? 400 : 502;
    sendError(
      res,
      status,
      error.code || "MAILBOX_TEST_FAILED",
      error.message || "邮箱连接测试失败。",
      error.details
    );
  }
};

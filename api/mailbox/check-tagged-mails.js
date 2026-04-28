const { readJson, sendError, sendJson } = require("../_lib/http");
const { listTaggedMails } = require("../_lib/imap-skeleton");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请使用 POST 调用此接口。");
    return;
  }

  try {
    const body = await readJson(req);
    const limit = Number(body.limit || 20);
    const result = await listTaggedMails(body, limit);
    sendJson(res, 200, result);
  } catch (error) {
    const status = error.code === "INVALID_MAILBOX_CONFIG" ? 400 : 502;
    sendError(
      res,
      status,
      error.code || "MAILBOX_CHECK_FAILED",
      error.message || "检查最近 [助理] 邮件失败。",
      error.details
    );
  }
};

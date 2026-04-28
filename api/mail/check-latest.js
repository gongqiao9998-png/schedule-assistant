const { readJson, sendError, sendJson } = require("../_lib/http");
const { listTaggedMails } = require("../_lib/imap-skeleton");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请使用 POST 调用此接口。");
    return;
  }

  try {
    const body = await readJson(req);
    const result = await listTaggedMails(body, Number(body.limit || 20));
    const item = result.items[0] || null;

    sendJson(res, 200, {
      success: true,
      found: Boolean(item),
      item,
      count: result.count,
      folder: result.folder,
      subjectTag: result.subjectTag,
    });
  } catch (error) {
    const status = error.code === "INVALID_MAILBOX_CONFIG" ? 400 : 502;
    sendError(
      res,
      status,
      error.code || "MAIL_CHECK_FAILED",
      error.message || "检查最近待处理邮件失败。",
      error.details
    );
  }
};

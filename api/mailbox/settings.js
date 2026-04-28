const { readJson, sendError, sendJson } = require("../_lib/http");
const { validateMailboxConfig } = require("../_lib/imap-skeleton");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请使用 POST 调用此接口。");
    return;
  }

  try {
    const body = await readJson(req);
    const { config, errors } = validateMailboxConfig(body, {
      requireAuth: false,
    });

    if (errors.length) {
      sendError(res, 400, "INVALID_MAILBOX_CONFIG", errors.join(" "));
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: "助理收件设置已通过后端校验。当前骨架版仅做接口连通与参数检查，后续可再接数据库持久化。",
      settings: {
        email: config.email,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        secure: config.secure,
        folder: config.folder,
        username: config.username,
        subjectTag: config.subjectTag,
      },
    });
  } catch (error) {
    sendError(
      res,
      400,
      error.code || "MAILBOX_SETTINGS_FAILED",
      error.message || "助理收件设置保存失败。"
    );
  }
};

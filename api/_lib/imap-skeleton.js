const net = require("node:net");
const tls = require("node:tls");
const { TextDecoder } = require("node:util");

const DEFAULT_TIMEOUT_MS = 12000;
const CLIENT_IDENTITY = {
  name: "Schedule Assistant",
  version: "0.1.0",
  vendor: "OpenAI Codex Prototype",
  "support-email": "support@schedule-assistant.local",
};

function normalizeMailboxConfig(input = {}) {
  return {
    email: String(input.email || "").trim(),
    imapHost: String(input.imapHost || "outlook.office365.com").trim(),
    imapPort: Number(input.imapPort || 993),
    secure: input.secure !== false,
    username: String(input.username || input.email || "").trim(),
    password: String(input.password || ""),
    folder: String(input.folder || "INBOX").trim() || "INBOX",
    subjectTag: String(input.subjectTag || "[助理]").trim() || "[助理]",
  };
}

function validateMailboxConfig(config, options = {}) {
  const normalized = normalizeMailboxConfig(config);
  const requireAuth = options.requireAuth !== false;
  const errors = [];

  if (!normalized.email) {
    errors.push("请填写邮箱地址。");
  }

  if (!normalized.imapHost) {
    errors.push("请填写收件服务器。");
  }

  if (!normalized.imapPort || Number.isNaN(normalized.imapPort)) {
    errors.push("请填写正确的端口。");
  }

  if (requireAuth) {
    if (!normalized.username) {
      errors.push("请填写登录账号。");
    }

    if (!normalized.password) {
      errors.push("请填写邮箱密码或应用专用密码。");
    }
  }

  return {
    config: normalized,
    errors,
  };
}

class SimpleImapSession {
  constructor(socket, greeting) {
    this.socket = socket;
    this.greeting = greeting;
    this.commandTag = 0;
    this.activeCommand = null;
  }

  static async connect(config) {
    const greeting = await openSocket(config);
    return greeting;
  }

  async sendCommand(command, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.commandTag += 1;
    const tag = `A${String(this.commandTag).padStart(4, "0")}`;
    const payload = `${tag} ${command}\r\n`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(makeError("IMAP_TIMEOUT", `IMAP 命令超时：${command}`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.activeCommand = null;
      };

      this.activeCommand = {
        buffer: "",
        tag,
        resolve: (buffer) => {
          cleanup();
          resolve(buffer);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };

      this.socket.write(payload, "utf8", (error) => {
        if (error) {
          cleanup();
          reject(makeError("IMAP_WRITE_FAILED", `无法发送 IMAP 命令：${error.message}`));
        }
      });
    });
  }

  handleData(chunk) {
    if (!this.activeCommand) {
      return;
    }

    this.activeCommand.buffer += chunk;
    const response = this.activeCommand.buffer;
    const completion = new RegExp(`(?:^|\\r\\n)${this.activeCommand.tag} (OK|NO|BAD)\\b`, "i");

    if (!completion.test(response)) {
      return;
    }

    if (new RegExp(`(?:^|\\r\\n)${this.activeCommand.tag} OK\\b`, "i").test(response)) {
      this.activeCommand.resolve(response);
      return;
    }

    const errorLine = response
      .split("\r\n")
      .find((line) => line.startsWith(`${this.activeCommand.tag} `));
    this.activeCommand.reject(
      makeError("IMAP_COMMAND_FAILED", errorLine || "IMAP 命令执行失败。")
    );
  }

  handleError(error) {
    if (!this.activeCommand) {
      return;
    }

    this.activeCommand.reject(makeError("IMAP_SOCKET_ERROR", error.message));
  }

  async login(username, password) {
    await this.sendCommand(`LOGIN ${quoteImap(username)} ${quoteImap(password)}`);
  }

  async selectMailbox(folder) {
    await this.sendCommand(`SELECT ${quoteImap(folder)}`);
  }

  async identifyClient(identity = CLIENT_IDENTITY) {
    const pairs = Object.entries(identity)
      .filter(([, value]) => value)
      .map(([key, value]) => `${quoteImap(key)} ${quoteImap(value)}`)
      .join(" ");

    if (!pairs) {
      return;
    }

    await this.sendCommand(`ID (${pairs})`);
  }

  async searchAll() {
    const response = await this.sendCommand("SEARCH ALL");
    const match = response.match(/\* SEARCH([^\r\n]*)/i);
    if (!match) {
      return [];
    }

    return match[1]
      .trim()
      .split(/\s+/)
      .map((part) => Number(part))
      .filter((part) => Number.isInteger(part) && part > 0);
  }

  async fetchHeaders(sequence) {
    const response = await this.sendCommand(
      `FETCH ${sequence} (UID BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])`
    );

    const headerBlock = extractLiteralBlock(response);
    const headers = parseHeaderBlock(headerBlock);
    const uidMatch = response.match(/\bUID (\d+)\b/i);

    return {
      sequence,
      uid: uidMatch ? uidMatch[1] : String(sequence),
      subject: headers.subject || "",
      from: headers.from || "",
      date: headers.date || "",
      messageId: headers["message-id"] || "",
      rawHeaders: headerBlock,
    };
  }

  async fetchRawMessage(sequence) {
    const response = await this.sendCommand(`FETCH ${sequence} (UID BODY.PEEK[])`, 20000);
    const literalBlock = extractLiteralBlock(response);
    const uidMatch = response.match(/\bUID (\d+)\b/i);

    return {
      uid: uidMatch ? uidMatch[1] : String(sequence),
      raw: literalBlock,
    };
  }

  async logout() {
    try {
      await this.sendCommand("LOGOUT", 4000);
    } catch (error) {
      // Ignore logout errors in skeleton mode.
    } finally {
      this.socket.end();
      this.socket.destroy();
    }
  }
}

async function openSocket(config) {
  return new Promise((resolve, reject) => {
    const options = {
      host: config.imapHost,
      port: config.imapPort,
    };
    const socket = config.secure
      ? tls.connect({
          ...options,
          servername: config.imapHost,
          rejectUnauthorized: true,
        })
      : net.connect(options);

    let greetingBuffer = "";
    let settled = false;

    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      reject(error);
    };

    const finishResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      const session = new SimpleImapSession(socket, greetingBuffer.trim());
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => session.handleData(chunk));
      socket.on("error", (error) => session.handleError(error));
      socket.on("close", () => {
        session.handleError(makeError("IMAP_SOCKET_CLOSED", "邮箱连接已关闭。"));
      });
      resolve(session);
    };

    socket.setEncoding("utf8");
    socket.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      finishReject(makeError("IMAP_TIMEOUT", "连接邮箱服务器超时。"));
    });

    socket.on("data", (chunk) => {
      greetingBuffer += chunk;
      if (/\r\n/.test(greetingBuffer)) {
        finishResolve();
      }
    });

    socket.on("error", (error) => {
      finishReject(makeError("IMAP_CONNECT_FAILED", `无法连接 ${config.imapHost}:${config.imapPort}。`, error.message));
    });
  });
}

async function testMailboxConnection(input) {
  const { config, errors } = validateMailboxConfig(input);
  if (errors.length) {
    throw makeError("INVALID_MAILBOX_CONFIG", errors.join(" "));
  }

  const session = await SimpleImapSession.connect(config);
  const result = {
    success: true,
    stage: "connected",
    serverBanner: session.greeting,
  };

  try {
    await session.login(config.username, config.password);
    result.stage = "authenticated";

    await session.identifyClient();
    result.stage = "identified";

    await session.selectMailbox(config.folder);
    result.stage = "mailbox_selected";
    result.folder = config.folder;
    return result;
  } finally {
    await session.logout();
  }
}

async function listTaggedMails(input, limit = 20) {
  const { config, errors } = validateMailboxConfig(input);
  if (errors.length) {
    throw makeError("INVALID_MAILBOX_CONFIG", errors.join(" "));
  }

  const session = await SimpleImapSession.connect(config);

  try {
    await session.login(config.username, config.password);
    await session.identifyClient();
    await session.selectMailbox(config.folder);

    const allSequences = await session.searchAll();
    const latestSequences = allSequences.slice(-Math.max(limit, 1)).reverse();
    const items = [];

    for (const sequence of latestSequences) {
      const headers = await session.fetchHeaders(sequence);
      if ((headers.subject || "").includes(config.subjectTag)) {
        items.push({
          uid: headers.uid,
          sequence: headers.sequence,
          subject: headers.subject,
          from: headers.from,
          date: headers.date,
          messageId: headers.messageId,
          subjectTag: config.subjectTag,
        });
      }
    }

    return {
      success: true,
      folder: config.folder,
      subjectTag: config.subjectTag,
      count: items.length,
      items,
    };
  } finally {
    await session.logout();
  }
}

async function inspectLatestTaggedMail(input, limit = 20) {
  const { config, errors } = validateMailboxConfig(input);
  if (errors.length) {
    throw makeError("INVALID_MAILBOX_CONFIG", errors.join(" "));
  }

  const session = await SimpleImapSession.connect(config);

  try {
    await session.login(config.username, config.password);
    await session.identifyClient();
    await session.selectMailbox(config.folder);

    const allSequences = await session.searchAll();
    const latestSequences = allSequences.slice(-Math.max(limit, 1)).reverse();

    for (const sequence of latestSequences) {
      const headers = await session.fetchHeaders(sequence);
      if (!(headers.subject || "").includes(config.subjectTag)) {
        continue;
      }

      const rawMessage = await session.fetchRawMessage(sequence);
      return {
        success: true,
        folder: config.folder,
        subjectTag: config.subjectTag,
        item: {
          uid: rawMessage.uid,
          sequence: headers.sequence,
          subject: headers.subject,
          from: headers.from,
          date: headers.date,
          messageId: headers.messageId,
          subjectTag: config.subjectTag,
          raw: rawMessage.raw,
        },
      };
    }

    return {
      success: true,
      folder: config.folder,
      subjectTag: config.subjectTag,
      item: null,
    };
  } finally {
    await session.logout();
  }
}

function quoteImap(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function extractLiteralBlock(response) {
  const literalMatch = response.match(/\{(\d+)\}\r\n/);
  if (!literalMatch || literalMatch.index === undefined) {
    return "";
  }

  const literalLength = Number(literalMatch[1]);
  const start = literalMatch.index + literalMatch[0].length;
  return response.slice(start, start + literalLength);
}

function parseHeaderBlock(block) {
  const headers = {};
  const normalized = String(block || "").replace(/\r\n[ \t]+/g, " ");

  normalized
    .split("\r\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) {
        return;
      }

      const name = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers[name] = decodeMimeHeader(value);
    });

  return headers;
}

function decodeMimeHeader(value) {
  const input = String(value || "");
  return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      const normalizedCharset = normalizeCharset(charset);
      const bytes =
        String(encoding).toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : decodeQuotedPrintableToBuffer(text);

      return decodeBytes(bytes, normalizedCharset);
    } catch (error) {
      return text;
    }
  });
}

function normalizeCharset(charset) {
  const lower = String(charset || "utf-8").trim().toLowerCase();
  if (lower === "utf8") {
    return "utf-8";
  }

  if (lower === "gbk" || lower === "gb2312") {
    return "gb18030";
  }

  return lower;
}

function decodeQuotedPrintableToBuffer(text) {
  const normalized = String(text || "")
    .replace(/_/g, " ")
    .replace(/=([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));

  return Buffer.from(normalized, "binary");
}

function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch (error) {
    return bytes.toString("utf8");
  }
}

function makeError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

module.exports = {
  decodeMimeHeader,
  inspectLatestTaggedMail,
  listTaggedMails,
  testMailboxConnection,
  validateMailboxConfig,
};

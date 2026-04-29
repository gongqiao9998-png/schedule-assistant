const { TextDecoder } = require("node:util");
const { decodeMimeHeader } = require("./imap-skeleton");

function parseRawEmail(raw) {
  const normalized = String(raw || "");
  const separator = normalized.search(/\r?\n\r?\n/);
  const headerText = separator >= 0 ? normalized.slice(0, separator) : normalized;
  const bodyText = separator >= 0 ? normalized.slice(separator).replace(/^\r?\n\r?\n/, "") : "";
  const headers = parseHeaderLines(headerText);

  const contentType = headers["content-type"] || "text/plain";
  const transferEncoding = (headers["content-transfer-encoding"] || "").toLowerCase();

  const parsedBody = parseMimeEntity({
    headers,
    body: bodyText,
    contentType,
    transferEncoding,
  });

  return {
    subject: headers.subject || "",
    from: headers.from || "",
    date: headers.date || "",
    messageId: headers["message-id"] || "",
    textBody: parsedBody.textBody || "",
    htmlBody: parsedBody.htmlBody || "",
    calendarParts: parsedBody.calendarParts || [],
    attachments: parsedBody.attachments || [],
  };
}

function extractInviteFromMail(raw) {
  const parsedMail = parseRawEmail(raw);
  const calendarText = parsedMail.calendarParts[0]?.content || "";
  const ics = calendarText ? parseIcsText(calendarText) : null;
  const textSource = parsedMail.textBody || stripHtml(parsedMail.htmlBody) || "";
  const subjectTitle = cleanSubject(parsedMail.subject);
  const normalizedIcsTitle = cleanSubject(ics?.title || "");
  const meetingMeta = extractMeetingMeta(textSource, {
    location: ics?.location,
    meetingLink: ics?.meetingLink,
  });

  return {
    mail: parsedMail,
    invite: {
      title: normalizedIcsTitle || subjectTitle,
      decision: inferDecision({
        method: ics?.method,
        status: ics?.status,
        sequence: ics?.sequence,
        subject: parsedMail.subject,
        title: normalizedIcsTitle || subjectTitle,
        textBody: parsedMail.textBody,
      }),
      calendarUid: ics?.uid || "",
      sourceMessageId: parsedMail.messageId || "",
      startAt: ics?.startAt || parseDateTimeFromText(textSource),
      endAt: ics?.endAt || null,
      location: meetingMeta.location,
      organizer: normalizeOrganizer(ics?.organizer || parsedMail.from || ""),
      meetingLink: meetingMeta.meetingLink,
      meetingDetails: meetingMeta.meetingDetails,
      summary: buildInviteSummary(ics, parsedMail),
      source: calendarText ? "mail-ics" : "mail-body",
      rawCalendar: calendarText,
    },
  };
}

function parseMimeEntity(entity) {
  const contentType = entity.contentType || "text/plain";
  const match = contentType.match(/boundary="?([^";]+)"?/i);

  if (match && /^multipart\//i.test(contentType)) {
    const parts = splitMultipartBody(entity.body, match[1]);
    return parts.reduce(
      (acc, part) => mergeParsedParts(acc, parseMimeEntity(part)),
      { textBody: "", htmlBody: "", calendarParts: [], attachments: [] }
    );
  }

  const decodedBody = decodeEntityBody(entity.body, entity.transferEncoding || "");
  const decodedText = decodeBuffer(decodedBody, extractCharset(contentType));

  if (/text\/plain/i.test(contentType)) {
    return {
      textBody: decodedText,
      htmlBody: "",
      calendarParts: [],
      attachments: [],
    };
  }

  if (/text\/html/i.test(contentType)) {
    return {
      textBody: "",
      htmlBody: decodedText,
      calendarParts: [],
      attachments: [],
    };
  }

  if (/text\/calendar/i.test(contentType) || /application\/ics/i.test(contentType)) {
    return {
      textBody: "",
      htmlBody: "",
      calendarParts: [
        {
          contentType,
          content: decodedText,
        },
      ],
      attachments: [],
    };
  }

  const filename = extractFilename(entity.headers);
  return {
    textBody: "",
    htmlBody: "",
    calendarParts:
      filename && /\.ics$/i.test(filename)
        ? [
            {
              contentType,
              filename,
              content: decodedText,
            },
          ]
        : [],
    attachments: filename
      ? [
          {
            filename,
            contentType,
          },
        ]
      : [],
  };
}

function splitMultipartBody(body, boundary) {
  const chunks = String(body || "").split(new RegExp(`(?:\\r?\\n)?--${escapeRegExp(boundary)}(?:--)?\\r?\\n`, "g"));
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const separator = chunk.search(/\r?\n\r?\n/);
      const headerText = separator >= 0 ? chunk.slice(0, separator) : "";
      const contentText = separator >= 0 ? chunk.slice(separator).replace(/^\r?\n\r?\n/, "") : chunk;
      const headers = parseHeaderLines(headerText);

      return {
        headers,
        body: contentText,
        contentType: headers["content-type"] || "text/plain",
        transferEncoding: (headers["content-transfer-encoding"] || "").toLowerCase(),
      };
    });
}

function parseHeaderLines(block) {
  const headers = {};
  const normalized = String(block || "").replace(/\r\n[ \t]+/g, " ");

  normalized
    .split(/\r?\n/)
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

function decodeEntityBody(body, encoding) {
  const normalizedEncoding = String(encoding || "").toLowerCase();
  if (normalizedEncoding === "base64") {
    return Buffer.from(String(body || "").replace(/\s+/g, ""), "base64");
  }

  if (normalizedEncoding === "quoted-printable") {
    return decodeQuotedPrintableToBuffer(body);
  }

  return Buffer.from(String(body || ""), "utf8");
}

function decodeQuotedPrintableToBuffer(text) {
  const input = String(text || "").replace(/=\r?\n/g, "");
  const bytes = [];

  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "=" && /^[0-9a-fA-F]{2}$/.test(input.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(input.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    bytes.push(input.charCodeAt(index));
  }

  return Buffer.from(bytes);
}

function extractCharset(contentType) {
  const match = String(contentType || "").match(/charset="?([^";]+)"?/i);
  if (!match) {
    return "utf-8";
  }

  const charset = match[1].trim().toLowerCase();
  if (charset === "utf8") {
    return "utf-8";
  }

  if (charset === "gbk" || charset === "gb2312") {
    return "gb18030";
  }

  return charset;
}

function decodeBuffer(buffer, charset) {
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch (error) {
    return Buffer.from(buffer).toString("utf8");
  }
}

function extractFilename(headers) {
  const disposition = headers["content-disposition"] || "";
  const type = headers["content-type"] || "";
  const match = disposition.match(/filename="?([^";]+)"?/i) || type.match(/name="?([^";]+)"?/i);
  return match ? decodeMimeHeader(match[1]) : "";
}

function mergeParsedParts(acc, next) {
  return {
    textBody: acc.textBody || next.textBody || "",
    htmlBody: acc.htmlBody || next.htmlBody || "",
    calendarParts: [...(acc.calendarParts || []), ...(next.calendarParts || [])],
    attachments: [...(acc.attachments || []), ...(next.attachments || [])],
  };
}

function parseIcsText(rawText) {
  const unfolded = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce((acc, line) => {
      if (/^[ \t]/.test(line) && acc.length) {
        acc[acc.length - 1] += line.slice(1);
      } else {
        acc.push(line);
      }
      return acc;
    }, []);

  const result = {
    method: "",
    status: "",
    uid: "",
    sequence: 0,
    title: "",
    startAt: null,
    endAt: null,
    location: "",
    organizer: "",
    meetingLink: "",
    description: "",
  };

  unfolded.forEach((line) => {
    if (line.startsWith("METHOD:")) {
      result.method = line.slice(7).trim().toUpperCase();
    }
    if (line.startsWith("UID:")) {
      result.uid = decodeIcsValue(line.slice(4));
    }
    if (line.startsWith("SEQUENCE:")) {
      result.sequence = Number.parseInt(line.slice(9).trim(), 10) || 0;
    }
    if (line.startsWith("SUMMARY:")) {
      result.title = decodeIcsValue(line.slice(8));
    }
    if (line.startsWith("STATUS:")) {
      result.status = line.slice(7).trim().toUpperCase();
    }
    if (line.startsWith("LOCATION:")) {
      result.location = decodeIcsValue(line.slice(9));
    }
    if (line.startsWith("DESCRIPTION:")) {
      result.description = decodeIcsValue(line.slice(12));
      result.meetingLink = extractMeetingLink(result.description);
    }
    if (line.startsWith("ORGANIZER")) {
      result.organizer = line.includes("CN=")
        ? line.match(/CN=([^;:]+)/)?.[1] || "ICS 组织者"
        : "ICS 组织者";
    }
    if (line.startsWith("DTSTART")) {
      result.startAt = parseIcsDateValue(line);
    }
    if (line.startsWith("DTEND")) {
      result.endAt = parseIcsDateValue(line);
    }
  });

  return result;
}

function decodeIcsValue(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDateValue(line) {
  const rawValue = String(line || "").split(":")[1];
  if (!rawValue) {
    return null;
  }

  if (rawValue.endsWith("Z")) {
    const yyyy = rawValue.slice(0, 4);
    const mm = rawValue.slice(4, 6);
    const dd = rawValue.slice(6, 8);
    const hh = rawValue.slice(9, 11);
    const mi = rawValue.slice(11, 13);
    const ss = rawValue.slice(13, 15) || "00";
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`).toISOString();
  }

  const yyyy = rawValue.slice(0, 4);
  const mm = rawValue.slice(4, 6);
  const dd = rawValue.slice(6, 8);
  const hh = rawValue.slice(9, 11) || "09";
  const mi = rawValue.slice(11, 13) || "00";
  const ss = rawValue.slice(13, 15) || "00";
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`).toISOString();
}

function inferDecision({ method, status, sequence, subject, title, textBody }) {
  if (String(method || "").toUpperCase() === "CANCEL" || String(status || "").toUpperCase() === "CANCELLED") {
    return "cancel";
  }

  const signalText = `${subject || ""}\n${title || ""}\n${textBody || ""}`;
  if (/取消|撤销|终止|会议取消|canceled|cancelled|withdrawn/i.test(signalText)) {
    return "cancel";
  }

  if (/改期|调整|变更|更新|延期|顺延|rescheduled|updated|changed|postponed|moved/i.test(signalText)) {
    return "update";
  }

  if (Number(sequence || 0) > 0) {
    return "update";
  }

  return "create";
}

function buildInviteSummary(ics, parsedMail) {
  if (ics?.title) {
    return ics.method === "CANCEL" || ics.status === "CANCELLED"
      ? "助理已从邮件中的日历附件识别出一条取消通知。"
      : "助理已从邮件中的日历附件识别出会议标题、时间和地点。";
  }

  return "助理已从转发邮件正文中提取会议主题、时间线索和链接，可继续补齐并导入工作台。";
}

function cleanSubject(subject) {
  return String(subject || "")
    .replace(/^\s*\[助理\]\s*/i, "")
    .replace(/^\s*取消[:：]\s*/i, "")
    .replace(/^转发[:：]\s*/i, "")
    .replace(/\s*(改期|调整|变更|更新)(通知)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeetingMeta(text, fallback = {}) {
  const source = String(text || "");
  const meetingLink = fallback.meetingLink || extractMeetingLink(source) || "";
  const meetingCodeMatch =
    source.match(/(?:腾讯会议|会议号|会议 ID|Meeting ID)[:：\s#-]*([A-Za-z0-9-]{8,})/i) ||
    source.match(/\b\d{3}-\d{4}-\d{4}\b/) ||
    source.match(/\b\d{9,12}\b/);
  const meetingCode = meetingCodeMatch
    ? Array.isArray(meetingCodeMatch) && meetingCodeMatch[1]
      ? meetingCodeMatch[1]
      : meetingCodeMatch[0]
    : "";

  let location = fallback.location || extractLocation(source) || inferMeetingPlatform(meetingLink, source) || "";
  if (location) {
    location = location.replace(/(?:腾讯会议|会议号|Meeting ID)[:：].*$/i, "").trim();
  }

  const tencentLine = source.match(/([^\n\r]*腾讯会议[^\n\r]*)/i)?.[1]?.trim() || "";
  const meetingDetails = [meetingLink, tencentLine || (meetingCode ? `会议号：${meetingCode}` : "")]
    .filter(Boolean)
    .find((value, index, list) => list.indexOf(value) === index) || "";

  return {
    location,
    meetingLink,
    meetingCode,
    meetingDetails,
  };
}

function extractMeetingLink(text) {
  const match = String(text || "").match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : "";
}

function extractLocation(input) {
  const text = String(input || "");
  const patterns = [
    /地点[:：]\s*([^\n\r]+)/,
    /地址[:：]\s*([^\n\r]+)/,
    /会议地点[:：]\s*([^\n\r]+)/,
    /参会地点[:：]\s*([^\n\r]+)/,
    /会议室[:：]\s*([^\n\r]+)/,
    /会议形式[:：]\s*([^\n\r]+)/,
    /在([\u4e00-\u9fa5A-Za-z0-9·\-/（）() ]{2,30})(?:见面|开会|会面|吃饭|碰头|电话|视频|沟通)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return "";
}

function inferMeetingPlatform(link, source) {
  const text = `${link || ""}\n${source || ""}`;

  if (/meeting\.tencent\.com|腾讯会议/i.test(text)) {
    return "腾讯会议";
  }

  if (/teams\.microsoft\.com|microsoft teams|teams meeting/i.test(text)) {
    return "Microsoft Teams";
  }

  if (/zoom\.us|zoom meeting/i.test(text)) {
    return "Zoom";
  }

  if (/webex/i.test(text)) {
    return "Webex";
  }

  if (/google meet|meet\.google\.com/i.test(text)) {
    return "Google Meet";
  }

  return "";
}

function normalizeOrganizer(value) {
  const text = String(value || "").trim();
  const displayName = text.match(/^([^<]+)\s*</)?.[1]?.trim();
  return displayName || text;
}

function parseDateTimeFromText(text) {
  const source = String(text || "");
  const dateMatch = source.match(/(\d{1,2})月(\d{1,2})[日号]?\s*(上午|中午|下午|晚上)?\s*(\d{1,2})[:点时](\d{1,2})?/);
  if (!dateMatch) {
    return null;
  }

  const now = new Date();
  const year = now.getFullYear();
  let hours = Number(dateMatch[4]);
  const minutes = Number(dateMatch[5] || 0);
  const period = dateMatch[3] || "";

  if ((period === "下午" || period === "晚上") && hours < 12) {
    hours += 12;
  }
  if (period === "中午" && hours < 11) {
    hours += 12;
  }

  return new Date(year, Number(dateMatch[1]) - 1, Number(dateMatch[2]), hours, minutes, 0, 0).toISOString();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function escapeRegExp(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  cleanSubject,
  extractInviteFromMail,
  parseRawEmail,
};

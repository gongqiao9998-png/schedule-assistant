const { readJson, sendError, sendJson } = require("../_lib/http");
const { inspectTaggedMailsWithRaw } = require("../_lib/imap-skeleton");
const { cleanSubject, extractInviteFromMail } = require("../_lib/mail-parser");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请使用 POST 调用此接口。");
    return;
  }

  try {
    const body = await readJson(req);
    const result = await inspectTaggedMailsWithRaw(body, Number(body.limit || 20));
    const candidates = (result.items || []).map((item) => ({
      item,
      parsed: item.raw ? extractInviteFromMail(item.raw) : null,
    }));
    const selected = selectBestMailCandidate(candidates, body.subjectTag || "[助理]");
    const item = selected?.item || null;
    const parsed = selected ? applySelectionHints(selected) : null;

    sendJson(res, 200, {
      success: true,
      found: Boolean(item),
      item,
      parsed,
      count: result.count || 0,
      candidates: candidates.map((candidate) => ({
        subject: candidate.item.subject,
        date: candidate.item.date,
        messageId: candidate.item.messageId,
        decision: candidate.parsed?.invite?.decision || "create",
        title: candidate.parsed?.invite?.title || cleanSubject(candidate.item.subject || ""),
      })),
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

function selectBestMailCandidate(candidates, subjectTag) {
  if (!candidates.length) {
    return null;
  }

  const groups = new Map();

  candidates.forEach((candidate) => {
    const normalizedTitle = normalizeCandidateTitle(candidate, subjectTag);
    const group = groups.get(normalizedTitle) || [];
    group.push(candidate);
    groups.set(normalizedTitle, group);
  });

  const rankedGroups = Array.from(groups.values()).sort(compareGroups);
  const bestGroup = rankedGroups[0] || [];
  const bestCandidate = [...bestGroup].sort(compareCandidates)[0] || null;
  if (!bestCandidate) {
    return null;
  }

  return {
    ...bestCandidate,
    siblingCount: bestGroup.length,
  };
}

function normalizeCandidateTitle(candidate, subjectTag) {
  const inviteTitle = candidate.parsed?.invite?.title || "";
  const subjectTitle = cleanSubject(candidate.item.subject || "")
    .replace(subjectTag, "")
    .trim();
  return normalizeTitle(inviteTitle || subjectTitle || candidate.item.subject || "");
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^\s*转发[:：]\s*/i, "")
    .replace(/^\s*取消[:：]\s*/i, "")
    .replace(/\s*(改期|调整|变更|更新)(通知)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compareGroups(groupA, groupB) {
  const rankDiff = getGroupRank(groupB) - getGroupRank(groupA);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const repeatDiff = getGroupRepeatRank(groupB) - getGroupRepeatRank(groupA);
  if (repeatDiff !== 0) {
    return repeatDiff;
  }

  return getGroupTimestamp(groupB) - getGroupTimestamp(groupA);
}

function compareCandidates(a, b) {
  const rankDiff = getDecisionRank(b.parsed?.invite?.decision) - getDecisionRank(a.parsed?.invite?.decision);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  return getCandidateTimestamp(b) - getCandidateTimestamp(a);
}

function getGroupRank(group) {
  return Math.max(...group.map((candidate) => getDecisionRank(candidate.parsed?.invite?.decision)), 0);
}

function getGroupTimestamp(group) {
  return Math.max(...group.map((candidate) => getCandidateTimestamp(candidate)), 0);
}

function getGroupRepeatRank(group) {
  return group.length > 1 ? 1 : 0;
}

function getCandidateTimestamp(candidate) {
  const timestamp = Date.parse(candidate.item?.date || "") || 0;
  return timestamp;
}

function getDecisionRank(decision) {
  if (decision === "cancel") {
    return 3;
  }
  if (decision === "update") {
    return 2;
  }
  return 1;
}

function applySelectionHints(selected) {
  if (!selected?.parsed?.invite) {
    return selected?.parsed || null;
  }

  const parsed = JSON.parse(JSON.stringify(selected.parsed));
  const invite = parsed.invite;

  if (selected.siblingCount > 1 && invite.decision === "create") {
    invite.decision = "update";
    invite.summary =
      invite.summary ||
      "助理发现最近存在同标题邮件，已优先按会议改期 / 更新处理。";
  }

  return parsed;
}

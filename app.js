const STORAGE_KEY = "assistant-schedule-mvp";
const MAILBOX_API_TIMEOUT_MS = 12000;

const state = loadState();
const ui = {
  summaryCards: document.querySelector("#summaryCards"),
  heroBrief: document.querySelector("#heroBrief"),
  captureInput: document.querySelector("#captureInput"),
  parseButton: document.querySelector("#parseButton"),
  clearButton: document.querySelector("#clearButton"),
  listenButton: document.querySelector("#listenButton"),
  installButton: document.querySelector("#installButton"),
  notifyButton: document.querySelector("#notifyButton"),
  voiceStatus: document.querySelector("#voiceStatus"),
  draftContent: document.querySelector("#draftContent"),
  draftConfidence: document.querySelector("#draftConfidence"),
  assistantBrief: document.querySelector("#assistantBrief"),
  mailImportStatus: document.querySelector("#mailImportStatus"),
  mailboxSettingsPanel: document.querySelector("#mailboxSettingsPanel"),
  mailFileInput: document.querySelector("#mailFileInput"),
  agendaList: document.querySelector("#agendaList"),
  reminderList: document.querySelector("#reminderList"),
  travelList: document.querySelector("#travelList"),
  promptChips: document.querySelector("#promptChips"),
};

const speechApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let reminderTimers = [];
let installPromptEvent = null;

boot();

function boot() {
  setupInstallPrompt();
  render();
  registerServiceWorker();
  bindEvents();
  scheduleReminderNotifications();
}

function bindEvents() {
  ui.parseButton.addEventListener("click", handleParse);
  ui.clearButton.addEventListener("click", () => {
    ui.captureInput.value = "";
    state.draft = null;
    saveState();
    renderDraft();
  });

  ui.promptChips.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) {
      return;
    }

    ui.captureInput.value = button.textContent.trim();
    handleParse();
  });

  ui.listenButton.addEventListener("click", toggleVoiceInput);
  ui.installButton.addEventListener("click", handleInstallClick);
  ui.notifyButton.addEventListener("click", requestNotificationPermission);
  ui.mailFileInput.addEventListener("change", handleMailFileChange);

  document.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const { action, type, id } = actionButton.dataset;
    if (action === "save-draft") {
      persistDraft();
    }

    if (action === "demo-mail") {
      importDemoMailInvite();
    }

    if (action === "demo-calendar") {
      importDemoCalendarEvent();
    }

    if (action === "mail-forwarded") {
      startForwardedMailFlow();
    }

    if (action === "mail-check") {
      await simulateForwardedMailRecognition();
    }

    if (action === "mail-paste") {
      openMailPasteComposer();
    }

    if (action === "mail-parse-paste") {
      parsePastedMail();
    }

    if (action === "mail-upload-ics") {
      ui.mailFileInput.click();
    }

    if (action === "mail-settings") {
      openMailboxSettings();
    }

    if (action === "mailbox-test") {
      await testMailboxSettings();
    }

    if (action === "mailbox-save") {
      await saveMailboxSettings();
    }

    if (action === "mailbox-check-tagged") {
      await checkTaggedMailboxMails();
    }

    if (action === "confirm-mail-import") {
      confirmMailImport();
    }

    if (action === "dismiss-mail-import") {
      state.mailImport = null;
      saveState();
      renderMailImport();
    }

    if (action === "toggle" && type) {
      toggleItemStatus(type, id);
    }
  });
}

function setupInstallPrompt() {
  ui.installButton.hidden = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    ui.installButton.hidden = false;
    ui.installButton.textContent = "安装到手机";
  });

  window.addEventListener("appinstalled", () => {
    installPromptEvent = null;
    ui.installButton.hidden = true;
    ui.voiceStatus.textContent = "应用已安装到桌面";
  });

  if (isStandaloneMode()) {
    ui.installButton.hidden = true;
    return;
  }

  if (isIosDevice()) {
    ui.installButton.hidden = false;
    ui.installButton.textContent = "iPhone 安装说明";
  }
}

function handleParse() {
  const input = ui.captureInput.value.trim();

  if (!input) {
    ui.voiceStatus.textContent = "请先输入一句安排";
    return;
  }

  state.draft = parseAssistantInput(input);
  saveState();
  renderDraft();
}

function persistDraft() {
  if (!state.draft) {
    return;
  }

  if (state.draft.calendarEvent) {
    state.events.unshift({
      ...state.draft.calendarEvent,
      id: crypto.randomUUID(),
      status: "scheduled",
    });
  }

  state.draft.reminders.forEach((reminder) => {
    state.reminders.unshift({
      ...reminder,
      id: crypto.randomUUID(),
      status: "pending",
      source: "assistant",
    });
  });

  state.draft.todos.forEach((todo) => {
    state.reminders.unshift({
      ...todo,
      id: crypto.randomUUID(),
      kind: "todo",
      status: "pending",
      source: "assistant",
    });
  });

  if (state.draft.travelRequest) {
    state.travelRequests.unshift({
      ...state.draft.travelRequest,
      id: crypto.randomUUID(),
      status: "待预订",
    });
  }

  state.draft = null;
  ui.captureInput.value = "";
  saveState();
  render();
  scheduleReminderNotifications();
  ui.voiceStatus.textContent = "已保存到工作台";
}

function toggleItemStatus(type, id) {
  const targetList = type === "event" ? state.events : state.reminders;
  const item = targetList.find((entry) => entry.id === id);

  if (!item) {
    return;
  }

  if (type === "event") {
    item.status = item.status === "done" ? "scheduled" : "done";
  } else {
    item.status = item.status === "done" ? "pending" : "done";
  }

  saveState();
  render();
  scheduleReminderNotifications();
}

function render() {
  renderSummary();
  renderHeroBrief();
  renderDraft();
  renderAssistantBrief();
  renderMailImport();
  renderMailboxSettings();
  renderAgenda();
  renderReminders();
  renderTravel();
}

function renderSummary() {
  const today = new Date();
  const todayStart = startOfDay(today);
  const tomorrowStart = addDays(todayStart, 1);

  const todayEvents = state.events.filter((event) => {
    const start = new Date(event.startAt);
    return event.status !== "cancelled" && start >= todayStart && start < tomorrowStart;
  });

  const pendingReminders = state.reminders.filter((item) => item.status !== "done");
  const pendingTravel = state.travelRequests.filter((item) => item.status !== "已完成");

  const cards = [
    {
      label: "今日会议",
      value: `${todayEvents.length}`,
      helper: todayEvents[0] ? formatDateTime(todayEvents[0].startAt) : "今天暂无会议",
    },
    {
      label: "待处理事项",
      value: `${pendingReminders.length}`,
      helper: pendingReminders[0] ? pendingReminders[0].title : "提醒已清空",
    },
    {
      label: "待预订差旅",
      value: `${pendingTravel.length}`,
      helper: pendingTravel[0] ? pendingTravel[0].title : "目前没有待预订行程",
    },
  ];

  ui.summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <p>${escapeHtml(card.helper)}</p>
        </article>
      `
    )
    .join("");
}

function renderHeroBrief() {
  const nextEvent = getNextUpcomingEvent();
  const pendingCount = state.reminders.filter((item) => item.status !== "done").length;

  if (nextEvent) {
    ui.heroBrief.innerHTML = `
      <strong>助理提示：</strong>
      下一项重点安排是 <strong>${escapeHtml(nextEvent.title)}</strong>，
      时间在 ${escapeHtml(formatDateTime(nextEvent.startAt))}。
      当前还有 ${pendingCount} 项提醒与待办待处理。
    `;
    return;
  }

  ui.heroBrief.innerHTML = `
    <strong>助理提示：</strong>
    你今天还没有紧迫会议，适合先把临时约见、待办和差旅行程一次性说给我整理。
  `;
}

function renderDraft() {
  if (!state.draft) {
    ui.draftConfidence.textContent = "等待输入";
    ui.draftContent.className = "draft-empty";
    ui.draftContent.textContent =
      "输入一段语音或文字后，我会先帮你形成一版助理建议，你确认后再写入正式工作台。";
    return;
  }

  const { calendarEvent, reminders, todos, travelRequest, confidence, summary } = state.draft;
  ui.draftConfidence.textContent = `识别可信度 ${Math.round(confidence * 100)}%`;
  ui.draftContent.className = "draft-grid";

  const reminderItems = reminders.length
    ? `<ul>${reminders.map((item) => `<li>${escapeHtml(item.title)} · ${escapeHtml(formatDateTime(item.remindAt))}</li>`).join("")}</ul>`
    : "<p>未识别到提醒，保存后可在提醒区补充。</p>";

  const todoItems = todos.length
    ? `<ul>${todos.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}</ul>`
    : "<p>没有额外待办。</p>";

  const eventBlock = calendarEvent
    ? `
      <article class="draft-block">
        <span class="type-pill">日程</span>
        <h3>${escapeHtml(calendarEvent.title)}</h3>
        <p>${escapeHtml(summary)}</p>
        <ul class="meta-list">
          <li>${escapeHtml(formatDateTime(calendarEvent.startAt))} - ${escapeHtml(formatDateTime(calendarEvent.endAt, true))}</li>
          <li>${escapeHtml(calendarEvent.location || "地点待定")}</li>
          <li>${escapeHtml(calendarEvent.participants || "参与人待补充")}</li>
        </ul>
      </article>
    `
    : `
      <article class="draft-block">
        <span class="type-pill">日程</span>
        <h3>未识别到明确时间</h3>
        <p>可以再补一句具体日期和时间，系统就能自动生成行事历。</p>
      </article>
    `;

  const travelBlock = travelRequest
    ? `
      <article class="draft-block">
        <span class="type-pill">差旅</span>
        <h3>${escapeHtml(travelRequest.title)}</h3>
        <p>${escapeHtml(travelRequest.note)}</p>
        <ul class="meta-list">
          <li>${escapeHtml(travelRequest.mode)}</li>
          <li>${escapeHtml(travelRequest.route)}</li>
          <li>${escapeHtml(formatDateTime(travelRequest.departAt))}</li>
        </ul>
      </article>
    `
    : `
      <article class="draft-block">
        <span class="type-pill">差旅</span>
        <h3>没有预订需求</h3>
        <p>如果你说了飞机、高铁、酒店、接送机等关键词，这里会自动生成预订请求。</p>
      </article>
    `;

  ui.draftContent.innerHTML = `
    ${eventBlock}
    <article class="draft-block">
      <span class="type-pill">提醒</span>
      <h3>提醒清单</h3>
      ${reminderItems}
    </article>
    <article class="draft-block">
      <span class="type-pill">待办</span>
      <h3>跟进事项</h3>
      ${todoItems}
    </article>
    ${travelBlock}
    <article class="draft-block">
      <span class="type-pill">动作</span>
      <h3>一键写入工作台</h3>
      <p>确认无误后，系统会把识别出的安排写入你的行事历、提醒和差旅区。</p>
      <div class="capture-actions">
        <button class="primary-button" type="button" data-action="save-draft">保存安排</button>
      </div>
    </article>
  `;
}

function renderAssistantBrief() {
  const briefItems = buildAssistantBriefItems();

  ui.assistantBrief.innerHTML = briefItems
    .map(
      (item) => `
        <article class="brief-item">
          <span class="type-pill">${escapeHtml(item.tag)}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `
    )
    .join("");
}

function renderMailImport() {
  const importState = state.mailImport;

  if (!importState) {
    ui.mailImportStatus.className = "draft-empty";
    ui.mailImportStatus.innerHTML =
      "你可以把重要会议邀请一键转发给助理，或者先粘贴邮件内容 / 上传 <code>.ics</code> 做导入演示。";
    return;
  }

  if (importState.mode === "forwarded_waiting") {
    ui.mailImportStatus.className = "mail-helper";
    ui.mailImportStatus.innerHTML = `
      <div class="mail-decision">
        <strong>第 1 步已完成：你已把会议转发给助理</strong>
        <p>下一步可以模拟“助理收件并识别最新转发邮件”。正式接入后，这里会变成真实收件状态。</p>
      </div>
      <div class="capture-actions">
        <button class="primary-button" type="button" data-action="mail-check">模拟收取最新转发邮件</button>
        <button class="ghost-button" type="button" data-action="dismiss-mail-import">暂时关闭</button>
      </div>
    `;
    return;
  }

  if (importState.mode === "paste") {
    ui.mailImportStatus.className = "mail-import-composer";
    ui.mailImportStatus.innerHTML = `
      <div class="mail-decision">
        <strong>把转发邮件正文粘贴到这里</strong>
        <p>适合你临时不能自动收件时做手动导入。助理会识别标题、时间、地点和是否改期/取消。</p>
      </div>
      <textarea id="mailPasteInput" placeholder="请粘贴 Outlook 转发后的会议邮件内容，或包含标题 / 时间 / 地点 / 链接的文本。">${escapeHtml(
        importState.rawText || ""
      )}</textarea>
      <div class="capture-actions">
        <button class="primary-button" type="button" data-action="mail-parse-paste">开始识别</button>
        <button class="ghost-button" type="button" data-action="dismiss-mail-import">取消</button>
      </div>
    `;
    return;
  }

  if (importState.mode === "parsed") {
    const item = importState.item;
    ui.mailImportStatus.className = "mail-import-result";
    ui.mailImportStatus.innerHTML = `
      <div class="mail-decision">
        <span class="type-pill">${escapeHtml(item.decisionLabel)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
      </div>
      <div class="mail-detail-grid">
        <article class="mail-detail-item">
          <span>开始时间</span>
          <strong>${escapeHtml(item.startAt ? formatDateTime(item.startAt) : "待补充")}</strong>
        </article>
        <article class="mail-detail-item">
          <span>结束时间</span>
          <strong>${escapeHtml(item.endAt ? formatDateTime(item.endAt) : "默认 1 小时后")}</strong>
        </article>
        <article class="mail-detail-item">
          <span>地点</span>
          <strong>${escapeHtml(item.location || "待补充")}</strong>
        </article>
        <article class="mail-detail-item">
          <span>组织者</span>
          <strong>${escapeHtml(item.organizer || "邮件发起人待识别")}</strong>
        </article>
        <article class="mail-detail-item">
          <span>会议链接 / 会议号</span>
          <strong>${escapeHtml(item.meetingDetails || item.meetingLink || "待补充")}</strong>
        </article>
      </div>
      <div class="capture-actions">
        <button class="primary-button" type="button" data-action="confirm-mail-import">确认导入工作台</button>
        <button class="ghost-button" type="button" data-action="dismiss-mail-import">稍后处理</button>
      </div>
    `;
  }
}

function renderMailboxSettings() {
  const mailbox = state.mailboxSettings;

  if (!mailbox || mailbox.mode !== "editing") {
    ui.mailboxSettingsPanel.className = "draft-empty";
    ui.mailboxSettingsPanel.innerHTML =
      "助理只会检查你主动标记为 <code>[助理]</code> 的会议邮件，不会读取其他普通邮件。";
    return;
  }

  ui.mailboxSettingsPanel.className = "mailbox-settings";
  ui.mailboxSettingsPanel.innerHTML = `
    <div class="mailbox-note">
      请告诉助理应该检查哪个邮箱、哪个文件夹，以及用什么主题标识识别“需要交给助理处理”的会议邮件。
    </div>
    <div class="mailbox-settings-form">
      <div class="mailbox-grid">
        <div class="mailbox-field">
          <label for="mailboxEmail">邮箱地址</label>
          <input id="mailboxEmail" value="${escapeHtml(mailbox.email || "")}" placeholder="name@company.com" />
        </div>
        <div class="mailbox-field">
          <label for="mailboxHost">收件服务器</label>
          <input id="mailboxHost" value="${escapeHtml(mailbox.imapHost || "outlook.office365.com")}" placeholder="outlook.office365.com" />
        </div>
        <div class="mailbox-field">
          <label for="mailboxPort">端口</label>
          <input id="mailboxPort" value="${escapeHtml(String(mailbox.imapPort || 993))}" placeholder="993" />
        </div>
        <div class="mailbox-field">
          <label for="mailboxFolder">检查文件夹</label>
          <input id="mailboxFolder" value="${escapeHtml(mailbox.folder || "INBOX")}" placeholder="INBOX" />
        </div>
        <div class="mailbox-field">
          <label for="mailboxUsername">登录账号</label>
          <input id="mailboxUsername" value="${escapeHtml(mailbox.username || mailbox.email || "")}" placeholder="name@company.com" />
        </div>
        <div class="mailbox-field">
          <label for="mailboxTag">助理邮件标识</label>
          <input id="mailboxTag" value="${escapeHtml(mailbox.subjectTag || "[助理]")}" placeholder="[助理]" />
        </div>
      </div>
      <div class="mailbox-field">
        <label for="mailboxPassword">邮箱密码 / 应用专用密码</label>
        <input id="mailboxPassword" type="password" value="${escapeHtml(mailbox.password || "")}" placeholder="请输入密码或专用密码" />
      </div>
      <div class="capture-actions">
        <button class="primary-button" type="button" data-action="mailbox-test">测试邮箱连接</button>
        <button class="secondary-button" type="button" data-action="mailbox-check-tagged">检查最近 [助理] 邮件</button>
        <button class="ghost-button" type="button" data-action="mailbox-save">保存设置</button>
      </div>
      ${
        mailbox.resultMessage
          ? `<div class="mailbox-note">${escapeHtml(mailbox.resultMessage)}</div>`
          : ""
      }
    </div>
  `;
}

function renderAgenda() {
  if (!state.events.length) {
    ui.agendaList.innerHTML =
      '<div class="empty-state">还没有正式写入的行程。先在上方用一句话告诉助理你的安排。</div>';
    return;
  }

  const sortedEvents = [...state.events].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  ui.agendaList.innerHTML = sortedEvents
    .map(
      (event) => `
        <article class="list-item">
          <div class="list-item__top">
            <div>
              <span class="type-pill">行程</span>
              <h3>${escapeHtml(event.title)}</h3>
            </div>
            <span class="time-pill">${escapeHtml(event.status === "cancelled" ? "已取消" : formatDateTime(event.startAt))}</span>
          </div>
          <p>${escapeHtml(event.location || "地点待定")} · ${escapeHtml(event.participants || "参与人待补充")}</p>
          <div class="list-item__footer">
            <span>${escapeHtml(buildEventFooterNote(event))}</span>
            ${
              event.status === "cancelled"
                ? '<button class="small-button" type="button" disabled>已取消</button>'
                : `<button class="small-button ${event.status === "done" ? "is-complete" : ""}" type="button" data-action="toggle" data-type="event" data-id="${event.id}">
              ${event.status === "done" ? "已完成" : "标记完成"}
            </button>`
            }
          </div>
        </article>
      `
    )
    .join("");
}

function renderReminders() {
  if (!state.reminders.length) {
    ui.reminderList.innerHTML =
      '<div class="empty-state">提醒和待办会自动出现在这里，也可以通过语音说“提醒我……”来生成。</div>';
    return;
  }

  const sortedItems = [...state.reminders].sort((a, b) => {
    const aTime = a.remindAt || a.dueAt || a.createdAt;
    const bTime = b.remindAt || b.dueAt || b.createdAt;
    return new Date(aTime) - new Date(bTime);
  });

  ui.reminderList.innerHTML = sortedItems
    .map(
      (item) => `
        <article class="list-item">
          <div class="list-item__top">
            <div>
              <span class="type-pill">${item.kind === "todo" ? "待办" : "提醒"}</span>
              <h3>${escapeHtml(item.title)}</h3>
            </div>
            <span class="time-pill">${escapeHtml(formatDateTime(item.remindAt || item.dueAt || item.createdAt))}</span>
          </div>
          <p>${escapeHtml(item.note || "由助理从语音内容自动提取")}</p>
          <div class="list-item__footer">
            <span>${escapeHtml(item.source === "assistant" ? "来自语音助理" : "系统生成")}</span>
            <button class="small-button ${item.status === "done" ? "is-complete" : ""}" type="button" data-action="toggle" data-type="reminder" data-id="${item.id}">
              ${item.status === "done" ? "已完成" : "标记完成"}
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderTravel() {
  if (!state.travelRequests.length) {
    ui.travelList.innerHTML =
      '<div class="empty-state">当你说到高铁、航班、酒店、接送机等需求时，系统会自动生成差旅预订请求。</div>';
    return;
  }

  const sortedTravel = [...state.travelRequests].sort((a, b) => new Date(a.departAt) - new Date(b.departAt));

  ui.travelList.innerHTML = sortedTravel
    .map(
      (item) => `
        <article class="list-item">
          <div class="list-item__top">
            <div>
              <span class="type-pill">差旅</span>
              <h3>${escapeHtml(item.title)}</h3>
            </div>
            <span class="time-pill">${escapeHtml(item.status)}</span>
          </div>
          <p>${escapeHtml(item.route)} · ${escapeHtml(formatDateTime(item.departAt))}</p>
          <div class="list-item__footer">
            <span>${escapeHtml(item.note)}</span>
            <button class="small-button ${item.status === "已完成" ? "is-complete" : ""}" type="button" data-action="toggle-travel" disabled>
              接口待接入
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function buildAssistantBriefItems() {
  const nextEvent = getNextUpcomingEvent();
  const pendingReminders = state.reminders.filter((item) => item.status !== "done");
  const pendingTravel = state.travelRequests.filter((item) => item.status !== "已完成");
  const items = [];

  if (nextEvent) {
    items.push({
      tag: "重点安排",
      title: nextEvent.title,
      description: `${formatDateTime(nextEvent.startAt)} · ${
        nextEvent.location || "地点待补充"
      }`,
    });
  } else {
    items.push({
      tag: "日程空档",
      title: "今天没有新增会议压力",
      description: "如果你有临时拜访、电话沟通或商务餐叙，可以直接语音录入让我补齐。",
    });
  }

  items.push({
    tag: "待跟进",
    title: `还有 ${pendingReminders.length} 项提醒 / 待办`,
    description: pendingReminders[0]
      ? `当前最靠前的是：${pendingReminders[0].title}`
      : "当前没有待处理提醒，适合清理新的安排。",
  });

  items.push({
    tag: "外部同步",
    title: "可继续导入邮件邀约或系统日历",
    description: "下方同步区已经预留了演示按钮，后续可以替换成真实邮箱和日历接口。",
  });

  if (pendingTravel.length) {
    items.push({
      tag: "差旅关注",
      title: `${pendingTravel.length} 条差旅请求待确认`,
      description: `最近一条是：${pendingTravel[0].route}，状态为 ${pendingTravel[0].status}。`,
    });
  }

  return items;
}

function parseAssistantInput(input) {
  const now = new Date();
  const startAt = parseDateTime(input, now);
  const durationMinutes = parseDurationMinutes(input);
  const endAt = startAt ? new Date(startAt.getTime() + durationMinutes * 60 * 1000) : null;

  const title = buildEventTitle(input);
  const location = extractLocation(input);
  const participants = extractParticipants(input);

  const reminders = buildReminders(input, startAt, title);
  const todos = buildTodos(input, startAt);
  const travelRequest = buildTravelRequest(input, startAt);
  const hasIntent = Boolean(startAt || reminders.length || todos.length || travelRequest);

  return {
    raw: input,
    createdAt: now.toISOString(),
    confidence: hasIntent ? 0.84 : 0.42,
    summary: buildSummary(input, startAt, location),
    calendarEvent: startAt
      ? {
          title,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          location,
          participants,
          notes: "来自语音 / 文本自动整理",
        }
      : null,
    reminders,
    todos,
    travelRequest,
  };
}

function buildSummary(input, startAt, location) {
  if (!startAt) {
    return "我识别到你在描述提醒、待办或差旅，但还缺一个明确时间，补一句日期或时段会更完整。";
  }

  const segments = [
    `已识别 ${formatDateTime(startAt.toISOString())} 的安排`,
    location ? `地点在 ${location}` : "地点待补充",
    "可一键写入行事历并生成配套提醒",
  ];
  return segments.join("，") + "。";
}

function importDemoMailInvite() {
  const title = "客户邮件邀约：季度合作复盘会";
  if (state.events.some((event) => event.title === title)) {
    ui.voiceStatus.textContent = "邮件邀约示例已经导入过了";
    return;
  }

  const startAt = getNextBusinessSlot(1, 14, 30);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  state.events.unshift({
    id: crypto.randomUUID(),
    title,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    location: "腾讯会议 / 邮件邀请",
    participants: "张总、商务团队",
    notes: "模拟从企业邮箱抓取的会议邀约",
    status: "scheduled",
  });

  state.reminders.unshift({
    id: crypto.randomUUID(),
    kind: "reminder",
    title: "会前确认邮件材料",
    remindAt: new Date(startAt.getTime() - 45 * 60 * 1000).toISOString(),
    note: "模拟伴随邮件邀约生成的会前提醒",
    source: "mail-demo",
    status: "pending",
  });

  saveState();
  render();
  scheduleReminderNotifications();
  ui.voiceStatus.textContent = "已导入一条邮件邀约示例";
}

function importDemoCalendarEvent() {
  const title = "系统日历同步：管理周例会";
  if (state.events.some((event) => event.title === title)) {
    ui.voiceStatus.textContent = "系统日历示例已经同步过了";
    return;
  }

  const startAt = getNextBusinessSlot(2, 9, 30);
  const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);

  state.events.unshift({
    id: crypto.randomUUID(),
    title,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    location: "总部 8F 大会议室",
    participants: "管理层",
    notes: "模拟从手机系统日历同步的既有安排",
    status: "scheduled",
  });

  state.reminders.unshift({
    id: crypto.randomUUID(),
    kind: "reminder",
    title: "同步安排后的会前提醒",
    remindAt: new Date(startAt.getTime() - 30 * 60 * 1000).toISOString(),
    note: "模拟同步系统日历后自动生成的提醒",
    source: "calendar-demo",
    status: "pending",
  });

  saveState();
  render();
  scheduleReminderNotifications();
  ui.voiceStatus.textContent = "已同步一条系统日历示例";
}

function startForwardedMailFlow() {
  state.mailImport = {
    mode: "forwarded_waiting",
  };
  saveState();
  renderMailImport();
  ui.voiceStatus.textContent = "已记录：你刚刚转发了一封会议邀请";
}

function openMailboxSettings() {
  state.mailboxSettings = {
    mode: "editing",
    email: state.mailboxSettings?.email || "",
    imapHost: state.mailboxSettings?.imapHost || "outlook.office365.com",
    imapPort: state.mailboxSettings?.imapPort || 993,
    folder: state.mailboxSettings?.folder || "INBOX",
    username: state.mailboxSettings?.username || "",
    password: state.mailboxSettings?.password || "",
    subjectTag: state.mailboxSettings?.subjectTag || "[助理]",
    resultMessage: "",
  };
  saveState();
  renderMailboxSettings();
  scrollToMailboxSettings();
  ui.voiceStatus.textContent = "已展开助理收件设置";
}

async function simulateForwardedMailRecognition() {
  if (state.mailboxSettings?.email && state.mailboxSettings?.username && state.mailboxSettings?.password) {
    try {
      ui.voiceStatus.textContent = "正在检查最近一封 [助理] 邮件";
      const response = await callMailboxApi("/api/mail/check-latest", {
        ...state.mailboxSettings,
        limit: 20,
      });

      if (response.found && response.item) {
        state.mailImport = {
          mode: "parsed",
          item: buildMailImportFromMailboxItem(response.item, response.parsed),
        };
        saveState();
        renderMailImport();
        ui.voiceStatus.textContent = "已从邮箱找到最近一封 [助理] 邮件";
        return;
      }

      const form = {
        ...state.mailboxSettings,
        resultMessage: `未找到新的 ${state.mailboxSettings.subjectTag || "[助理]"} 邮件，已回退为演示识别。`,
      };
      state.mailboxSettings = form;
      saveState();
      renderMailboxSettings();
    } catch (error) {
      console.warn("mail check fallback:", error);
    }
  }

  const startAt = getNextBusinessSlot(1, 16, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  state.mailImport = {
    mode: "parsed",
    item: {
      title: "客户转发邮件：季度合作复盘会",
      decision: "create",
      decisionLabel: "助理判断：新增会议",
      summary: "已根据你转发的会议邀请识别出一条新增会议，并建议同步生成会前提醒与资料准备待办。",
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      location: "腾讯会议 / 邮件邀请",
      organizer: "Vivi 公司邮箱",
      meetingLink: "https://teams.microsoft.com/",
      reminderTitle: "会前确认复盘资料",
      todoTitle: "准备季度合作复盘材料",
      source: "forwarded-mail",
    },
  };
  saveState();
  renderMailImport();
  ui.voiceStatus.textContent = "助理已识别最新转发邮件";
}

function openMailPasteComposer() {
  state.mailImport = {
    mode: "paste",
    rawText: "",
  };
  saveState();
  renderMailImport();
}

function parsePastedMail() {
  const textarea = document.querySelector("#mailPasteInput");
  const rawText = textarea ? textarea.value.trim() : "";

  if (!rawText) {
    ui.voiceStatus.textContent = "请先粘贴邮件内容";
    return;
  }

  const parsed = buildMailImportFromText(rawText);
  state.mailImport = {
    mode: "parsed",
    item: parsed,
  };
  saveState();
  renderMailImport();
  ui.voiceStatus.textContent = "助理已完成邮件内容识别";
}

function handleMailFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    const parsed = buildMailImportFromIcs(text, file.name);
    state.mailImport = {
      mode: "parsed",
      item: parsed,
    };
    saveState();
    renderMailImport();
    ui.voiceStatus.textContent = "已完成 .ics 导入识别";
    ui.mailFileInput.value = "";
  };
  reader.readAsText(file);
}

function readMailboxForm() {
  return {
    mode: "editing",
    email: document.querySelector("#mailboxEmail")?.value.trim() || "",
    imapHost: document.querySelector("#mailboxHost")?.value.trim() || "outlook.office365.com",
    imapPort: Number(document.querySelector("#mailboxPort")?.value.trim() || 993),
    folder: document.querySelector("#mailboxFolder")?.value.trim() || "INBOX",
    username: document.querySelector("#mailboxUsername")?.value.trim() || "",
    password: document.querySelector("#mailboxPassword")?.value || "",
    subjectTag: document.querySelector("#mailboxTag")?.value.trim() || "[助理]",
    resultMessage: "",
  };
}

async function testMailboxSettings() {
  const form = readMailboxForm();

  if (!form.email || !form.username || !form.password) {
    form.resultMessage = "请先补全邮箱地址、登录账号和密码，再测试连接。";
    state.mailboxSettings = form;
    saveState();
    renderMailboxSettings();
    ui.voiceStatus.textContent = "请先补全邮箱连接信息";
    return;
  }

  try {
    ui.voiceStatus.textContent = "正在测试邮箱连接";
    const response = await callMailboxApi("/api/mailbox/test-connection", form);
    form.resultMessage = buildMailboxConnectionMessage(response, form);
    state.mailboxSettings = form;
    saveState();
    renderMailboxSettings();
    ui.voiceStatus.textContent = "邮箱连接测试完成";
  } catch (error) {
    console.warn("mailbox test fallback:", error);
    form.resultMessage = buildMailboxErrorMessage(
      error,
      `未连通后端测试接口，已回退演示模式：将尝试连接 ${form.imapHost}:${form.imapPort}，并只检查主题含 ${form.subjectTag} 的邮件。`
    );
    state.mailboxSettings = form;
    saveState();
    renderMailboxSettings();
    ui.voiceStatus.textContent = "已运行邮箱连接演示测试";
  }
}

async function saveMailboxSettings() {
  const form = readMailboxForm();

  try {
    const response = await callMailboxApi("/api/mailbox/settings", form);
    form.resultMessage =
      response.message ||
      "助理收件设置已保存。后续真实接入时，系统将只检查带指定标识的邮件。";
  } catch (error) {
    console.warn("mailbox save fallback:", error);
    form.resultMessage = "助理收件设置已保存到当前设备。后续真实接入时，系统将只检查带指定标识的邮件。";
  }

  state.mailboxSettings = form;
  saveState();
  renderMailboxSettings();
  ui.voiceStatus.textContent = "助理收件设置已保存";
}

async function checkTaggedMailboxMails() {
  const form = readMailboxForm();

  if (!form.email || !form.username || !form.password) {
    form.resultMessage = "请先保存邮箱账号与密码，再检查最近 [助理] 邮件。";
    state.mailboxSettings = form;
    saveState();
    renderMailboxSettings();
    ui.voiceStatus.textContent = "请先补全助理收件设置";
    return;
  }

  try {
    ui.voiceStatus.textContent = `正在检查 ${form.subjectTag} 邮件`;
    const response = await callMailboxApi("/api/mailbox/check-tagged-mails", {
      ...form,
      limit: 20,
    });
    form.resultMessage = buildTaggedMailResultMessage(response, form);
    state.mailboxSettings = form;
    saveState();
    renderMailboxSettings();
    ui.voiceStatus.textContent = "最近 [助理] 邮件检查完成";
  } catch (error) {
    console.warn("tagged mail fallback:", error);
    form.resultMessage = buildMailboxErrorMessage(
      error,
      `未连通真实检查接口，已回退演示模式：将检查 ${form.folder} 文件夹中主题包含 ${form.subjectTag} 的最近邮件。`
    );
    state.mailboxSettings = form;
    saveState();
    renderMailboxSettings();
    ui.voiceStatus.textContent = "已演示检查最近 [助理] 邮件";
  }
}

async function callMailboxApi(path, payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MAILBOX_API_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data?.error?.message || `Request failed with status ${response.status}`);
    }

    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildMailboxConnectionMessage(response, form) {
  const stageLabels = {
    connected: "已连通收件服务器",
    authenticated: "已完成邮箱认证",
    identified: "已完成客户端身份声明",
    mailbox_selected: `已可读取 ${form.folder} 文件夹`,
  };
  const stage = response.stage ? stageLabels[response.stage] || response.stage : "已完成连接测试";
  const banner = response.serverBanner ? `服务器响应：${response.serverBanner}` : "";
  return `${stage}。${banner}`.trim();
}

function buildTaggedMailResultMessage(response, form) {
  if (!response.count) {
    return `未找到新的 ${form.subjectTag} 邮件。助理会继续只检查 ${form.folder} 中被你主动标记的会议邮件。`;
  }

  const latest = response.items?.[0];
  const latestSummary = latest?.subject
    ? ` 最近一封是《${cleanImportedMailTitle(latest.subject, form.subjectTag)}》。`
    : "";
  return `已找到 ${response.count} 封 ${form.subjectTag} 邮件。${latestSummary}`.trim();
}

function buildMailImportFromMailboxItem(item, parsedPayload) {
  const parsedInvite = parsedPayload?.invite;
  const fallbackStart = getNextBusinessSlot(1, 16, 0);
  const fallbackEnd = new Date(fallbackStart.getTime() + 60 * 60 * 1000);
  const cleanedSubject = cleanImportedMailTitle(item.subject || "最近转发邮件", item.subjectTag || "[助理]");
  const rawTitle = parsedInvite?.title || cleanedSubject || "最近转发邮件";
  const title = cleanImportedMailTitle(rawTitle, item.subjectTag || "[助理]");
  const startAt = parsedInvite?.startAt || fallbackStart.toISOString();
  const previewItem = {
    title,
    startAt,
    organizer: parsedInvite?.organizer || item.from || "当前邮箱",
    calendarUid: parsedInvite?.calendarUid || "",
    sourceMessageId: parsedInvite?.sourceMessageId || item.messageId || "",
  };
  const existingMatch = findExistingImportedEvent(previewItem);
  const decision = inferMailImportDecision(parsedInvite, item.subject, title, existingMatch);
  const endAt =
    parsedInvite?.endAt ||
    (parsedInvite?.startAt ? new Date(new Date(parsedInvite.startAt).getTime() + 60 * 60 * 1000).toISOString() : fallbackEnd.toISOString());

  return {
    title,
    decision,
    decisionLabel:
      decision === "cancel"
        ? "助理判断：会议取消"
        : decision === "update"
          ? "助理判断：会议改期 / 更新"
          : "助理判断：新增会议",
    summary:
      parsedInvite?.summary ||
      "后端已找到一封带指定标识的邮件，并完成了第一轮正文 / 日历附件解析。",
    startAt,
    endAt,
    location: parsedInvite?.location || "待从邮件正文 / .ics 解析",
    organizer: parsedInvite?.organizer || item.from || "当前邮箱",
    meetingLink: parsedInvite?.meetingLink || "",
    meetingDetails: parsedInvite?.meetingDetails || parsedInvite?.meetingLink || "",
    calendarUid: parsedInvite?.calendarUid || "",
    sourceMessageId: parsedInvite?.sourceMessageId || item.messageId || "",
    matchedEventId: existingMatch?.id || "",
    reminderTitle: `会前确认${title || "邮件会议"}资料`,
    todoTitle: `准备${title || "邮件会议"}会前资料`,
    source: "mailbox-api",
  };
}

function cleanImportedMailTitle(value, subjectTag = "[助理]") {
  return String(value || "")
    .replace(subjectTag, "")
    .replace(/^转发[:：]\s*/i, "")
    .replace(/^取消[:：]\s*/i, "")
    .replace(/\s*(改期|调整|变更|更新)(通知)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferMailImportDecision(parsedInvite, subject, title, existingMatch) {
  const signalText = `${subject || ""}\n${parsedInvite?.title || ""}\n${title || ""}`;

  if (parsedInvite?.decision === "cancel" || /取消|canceled|cancelled/i.test(signalText)) {
    return "cancel";
  }

  if (
    parsedInvite?.decision === "update" ||
    /改期|调整|变更|更新|rescheduled|updated|changed/i.test(signalText)
  ) {
    return "update";
  }

  if (existingMatch) {
    return "update";
  }

  return "create";
}

function buildMailboxErrorMessage(error, fallbackMessage) {
  const message = error?.message?.trim();
  if (!message) {
    return fallbackMessage;
  }

  return `真实检查失败：${message}`;
}

function scrollToMailboxSettings() {
  const section = document.querySelector("#mailboxSettings");
  if (!section) {
    return;
  }

  section.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function buildMailImportFromText(rawText) {
  const startDate = parseDateTime(rawText, new Date());
  const endDate = startDate ? new Date(startDate.getTime() + 60 * 60 * 1000) : null;
  const title = extractMailTitle(rawText) || buildEventTitle(rawText) || "邮件导入会议";
  const isCancel = /取消|canceled|cancelled/i.test(rawText);
  const isUpdate = /改期|调整|rescheduled|updated/i.test(rawText);

  return {
    title,
    decision: isCancel ? "cancel" : isUpdate ? "update" : "create",
    decisionLabel: isCancel
      ? "助理判断：会议取消"
      : isUpdate
        ? "助理判断：会议改期 / 更新"
        : "助理判断：新增会议",
    summary: isCancel
      ? "识别到这是一封取消通知，确认后会把原会议标记为取消并关闭关联提醒。"
      : isUpdate
        ? "识别到这是一封改期或更新通知，确认后会同步刷新原会议的时间与提醒。"
        : "识别到这是一封新的会议邀请，确认后会导入行程并自动生成提醒与会前待办。",
    startAt: startDate ? startDate.toISOString() : null,
    endAt: endDate ? endDate.toISOString() : null,
    location: extractLocation(rawText),
    organizer: extractParticipants(rawText) || "转发邮件发起人",
    meetingLink: extractMeetingLink(rawText),
    meetingDetails: extractMeetingDetails(rawText),
    calendarUid: "",
    sourceMessageId: "",
    reminderTitle: `会前确认${title}资料`,
    todoTitle: `准备${title}会前资料`,
    source: "pasted-mail",
  };
}

function buildMailImportFromIcs(rawText, filename) {
  const parsed = parseIcsText(rawText);
  const isCancel = parsed.method === "CANCEL" || parsed.status === "CANCELLED";
  const isUpdate = !isCancel && Number(parsed.sequence || 0) > 0;

  return {
    title: parsed.title || filename || "ICS 会议导入",
    decision: isCancel ? "cancel" : isUpdate ? "update" : "create",
    decisionLabel: isCancel
      ? "助理判断：会议取消"
      : isUpdate
        ? "助理判断：会议改期 / 更新"
        : "助理判断：新增会议",
    summary:
      isCancel
        ? "这是来自日历附件的取消通知，确认后会把对应会议标记为取消。"
        : isUpdate
          ? "这是来自日历附件的更新通知，确认后会刷新原会议时间与提醒。"
        : "助理已从 .ics 中识别出会议标题、时间和地点，可直接写入工作台。",
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    location: parsed.location,
    organizer: parsed.organizer || "ICS 组织者",
    meetingLink: parsed.meetingLink,
    meetingDetails: parsed.meetingDetails || parsed.meetingLink,
    calendarUid: parsed.uid || "",
    sourceMessageId: "",
    reminderTitle: `会前确认${parsed.title || "会议"}资料`,
    todoTitle: `准备${parsed.title || "会议"}会前资料`,
    source: "ics-upload",
  };
}

function confirmMailImport() {
  const item = state.mailImport?.item;
  if (!item) {
    return;
  }

  item.importKey = buildMailImportKey(item);
  const existing = findExistingImportedEvent(item);

  if (item.decision === "cancel") {
    if (existing) {
      existing.status = "cancelled";
      existing.mailImportKey = item.importKey || existing.mailImportKey || "";
      existing.sourceMessageId = item.sourceMessageId || existing.sourceMessageId || "";
      existing.calendarUid = item.calendarUid || existing.calendarUid || "";
      existing.notes = "由转发邮件导入流程标记为已取消";
    }
    cancelRelatedActionItems(existing?.id, item.importKey);
    state.mailImport = null;
    saveState();
    render();
    ui.voiceStatus.textContent = "已按邮件内容处理会议取消";
    return;
  }

  const startAt = item.startAt ? new Date(item.startAt) : getNextBusinessSlot(1, 15, 0);
  const endAt = item.endAt ? new Date(item.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);

  let targetEvent = existing || null;

  if (targetEvent) {
    targetEvent.title = item.title;
    targetEvent.startAt = startAt.toISOString();
    targetEvent.endAt = endAt.toISOString();
    targetEvent.location = item.location || targetEvent.location;
    targetEvent.participants = item.organizer || targetEvent.participants || "邮件组织者";
    targetEvent.meetingLink = item.meetingLink || targetEvent.meetingLink || "";
    targetEvent.meetingDetails = item.meetingDetails || targetEvent.meetingDetails || "";
    targetEvent.mailImportKey = item.importKey || targetEvent.mailImportKey || "";
    targetEvent.sourceMessageId = item.sourceMessageId || targetEvent.sourceMessageId || "";
    targetEvent.calendarUid = item.calendarUid || targetEvent.calendarUid || "";
    targetEvent.status = "scheduled";
    targetEvent.notes =
      item.decision === "update" ? "由转发邮件导入流程更新" : "由转发邮件导入流程同步到现有会议";
  } else {
    targetEvent = {
      id: crypto.randomUUID(),
      title: item.title,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      location: item.location || "邮件邀请待补充地点",
      participants: item.organizer || "邮件组织者",
      meetingLink: item.meetingLink || "",
      meetingDetails: item.meetingDetails || item.meetingLink || "",
      mailImportKey: item.importKey || "",
      sourceMessageId: item.sourceMessageId || "",
      calendarUid: item.calendarUid || "",
      notes: "来自转发邮件导入",
      status: "scheduled",
    };
    state.events.unshift(targetEvent);
  }

  upsertMailImportActionItems(targetEvent.id, item, startAt);

  state.mailImport = null;
  saveState();
  render();
  scheduleReminderNotifications();
  ui.voiceStatus.textContent = existing
    ? item.decision === "update"
      ? "邮件邀请已更新到助理工作台"
      : "已跳过重复导入，并同步到现有会议"
    : "邮件邀请已写入助理工作台";
}

function buildMailImportKey(item) {
  if (item.calendarUid) {
    return `calendar:${item.calendarUid}`;
  }

  if (item.sourceMessageId) {
    return `message:${item.sourceMessageId}`;
  }

  const titleKey = normalizeImportTitle(item.title);
  const startKey = item.startAt ? new Date(item.startAt).toISOString().slice(0, 16) : "na";
  return `fallback:${titleKey}:${startKey}`;
}

function normalizeImportTitle(value) {
  return String(value || "")
    .trim()
    .replace(/^\s*取消[:：]\s*/i, "")
    .toLowerCase()
    .replace(/^转发[:：]\s*/i, "")
    .replace(/\s*(改期|调整|变更|更新)(通知)?\s*$/i, "")
    .replace(/\s+/g, " ");
}

function findExistingImportedEvent(item) {
  const titleKey = normalizeImportTitle(item.title);

  if (item.calendarUid) {
    const byCalendar = state.events.find((event) => event.calendarUid && event.calendarUid === item.calendarUid);
    if (byCalendar) {
      return byCalendar;
    }
  }

  if (item.sourceMessageId) {
    const byMessage = state.events.find(
      (event) => event.sourceMessageId && event.sourceMessageId === item.sourceMessageId
    );
    if (byMessage) {
      return byMessage;
    }
  }

  if (item.importKey) {
    const byImportKey = state.events.find((event) => event.mailImportKey && event.mailImportKey === item.importKey);
    if (byImportKey) {
      return byImportKey;
    }
  }

  return state.events.find((event) => {
    if (normalizeImportTitle(event.title) !== titleKey) {
      return false;
    }

    const sameOrganizer =
      !item.organizer ||
      !event.participants ||
      String(event.participants).includes(item.organizer) ||
      String(item.organizer).includes(event.participants);

    const eventStart = event.startAt ? new Date(event.startAt).getTime() : NaN;
    const itemStart = item.startAt ? new Date(item.startAt).getTime() : NaN;
    const timeDistance = Number.isFinite(eventStart) && Number.isFinite(itemStart)
      ? Math.abs(eventStart - itemStart)
      : Number.POSITIVE_INFINITY;

    return sameOrganizer && timeDistance <= 3 * 24 * 60 * 60 * 1000;
  });
}

function upsertMailImportActionItems(eventId, item, startAt) {
  const reminderAt = new Date(startAt.getTime() - 30 * 60 * 1000).toISOString();
  const todoDueAt = new Date(startAt.getTime() - 60 * 60 * 1000).toISOString();

  upsertMailImportActionItem({
    eventId,
    importKey: item.importKey,
    kind: "reminder",
    title: item.reminderTitle,
    remindAt: reminderAt,
    note: "由转发邮件导入自动生成",
    source: item.source,
  });

  upsertMailImportActionItem({
    eventId,
    importKey: item.importKey,
    kind: "todo",
    title: item.todoTitle,
    dueAt: todoDueAt,
    note: "由转发邮件导入自动生成",
    source: item.source,
  });
}

function upsertMailImportActionItem(payload) {
  const existing = state.reminders.find((entry) => {
    if (entry.kind !== payload.kind) {
      return false;
    }
    if (entry.eventId && payload.eventId && entry.eventId === payload.eventId) {
      return true;
    }
    return entry.mailImportKey && payload.importKey && entry.mailImportKey === payload.importKey;
  });

  if (existing) {
    existing.title = payload.title;
    existing.note = payload.note;
    existing.source = payload.source;
    existing.status = "pending";
    existing.eventId = payload.eventId;
    existing.mailImportKey = payload.importKey || existing.mailImportKey || "";
    if (payload.kind === "todo") {
      existing.dueAt = payload.dueAt;
    } else {
      existing.remindAt = payload.remindAt;
    }
    return;
  }

  state.reminders.unshift({
    id: crypto.randomUUID(),
    kind: payload.kind,
    title: payload.title,
    remindAt: payload.remindAt,
    dueAt: payload.dueAt,
    note: payload.note,
    source: payload.source,
    status: "pending",
    eventId: payload.eventId,
    mailImportKey: payload.importKey || "",
  });
}

function cancelRelatedActionItems(eventId, importKey) {
  state.reminders.forEach((entry) => {
    const sameEvent = eventId && entry.eventId === eventId;
    const sameImport = importKey && entry.mailImportKey === importKey;

    if (sameEvent || sameImport) {
      entry.status = "cancelled";
    }
  });
}

function buildEventTitle(input) {
  const matchByContact = input.match(/和([\u4e00-\u9fa5A-Za-z0-9·]{1,10})(?:在|于|电话|视频|见面|沟通|开会|吃饭)/);
  if (matchByContact) {
    if (/(电话|视频)/.test(input)) {
      return `与${matchByContact[1]}沟通`;
    }
    if (/吃饭|晚餐|午餐/.test(input)) {
      return `与${matchByContact[1]}商务会面`;
    }
    return `与${matchByContact[1]}会面`;
  }

  const activityPairs = [
    ["开会", "会议安排"],
    ["会议", "会议安排"],
    ["拜访", "客户拜访"],
    ["见面", "商务见面"],
    ["沟通", "业务沟通"],
    ["电话", "电话沟通"],
    ["视频", "视频会议"],
    ["出差", "出差行程"],
    ["晚餐", "商务晚餐"],
    ["午餐", "商务午餐"],
  ];

  const found = activityPairs.find(([keyword]) => input.includes(keyword));
  if (found) {
    return found[1];
  }

  return "待确认安排";
}

function buildReminders(input, startAt, title) {
  const reminders = [];
  const offsetMatch = input.match(/提前([一二两三四五六七八九十\d半]+)(小时|分钟)/);

  if (offsetMatch && startAt) {
    const amount = parseChineseNumber(offsetMatch[1], offsetMatch[2] === "小时");
    const remindAt = new Date(
      startAt.getTime() -
        amount * (offsetMatch[2] === "小时" ? 60 * 60 * 1000 : 60 * 1000)
    );
    reminders.push({
      kind: "reminder",
      title: `${title}前提醒`,
      remindAt: remindAt.toISOString(),
      note: `根据“提前${offsetMatch[1]}${offsetMatch[2]}”自动生成`,
    });
  }

  const plainReminderMatch = input.match(/提醒我(.+?)(?:，|。|$)/);
  if (plainReminderMatch) {
    const reminderText = plainReminderMatch[1].trim();
    const derivedTitle = offsetMatch && /出发/.test(reminderText) ? "出发" : reminderText;

    reminders.push({
      kind: "reminder",
      title: derivedTitle,
      remindAt: startAt
        ? new Date(startAt.getTime() - 30 * 60 * 1000).toISOString()
        : new Date().toISOString(),
      note: "来自口述中的明确提醒动作",
    });
  }

  return dedupeByTitle(reminders);
}

function buildTodos(input, startAt) {
  const todos = [];
  const todoVerbs = ["准备", "确认", "发送", "跟进", "联系", "整理", "带上"];

  todoVerbs.forEach((verb) => {
    const match = input.match(new RegExp(`${verb}([^，。]+)`));
    if (!match) {
      return;
    }

    todos.push({
      title: `${verb}${match[1].trim()}`,
      dueAt: startAt ? new Date(startAt.getTime() - 60 * 60 * 1000).toISOString() : new Date().toISOString(),
      note: "助理从描述中的动作词自动提炼",
    });
  });

  return dedupeByTitle(todos);
}

function buildTravelRequest(input, startAt) {
  const travelIntent = /(高铁|火车|航班|飞机|机票|酒店|接机|送机|差旅|出差|预定|订)/.test(input);
  if (!travelIntent) {
    return null;
  }

  const mode = input.includes("高铁") || input.includes("火车") ? "高铁 / 火车" : input.includes("酒店") ? "酒店 / 差旅服务" : "航班 / 差旅服务";
  const route = extractRoute(input);
  const departAt = startAt || parseDateTime(input, new Date()) || addDays(new Date(), 1);

  return {
    title: "差旅预订请求",
    mode,
    route,
    departAt: departAt.toISOString(),
    note: "当前版本先生成预订请求卡片，后续可直接对接企业差旅系统。",
  };
}

function extractMailTitle(text) {
  const match = text.match(/主题[:：]\s*(.+)/);
  return match ? match[1].trim() : "";
}

function extractParticipants(input) {
  const match = input.match(/和([\u4e00-\u9fa5A-Za-z0-9·]{1,12})/);
  return match ? `${match[1]}` : "";
}

function extractLocation(input) {
  const patterns = [
    /在([\u4e00-\u9fa5A-Za-z0-9·]{2,18})(?:见面|开会|会面|吃饭|碰头|电话|视频|沟通)/,
    /去([\u4e00-\u9fa5A-Za-z0-9·]{2,18})(?:出差|拜访|开会|见客户|见面)/,
    /到([\u4e00-\u9fa5A-Za-z0-9·]{2,18})(?:出差|开会|见面|机场|高铁站)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return "";
}

function extractRoute(input) {
  const routePatterns = [
    /从([\u4e00-\u9fa5A-Za-z0-9·]{2,10})到([\u4e00-\u9fa5A-Za-z0-9·]{2,10})/,
    /去([\u4e00-\u9fa5A-Za-z0-9·]{2,10})/,
    /飞([\u4e00-\u9fa5A-Za-z0-9·]{2,10})/,
  ];

  for (const pattern of routePatterns) {
    const match = input.match(pattern);
    if (match) {
      if (match[2]) {
        return `${match[1]} -> ${match[2]}`;
      }
      return `前往 ${match[1]}`;
    }
  }

  return "路线待确认";
}

function extractMeetingLink(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function extractMeetingDetails(text) {
  const link = extractMeetingLink(text);
  const line = text.match(/([^\n\r]*(腾讯会议|会议号|Meeting ID)[^\n\r]*)/i)?.[1]?.trim() || "";
  return link || line;
}

function parseIcsText(rawText) {
  const unfolded = rawText.replace(/\r\n/g, "\n").split("\n").reduce((acc, line) => {
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
    meetingDetails: "",
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
      const description = decodeIcsValue(line.slice(12));
      result.meetingLink = extractMeetingLink(description);
      result.meetingDetails = extractMeetingDetails(description);
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

function buildEventFooterNote(event) {
  const parts = [];

  if (event.meetingDetails) {
    parts.push(event.meetingDetails);
  } else if (event.meetingLink) {
    parts.push(event.meetingLink);
  }

  parts.push(event.notes || "由助理根据输入自动整理");
  return parts.filter(Boolean).join(" · ");
}

function decodeIcsValue(value) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDateValue(line) {
  const rawValue = line.split(":")[1];
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

function parseDateTime(input, baseDate) {
  let targetDate = null;

  if (/今天/.test(input)) {
    targetDate = startOfDay(baseDate);
  } else if (/明天/.test(input)) {
    targetDate = addDays(startOfDay(baseDate), 1);
  } else if (/后天/.test(input)) {
    targetDate = addDays(startOfDay(baseDate), 2);
  } else {
    const absoluteDate = input.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (absoluteDate) {
      const year = baseDate.getFullYear();
      targetDate = new Date(year, Number(absoluteDate[1]) - 1, Number(absoluteDate[2]));
    } else {
      const weekDate = parseWeekday(input, baseDate);
      if (weekDate) {
        targetDate = weekDate;
      }
    }
  }

  if (!targetDate) {
    return null;
  }

  const timeParts = parseTime(input);
  targetDate.setHours(timeParts.hours, timeParts.minutes, 0, 0);
  return targetDate;
}

function parseWeekday(input, baseDate) {
  const weekMap = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0,
  };

  const match = input.match(/(下周|这周|本周|周)([一二三四五六日天])/);
  if (!match) {
    return null;
  }

  const current = new Date(baseDate);
  const target = weekMap[match[2]];
  const currentDay = current.getDay();
  let diff = target - currentDay;

  if (match[1] === "下周") {
    diff += 7;
  } else if (diff < 0) {
    diff += 7;
  }

  return addDays(startOfDay(current), diff);
}

function parseTime(input) {
  const match = input.match(/(上午|中午|下午|晚上)?([零一二两三四五六七八九十\d]{1,3})点(?:(半)|([零一二三四五六七八九十\d]{1,3})分?)?/);
  if (!match) {
    if (/晚上/.test(input)) {
      return { hours: 19, minutes: 0 };
    }
    if (/中午/.test(input)) {
      return { hours: 12, minutes: 0 };
    }
    if (/下午/.test(input)) {
      return { hours: 15, minutes: 0 };
    }
    if (/上午/.test(input)) {
      return { hours: 9, minutes: 0 };
    }
    return { hours: 9, minutes: 0 };
  }

  let hours = parseChineseNumber(match[2], true);
  let minutes = 0;

  if (match[3]) {
    minutes = 30;
  } else if (match[4]) {
    minutes = parseChineseNumber(match[4], false);
  }

  if ((match[1] === "下午" || match[1] === "晚上") && hours < 12) {
    hours += 12;
  }

  if (match[1] === "中午" && hours < 11) {
    hours += 12;
  }

  return { hours, minutes };
}

function parseDurationMinutes(input) {
  const explicitDuration =
    input.match(
      /(?:时长|持续|大概|预计)([一二两三四五六七八九十\d半个]+)(小时|分钟)/
    ) ||
    input.match(
      /([一二两三四五六七八九十\d半个]+)(小时|分钟)(?:的)?(?:会议|沟通|会面|见面|拜访)/
    );

  const match = explicitDuration;
  if (!match) {
    return 60;
  }

  const value = parseChineseNumber(match[1], match[2] === "小时");
  return match[2] === "小时" ? value * 60 : value;
}

function parseChineseNumber(raw, allowHalfHour) {
  const normalized = raw.replace(/个/g, "");

  if (normalized === "半") {
    return allowHalfHour ? 0.5 : 30;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const map = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };

  if (normalized.length === 1) {
    return map[normalized] ?? 0;
  }

  if (normalized.includes("十")) {
    const [left, right] = normalized.split("十");
    const tens = left ? map[left] : 1;
    const ones = right ? map[right] : 0;
    return tens * 10 + ones;
  }

  return map[normalized] ?? 0;
}

function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.title)) {
      return false;
    }
    seen.add(item.title);
    return true;
  });
}

function scheduleReminderNotifications() {
  reminderTimers.forEach((timer) => window.clearTimeout(timer));
  reminderTimers = [];

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  state.reminders
    .filter((item) => item.status !== "done" && item.kind !== "todo" && item.remindAt)
    .forEach((item) => {
      const delta = new Date(item.remindAt).getTime() - Date.now();
      if (delta <= 0 || delta > 24 * 60 * 60 * 1000) {
        return;
      }

      const timer = window.setTimeout(() => {
        new Notification("行程助理提醒", {
          body: item.title,
        });
      }, delta);

      reminderTimers.push(timer);
    });
}

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    ui.voiceStatus.textContent = "当前浏览器不支持通知提醒";
    return;
  }

  Notification.requestPermission().then((permission) => {
    ui.voiceStatus.textContent =
      permission === "granted" ? "提醒权限已开启" : "未开启系统提醒，可继续使用列表提醒";
    scheduleReminderNotifications();
  });
}

function handleInstallClick() {
  if (isStandaloneMode()) {
    ui.voiceStatus.textContent = "当前已经是桌面应用模式";
    return;
  }

  if (installPromptEvent) {
    installPromptEvent.prompt();
    installPromptEvent.userChoice.finally(() => {
      installPromptEvent = null;
      ui.installButton.hidden = true;
    });
    return;
  }

  if (isIosDevice()) {
    window.alert(
      "请用 Safari 打开本站，点击底部“分享”，再选择“添加到主屏幕”。"
    );
    return;
  }

  window.alert("请在浏览器菜单中选择“安装应用”或“添加到主屏幕”。");
}

function toggleVoiceInput() {
  if (!speechApi) {
    ui.voiceStatus.textContent = "当前浏览器不支持语音识别，可直接输入文字";
    return;
  }

  if (!recognition) {
    recognition = new speechApi();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      ui.voiceStatus.textContent = "正在听你说话…";
      ui.listenButton.textContent = "停止录音";
    };

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      ui.captureInput.value = text;

      if (event.results[event.results.length - 1].isFinal) {
        ui.voiceStatus.textContent = "语音已转文字，可以生成草稿";
      }
    };

    recognition.onend = () => {
      ui.listenButton.textContent = "语音录入";
    };

    recognition.onerror = () => {
      ui.voiceStatus.textContent = "语音识别失败，请改为文字输入";
      ui.listenButton.textContent = "语音录入";
    };
  }

  if (ui.listenButton.textContent === "停止录音") {
    recognition.stop();
    ui.voiceStatus.textContent = "已停止录音";
    return;
  }

  recognition.start();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.warn("load state failed", error);
  }

  const now = new Date();
  const nextMeeting = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  return {
    draft: null,
    mailImport: null,
    mailboxSettings: null,
    events: [
      {
        id: crypto.randomUUID(),
        title: "与运营团队晨会",
        startAt: nextMeeting.toISOString(),
        endAt: new Date(nextMeeting.getTime() + 60 * 60 * 1000).toISOString(),
        location: "线上会议",
        participants: "运营团队",
        notes: "示例数据，可自行覆盖",
        status: "scheduled",
      },
    ],
    reminders: [
      {
        id: crypto.randomUUID(),
        kind: "reminder",
        title: "确认客户会面资料",
        remindAt: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
        note: "示例提醒",
        source: "system",
        status: "pending",
      },
    ],
    travelRequests: [],
  };
}

function getNextUpcomingEvent() {
  return [...state.events]
    .filter((event) => event.status !== "done" && event.status !== "cancelled" && new Date(event.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0];
}

function getNextBusinessSlot(offsetDays, hour, minute) {
  const date = addDays(startOfDay(new Date()), offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDateTime(dateInput, timeOnly = false) {
  const date = new Date(dateInput);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return timeOnly ? `${hours}:${minutes}` : `${month}-${day} ${hours}:${minutes}`;
}

function startOfDay(date) {
  const cloned = new Date(date);
  cloned.setHours(0, 0, 0, 0);
  return cloned;
}

function addDays(date, offset) {
  const cloned = new Date(date);
  cloned.setDate(cloned.getDate() + offset);
  return cloned;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

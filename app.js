const STORAGE_KEY = "dingtalk-h5-biz-requests";
const DRAFT_KEY = "dingtalk-h5-biz-drafts";

const seedRequirements = [
  {
    id: "req-1001",
    title: "企业团检客户希望查看预约后进度报表",
    customer: "华东连锁体检",
    industry: "体检",
    status: "待澄清",
    urgency: "高",
    businessValue: "高",
    summary:
      "客户希望企业团检预约后可直接查看执行进度，当前依赖人工汇总给 HR，效率低且易遗漏。客户要求下个月上线，竞品已支持类似能力。",
    scenario: "企业团检预约完成后，企业 HR 希望随时查看执行进度和完成率。",
    pain: "目前需要运营人工导出和汇总数据，反馈慢，客户满意度下降。",
    outcome: "客户可自助查看团检进度报表，减少人工沟通和重复统计。",
    nextStep: "等待 BD 确认报表查看对象与数据口径",
    owner: "Vivi / 商务",
    updatedAt: "今天 10:40",
    questions: [
      "报表查看对象是企业 HR、客户经理还是内部运营？",
      "是否涉及不同企业账户的权限隔离？",
      "是否已有统一的数据口径定义？",
    ],
    clarifications: [
      {
        owner: "中台",
        status: "待回复",
        question: "报表查看对象是企业 HR、客户经理还是内部运营？",
        answer: "",
      },
      {
        owner: "中台",
        status: "待回复",
        question: "是否已有统一的数据口径定义？",
        answer: "",
      },
    ],
    solutions: [
      {
        name: "V1 标准报表增强方案",
        version: "V1",
        status: "草拟中",
        summary: "在现有报表模块增加企业团检进度视图，支持按批次查看。",
        timeline: "3 周",
        risk: "需补齐数据口径",
      },
    ],
  },
  {
    id: "req-1002",
    title: "保险客户要求导出分机构体检数据",
    customer: "安和保险",
    industry: "保险",
    status: "方案中",
    urgency: "中",
    businessValue: "高",
    summary:
      "客户希望按分机构导出体检结果与预约执行数据，满足内部审计与对账需求，目前数据需要人工拆分处理。",
    scenario: "保险客户按地区机构管理团检业务，需要定期导出分机构数据。",
    pain: "人工拆分数据耗时长、容易出错，难以满足月度审计节奏。",
    outcome: "支持按机构维度导出标准化数据，缩短对账与审计准备时间。",
    nextStep: "等待方案负责人确认导出字段范围",
    owner: "产品中台 / 方案负责人",
    updatedAt: "今天 09:15",
    questions: [
      "导出字段是否存在机构差异？",
      "客户希望按月导出还是实时导出？",
    ],
    clarifications: [
      {
        owner: "BD",
        status: "已回复",
        question: "客户希望按月导出还是实时导出？",
        answer: "客户当前按月导出即可，后续可能要求实时。",
      },
    ],
    solutions: [
      {
        name: "分机构导出配置方案",
        version: "V2",
        status: "待确认",
        summary: "通过导出模板配置支持按机构筛选与字段控制。",
        timeline: "2 周",
        risk: "历史数据字段一致性待校验",
      },
    ],
  },
  {
    id: "req-1003",
    title: "门诊客户需要对接第三方挂号平台",
    customer: "嘉宁门诊",
    industry: "门诊",
    status: "待决策",
    urgency: "高",
    businessValue: "中",
    summary:
      "门诊客户希望与第三方挂号平台打通预约数据，减少人工导入导出，提高前台接诊效率。",
    scenario: "门诊前台使用第三方挂号平台接单，需要与内部系统同步预约数据。",
    pain: "人工导入预约数据耗时长，前台经常漏登记。",
    outcome: "实现挂号平台预约同步，减少人工录入与出错率。",
    nextStep: "等待管理层判断是否列入本季度优先级",
    owner: "管理层 / 待决策",
    updatedAt: "昨天 18:20",
    questions: [
      "是否已有第三方平台接口文档？",
      "这次对接是否与签约进度绑定？",
    ],
    clarifications: [
      {
        owner: "BD",
        status: "已回复",
        question: "这次对接是否与签约进度绑定？",
        answer: "是，客户希望在签约后 6 周内启动上线计划。",
      },
    ],
    solutions: [
      {
        name: "第三方挂号平台 API 对接方案",
        version: "V2",
        status: "待审批",
        summary: "通过统一接口层对接第三方挂号平台，先覆盖预约同步。",
        timeline: "6 周",
        risk: "接口文档尚未确认，排期受制于第三方",
      },
    ],
  },
];

const state = {
  route: "home",
  createMode: "voice",
  currentRequirementId: "req-1001",
  currentDraft: null,
  requirements: loadState(),
  drafts: loadDrafts(),
  messageFilter: "全部",
  statusFilter: "全部",
  search: "",
};

const views = {
  home: document.getElementById("view-home"),
  requirements: document.getElementById("view-requirements"),
  create: document.getElementById("view-create"),
  draft: document.getElementById("view-draft"),
  detail: document.getElementById("view-detail"),
  messages: document.getElementById("view-messages"),
  profile: document.getElementById("view-profile"),
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : seedRequirements;
  } catch (error) {
    return seedRequirements;
  }
}

function loadDrafts() {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.requirements));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts));
}

function navigate(route) {
  state.route = route;
  Object.entries(views).forEach(([key, node]) => {
    node.classList.toggle("active", key === route);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === route);
  });
  updateHeader();
  if (route === "home") renderHomePriority();
  if (route === "requirements") renderRequirementList();
  if (route === "detail") renderRequirementDetail();
  if (route === "messages") renderMessages();
}

function updateHeader() {
  const titleMap = {
    home: "商需通",
    requirements: "需求池",
    create: "新建需求",
    draft: "AI 草稿确认",
    detail: "需求详情",
    messages: "消息中心",
    profile: "我的",
  };
  const actionMap = {
    home: "工作台",
    requirements: "新建",
    create: "草稿箱",
    draft: "返回",
    detail: "需求池",
    messages: "全部已读",
    profile: "设置",
  };
  document.getElementById("page-title").textContent = titleMap[state.route];
  document.getElementById("top-action").textContent = actionMap[state.route];
}

function setCreateMode(mode) {
  state.createMode = mode;
  document.querySelectorAll(".create-mode-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.mode === mode);
  });
  document.querySelectorAll(".mode-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `mode-${mode}`);
  });
}

function renderHomePriority() {
  const container = document.getElementById("home-priority-list");
  const items = [...state.requirements]
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, 3);

  container.innerHTML = items
    .map(
      (item) => `
      <button class="card-link" data-open-requirement="${item.id}">
        <div class="detail-head">
          <div>
            <h4>${item.title}</h4>
            <p>${item.customer} · ${item.updatedAt}</p>
          </div>
          <span class="status-chip ${statusClass(item.status)}">${item.status}</span>
        </div>
        <div class="meta-row">
          <span class="small-chip">紧急度 ${item.urgency}</span>
          <span class="small-chip">商业价值 ${item.businessValue}</span>
        </div>
      </button>
    `,
    )
    .join("");
}

function renderRequirementList() {
  const list = document.getElementById("requirement-list");
  const filtered = state.requirements.filter((item) => {
    const matchesStatus =
      state.statusFilter === "全部" || item.status === state.statusFilter;
    const keyword = state.search.trim();
    const matchesSearch =
      !keyword ||
      [item.title, item.customer, item.industry, item.summary]
        .join(" ")
        .toLowerCase()
        .includes(keyword.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  list.innerHTML = filtered
    .map(
      (item) => `
      <button class="card-link list-card" data-open-requirement="${item.id}">
        <div class="detail-head">
          <div>
            <h4>${item.title}</h4>
            <p>${item.customer} · ${item.industry}</p>
          </div>
          <span class="status-chip ${statusClass(item.status)}">${item.status}</span>
        </div>
        <p>${item.summary}</p>
        <div class="meta-row">
          <span class="small-chip">责任人 ${item.owner}</span>
          <span class="small-chip">紧急度 ${item.urgency}</span>
          <span class="small-chip">价值 ${item.businessValue}</span>
        </div>
      </button>
    `,
    )
    .join("");
}

function renderRequirementDetail() {
  const item = state.requirements.find(
    (requirement) => requirement.id === state.currentRequirementId,
  );
  if (!item) return;

  document.getElementById("requirement-detail").innerHTML = `
    <article class="detail-card">
      <div class="detail-head">
        <div>
          <h2>${item.title}</h2>
          <p>${item.customer} · ${item.industry}</p>
        </div>
        <span class="status-chip ${statusClass(item.status)}">${item.status}</span>
      </div>
      <div class="meta-row">
        <span class="small-chip">责任人 ${item.owner}</span>
        <span class="small-chip">更新于 ${item.updatedAt}</span>
        <span class="small-chip">下一步 ${item.nextStep}</span>
      </div>
      <div class="timeline">
        ${renderTimeline(item.status)}
      </div>
    </article>

    <article class="detail-card">
      <div class="section-head">
        <h3>需求摘要</h3>
      </div>
      <p>${item.summary}</p>
      <div class="detail-grid">
        <article>
          <strong>客户场景</strong>
          <span>${item.scenario}</span>
        </article>
        <article>
          <strong>当前痛点</strong>
          <span>${item.pain}</span>
        </article>
        <article>
          <strong>目标结果</strong>
          <span>${item.outcome}</span>
        </article>
        <article>
          <strong>优先级判断</strong>
          <span>紧急度 ${item.urgency} · 商业价值 ${item.businessValue}</span>
        </article>
      </div>
    </article>

    <article class="detail-card">
      <div class="section-head">
        <h3>澄清协同</h3>
        <button class="text-btn" data-add-clarification="${item.id}">回复澄清</button>
      </div>
      <div class="stack-list">
        ${item.clarifications
          .map(
            (clarification) => `
            <div class="list-card">
              <div class="detail-head">
                <strong>${clarification.question}</strong>
                <span class="status-chip ${clarification.status === "待回复" ? "warning" : "success"}">${clarification.status}</span>
              </div>
              <p>${clarification.answer || "等待 BD 补充回复"}</p>
            </div>
          `,
          )
          .join("")}
      </div>
    </article>

    <article class="detail-card">
      <div class="section-head">
        <h3>方案管理</h3>
      </div>
      <div class="stack-list">
        ${item.solutions
          .map(
            (solution) => `
            <div class="list-card">
              <div class="detail-head">
                <div>
                  <h4>${solution.name}</h4>
                  <p>${solution.version} · ${solution.timeline}</p>
                </div>
                <span class="status-chip ${solution.status.includes("待") ? "warning" : "success"}">${solution.status}</span>
              </div>
              <p>${solution.summary}</p>
              <div class="meta-row">
                <span class="small-chip">风险 ${solution.risk}</span>
              </div>
            </div>
          `,
          )
          .join("")}
      </div>
    </article>

    <article class="detail-card">
      <div class="section-head">
        <h3>钉钉动作建议</h3>
      </div>
      <ul class="bullet-list">
        <li>把“回复澄清”同步为钉钉待办</li>
        <li>把方案更新和状态变更同步为工作通知</li>
        <li>把“待决策”节点接入钉钉审批流</li>
      </ul>
    </article>
  `;
}

function renderMessages() {
  const messages = buildMessages().filter((item) => {
    return state.messageFilter === "全部" || item.type === state.messageFilter;
  });

  document.getElementById("message-list").innerHTML = messages
    .map(
      (message) => `
      <button class="card-link list-card" data-open-requirement="${message.requirementId}">
        <div class="detail-head">
          <div>
            <h4>${message.title}</h4>
            <p>${message.time}</p>
          </div>
          <span class="status-chip ${message.type === "反馈" ? "success" : message.type === "审批" ? "danger" : "warning"}">${message.type}</span>
        </div>
        <p>${message.content}</p>
      </button>
    `,
    )
    .join("");
}

function buildMessages() {
  return state.requirements.flatMap((item) => {
    const items = [];
    if (item.clarifications.some((clarification) => clarification.status === "待回复")) {
      items.push({
        requirementId: item.id,
        type: "待补充",
        title: item.title,
        time: item.updatedAt,
        content: "有新的澄清问题等待回复，请尽快补充业务信息。",
      });
    }
    if (item.status === "待决策") {
      items.push({
        requirementId: item.id,
        type: "审批",
        title: item.title,
        time: item.updatedAt,
        content: "该需求已进入待决策状态，建议接入钉钉审批流完成拍板。",
      });
    }
    if (item.solutions.some((solution) => solution.status.includes("待") || solution.status.includes("更新"))) {
      items.push({
        requirementId: item.id,
        type: "反馈",
        title: item.title,
        time: item.updatedAt,
        content: "方案已有更新，可进入详情查看最新结论和风险。",
      });
    }
    return items;
  });
}

function renderTimeline(status) {
  const steps = ["待审核", "待澄清", "方案中", "待决策", "已完成"];
  const currentIndex = steps.indexOf(status);
  return steps
    .map((step, index) => {
      const className =
        index < currentIndex ? "timeline-step done" : index === currentIndex ? "timeline-step active" : "timeline-step";
      return `<div class="${className}">${step}</div>`;
    })
    .join("");
}

function priorityScore(item) {
  return (
    (item.urgency === "高" ? 2 : item.urgency === "中" ? 1 : 0) +
    (item.businessValue === "高" ? 2 : item.businessValue === "中" ? 1 : 0)
  );
}

function statusClass(status) {
  if (status === "待澄清" || status === "方案中") return "warning";
  if (status === "待决策") return "danger";
  return "success";
}

function heuristicDraft(text, mode) {
  const source = text.trim();
  const industry = inferIndustry(source);
  const customer = inferCustomer(source);
  const title = inferTitle(source, industry);
  const scenario = inferScenario(source, mode);
  const pain = inferPain(source);
  const outcome = inferOutcome(source);
  const urgency = inferUrgency(source);
  const businessValue = inferBusinessValue(source);
  const split = /(同时|另外|还需要|并且还要)/.test(source) ? "是" : "否";
  const summary = `${scenario}${pain ? ` 当前痛点是${pain}` : ""}${outcome ? ` 目标是${outcome}` : ""}${urgency === "高" ? " 当前时效性较强，建议优先处理。" : " 建议进入常规评估流程。"}`
    .replace(/\s+/g, " ")
    .trim();

  const questions = inferQuestions(source);

  return {
    title,
    customer,
    industry,
    summary,
    scenario,
    pain,
    outcome,
    urgency,
    businessValue,
    split,
    questions,
  };
}

function inferIndustry(text) {
  if (/体检|团检/.test(text)) return "体检";
  if (/保险/.test(text)) return "保险";
  if (/医院|门诊|挂号/.test(text)) return "门诊";
  if (/药企|药店/.test(text)) return "医药";
  return "健康服务";
}

function inferCustomer(text) {
  const patterns = [
    /客户是([^，。]+)/,
    /客户为([^，。]+)/,
    /([^，。]+客户)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/希望.*/, "").trim();
  }
  return "待补充客户";
}

function inferTitle(text, industry) {
  if (/报表|进度/.test(text)) return "企业团检客户希望查看预约后进度报表";
  if (/挂号|对接/.test(text)) return "门诊客户需要对接第三方挂号平台";
  if (/导出/.test(text)) return `${industry}客户要求导出业务数据`;
  return `${industry}客户希望优化关键业务场景`;
}

function inferScenario(text, mode) {
  if (/预约/.test(text) && /报表|进度/.test(text)) {
    return "客户希望在预约完成后直接查看团检进度和执行情况。";
  }
  if (/导出/.test(text)) {
    return "客户希望按指定维度导出业务数据，用于内部对账或审计。";
  }
  if (/挂号|对接/.test(text)) {
    return "客户希望把第三方平台数据与内部系统打通，减少人工同步。";
  }
  if (mode === "form") {
    return "这是商务提交的明确需求，建议进入标准分析流程。";
  }
  return "客户在既有业务流程中遇到效率或协同问题，希望系统提供支持。";
}

function inferPain(text) {
  if (/人工/.test(text) && /汇总|导出|整理/.test(text)) {
    return "当前依赖人工汇总与整理，效率低且容易出错。";
  }
  if (/漏|遗漏|出错/.test(text)) {
    return "当前流程容易遗漏信息，影响客户体验。";
  }
  return "现有流程依赖人工处理，反馈效率不足。";
}

function inferOutcome(text) {
  if (/报表|进度/.test(text)) return "客户可自助查看进度报表，减少人工反馈。";
  if (/导出/.test(text)) return "客户可按需导出结构化数据，缩短审计和对账时间。";
  if (/挂号|对接/.test(text)) return "实现平台间数据同步，减少前台人工录入。";
  return "提升处理效率和客户满意度。";
}

function inferUrgency(text) {
  if (/本周|本月|下个月|尽快|竞品|签约|投标|续约/.test(text)) return "高";
  if (/季度|近期/.test(text)) return "中";
  return "中";
}

function inferBusinessValue(text) {
  if (/签约|续约|竞品|大客户|集团|连锁/.test(text)) return "高";
  if (/效率|满意度|审计|对账/.test(text)) return "中";
  return "中";
}

function inferQuestions(text) {
  const base = [];
  if (/报表|进度/.test(text)) {
    base.push("报表查看对象是谁，是否涉及权限隔离？");
    base.push("客户希望查看哪些进度维度和统计口径？");
  }
  if (/导出/.test(text)) {
    base.push("导出字段范围是否已经确认？");
    base.push("导出频率是按月、按周还是实时？");
  }
  if (/挂号|对接/.test(text)) {
    base.push("第三方平台是否已有标准接口文档？");
    base.push("这次对接是否与签约或上线节点绑定？");
  }
  base.push("该需求优先服务哪个客户角色或内部角色？");
  return [...new Set(base)].slice(0, 4);
}

function populateDraft(draft) {
  state.currentDraft = draft;
  document.getElementById("draft-title").value = draft.title;
  document.getElementById("draft-summary").value = draft.summary;
  document.getElementById("draft-customer").value = draft.customer;
  document.getElementById("draft-industry").value = draft.industry;
  document.getElementById("draft-urgency").value = draft.urgency;
  document.getElementById("draft-business-value").value = draft.businessValue;
  document.getElementById("draft-split").value = draft.split;
  document.getElementById("draft-scenario").value = draft.scenario;
  document.getElementById("draft-pain").value = draft.pain;
  document.getElementById("draft-outcome").value = draft.outcome;
  renderDraftQuestions(draft.questions);
}

function renderDraftQuestions(questions) {
  const container = document.getElementById("draft-questions");
  container.innerHTML = questions
    .map(
      (question, index) => `
        <div class="question-row">
          <input type="text" value="${question}" data-question-index="${index}" />
          <button class="ghost-btn" data-remove-question="${index}">删除</button>
        </div>
      `,
    )
    .join("");
}

function collectDraftFromForm() {
  const questionInputs = [...document.querySelectorAll("#draft-questions input")];
  return {
    title: document.getElementById("draft-title").value.trim(),
    summary: document.getElementById("draft-summary").value.trim(),
    customer: document.getElementById("draft-customer").value.trim() || "待补充客户",
    industry: document.getElementById("draft-industry").value.trim() || "健康服务",
    urgency: document.getElementById("draft-urgency").value,
    businessValue: document.getElementById("draft-business-value").value,
    split: document.getElementById("draft-split").value,
    scenario: document.getElementById("draft-scenario").value.trim(),
    pain: document.getElementById("draft-pain").value.trim(),
    outcome: document.getElementById("draft-outcome").value.trim(),
    questions: questionInputs.map((input) => input.value.trim()).filter(Boolean),
  };
}

function createRequirementFromDraft(draft, asDraft = false) {
  const item = {
    id: `req-${Date.now()}`,
    title: draft.title,
    customer: draft.customer,
    industry: draft.industry,
    status: asDraft ? "草稿" : "待审核",
    urgency: draft.urgency,
    businessValue: draft.businessValue,
    summary: draft.summary,
    scenario: draft.scenario,
    pain: draft.pain,
    outcome: draft.outcome,
    nextStep: asDraft ? "等待继续编辑" : "等待商务负责人审核业务价值",
    owner: asDraft ? "Vivi / 草稿箱" : "商务负责人",
    updatedAt: "刚刚",
    questions: draft.questions,
    clarifications: draft.questions.map((question) => ({
      owner: "中台",
      status: "待回复",
      question,
      answer: "",
    })),
    solutions: [],
  };
  return item;
}

function openRequirement(id) {
  state.currentRequirementId = id;
  navigate("detail");
}

function addClarificationAnswer(requirementId) {
  const target = state.requirements.find((item) => item.id === requirementId);
  if (!target) return;
  const pending = target.clarifications.find((entry) => entry.status === "待回复");
  if (!pending) {
    alert("当前没有待回复的澄清问题。");
    return;
  }
  const answer = window.prompt(`请回复：${pending.question}`, "客户确认由企业 HR 查看，需按企业账号隔离权限。");
  if (!answer) return;
  pending.answer = answer;
  pending.status = "已回复";
  target.updatedAt = "刚刚";
  target.nextStep = "等待中台根据澄清结果继续分析";
  saveState();
  renderRequirementDetail();
  renderMessages();
}

function bindEvents() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(button.dataset.route);
    });
  });

  document.querySelectorAll(".create-mode-card").forEach((card) => {
    card.addEventListener("click", () => setCreateMode(card.dataset.mode));
  });

  document.getElementById("generate-draft-btn").addEventListener("click", () => {
    let text = "";
    if (state.createMode === "voice") text = document.getElementById("voice-input").value;
    if (state.createMode === "meeting") text = document.getElementById("meeting-input").value;
    if (state.createMode === "form") {
      const customer = document.getElementById("form-customer").value;
      const scenario = document.getElementById("form-scenario").value;
      const pain = document.getElementById("form-pain").value;
      const outcome = document.getElementById("form-outcome").value;
      text = `客户是${customer}，场景是${scenario}，当前痛点是${pain}，目标是${outcome}`;
    }
    if (!text.trim()) {
      alert("请先输入语音转写、会议纪要或轻表单内容。");
      return;
    }
    const draft = heuristicDraft(text, state.createMode);
    populateDraft(draft);
    navigate("draft");
  });

  document.getElementById("save-draft-btn").addEventListener("click", () => {
    const draft = collectDraftFromForm();
    const savedDraft = createRequirementFromDraft(draft, true);
    state.drafts.unshift(savedDraft);
    saveState();
    alert("已保存到草稿箱。");
  });

  document.getElementById("submit-requirement-btn").addEventListener("click", () => {
    const draft = collectDraftFromForm();
    const requirement = createRequirementFromDraft(draft, false);
    state.requirements.unshift(requirement);
    saveState();
    state.currentRequirementId = requirement.id;
    renderRequirementList();
    renderMessages();
    navigate("detail");
  });

  document.getElementById("add-question-btn").addEventListener("click", () => {
    const draft = collectDraftFromForm();
    draft.questions.push("请补充该需求对应的客户角色和业务对象。");
    renderDraftQuestions(draft.questions);
  });

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-requirement]");
    if (openButton) openRequirement(openButton.dataset.openRequirement);

    const modeButton = event.target.closest("[data-create-mode]");
    if (modeButton) {
      navigate("create");
      setCreateMode(modeButton.dataset.createMode);
    }

    const boardButton = event.target.closest("[data-open-board]");
    if (boardButton) {
      document.getElementById("board-drawer").classList.remove("hidden");
    }

    const clarificationButton = event.target.closest("[data-add-clarification]");
    if (clarificationButton) {
      addClarificationAnswer(clarificationButton.dataset.addClarification);
    }

    const removeQuestionButton = event.target.closest("[data-remove-question]");
    if (removeQuestionButton) {
      const draft = collectDraftFromForm();
      draft.questions.splice(Number(removeQuestionButton.dataset.removeQuestion), 1);
      renderDraftQuestions(draft.questions);
    }
  });

  document.getElementById("close-board-btn").addEventListener("click", () => {
    document.getElementById("board-drawer").classList.add("hidden");
  });

  document.getElementById("requirement-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderRequirementList();
  });

  document.getElementById("status-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    state.statusFilter = button.dataset.status;
    document
      .querySelectorAll("#status-filter .segmented-btn")
      .forEach((item) => item.classList.toggle("active", item === button));
    renderRequirementList();
  });

  document.getElementById("message-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    state.messageFilter = button.dataset.type;
    document
      .querySelectorAll("#message-filter .segmented-btn")
      .forEach((item) => item.classList.toggle("active", item === button));
    renderMessages();
  });

  document.getElementById("top-action").addEventListener("click", () => {
    if (state.route === "requirements" || state.route === "detail") navigate("create");
    if (state.route === "draft") navigate("create");
    if (state.route === "create") alert(`当前草稿箱共有 ${state.drafts.length} 条草稿。`);
    if (state.route === "messages") alert("演示版中可在这里添加“全部已读”接口。");
    if (state.route === "profile") alert("演示版中可在这里接入钉钉通知设置和免登信息。");
  });
}

function init() {
  bindEvents();
  renderHomePriority();
  renderRequirementList();
  renderMessages();
  updateHeader();
  setCreateMode("voice");
}

init();

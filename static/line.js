const mobileStatusMeta = {
  todo: { label: "รอทำ", className: "status-todo" },
  progress: { label: "กำลังทำ", className: "status-progress" },
  review: { label: "รอตรวจ", className: "status-review" },
  done: { label: "เสร็จแล้ว", className: "status-done" }
};

const mobilePriorityMeta = {
  high: { label: "ด่วน", className: "priority-high" },
  medium: { label: "ปกติ", className: "priority-medium" },
  low: { label: "ต่ำ", className: "priority-low" }
};

const PERSONAL_MODE = true;

const fallbackTasks = [
  {
    id: "task-1",
    title: "ออกแบบ LINE notification flow",
    description: "กำหนดข้อความแจ้งเตือนสำหรับงานใหม่ งานใกล้ครบกำหนด และงานเลยกำหนด",
    project: "LINE Integration",
    status: "progress",
    priority: "high",
    assignee: "Narin",
    dueDate: "2026-05-18",
    tags: ["LINE", "Automation"],
    activity: []
  },
  {
    id: "task-2",
    title: "สร้าง Project dashboard",
    description: "รวมจำนวนงานตามสถานะ งานเสี่ยงเลยกำหนด และงานของฉันในหน้าเดียว",
    project: "Core App",
    status: "review",
    priority: "medium",
    assignee: "Mali",
    dueDate: "2026-05-20",
    tags: ["Dashboard"],
    activity: []
  },
  {
    id: "task-3",
    title: "กำหนด schema สำหรับ task และ comment",
    description: "เตรียมโครงสร้างข้อมูลให้รองรับ workspace, assignee, due date, activity log และ LINE user id",
    project: "Data Model",
    status: "todo",
    priority: "high",
    assignee: "Krit",
    dueDate: "2026-05-22",
    tags: ["Database"],
    activity: []
  }
];

let mobileTasks = [];
let activeFilter = "all";
let currentLineUserId = "";
let currentLineIdToken = "";
let assigneeOptions = [];
let teamState = {
  user: null,
  memberships: [],
  activeOrganization: null,
  members: []
};
let pendingInviteOrganizationId = "";
let myKpi = null;
let myTasksFilter = "today";
let selectedProjectName = "";
let reminderSettings = null;

const mobileElements = {
  taskList: document.querySelector("#taskList"),
  filterText: document.querySelector("#filterText"),
  toast: document.querySelector("#toast"),
  taskDialog: document.querySelector("#taskDialog"),
  mobileTaskForm: document.querySelector("#mobileTaskForm"),
  newMobileTaskButton: document.querySelector("#newMobileTaskButton"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  lineStatusTitle: document.querySelector("#lineStatusTitle"),
  lineStatusText: document.querySelector("#lineStatusText"),
  lineLoginButton: document.querySelector("#lineLoginButton"),
  sectionTitle: document.querySelector(".section-header h2"),
  sectionSubtitle: document.querySelector("#filterText")
};

document.querySelectorAll(".quick-card").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".quick-card").forEach((item) => item.classList.toggle("active", item === button));
    renderMobile();
  });
});

mobileElements.newMobileTaskButton.addEventListener("click", () => {
  setActiveNav("create");
  renderCreateTaskPage();
});
mobileElements.closeDialogButton.addEventListener("click", () => mobileElements.taskDialog.close());
mobileElements.mobileTaskForm.addEventListener("submit", saveMobileTask);
mobileElements.lineLoginButton.addEventListener("click", () => {
  if (window.liff && !window.liff.isLoggedIn()) {
    window.liff.login();
  }
});

document.querySelectorAll(".bottom-nav button").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.navView || "home";
    setActiveNav(view);
    if (view === "create") renderCreateTaskPage();
    else if (view === "tasks") renderMyTasksPage();
    else if (view === "projects") renderProjectsPage();
    else if (view === "line") renderPersonalSettings();
    else renderMobile();
  });
});

document.querySelector(".profile-dot")?.addEventListener("click", () => {
  setActiveNav("tasks");
  renderMyProfile();
});

function setActiveNav(view) {
  document.querySelectorAll(".bottom-nav button").forEach((item) => {
    item.classList.toggle("active", item.dataset.navView === view);
  });
}

initializeApp();

async function initializeApp() {
  await initializeLine();
  await loadMobileTasks();
}

async function initializeLine() {
  try {
    const response = await fetch("/api/line/config");
    const config = await response.json();

    if (!config.isLiffConfigured) {
      setLineStatus("ยังไม่ตั้งค่า LIFF", "ใส่ LINE_LIFF_ID ในไฟล์ .env แล้ว restart server");
      return;
    }

    if (!window.liff) {
      setLineStatus("โหลด LIFF SDK ไม่ได้", "ตรวจสอบ internet หรือเปิดผ่าน LINE อีกครั้ง");
      return;
    }

    await window.liff.init({ liffId: config.liffId });
    if (!window.liff.isLoggedIn()) {
      setLineStatus("ยังไม่ได้เข้า LINE", "กดปุ่มเพื่อ login ผ่าน LINE");
      mobileElements.lineLoginButton.classList.remove("hidden");
      return;
    }

    const profile = await window.liff.getProfile();
    currentLineUserId = profile.userId;
    currentLineIdToken = window.liff.getIDToken ? window.liff.getIDToken() || "" : "";
    if (!currentLineIdToken) {
      setLineStatus("ยืนยัน LINE ไม่สำเร็จ", "กรุณาเปิดผ่าน LINE อีกครั้ง");
      return;
    }
    await fetch("/api/line/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-line-id-token": currentLineIdToken
      },
      body: JSON.stringify(profile)
    });
    setLineStatus("เชื่อม LINE แล้ว", `สวัสดี ${profile.displayName}`);
    mobileElements.lineLoginButton.classList.add("hidden");
  } catch {
    setLineStatus("LINE ยังไม่พร้อม", "หน้านี้ยังใช้แบบเว็บได้ และจะเชื่อม LINE เมื่อ config ครบ");
  }
  await loadTeamState();
  handleInviteFromQuery();
}

function setLineStatus(title, text) {
  mobileElements.lineStatusTitle.textContent = title;
  mobileElements.lineStatusText.textContent = text;
}

async function pushSummaryToLine() {
  try {
    const response = await fetch("/api/line/push-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Cannot push summary");
    showToast("ส่งสรุปเข้า LINE แล้ว");
  } catch (error) {
    const openTasks = mobileTasks.filter((task) => task.status !== "done").length;
    showToast(`ยังส่งจริงไม่ได้: ${error.message || "ต้องตั้งค่า LINE token"} | งานค้าง ${openTasks} งาน`);
  }
}

async function loadReminderSettings() {
  try {
    const response = await apiFetch("/api/line/reminder-settings");
    if (!response.ok) throw new Error("Cannot load reminder settings");
    reminderSettings = await response.json();
  } catch {
    reminderSettings = {
      enabled: true,
      dailySummaryEnabled: true,
      dailySummaryTime: "08:30",
      dueSoonEnabled: true,
      dueSoonDays: 1,
      dueSoonTime: "18:00",
      overdueEnabled: true,
      reminderTime: "09:00",
      quietHoursEnabled: false,
      quietStart: "22:00",
      quietEnd: "08:00"
    };
  }
}

async function saveReminderSettings(payload) {
  const response = await apiFetch("/api/line/reminder-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Cannot save reminder settings");
  reminderSettings = await response.json();
  return reminderSettings;
}

async function sendTestReminder() {
  const response = await apiFetch("/api/line/test-reminder", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!response.ok) throw new Error("Cannot send test reminder");
}

async function loadMobileTasks() {
  const allowLocalPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  if (!currentLineUserId && !allowLocalPreview) {
    mobileTasks = [];
    renderMobile();
    showToast("กรุณาเปิดผ่าน LINE และเข้าสู่ระบบก่อนดูงาน");
    return;
  }
  try {
    const response = await apiFetch("/api/tasks");
    if (!response.ok) throw new Error("Cannot load tasks");
    mobileTasks = await response.json();
  } catch {
    mobileTasks = fallbackTasks;
    showToast("โหลด backend ไม่ได้ แสดงข้อมูลตัวอย่างก่อน");
  }
  renderMobile();
  openTaskFromQuery();
  handleInviteFromQuery();
}

function handleInviteFromQuery() {
  const inviteId = new URLSearchParams(window.location.search).get("invite");
  if (!inviteId || pendingInviteOrganizationId === inviteId) return;
  pendingInviteOrganizationId = inviteId;
  renderInviteJoin(inviteId);
}

async function apiFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(currentLineUserId ? { "x-line-user-id": currentLineUserId } : {}),
    ...(currentLineIdToken ? { "x-line-id-token": currentLineIdToken } : {})
  };
  return fetch(url, { ...options, headers });
}

async function loadTeamState() {
  try {
    const response = await apiFetch("/api/team/me");
    if (!response.ok) throw new Error("Cannot load team");
    teamState = { ...teamState, ...(await response.json()) };
    if (teamState.memberships.length && !teamState.activeOrganization) {
      teamState.activeOrganization = teamState.memberships[0].organization;
      await loadOrganization(teamState.activeOrganization.id);
    }
    await loadMyKpi();
    await loadAssigneeOptions();
  } catch {
    teamState = { user: null, memberships: [], activeOrganization: null, members: [] };
  }
}

async function loadAssigneeOptions() {
  try {
    const response = await apiFetch("/api/team/assignees");
    if (!response.ok) throw new Error("Cannot load assignees");
    assigneeOptions = await response.json();
  } catch {
    assigneeOptions = [];
  }
}

async function loadMyKpi() {
  try {
    const response = await apiFetch("/api/team/me/kpi");
    if (!response.ok) throw new Error("Cannot load KPI");
    myKpi = await response.json();
  } catch {
    myKpi = null;
  }
}

async function loadOrganization(organizationId) {
  const response = await apiFetch(`/api/team/organizations/${encodeURIComponent(organizationId)}`);
  if (!response.ok) throw new Error("Cannot load organization");
  const result = await response.json();
  teamState.activeOrganization = result.organization;
  teamState.members = result.members;
}

function openTaskFromQuery() {
  const taskId = new URLSearchParams(window.location.search).get("task");
  const action = new URLSearchParams(window.location.search).get("action");
  if (!taskId) return;
  const task = mobileTasks.find((currentTask) => currentTask.id === taskId);
  if (task) {
    openMobileDialog(task);
    if (action === "reschedule") {
      window.setTimeout(() => {
        const dueDateInput = document.querySelector("#mobileTaskDueDate");
        dueDateInput?.focus();
        showToast("เลือกวันครบกำหนดใหม่ แล้วกดบันทึก");
      }, 150);
    }
  }
}

async function saveTaskToApi(task, exists) {
  const response = await apiFetch(exists ? `/api/tasks/${encodeURIComponent(task.id)}` : "/api/tasks", {
    method: exists ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });
  if (!response.ok) throw new Error("Cannot save task");
  return response.json();
}

async function patchTaskToApi(taskId, patch) {
  const response = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error("Cannot update task");
  return response.json();
}

async function persistTask(task, exists) {
  const savedTask = await saveTaskToApi(task, exists);
  mobileTasks = exists
    ? mobileTasks.map((currentTask) => (currentTask.id === savedTask.id ? savedTask : currentTask))
    : [savedTask, ...mobileTasks];
  return savedTask;
}

function renderMobile() {
  document.body.dataset.view = "dashboard";
  const today = new Date("2026-05-16T00:00:00+07:00");
  const dueTasks = mobileTasks.filter((task) => {
    const diff = (new Date(`${task.dueDate}T00:00:00+07:00`).getTime() - today.getTime()) / 86400000;
    return task.status !== "done" && diff >= 0 && diff <= 3;
  });
  const mineTasks = PERSONAL_MODE
    ? mobileTasks
    : mobileTasks.filter((task) => task.assignee.toLowerCase() === "narin");
  const doneTasks = mobileTasks.filter((task) => task.status === "done");

  const visibleTasks = getFilteredTasks({ dueTasks, mineTasks, doneTasks });
  mobileElements.filterText.textContent = getFilterText();
  mobileElements.sectionTitle.textContent = "ภาพรวมงานวันนี้";
  mobileElements.sectionSubtitle.textContent = PERSONAL_MODE
    ? "งานส่วนตัวของคุณ เตือนผ่าน LINE อัตโนมัติ"
    : "จัดการงานสำคัญและบอร์ดของทีม";
  mobileElements.taskList.innerHTML = renderDashboard({
    tasks: visibleTasks,
    dueTasks,
    doneTasks
  });

  mobileElements.taskList.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => openMobileDialog(mobileTasks.find((task) => task.id === button.dataset.editTask)));
  });
  mobileElements.taskList.querySelectorAll("[data-card-edit]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openMobileDialog(mobileTasks.find((task) => task.id === card.dataset.cardEdit));
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openMobileDialog(mobileTasks.find((task) => task.id === card.dataset.cardEdit));
    });
  });

  mobileElements.taskList.querySelectorAll("[data-done-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const updatedTask = await patchTaskToApi(button.dataset.doneTask, {
          status: "done",
          activityText: "เปลี่ยนสถานะเป็นเสร็จแล้ว"
        });
        mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        renderMobile();
        showToast("อัปเดตงานเป็นเสร็จแล้ว");
      } catch {
        showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  });

  mobileElements.taskList.querySelectorAll("[data-add-status]").forEach((button) => {
    button.addEventListener("click", () => openMobileDialog({ ...createMobileTask(), status: button.dataset.addStatus }));
  });
  mobileElements.taskList.querySelectorAll("[data-open-my-tasks]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = "";
      setActiveNav("tasks");
      renderMyTasksPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-open-line-settings]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNav("line");
      renderPersonalSettings();
    });
  });
}

function renderDashboard({ tasks, dueTasks, doneTasks }) {
  const todoTasks = mobileTasks.filter((task) => task.status === "todo");
  const progressTasks = mobileTasks.filter((task) => task.status === "progress" || task.status === "review");
  const completedTasks = mobileTasks.filter((task) => task.status === "done");
  const total = mobileTasks.length || 1;
  const progress = Math.round((completedTasks.length / total) * 100);
  const importantTask = dueTasks[0] || progressTasks[0] || todoTasks[0] || mobileTasks[0];

  return `
    <div class="dashboard-grid">
      <section class="dashboard-hero">
        <div class="hero-summary">
          <h2>ภาพรวมงานวันนี้</h2>
          <div class="summary-stats">
            <div class="summary-stat todo"><span>ต้องทำ</span><strong>${todoTasks.length}</strong></div>
            <div class="summary-stat progress"><span>กำลังทำ</span><strong>${progressTasks.length}</strong></div>
            <div class="summary-stat done"><span>เสร็จแล้ว</span><strong>${completedTasks.length}</strong></div>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width: ${progress}%"></div></div>
          <div class="summary-foot"><span>ความคืบหน้าโดยรวม</span><strong>${progress}%</strong></div>
        </div>
        <div class="boss-mascot" aria-hidden="true">
          <div class="boss-cat">
            <div class="boss-face"></div>
            <div class="boss-tie"></div>
          </div>
        </div>
      </section>

      <section class="important-section">
        <div class="section-title-row">
          <h2>งานสำคัญของคุณ</h2>
          <button class="view-all-link" data-open-my-tasks type="button">ดูทั้งหมด ›</button>
        </div>
        ${importantTask ? renderFeaturedTask(importantTask) : `<p class="task-description">ยังไม่มีงานสำคัญ</p>`}
      </section>

      <section class="mini-board">
        <div class="section-title-row">
          <h2>บอร์ดงานของฉัน</h2>
          <button class="view-all-link" data-open-my-tasks type="button">ดูบอร์ดทั้งหมด ›</button>
        </div>
        <div class="dashboard-task-list">
          ${renderDashboardTaskList([...todoTasks, ...progressTasks, ...completedTasks])}
        </div>
      </section>

      <section class="line-automation-card">
        <div class="line-bubble">LINE</div>
        <div>
          <strong>เตือนงานผ่าน LINE ของคุณ</strong>
          <p class="task-description">สรุปงานค้าง งานใกล้ครบกำหนด และเปิดแอปจากแชทได้ทันที</p>
        </div>
        <button class="view-all-link" data-open-line-settings type="button">ตั้งค่า ›</button>
      </section>
    </div>
  `;
}

function renderFeaturedTask(task) {
  const percent = task.status === "done" ? 100 : task.status === "progress" || task.status === "review" ? 65 : 20;
  const statusMeta = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const priorityMeta = mobilePriorityMeta[task.priority] || mobilePriorityMeta.medium;
  return `
    <article class="featured-task-card" data-card-edit="${task.id}" tabindex="0" role="button" aria-label="เปิดงาน ${escapeMobileHtml(task.title)}">
      <div class="featured-head">
        <div class="featured-icon">${task.status === "done" ? "✓" : "📣"}</div>
        <div>
          <div class="task-title">${escapeMobileHtml(task.title)}</div>
          <p class="task-description">${escapeMobileHtml(task.project || "โปรเจกต์ทั่วไป")}</p>
        </div>
        <div class="ring-progress" style="--progress: ${percent}%"><span>${percent}%</span></div>
      </div>
      <div class="featured-meta">
        <span class="pill ${statusMeta.className}">${statusMeta.label}</span>
        <span class="pill ${priorityMeta.className}">${priorityMeta.label}</span>
        <span class="pill status-todo">${formatMobileDate(task.dueDate)}</span>
      </div>
      <div class="task-bottom">
        <span>ผู้รับผิดชอบ ${escapeMobileHtml(task.assignee)}</span>
        <div class="task-actions">
          <button data-edit-task="${task.id}" type="button">แก้ไข</button>
          ${task.status !== "done" ? `<button data-done-task="${task.id}" type="button">ทำเสร็จ</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderDashboardTaskList(tasks) {
  const list = tasks.slice(0, 3);
  if (!list.length) {
    return `<p class="task-description">ยังไม่มีงานในบอร์ด กดเพิ่มงานเพื่อเริ่มเตือนตัวเองผ่าน LINE</p>`;
  }
  return list
    .map((task) => {
      const percent = task.status === "done" ? "✓" : task.status === "todo" ? "5" : "•";
      return `
        <button class="dashboard-task-row" data-edit-task="${task.id}" type="button">
          <div class="dashboard-row-icon">${task.status === "done" ? "✓" : "▣"}</div>
          <div>
            <strong>${escapeMobileHtml(task.title)}</strong>
            <span>ครบกำหนด ${formatMobileDate(task.dueDate)}</span>
          </div>
          <div class="task-avatar">${getInitials(task.assignee || teamState.user?.displayName || "ฉัน")}</div>
          <span class="dashboard-row-badge ${task.status === "done" ? "done" : ""}">${percent}</span>
        </button>
      `;
    })
    .join("");
}

function renderMiniColumn(title, tasks, status) {
  return `
    <div class="mini-column">
      <h3>${title} <span class="count-pill">${tasks.length}</span></h3>
      ${tasks
        .slice(0, 3)
        .map(
          (task) => `
            <div class="mini-task" data-edit-task="${task.id}">
              <strong>${escapeMobileHtml(task.title)}</strong>
              <span>${formatMobileDate(task.dueDate)}</span>
            </div>
          `
        )
        .join("")}
      <button class="mini-add" data-add-status="${status}" type="button">+ เพิ่มงาน</button>
    </div>
  `;
}

function renderMyTasksPage() {
  document.body.dataset.view = "tasks";
  mobileElements.sectionTitle.textContent = selectedProjectName ? selectedProjectName : "งานของฉัน";
  mobileElements.sectionSubtitle.textContent = selectedProjectName
    ? "งานในโปรเจกต์นี้ แตะการ์ดเพื่อแก้ไขหรือปิดงาน"
    : "ดูงานที่ต้องทำวันนี้ งานที่กำลังจะมาถึง และงานที่เสร็จแล้ว";

  const todayKey = new Date().toISOString().slice(0, 10);
  const projectScopedTasks = selectedProjectName
    ? mobileTasks.filter((task) => (task.project || "ทั่วไป") === selectedProjectName)
    : mobileTasks;
  const filteredTasks = projectScopedTasks.filter((task) => {
    if (myTasksFilter === "done") return task.status === "done";
    if (myTasksFilter === "upcoming") return task.status !== "done" && task.dueDate > todayKey;
    return task.status !== "done" && task.dueDate <= todayKey;
  });

  mobileElements.taskList.innerHTML = `
    <div class="my-tasks-screen">
      ${selectedProjectName ? `<button class="view-all-link project-clear-button" data-clear-project type="button">← งานของฉันทั้งหมด</button>` : ""}
      <div class="segmented-tabs">
        <button class="${myTasksFilter === "today" ? "active" : ""}" data-my-filter="today" type="button">วันนี้</button>
        <button class="${myTasksFilter === "upcoming" ? "active" : ""}" data-my-filter="upcoming" type="button">ที่กำลังจะมาถึง</button>
        <button class="${myTasksFilter === "done" ? "active" : ""}" data-my-filter="done" type="button">เสร็จสิ้น</button>
      </div>
      <div class="personal-task-list">
        ${filteredTasks.length ? filteredTasks.map(renderPersonalTaskRow).join("") : renderEmptyPersonalTasks()}
      </div>
    </div>
  `;

  mobileElements.taskList.querySelectorAll("[data-my-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      myTasksFilter = button.dataset.myFilter;
      renderMyTasksPage();
    });
  });
  mobileElements.taskList.querySelector("[data-clear-project]")?.addEventListener("click", () => {
    selectedProjectName = "";
    renderMyTasksPage();
  });
  mobileElements.taskList.querySelectorAll("[data-row-edit]").forEach((button) => {
    button.addEventListener("click", () => openMobileDialog(mobileTasks.find((task) => task.id === button.dataset.rowEdit)));
  });
  mobileElements.taskList.querySelectorAll("[data-row-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const updatedTask = await patchTaskToApi(button.dataset.rowDone, {
          status: "done",
          activityText: "ปิดงานจากหน้างานของฉัน"
        });
        mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        renderMyTasksPage();
        showToast("ปิดงานแล้ว");
      } catch {
        showToast("ปิดงานไม่สำเร็จ");
      }
    });
  });
  mobileElements.taskList.querySelector("[data-empty-create]")?.addEventListener("click", () => {
    setActiveNav("create");
    renderCreateTaskPage();
  });
}

function renderPersonalTaskRow(task) {
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const priority = mobilePriorityMeta[task.priority] || mobilePriorityMeta.medium;
  return `
    <article class="personal-task-row">
      <button class="check-box ${task.status === "done" ? "checked" : ""}" data-row-done="${task.id}" type="button" aria-label="Mark done"></button>
      <button class="personal-task-main" data-row-edit="${task.id}" type="button">
        <strong>${escapeMobileHtml(task.title)}</strong>
        <span class="project-chip">${escapeMobileHtml(task.project || "ทั่วไป")}</span>
        <small>▣ ครบกำหนด ${formatMobileDate(task.dueDate)}</small>
      </button>
      <div class="task-avatar">${getInitials(task.assignee || teamState.user?.displayName || "ฉัน")}</div>
      <span class="personal-status ${status.className}">${task.status === "done" ? "✓" : priority.label}</span>
    </article>
  `;
}

function renderEmptyPersonalTasks() {
  return `
    <article class="empty-state-card">
      <strong>ยังไม่มีงานในหมวดนี้</strong>
      <p class="task-description">กดปุ่ม + เพื่อเพิ่มงานใหม่ หรือพิมพ์ใน LINE เช่น “ประชุมพรุ่งนี้”</p>
      <button class="save-button" data-empty-create type="button">เพิ่มงาน</button>
    </article>
  `;
}

function renderCreateTaskPage(seedTask = createMobileTask()) {
  document.body.dataset.view = "create";
  mobileElements.sectionTitle.textContent = seedTask.id && mobileTasks.some((task) => task.id === seedTask.id) ? "แก้ไขภารกิจ" : "สร้างภารกิจ";
  mobileElements.sectionSubtitle.textContent = "เพิ่มงานส่วนตัว แล้วให้ BossBoard เตือนผ่าน LINE";

  const userName = teamState.user?.displayName || "ฉัน";
  mobileElements.taskList.innerHTML = `
    <form id="createTaskPageForm" class="create-task-page">
      <label>ชื่อภารกิจ
        <input id="createTaskTitle" value="${escapeMobileHtml(seedTask.title)}" placeholder="ชื่อภารกิจ" required />
      </label>
      <label>รายละเอียด
        <textarea id="createTaskDescription" placeholder="รายละเอียด">${escapeMobileHtml(seedTask.description || "")}</textarea>
      </label>
      <label>เลือกโปรเจกต์
        <input id="createTaskProject" value="${escapeMobileHtml(seedTask.project || "LINE Mobile")}" placeholder="เช่น งานส่วนตัว, การตลาด, ลูกค้า" />
      </label>
      <div class="assignee-strip" aria-label="ผู้รับผิดชอบ">
        <span>ผู้รับผิดชอบ</span>
        <div class="avatar-choice active">${getInitials(userName)}</div>
      </div>
      <label>วันครบกำหนด
        <input id="createTaskDueDate" value="${escapeMobileHtml(seedTask.dueDate)}" type="date" required />
      </label>
      <div class="form-row">
        <label>สถานะ
          <select id="createTaskStatus">
            ${Object.entries(mobileStatusMeta).map(([value, meta]) => `<option value="${value}" ${seedTask.status === value ? "selected" : ""}>${meta.label}</option>`).join("")}
          </select>
        </label>
        <label>ความสำคัญ
          <select id="createTaskPriority">
            ${Object.entries(mobilePriorityMeta).map(([value, meta]) => `<option value="${value}" ${seedTask.priority === value ? "selected" : ""}>${meta.label}</option>`).join("")}
          </select>
        </label>
      </div>
      <button class="create-submit-button" type="submit">สร้างภารกิจ</button>
    </form>
  `;

  document.querySelector("#createTaskPageForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const exists = mobileTasks.some((task) => task.id === seedTask.id);
    const task = {
      ...seedTask,
      title: document.querySelector("#createTaskTitle").value.trim() || "Untitled task",
      description: document.querySelector("#createTaskDescription").value.trim(),
      project: document.querySelector("#createTaskProject").value.trim() || "งานส่วนตัว",
      assignee: userName,
      assigneeUserId: teamState.user?.id || "",
      organizationId: "",
      dueDate: document.querySelector("#createTaskDueDate").value,
      status: document.querySelector("#createTaskStatus").value,
      priority: document.querySelector("#createTaskPriority").value,
      tags: ["LIFF"],
      activity: []
    };
    try {
      await persistTask(task, exists);
      setActiveNav("tasks");
      myTasksFilter = task.status === "done" ? "done" : "upcoming";
      renderMyTasksPage();
      showToast(exists ? "บันทึกงานแล้ว" : "สร้างภารกิจแล้ว");
    } catch {
      showToast("บันทึกงานไม่สำเร็จ");
    }
  });
}

async function renderPersonalSettings() {
  document.body.dataset.view = "settings";
  mobileElements.sectionTitle.textContent = "แจ้งเตือน LINE";
  mobileElements.sectionSubtitle.textContent = "ตั้งเวลาให้ BossBoard เตือนงานส่วนตัวของคุณ";
  await loadReminderSettings();
  const settings = reminderSettings || {};

  mobileElements.taskList.innerHTML = `
    <div class="dashboard-grid">
      <article class="profile-card reminder-hero-card">
        <div class="section-title-row">
          <h2>บัญชี LINE นี้</h2>
          <span class="pill ${settings.enabled ? "status-done" : "status-todo"}">${settings.enabled ? "เปิดเตือน" : "ปิดเตือน"}</span>
        </div>
        <p class="task-description">${escapeMobileHtml(teamState.user?.displayName || "ยังไม่ทราบชื่อ")}<br>${escapeMobileHtml(teamState.user?.lineUserId || currentLineUserId || "เปิดผ่าน LINE เพื่อระบุตัวตน")}</p>
        <div class="task-actions" style="margin-top: 14px;">
          <button type="button" id="sendTestReminderButton">ทดสอบส่ง LINE</button>
          <button type="button" id="pushSummaryButton">ส่งสรุปตอนนี้</button>
        </div>
      </article>

      <form id="reminderSettingsForm" class="profile-card reminder-settings-form">
        <div class="section-title-row">
          <h2>รอบแจ้งเตือน</h2>
          <label class="switch-row compact-switch">
            <input id="reminderEnabledInput" type="checkbox" ${settings.enabled ? "checked" : ""} />
            <span>เปิดใช้งาน</span>
          </label>
        </div>
        <div class="reminder-grid">
          <label class="switch-row">
            <input id="dailySummaryEnabledInput" type="checkbox" ${settings.dailySummaryEnabled ? "checked" : ""} />
            <span>สรุปรายวัน</span>
            <input id="dailySummaryTimeInput" type="time" value="${escapeMobileHtml(settings.dailySummaryTime || "08:30")}" />
          </label>
          <label class="switch-row">
            <input id="dueSoonEnabledInput" type="checkbox" ${settings.dueSoonEnabled ? "checked" : ""} />
            <span>เตือนก่อนครบกำหนด</span>
            <div class="inline-setting">
              <input id="dueSoonDaysInput" type="number" min="0" max="7" value="${escapeMobileHtml(settings.dueSoonDays ?? 1)}" />
              <small>วัน</small>
              <input id="dueSoonTimeInput" type="time" value="${escapeMobileHtml(settings.dueSoonTime || "18:00")}" />
            </div>
          </label>
          <label class="switch-row">
            <input id="overdueEnabledInput" type="checkbox" ${settings.overdueEnabled ? "checked" : ""} />
            <span>เตือนงานเลยกำหนด</span>
            <input id="reminderTimeInput" type="time" value="${escapeMobileHtml(settings.reminderTime || "09:00")}" />
          </label>
          <label class="switch-row">
            <input id="quietHoursEnabledInput" type="checkbox" ${settings.quietHoursEnabled ? "checked" : ""} />
            <span>งดแจ้งช่วงพัก</span>
            <div class="inline-setting">
              <input id="quietStartInput" type="time" value="${escapeMobileHtml(settings.quietStart || "22:00")}" />
              <small>ถึง</small>
              <input id="quietEndInput" type="time" value="${escapeMobileHtml(settings.quietEnd || "08:00")}" />
            </div>
          </label>
        </div>
        <button class="save-button" type="submit">บันทึกการแจ้งเตือน</button>
        <p class="task-description">หมายเหตุ: บน Render Free ระบบจะส่งตามเวลาที่ตั้งไว้เมื่อ server ตื่นอยู่ ถ้าเครื่องหลับ อาจส่งหลังจากมีคนเปิดแอปหรือมี webhook เข้า</p>
      </form>

      <article class="profile-card future-team-card">
        <div class="section-title-row">
          <h2>งานของคุณตอนนี้</h2>
          <span class="pill priority-medium">${mobileTasks.filter((task) => task.status !== "done").length} งานค้าง</span>
        </div>
        <p class="task-description">ระบบจะแจ้งเฉพาะงานที่เป็นของบัญชี LINE นี้ และจะไม่ส่งงานของคนอื่นมาปนกัน</p>
      </article>
    </div>
  `;

  document.querySelector("#reminderSettingsForm")?.addEventListener("submit", saveReminderSettingsFromForm);
  document.querySelector("#sendTestReminderButton")?.addEventListener("click", async () => {
    try {
      await sendTestReminder();
      showToast("ส่งทดสอบเข้า LINE แล้ว");
    } catch {
      showToast("ส่งทดสอบไม่สำเร็จ ตรวจสอบว่าเพิ่ม OA เป็นเพื่อนแล้ว");
    }
  });
  document.querySelector("#pushSummaryButton")?.addEventListener("click", pushSummaryToLine);
}

async function saveReminderSettingsFromForm(event) {
  event.preventDefault();
  const payload = {
    enabled: document.querySelector("#reminderEnabledInput").checked,
    dailySummaryEnabled: document.querySelector("#dailySummaryEnabledInput").checked,
    dailySummaryTime: document.querySelector("#dailySummaryTimeInput").value || "08:30",
    dueSoonEnabled: document.querySelector("#dueSoonEnabledInput").checked,
    dueSoonDays: Number(document.querySelector("#dueSoonDaysInput").value || 1),
    dueSoonTime: document.querySelector("#dueSoonTimeInput").value || "18:00",
    overdueEnabled: document.querySelector("#overdueEnabledInput").checked,
    reminderTime: document.querySelector("#reminderTimeInput").value || "09:00",
    quietHoursEnabled: document.querySelector("#quietHoursEnabledInput").checked,
    quietStart: document.querySelector("#quietStartInput").value || "22:00",
    quietEnd: document.querySelector("#quietEndInput").value || "08:00"
  };
  try {
    await saveReminderSettings(payload);
    showToast("บันทึกการแจ้งเตือนแล้ว");
    renderPersonalSettings();
  } catch {
    showToast("บันทึกการแจ้งเตือนไม่สำเร็จ");
  }
}

function renderProjectsPage() {
  document.body.dataset.view = "projects";
  mobileElements.sectionTitle.textContent = "โปรเจกต์";
  mobileElements.sectionSubtitle.textContent = "จัดกลุ่มงานส่วนตัวตามเรื่องที่ต้องทำ";
  const projects = Array.from(
    mobileTasks.reduce((map, task) => {
      const name = task.project || "ทั่วไป";
      const current = map.get(name) || { name, total: 0, done: 0, nextDue: task.dueDate };
      current.total += 1;
      if (task.status === "done") current.done += 1;
      if (task.dueDate && task.dueDate < current.nextDue) current.nextDue = task.dueDate;
      map.set(name, current);
      return map;
    }, new Map()).values()
  );
  mobileElements.taskList.innerHTML = `
    <div class="dashboard-grid">
      ${projects.length ? projects.map(renderProjectCard).join("") : `
        <article class="empty-state-card">
          <strong>ยังไม่มีโปรเจกต์</strong>
          <p class="task-description">เมื่อสร้างงานใหม่ ระบบจะรวมเป็นโปรเจกต์ให้อัตโนมัติจากช่อง “เลือกโปรเจกต์”</p>
        </article>
      `}
    </div>
  `;
  mobileElements.taskList.querySelectorAll("[data-project-name]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedProjectName = card.dataset.projectName;
      myTasksFilter = "upcoming";
      setActiveNav("tasks");
      renderMyTasksPage();
    });
  });
}

function renderProjectCard(project) {
  const percent = Math.round((project.done / Math.max(project.total, 1)) * 100);
  return `
    <button class="profile-card project-overview-card" data-project-name="${escapeMobileHtml(project.name)}" type="button">
      <div class="section-title-row">
        <h2>${escapeMobileHtml(project.name)}</h2>
        <span class="pill priority-medium">${percent}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
      <p class="task-description">${project.done}/${project.total} งานเสร็จแล้ว · ใกล้สุด ${formatMobileDate(project.nextDue)}</p>
    </button>
  `;
}

function renderTeamSettings() {
  document.body.dataset.view = "settings";
  mobileElements.sectionTitle.textContent = "ทีมและสมาชิก";
  mobileElements.sectionSubtitle.textContent = teamState.activeOrganization
    ? teamState.activeOrganization.name
    : "สร้างทีมแรกของคุณ";

  mobileElements.taskList.innerHTML = `
    <article class="task-card">
      <div class="task-title">ผู้ใช้ปัจจุบัน</div>
      <p class="task-description">${escapeMobileHtml(teamState.user?.displayName || "ยังไม่ทราบชื่อ")}<br>${escapeMobileHtml(teamState.user?.lineUserId || "dev-user")}</p>
    </article>

    <article class="task-card">
      <div class="task-title">สร้างทีม/องค์กร</div>
      <div class="task-actions" style="margin-top: 12px;">
        <input id="organizationNameInput" placeholder="เช่น ทีมขาย, BossBoard" style="flex: 1 1 180px; min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px;" />
        <button id="createOrganizationButton" type="button">สร้างทีม</button>
      </div>
    </article>

    ${teamState.activeOrganization ? renderMembersPanel() : ""}
  `;

  document.querySelector("#createOrganizationButton")?.addEventListener("click", createOrganization);
  document.querySelector("#inviteMemberButton")?.addEventListener("click", inviteMember);
  document.querySelector("#copyInviteLinkButton")?.addEventListener("click", copyInviteLink);
  document.querySelectorAll("[data-role-member]").forEach((select) => {
    select.addEventListener("change", () => updateMemberRole(select.dataset.roleMember, select.value));
  });
  document.querySelectorAll("[data-view-profile]").forEach((button) => {
    button.addEventListener("click", () => viewMemberProfile(button.dataset.viewProfile));
  });
}

async function renderMyProfile() {
  document.body.dataset.view = "profile";
  await loadTeamState();
  renderProfilePage(teamState.user, myKpi, true);
}

function renderProfilePage(user, kpi, editable) {
  document.body.dataset.view = "profile";
  mobileElements.sectionTitle.textContent = editable ? "โปรไฟล์ของฉัน" : "โปรไฟล์สมาชิก";
  mobileElements.sectionSubtitle.textContent = user?.position || user?.department || "ข้อมูลผู้ใช้และ KPI";
  const avatar = user?.avatarUrl || user?.pictureUrl || "";
  mobileElements.taskList.innerHTML = `
    <div class="dashboard-grid">
      <section class="profile-card">
        <div class="profile-head">
          ${avatar ? `<img class="profile-avatar" src="${escapeMobileHtml(avatar)}" alt="avatar" />` : `<div class="profile-avatar">👤</div>`}
          <div>
            <div class="task-title">${escapeMobileHtml(user?.displayName || "ยังไม่ตั้งชื่อ")}</div>
            <p class="task-description">${escapeMobileHtml(user?.department || "ยังไม่ระบุแผนก")} · ${escapeMobileHtml(user?.position || "ยังไม่ระบุตำแหน่ง")}</p>
            <span class="pill status-progress">${editable ? "แก้ไขได้" : "ดู KPI"}</span>
          </div>
        </div>
        ${editable ? renderProfileForm(user) : `<p class="task-description" style="margin-top: 14px;">${escapeMobileHtml(user?.bio || "ยังไม่มีข้อมูลแนะนำตัว")}</p>`}
      </section>
      ${renderKpiCard(kpi)}
    </div>
  `;
  document.querySelector("#saveProfileButton")?.addEventListener("click", saveMyProfile);
}

function renderProfileForm(user) {
  return `
    <div class="profile-form">
      <label>รูปโปรไฟล์ URL
        <input id="profileAvatarInput" value="${escapeMobileHtml(user?.avatarUrl || user?.pictureUrl || "")}" placeholder="https://..." />
      </label>
      <label>ชื่อที่แสดง
        <input id="profileNameInput" value="${escapeMobileHtml(user?.displayName || "")}" />
      </label>
      <div class="form-row">
        <label>แผนก
          <input id="profileDepartmentInput" value="${escapeMobileHtml(user?.department || "")}" placeholder="เช่น Marketing" />
        </label>
        <label>ตำแหน่ง
          <input id="profilePositionInput" value="${escapeMobileHtml(user?.position || "")}" placeholder="เช่น Manager" />
        </label>
      </div>
      <label>เบอร์โทร
        <input id="profilePhoneInput" value="${escapeMobileHtml(user?.phone || "")}" />
      </label>
      <label>Bio
        <textarea id="profileBioInput">${escapeMobileHtml(user?.bio || "")}</textarea>
      </label>
      <button id="saveProfileButton" class="save-button" type="button">บันทึกโปรไฟล์</button>
    </div>
  `;
}

function renderKpiCard(kpi) {
  const safeKpi = kpi || { total: 0, done: 0, active: 0, overdue: 0, completionRate: 0, dueSoon: [] };
  return `
    <section class="profile-card">
      <div class="section-title-row">
        <h2>KPI งาน</h2>
        <span class="pill priority-medium">${safeKpi.completionRate}% สำเร็จ</span>
      </div>
      <div class="kpi-grid">
        <div class="kpi-item"><span>ทั้งหมด</span><strong>${safeKpi.total}</strong></div>
        <div class="kpi-item"><span>เสร็จ</span><strong>${safeKpi.done}</strong></div>
        <div class="kpi-item"><span>ค้าง</span><strong>${safeKpi.active}</strong></div>
        <div class="kpi-item"><span>เลยกำหนด</span><strong>${safeKpi.overdue}</strong></div>
      </div>
      <div style="margin-top: 14px;">
        ${(safeKpi.dueSoon || []).length ? safeKpi.dueSoon.map((task) => `<div class="mini-task"><strong>${escapeMobileHtml(task.title)}</strong><span>${formatMobileDate(task.dueDate)}</span></div>`).join("") : `<p class="task-description">ยังไม่มีงานใกล้ครบกำหนด</p>`}
      </div>
    </section>
  `;
}

async function saveMyProfile() {
  const payload = {
    avatarUrl: document.querySelector("#profileAvatarInput").value.trim(),
    displayName: document.querySelector("#profileNameInput").value.trim(),
    department: document.querySelector("#profileDepartmentInput").value.trim(),
    position: document.querySelector("#profilePositionInput").value.trim(),
    phone: document.querySelector("#profilePhoneInput").value.trim(),
    bio: document.querySelector("#profileBioInput").value.trim()
  };
  const response = await apiFetch("/api/team/me/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    showToast("บันทึกโปรไฟล์ไม่สำเร็จ");
    return;
  }
  teamState.user = await response.json();
  showToast("บันทึกโปรไฟล์แล้ว");
  renderProfilePage(teamState.user, myKpi, true);
}

function getInviteLink() {
  if (!teamState.activeOrganization) return "";
  return `https://miniapp.line.me/2010109340-Oj89MY4l?invite=${encodeURIComponent(teamState.activeOrganization.id)}`;
}

function renderMembersPanel() {
  return `
    <article class="task-card">
      <div class="task-title">${escapeMobileHtml(teamState.activeOrganization.name)}</div>
      <p class="task-description">ส่งลิงก์เชิญให้เพื่อนใน LINE หรือเพิ่มสมาชิกด้วย LINE user id</p>
      <div class="task-actions" style="margin-top: 12px;">
        <input id="inviteLinkInput" value="${escapeMobileHtml(getInviteLink())}" readonly style="flex: 1 1 220px; min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px;" />
        <button id="copyInviteLinkButton" type="button">คัดลอกลิงก์เชิญ</button>
      </div>
      <div class="task-actions" style="margin-top: 12px;">
        <input id="memberNameInput" placeholder="ชื่อสมาชิก" style="flex: 1 1 120px; min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px;" />
        <input id="memberLineIdInput" placeholder="LINE user id" style="flex: 1 1 160px; min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px;" />
        <select id="memberRoleInput" style="min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px;">
          <option>Member</option>
          <option>Manager</option>
          <option>Admin</option>
        </select>
        <button id="inviteMemberButton" type="button">เชิญ</button>
      </div>
    </article>
    <section class="task-list">
      ${teamState.members.length ? teamState.members.map(renderMemberCard).join("") : `<article class="task-card"><p class="task-description">ยังไม่มีสมาชิก</p></article>`}
    </section>
  `;
}

async function copyInviteLink() {
  const link = getInviteLink();
  try {
    await navigator.clipboard.writeText(link);
    showToast("คัดลอกลิงก์เชิญแล้ว");
  } catch {
    const input = document.querySelector("#inviteLinkInput");
    input?.select();
    showToast("คัดลอกไม่ได้ ให้กดค้างที่ลิงก์เพื่อ copy");
  }
}

function renderInviteJoin(organizationId) {
  document.querySelectorAll(".bottom-nav button").forEach((item) => item.classList.remove("active"));
  mobileElements.sectionTitle.textContent = "คำเชิญเข้าร่วมทีม";
  mobileElements.sectionSubtitle.textContent = "เปิดผ่าน LINE แล้วกดเข้าร่วมได้เลย";
  mobileElements.taskList.innerHTML = `
    <article class="task-card">
      <div class="task-title">คุณได้รับคำเชิญ</div>
      <p class="task-description">เข้าร่วมทีม ID: ${escapeMobileHtml(organizationId)}<br>ระบบจะใช้บัญชี LINE ปัจจุบันของคุณเป็นสมาชิกทีม</p>
      <div class="task-actions" style="margin-top: 12px;">
        <button id="joinTeamButton" type="button">เข้าร่วมทีม</button>
        <button id="cancelJoinButton" type="button">ไว้ก่อน</button>
      </div>
    </article>
  `;
  document.querySelector("#joinTeamButton")?.addEventListener("click", () => joinInvitedTeam(organizationId));
  document.querySelector("#cancelJoinButton")?.addEventListener("click", () => {
    pendingInviteOrganizationId = "";
    window.history.replaceState({}, "", window.location.pathname);
    renderMobile();
  });
}

async function joinInvitedTeam(organizationId) {
  const response = await apiFetch(`/api/team/organizations/${encodeURIComponent(organizationId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!response.ok) {
    showToast("เข้าร่วมทีมไม่สำเร็จ");
    return;
  }
  await loadTeamState();
  pendingInviteOrganizationId = "";
  window.history.replaceState({}, "", window.location.pathname);
  renderTeamSettings();
  showToast("เข้าร่วมทีมแล้ว");
}

function renderMemberCard(member) {
  return `
    <article class="task-card">
      <button class="member-card-button" data-view-profile="${member.user?.id || ""}" type="button">
      <div class="task-top">
        <div>
          <div class="task-title">${escapeMobileHtml(member.user?.displayName || "Unnamed")}</div>
          <p class="task-description">${escapeMobileHtml(member.user?.lineUserId || "-")}</p>
        </div>
        <span class="pill status-progress">${escapeMobileHtml(member.status)}</span>
      </div>
      </button>
      <div class="task-actions">
        <select data-role-member="${member.id}" style="min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px;">
          ${["Admin", "Manager", "Member"].map((role) => `<option ${member.role === role ? "selected" : ""}>${role}</option>`).join("")}
        </select>
      </div>
    </article>
  `;
}

async function viewMemberProfile(userId) {
  if (!userId) return;
  const response = await apiFetch(`/api/team/users/${encodeURIComponent(userId)}/profile`);
  if (!response.ok) {
    showToast("คุณไม่มีสิทธิ์ดูโปรไฟล์นี้");
    return;
  }
  const result = await response.json();
  renderProfilePage(result.user, result.kpi, result.user.id === teamState.user?.id);
}

async function createOrganization() {
  const input = document.querySelector("#organizationNameInput");
  const name = input.value.trim();
  if (!name) {
    showToast("กรุณาใส่ชื่อทีม");
    return;
  }
  const response = await apiFetch("/api/team/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    showToast("สร้างทีมไม่สำเร็จ");
    return;
  }
  await loadTeamState();
  renderTeamSettings();
  showToast("สร้างทีมแล้ว");
}

async function inviteMember() {
  const displayName = document.querySelector("#memberNameInput").value.trim();
  const lineUserId = document.querySelector("#memberLineIdInput").value.trim();
  const role = document.querySelector("#memberRoleInput").value;
  if (!displayName && !lineUserId) {
    showToast("กรุณาใส่ชื่อหรือ LINE user id");
    return;
  }
  const response = await apiFetch(`/api/team/organizations/${encodeURIComponent(teamState.activeOrganization.id)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, lineUserId, role })
  });
  if (!response.ok) {
    showToast("เชิญสมาชิกไม่สำเร็จ");
    return;
  }
  await loadOrganization(teamState.activeOrganization.id);
  renderTeamSettings();
  showToast("เพิ่มสมาชิกแล้ว");
}

async function updateMemberRole(memberId, role) {
  const response = await apiFetch(`/api/team/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role })
  });
  if (!response.ok) {
    showToast("เปลี่ยนสิทธิ์ไม่สำเร็จ");
    return;
  }
  await loadOrganization(teamState.activeOrganization.id);
  renderTeamSettings();
  showToast("เปลี่ยนสิทธิ์แล้ว");
}

function getFilteredTasks(groups) {
  if (activeFilter === "due") return groups.dueTasks;
  if (activeFilter === "mine") return groups.mineTasks;
  if (activeFilter === "done") return groups.doneTasks;
  return mobileTasks;
}

function getFilterText() {
  if (activeFilter === "due") return "งานที่ควรรีบดู";
  if (activeFilter === "mine") return PERSONAL_MODE ? "งานของฉันทั้งหมด" : "งานที่มอบหมายให้ Narin";
  if (activeFilter === "done") return "งานที่ปิดแล้ว";
  return "แสดงงานทั้งหมด";
}

function renderMobileCard(task) {
  return `
    <article class="task-card">
      <div class="task-top">
        <span class="pill ${mobileStatusMeta[task.status].className}">${mobileStatusMeta[task.status].label}</span>
        <span class="pill ${mobilePriorityMeta[task.priority].className}">${mobilePriorityMeta[task.priority].label}</span>
      </div>
      <div class="task-title">${escapeMobileHtml(task.title)}</div>
      <p class="task-description">${escapeMobileHtml(task.description || "ไม่มีรายละเอียด")}</p>
      <div class="task-bottom">
        <span>${escapeMobileHtml(task.assignee)}</span>
        <span>${formatMobileDate(task.dueDate)}</span>
      </div>
      <div class="task-actions" style="margin-top: 12px;">
        <button data-edit-task="${task.id}" type="button">แก้ไข</button>
        ${task.status !== "done" ? `<button data-done-task="${task.id}" type="button">ทำเสร็จ</button>` : ""}
      </div>
    </article>
  `;
}

function openMobileDialog(task) {
  document.querySelector("#mobileTaskId").value = task.id;
  document.querySelector("#mobileTaskTitle").value = task.title;
  document.querySelector("#mobileTaskDescription").value = task.description;
  renderAssigneeSelect(task);
  document.querySelector("#mobileTaskDueDate").value = task.dueDate;
  document.querySelector("#mobileTaskStatus").value = task.status;
  document.querySelector("#mobileTaskPriority").value = task.priority;
  mobileElements.taskDialog.showModal();
}

function renderAssigneeSelect(task) {
  const select = document.querySelector("#mobileTaskAssigneeUserId");
  const fallbackName = task.assignee || teamState.user?.displayName || "Unassigned";
  if (PERSONAL_MODE) {
    const personalName = teamState.user?.displayName || fallbackName || "ฉัน";
    select.innerHTML = `<option value="${escapeMobileHtml(teamState.user?.id || "")}" data-name="${escapeMobileHtml(personalName)}" data-organization="">${escapeMobileHtml(personalName)}</option>`;
    return;
  }
  const options = assigneeOptions.length
    ? assigneeOptions
    : teamState.user
      ? [{ user: teamState.user, organizationId: teamState.activeOrganization?.id || "" }]
      : [];
  select.innerHTML = [
    `<option value="" data-name="${escapeMobileHtml(fallbackName)}">ไม่ระบุ / ${escapeMobileHtml(fallbackName)}</option>`,
    ...options.map(
      (item) =>
        `<option value="${escapeMobileHtml(item.user.id)}" data-name="${escapeMobileHtml(item.user.displayName)}" data-organization="${escapeMobileHtml(item.organizationId || "")}" ${
          task.assigneeUserId === item.user.id ? "selected" : ""
        }>${escapeMobileHtml(item.user.displayName)}${item.role ? ` · ${escapeMobileHtml(item.role)}` : ""}</option>`
    )
  ].join("");
}

async function saveMobileTask(event) {
  event.preventDefault();
  const task = {
    id: document.querySelector("#mobileTaskId").value,
    title: document.querySelector("#mobileTaskTitle").value.trim() || "Untitled task",
    description: document.querySelector("#mobileTaskDescription").value.trim(),
    project: "LINE Mobile",
    assignee: document.querySelector("#mobileTaskAssigneeUserId").selectedOptions[0]?.dataset.name || "Unassigned",
    assigneeUserId: document.querySelector("#mobileTaskAssigneeUserId").value,
    organizationId: PERSONAL_MODE ? "" : document.querySelector("#mobileTaskAssigneeUserId").selectedOptions[0]?.dataset.organization || "",
    dueDate: document.querySelector("#mobileTaskDueDate").value,
    status: document.querySelector("#mobileTaskStatus").value,
    priority: document.querySelector("#mobileTaskPriority").value,
    tags: ["LIFF"],
    activity: []
  };

  const exists = mobileTasks.some((currentTask) => currentTask.id === task.id);
  try {
    await persistTask(task, exists);
    mobileElements.taskDialog.close();
    renderMobile();
    showToast("บันทึกงานแล้ว");
  } catch {
    showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

function createMobileTask() {
  return {
    id: `task-${Date.now()}`,
    title: "",
    description: "",
    project: "LINE Mobile",
    assignee: teamState.user?.displayName || "Narin",
    assigneeUserId: teamState.user?.id || "",
    organizationId: PERSONAL_MODE ? "" : teamState.activeOrganization?.id || "",
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    status: "todo",
    priority: "medium",
    tags: ["LIFF"],
    activity: []
  };
}

function showToast(message) {
  mobileElements.toast.textContent = message;
  mobileElements.toast.classList.remove("hidden");
  window.setTimeout(() => mobileElements.toast.classList.add("hidden"), 2200);
}

function formatMobileDate(value) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function escapeMobileHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitials(value) {
  const text = String(value || "ฉัน").trim();
  if (!text) return "ฉัน";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

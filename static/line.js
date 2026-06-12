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
let currentLineAccessToken = "";
let currentLiffId = "";
let currentLineLoginRedirectUri = "";
let isLiffInitialized = false;
let isLineLoginPending = false;
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
let selectedReminderTaskIds = new Set();
let reminderSettings = null;
let mobileProjects = [];

const PROJECT_ICON_OPTIONS = [
  { value: "folder", icon: "folder", label: "โฟลเดอร์" },
  { value: "campaign", icon: "campaign", label: "แคมเปญ" },
  { value: "favorite", icon: "favorite", label: "หัวใจ" },
  { value: "star", icon: "star", label: "ดาว" },
  { value: "task_alt", icon: "task_alt", label: "เช็กลิสต์" },
  { value: "flag", icon: "flag", label: "เป้าหมาย" }
];

const PROJECT_COLOR_OPTIONS = ["#ff8a00", "#55ef7a", "#00d5ee", "#ff3366", "#ffea00"];

const PROJECT_PRIORITY_OPTIONS = [
  { value: "normal", label: "ปกติ" },
  { value: "urgent", label: "ด่วน" },
  { value: "critical", label: "ด่วนมาก" }
];

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
  selectedProjectName = "";
  setActiveNav("create");
  renderCreateTaskPage();
});
mobileElements.closeDialogButton.addEventListener("click", () => mobileElements.taskDialog.close());
mobileElements.mobileTaskForm.addEventListener("submit", saveMobileTask);
document.querySelector("#mobileTaskDeleteButton")?.addEventListener("click", () => {
  const taskId = document.querySelector("#mobileTaskId").value;
  deleteTaskWithConfirmation(taskId);
});
mobileElements.lineLoginButton.addEventListener("click", () => {
  loginWithLine();
});

document.querySelectorAll(".bottom-nav button").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.navView || "home";
    setActiveNav(view);
    if (view === "create") {
      selectedProjectName = "";
      renderCreateTaskPage();
    }
    else if (view === "tasks") {
      selectedProjectName = "";
      renderMyTasksPage();
    }
    else if (view === "projects") {
      selectedProjectName = "";
      renderProjectsPage();
    }
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

// Utility action pass: clear exits, cancel controls, bulk delete, and project removal.
function renderCreateTaskPage(seedTask = createMobileTask()) {
  document.body.dataset.view = "create";
  const exists = seedTask.id && mobileTasks.some((task) => task.id === seedTask.id);
  mobileElements.sectionTitle.textContent = exists ? "แก้ไขรายการเตือน" : "เพิ่มรายการเตือน";
  mobileElements.sectionSubtitle.textContent = "บันทึกเองได้ หรือพิมพ์จาก LINE ให้ระบบช่วยจดก็ได้";

  const userName = teamState.user?.displayName || "ฉัน";
  const projectNames = getProjectNames(seedTask.project);
  const selectedProject = projectNames.includes(seedTask.project) ? seedTask.project : "";
  mobileElements.taskList.innerHTML = `
    <form id="createTaskPageForm" class="create-task-page">
      <div class="utility-topbar">
        <button class="utility-back-button" data-create-back type="button">← กลับ</button>
        <button class="utility-ghost-button" data-create-cancel type="button">ยกเลิก</button>
      </div>
      <label>ชื่อรายการ
        <input id="createTaskTitle" value="${escapeMobileHtml(seedTask.title)}" placeholder="เช่น ประชุมลูกค้า, กินยา, ส่งรายงาน" required />
      </label>
      <label>รายละเอียด
        <textarea id="createTaskDescription" placeholder="ใส่รายละเอียดเพิ่ม ถ้ามี">${escapeMobileHtml(seedTask.description || "")}</textarea>
      </label>
      <label>หมวด / โปรเจกต์
        <select id="createTaskProject">
          ${projectNames.map((name) => `<option value="${escapeMobileHtml(name)}" ${name === selectedProject ? "selected" : ""}>${escapeMobileHtml(name)}</option>`).join("")}
          <option value="__new">+ สร้างโปรเจกต์ใหม่</option>
        </select>
      </label>
      <label id="newProjectLabel" class="${selectedProject ? "hidden" : ""}">ชื่อโปรเจกต์ใหม่
        <input id="newTaskProject" value="${selectedProject ? "" : escapeMobileHtml(seedTask.project || "")}" placeholder="เช่น งานส่วนตัว, ลูกค้า A" />
      </label>
      <label>วันครบกำหนด
        <input id="createTaskDueDate" value="${escapeMobileHtml(seedTask.dueDate)}" type="date" required />
      </label>
      <label>เวลาเตือน
        <input id="createTaskDueTime" value="${escapeMobileHtml(seedTask.dueTime || "")}" type="time" />
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
      <div class="form-actions-row">
        <button class="create-submit-button" type="submit">${exists ? "บันทึกการแก้ไข" : "สร้างรายการเตือน"}</button>
        ${exists ? `<button class="danger-outline-button" id="deleteTaskPageButton" type="button">ลบรายการนี้</button>` : ""}
      </div>
    </form>
  `;

  const goBack = () => {
    if (selectedProjectName) {
      setActiveNav("projects");
      renderProjectDetailPage(selectedProjectName);
      return;
    }
    setActiveNav("tasks");
    renderMyTasksPage();
  };
  document.querySelector("[data-create-back]")?.addEventListener("click", goBack);
  document.querySelector("[data-create-cancel]")?.addEventListener("click", async () => {
    const hasText = document.querySelector("#createTaskTitle")?.value.trim() || document.querySelector("#createTaskDescription")?.value.trim();
    if (hasText && !exists) {
      const confirmed = await confirmAction({
        title: "ยกเลิกการเพิ่มรายการ?",
        message: "ข้อมูลที่พิมพ์ไว้ในฟอร์มนี้จะไม่ถูกบันทึก",
        confirmText: "ยกเลิกเลย"
      });
      if (!confirmed) return;
    }
    goBack();
  });
  document.querySelector("#createTaskProject")?.addEventListener("change", (event) => {
    document.querySelector("#newProjectLabel")?.classList.toggle("hidden", event.target.value !== "__new");
  });
  document.querySelector("#createTaskPageForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const projectSelect = document.querySelector("#createTaskProject").value;
    const projectName = projectSelect === "__new"
      ? document.querySelector("#newTaskProject").value.trim()
      : projectSelect;
    if (!projectName) {
      showToast("กรุณาเลือกหรือสร้างโปรเจกต์");
      return;
    }
    const task = {
      ...seedTask,
      title: document.querySelector("#createTaskTitle").value.trim() || "Untitled task",
      description: document.querySelector("#createTaskDescription").value.trim(),
      project: projectName,
      assignee: userName,
      assigneeUserId: teamState.user?.id || "",
      organizationId: "",
      dueDate: document.querySelector("#createTaskDueDate").value,
      dueTime: document.querySelector("#createTaskDueTime").value,
      status: document.querySelector("#createTaskStatus").value,
      priority: document.querySelector("#createTaskPriority").value,
      tags: ["LIFF"],
      activity: []
    };
    try {
      if (projectSelect === "__new") {
        await saveProjectToApi({ name: projectName, description: "สร้างจากหน้าเพิ่มรายการเตือน" });
      }
      await persistTask(task, exists);
      goBack();
      showToast(exists ? "บันทึกการแก้ไขแล้ว" : "สร้างรายการเตือนแล้ว");
    } catch {
      showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  });
  document.querySelector("#deleteTaskPageButton")?.addEventListener("click", () => deleteTaskWithConfirmation(seedTask.id));
}

// Final undo handlers. Keep this block last so it wins over legacy duplicate functions above.
function showToast(message, action = null) {
  if (!mobileElements.toast) return;
  if (toastTimerId) window.clearTimeout(toastTimerId);
  const actionConfig = typeof action === "function"
    ? { label: "ย้อนกลับ", run: action }
    : action;
  mobileElements.toast.classList.toggle("has-action", Boolean(actionConfig?.run));
  mobileElements.toast.innerHTML = `
    <span>${escapeMobileHtml(message)}</span>
    ${actionConfig?.run ? `<button class="toast-action" type="button">${escapeMobileHtml(actionConfig.label || "ย้อนกลับ")}</button>` : ""}
  `;
  mobileElements.toast.classList.remove("hidden");
  mobileElements.toast.querySelector(".toast-action")?.addEventListener("click", async () => {
    if (toastTimerId) window.clearTimeout(toastTimerId);
    mobileElements.toast.classList.add("hidden");
    try {
      await actionConfig.run();
    } catch {
      showToast(actionConfig.errorMessage || "ย้อนกลับไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }, { once: true });
  toastTimerId = window.setTimeout(() => {
    mobileElements.toast.classList.add("hidden");
    mobileElements.toast.classList.remove("has-action");
  }, actionConfig?.run ? 6500 : 2400);
}

function showUndoToast(message, undoAction) {
  showToast(message, { label: "ย้อนกลับ", run: undoAction });
}

function cloneBossboardItem(item) {
  return typeof structuredClone === "function" ? structuredClone(item) : JSON.parse(JSON.stringify(item));
}

function renderAfterTaskMutation(fallbackRender = null) {
  if (typeof fallbackRender === "function") {
    fallbackRender();
    return;
  }
  const view = document.body.dataset.view || "";
  if (view.includes("project-detail") && selectedProjectName) {
    renderProjectDetailPage(selectedProjectName);
    return;
  }
  if (view.includes("tasks") || view.includes("reminder-list") || view.includes("create") || view.includes("task-detail")) {
    setActiveNav("tasks");
    renderMyTasksPage();
    return;
  }
  if (view.includes("projects")) {
    setActiveNav("projects");
    renderProjectsPage();
    return;
  }
  renderMobile();
}

async function updateReminderStatus(taskId, status, activityText, afterRender = null) {
  const beforeTask = mobileTasks.find((task) => task.id === taskId);
  if (!beforeTask) return;
  const previousTask = cloneBossboardItem(beforeTask);
  try {
    const updatedTask = await patchTaskToApi(taskId, { status, activityText });
    mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    renderAfterTaskMutation(afterRender);
    if (status === "done") {
      showUndoToast("บันทึกว่าเสร็จแล้ว", async () => {
        const restoredTask = await patchTaskToApi(taskId, {
          status: previousTask.status || "todo",
          activityText: "ย้อนกลับสถานะจากปุ่ม Undo"
        });
        mobileTasks = mobileTasks.map((task) => (task.id === restoredTask.id ? restoredTask : task));
        renderAfterTaskMutation(afterRender);
        showToast("ย้อนกลับสถานะแล้ว");
      });
      return;
    }
    showToast(status === "progress" ? "ย้ายไปกำลังทำแล้ว" : "อัปเดตสถานะแล้ว");
  } catch {
    showToast("อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function restoreDeletedTasks(tasks, rerender = null) {
  const restoredTasks = [];
  for (const task of tasks) {
    const savedTask = await saveTaskToApi(task, false);
    restoredTasks.push(savedTask);
  }
  mobileTasks = [
    ...restoredTasks,
    ...mobileTasks.filter((task) => !restoredTasks.some((restored) => restored.id === task.id))
  ];
  selectedReminderTaskIds.clear();
  await loadProjects().catch(() => {});
  renderAfterTaskMutation(rerender);
  showToast(tasks.length > 1 ? `กู้คืน ${tasks.length} รายการแล้ว` : "กู้คืนงานแล้ว");
}

async function deleteTaskWithConfirmation(taskId) {
  const task = mobileTasks.find((item) => item.id === taskId);
  if (!task) return;
  const confirmed = await confirmAction({
    title: "ลบรายการนี้?",
    message: `งาน "${task.title || "รายการนี้"}" จะถูกลบออกจาก BossBoard แต่ข้อความเดิมใน LINE จะยังอยู่`,
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  const deletedTask = cloneBossboardItem(task);
  try {
    await deleteTaskFromApi(taskId);
    mobileTasks = mobileTasks.filter((item) => item.id !== taskId);
    selectedReminderTaskIds.delete(taskId);
    renderAfterTaskMutation();
    showUndoToast("ลบงานแล้ว", () => restoreDeletedTasks([deletedTask]));
  } catch {
    showToast("ลบงานไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteSelectedReminderTasks() {
  const ids = [...selectedReminderTaskIds];
  if (!ids.length) return;
  const deletedTasks = mobileTasks
    .filter((task) => selectedReminderTaskIds.has(task.id))
    .map(cloneBossboardItem);
  const confirmed = await confirmAction({
    title: `ลบ ${ids.length} รายการ?`,
    message: "รายการที่เลือกจะถูกลบออกจาก BossBoard แต่กด Undo เพื่อกู้คืนทันทีได้",
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(ids.map((id) => deleteTaskFromApi(id)));
    mobileTasks = mobileTasks.filter((task) => !selectedReminderTaskIds.has(task.id));
    selectedReminderTaskIds.clear();
    renderMyTasksPage();
    showUndoToast(`ลบ ${deletedTasks.length} รายการแล้ว`, () => restoreDeletedTasks(deletedTasks, renderMyTasksPage));
  } catch {
    showToast("ลบบางรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteProjectWithConfirmation(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const savedProject = cloneBossboardItem(project);
  const savedTasks = projectTasks.map(cloneBossboardItem);
  const confirmed = await confirmAction({
    title: `ลบโปรเจกต์ "${project.name}"?`,
    message: projectTasks.length
      ? `มีงานอยู่ ${projectTasks.length} รายการ ระบบจะย้ายงานไป Inbox ก่อนลบโปรเจกต์ และกด Undo ได้ทันที`
      : "โปรเจกต์นี้จะถูกลบออกจากรายการ และกด Undo ได้ทันที",
    confirmText: "ลบโปรเจกต์",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(projectTasks.map((task) => patchTaskToApi(task.id, {
      project: "Inbox",
      activityText: `ย้ายออกจากโปรเจกต์ ${project.name} ก่อนลบโปรเจกต์`
    })));
    const realProject = mobileProjects.find((item) => item.id === project.id || item.name === project.name);
    if (realProject?.id) await deleteProjectFromApi(realProject.id);
    await Promise.all([loadMobileTasks(), loadProjects()]);
    selectedProjectName = "";
    renderProjectsPage();
    showUndoToast("ลบโปรเจกต์แล้ว งานถูกย้ายไป Inbox", async () => {
      await saveProjectToApi(savedProject);
      await Promise.all(savedTasks.map((task) => patchTaskToApi(task.id, {
        project: savedProject.name,
        activityText: `กู้คืนกลับเข้าโปรเจกต์ ${savedProject.name}`
      })));
      await Promise.all([loadMobileTasks(), loadProjects()]);
      selectedProjectName = savedProject.name;
      renderProjectDetailPage(savedProject.name);
      showToast("กู้คืนโปรเจกต์แล้ว");
    });
  } catch {
    showToast("ลบโปรเจกต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

let bossboardToastTimer = null;

function showToast(message, options = {}) {
  if (!mobileElements.toast) return;
  const normalizedOptions = typeof options === "function"
    ? { actionText: "Undo", onAction: options }
    : options;
  window.clearTimeout(bossboardToastTimer);
  mobileElements.toast.classList.toggle("has-action", Boolean(normalizedOptions?.onAction));
  mobileElements.toast.innerHTML = `
    <span>${escapeMobileHtml(message)}</span>
    ${normalizedOptions?.onAction ? `<button class="toast-action" type="button">${escapeMobileHtml(normalizedOptions.actionText || "Undo")}</button>` : ""}
  `;
  mobileElements.toast.classList.remove("hidden");
  mobileElements.toast.querySelector(".toast-action")?.addEventListener("click", async () => {
    window.clearTimeout(bossboardToastTimer);
    mobileElements.toast.classList.add("hidden");
    try {
      await normalizedOptions.onAction();
    } catch {
      showToast("ย้อนกลับไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }, { once: true });
  bossboardToastTimer = window.setTimeout(() => {
    mobileElements.toast.classList.add("hidden");
    mobileElements.toast.classList.remove("has-action");
  }, normalizedOptions?.duration || 5200);
}

function showUndoToast(message, onUndo, duration = 6500) {
  showToast(message, { actionText: "ย้อนกลับ", onAction: onUndo, duration });
}

function renderAfterTaskMutation(fallbackRender = null) {
  const view = document.body.dataset.view || "";
  if (typeof fallbackRender === "function") {
    fallbackRender();
    return;
  }
  if (view.includes("project-detail") && selectedProjectName) {
    renderProjectDetailPage(selectedProjectName);
    return;
  }
  if (view.includes("tasks") || view.includes("reminder-list")) {
    renderMyTasksPage();
    return;
  }
  if (view.includes("projects")) {
    renderProjectsPage();
    return;
  }
  renderMobile();
}

async function updateReminderStatus(taskId, status, activityText, afterRender = null) {
  const beforeTask = mobileTasks.find((task) => task.id === taskId);
  if (!beforeTask) return;
  const previousTask = typeof structuredClone === "function" ? structuredClone(beforeTask) : JSON.parse(JSON.stringify(beforeTask));
  try {
    const updatedTask = await patchTaskToApi(taskId, { status, activityText });
    mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    renderAfterTaskMutation(afterRender);
    if (status === "done") {
      showUndoToast("บันทึกว่าเสร็จแล้ว", async () => {
        const restoredTask = await patchTaskToApi(taskId, {
          status: previousTask.status || "todo",
          activityText: "ย้อนกลับสถานะจากปุ่ม Undo"
        });
        mobileTasks = mobileTasks.map((task) => (task.id === restoredTask.id ? restoredTask : task));
        renderAfterTaskMutation(afterRender);
        showToast("ย้อนกลับสถานะแล้ว");
      });
      return;
    }
    showToast(status === "progress" ? "ย้ายไปกำลังทำแล้ว" : "อัปเดตสถานะแล้ว");
  } catch {
    showToast("อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function restoreDeletedTasks(tasks, rerender = renderMyTasksPage) {
  if (!tasks.length) return;
  const restoredTasks = [];
  for (const task of tasks) {
    const savedTask = await saveTaskToApi(task, false);
    restoredTasks.push(savedTask);
  }
  mobileTasks = [
    ...restoredTasks,
    ...mobileTasks.filter((task) => !restoredTasks.some((restored) => restored.id === task.id))
  ];
  selectedReminderTaskIds.clear();
  await loadProjects().catch(() => {});
  rerender();
  showToast(tasks.length > 1 ? `กู้คืน ${tasks.length} รายการแล้ว` : "กู้คืนงานแล้ว");
}

async function deleteTaskWithConfirmation(taskId) {
  const task = mobileTasks.find((item) => item.id === taskId);
  if (!task) return;
  const confirmed = await confirmAction({
    title: "ลบรายการนี้?",
    message: `งาน "${task.title || "รายการนี้"}" จะถูกลบออกจาก BossBoard แต่ข้อความเดิมใน LINE จะยังอยู่`,
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  const deletedTask = typeof structuredClone === "function" ? structuredClone(task) : JSON.parse(JSON.stringify(task));
  try {
    await deleteTaskFromApi(taskId);
    mobileTasks = mobileTasks.filter((item) => item.id !== taskId);
    selectedReminderTaskIds.delete(taskId);
    renderAfterTaskMutation();
    showUndoToast("ลบงานแล้ว", () => restoreDeletedTasks([deletedTask], () => renderAfterTaskMutation()));
  } catch {
    showToast("ลบงานไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteSelectedReminderTasks() {
  const ids = [...selectedReminderTaskIds];
  if (!ids.length) return;
  const deletedTasks = mobileTasks
    .filter((task) => selectedReminderTaskIds.has(task.id))
    .map((task) => (typeof structuredClone === "function" ? structuredClone(task) : JSON.parse(JSON.stringify(task))));
  const confirmed = await confirmAction({
    title: `ลบ ${ids.length} รายการ?`,
    message: "รายการที่เลือกจะถูกลบออกจาก BossBoard แต่ยังสามารถกด Undo เพื่อกู้คืนทันทีได้",
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(ids.map((id) => deleteTaskFromApi(id)));
    mobileTasks = mobileTasks.filter((task) => !selectedReminderTaskIds.has(task.id));
    selectedReminderTaskIds.clear();
    renderMyTasksPage();
    showUndoToast(`ลบ ${deletedTasks.length} รายการแล้ว`, () => restoreDeletedTasks(deletedTasks, renderMyTasksPage));
  } catch {
    showToast("ลบบางรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteProjectWithConfirmation(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const savedProject = typeof structuredClone === "function" ? structuredClone(project) : JSON.parse(JSON.stringify(project));
  const savedTasks = projectTasks.map((task) => (typeof structuredClone === "function" ? structuredClone(task) : JSON.parse(JSON.stringify(task))));
  const confirmed = await confirmAction({
    title: `ลบโปรเจกต์ "${project.name}"?`,
    message: projectTasks.length
      ? `มีงานอยู่ ${projectTasks.length} รายการ ระบบจะย้ายงานไป Inbox ก่อนลบโปรเจกต์ และกด Undo ได้ทันที`
      : "โปรเจกต์นี้จะถูกลบออกจากรายการ และกด Undo ได้ทันที",
    confirmText: "ลบโปรเจกต์",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(projectTasks.map((task) => patchTaskToApi(task.id, {
      project: "Inbox",
      activityText: `ย้ายออกจากโปรเจกต์ ${project.name} ก่อนลบโปรเจกต์`
    })));
    const realProject = mobileProjects.find((item) => item.id === project.id || item.name === project.name);
    if (realProject?.id) await deleteProjectFromApi(realProject.id);
    await Promise.all([loadMobileTasks(), loadProjects()]);
    selectedProjectName = "";
    renderProjectsPage();
    showUndoToast("ลบโปรเจกต์แล้ว งานถูกย้ายไป Inbox", async () => {
      await saveProjectToApi(savedProject);
      await Promise.all(savedTasks.map((task) => patchTaskToApi(task.id, {
        project: savedProject.name,
        activityText: `กู้คืนกลับเข้าโปรเจกต์ ${savedProject.name}`
      })));
      await Promise.all([loadMobileTasks(), loadProjects()]);
      selectedProjectName = savedProject.name;
      renderProjectDetailPage(savedProject.name);
      showToast("กู้คืนโปรเจกต์แล้ว");
    });
  } catch {
    showToast("ลบโปรเจกต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

// Undo layer for risky actions. Defined last so it wins over earlier legacy handlers.
let toastTimerId = null;

function renderAfterTaskMutation() {
  const view = document.body.dataset.view || "";
  if (view.includes("project-detail") && selectedProjectName) {
    renderProjectDetailPage(selectedProjectName);
  } else if (view.includes("tasks")) {
    renderMyTasksPage();
  } else if (view.includes("create")) {
    setActiveNav("tasks");
    renderMyTasksPage();
  } else if (view.includes("task-detail")) {
    renderMyTasksPage();
  } else {
    renderMobile();
  }
}

function showToast(message, action) {
  if (!mobileElements.toast) return;
  if (toastTimerId) window.clearTimeout(toastTimerId);
  mobileElements.toast.classList.toggle("has-action", !!action);
  mobileElements.toast.innerHTML = `
    <span>${escapeMobileHtml(message)}</span>
    ${action ? `<button type="button">${escapeMobileHtml(action.label || "Undo")}</button>` : ""}
  `;
  mobileElements.toast.classList.remove("hidden");
  if (action) {
    mobileElements.toast.querySelector("button")?.addEventListener("click", async () => {
      if (toastTimerId) window.clearTimeout(toastTimerId);
      mobileElements.toast.classList.add("hidden");
      try {
        await action.run();
      } catch {
        showToast(action.errorMessage || "ย้อนกลับไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    }, { once: true });
  }
  toastTimerId = window.setTimeout(() => {
    mobileElements.toast.classList.add("hidden");
    mobileElements.toast.classList.remove("has-action");
  }, action ? 6500 : 2200);
}

function showUndoToast(message, undoAction) {
  showToast(message, {
    label: "Undo",
    run: undoAction,
    errorMessage: "Undo ไม่สำเร็จ ลองใหม่อีกครั้ง"
  });
}

async function updateReminderStatus(taskId, status, activityText, afterRender = renderAfterTaskMutation) {
  const beforeTask = mobileTasks.find((task) => task.id === taskId);
  if (!beforeTask) return;
  try {
    const updatedTask = await patchTaskToApi(taskId, { status, activityText });
    mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    afterRender();
    if (status === "done") {
      showUndoToast("บันทึกว่าเสร็จแล้ว", async () => {
        const restoredTask = await patchTaskToApi(taskId, {
          status: beforeTask.status,
          activityText: `Undo: กลับสถานะเป็น ${mobileStatusMeta[beforeTask.status]?.label || beforeTask.status}`
        });
        mobileTasks = mobileTasks.map((task) => (task.id === restoredTask.id ? restoredTask : task));
        afterRender();
        showToast("ย้อนกลับสถานะแล้ว");
      });
    } else {
      showToast("อัปเดตสถานะแล้ว");
    }
  } catch {
    showToast("อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteTaskWithConfirmation(taskId) {
  const task = mobileTasks.find((item) => item.id === taskId);
  if (!task) return;
  const confirmed = await confirmAction({
    title: "ลบรายการนี้?",
    message: `รายการ "${task.title}" จะถูกลบออกจาก BossBoard แต่ยัง Undo ได้ชั่วคราวหลังลบ`,
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  try {
    const deletedTask = { ...task, activity: Array.isArray(task.activity) ? [...task.activity] : [] };
    await deleteTaskFromApi(taskId);
    mobileTasks = mobileTasks.filter((item) => item.id !== taskId);
    if (mobileElements.taskDialog?.open) mobileElements.taskDialog.close();
    renderAfterTaskMutation();
    showUndoToast("ลบรายการแล้ว", async () => {
      const restoredTask = await saveTaskToApi({
        ...deletedTask,
        activity: [
          { id: `activity-${Date.now()}`, text: "Undo: กู้คืนรายการที่ลบ", time: "ตอนนี้" },
          ...(deletedTask.activity || [])
        ]
      }, false);
      mobileTasks = [restoredTask, ...mobileTasks.filter((item) => item.id !== restoredTask.id)];
      renderAfterTaskMutation();
      showToast("กู้คืนรายการแล้ว");
    });
  } catch {
    showToast("ลบรายการไม่สำเร็จ");
  }
}

async function deleteSelectedReminderTasks() {
  const ids = [...selectedReminderTaskIds];
  if (!ids.length) return;
  const deletedTasks = mobileTasks
    .filter((task) => selectedReminderTaskIds.has(task.id))
    .map((task) => ({ ...task, activity: Array.isArray(task.activity) ? [...task.activity] : [] }));
  const confirmed = await confirmAction({
    title: `ลบ ${ids.length} รายการ?`,
    message: "รายการที่เลือกจะถูกลบออกจาก BossBoard แต่ยัง Undo ได้ชั่วคราวหลังลบ",
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(ids.map((id) => deleteTaskFromApi(id)));
    mobileTasks = mobileTasks.filter((task) => !selectedReminderTaskIds.has(task.id));
    selectedReminderTaskIds.clear();
    renderMyTasksPage();
    showUndoToast(`ลบ ${deletedTasks.length} รายการแล้ว`, async () => {
      const restoredTasks = await Promise.all(deletedTasks.map((task, index) =>
        saveTaskToApi({
          ...task,
          activity: [
            { id: `activity-${Date.now()}-${index}`, text: "Undo: กู้คืนรายการที่ลบ", time: "ตอนนี้" },
            ...(task.activity || [])
          ]
        }, false)
      ));
      const restoredIds = new Set(restoredTasks.map((task) => task.id));
      mobileTasks = [
        ...restoredTasks,
        ...mobileTasks.filter((task) => !restoredIds.has(task.id))
      ];
      renderMyTasksPage();
      showToast("กู้คืนรายการที่ลบแล้ว");
    });
  } catch {
    showToast("ลบบางรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

function renderProjectDetailPage(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const openTasks = projectTasks.filter((task) => task.status !== "done").sort(sortTasksByDueDate);
  const doneTasks = projectTasks.filter((task) => task.status === "done").sort(sortTasksByDueDate);
  const nextTask = openTasks[0];
  const total = projectTasks.length;
  const done = doneTasks.length;
  const percent = Math.round((done / Math.max(total, 1)) * 100);
  const projectColor = project.color || "#ff8a00";
  const projectIcon = PROJECT_ICON_OPTIONS.find((item) => item.value === project.icon)?.icon || project.icon || "folder";

  document.body.dataset.view = "project-detail";
  mobileElements.sectionTitle.textContent = project.name;
  mobileElements.sectionSubtitle.textContent = "งานในโปรเจกต์นี้และขั้นตอนถัดไป";
  mobileElements.taskList.innerHTML = `
    <div class="project-detail-screen" style="--project-color:${escapeMobileHtml(projectColor)}">
      <div class="utility-topbar">
        <button class="detail-back-button" data-project-back type="button">← โปรเจกต์</button>
        <button class="danger-outline-button compact" data-project-delete type="button">ลบโปรเจกต์</button>
      </div>
      <section class="project-detail-hero">
        <div class="project-detail-icon">
          <span class="material-symbols-outlined">${escapeMobileHtml(projectIcon)}</span>
        </div>
        <div class="project-detail-main">
          <span class="settings-kicker">PROJECT</span>
          <h2>${escapeMobileHtml(project.name)}</h2>
          <p>${escapeMobileHtml(project.description || "รวมรายการเตือนและงานที่เกี่ยวกับเรื่องนี้ไว้ด้วยกัน")}</p>
          <div class="project-progress-bar"><span style="width:${percent}%"></span></div>
          <div class="project-detail-stats">
            <span>เสร็จแล้ว ${done}/${total}</span>
            <strong>${percent}%</strong>
          </div>
        </div>
      </section>
      <section class="project-next-card">
        <div class="section-title-row">
          <h2>งานถัดไป</h2>
          <button class="view-all-link" data-project-add-task type="button">+ เพิ่มงาน</button>
        </div>
        ${nextTask ? renderProjectNextTask(nextTask) : `<article class="mission-empty-card"><strong>ยังไม่มีงานค้างในโปรเจกต์นี้</strong></article>`}
      </section>
      <section class="project-task-list-card">
        <div class="section-title-row">
          <h2>งานในโปรเจกต์</h2>
          <span class="count-pill">${total}</span>
        </div>
        <div class="personal-task-list">
          ${projectTasks.length ? projectTasks.sort(sortTasksByDueDate).map(renderPersonalTaskRow).join("") : renderEmptyPersonalTasks()}
        </div>
      </section>
    </div>
  `;
  wireProjectDetailActions(project.name);
  mobileElements.taskList.querySelector("[data-project-delete]")?.addEventListener("click", () => deleteProjectWithConfirmation(project.name));
}

async function deleteProjectWithConfirmation(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const confirmed = await confirmAction({
    title: `ลบโปรเจกต์ "${project.name}"?`,
    message: projectTasks.length
      ? `มีงานอยู่ ${projectTasks.length} รายการ ระบบจะย้ายงานเหล่านี้กลับไปที่ Inbox ก่อนลบโปรเจกต์`
      : "โปรเจกต์นี้จะถูกลบออกจากรายการ",
    confirmText: "ลบโปรเจกต์",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(projectTasks.map((task) => patchTaskToApi(task.id, {
      project: "Inbox",
      activityText: `ย้ายออกจากโปรเจกต์ ${project.name} ก่อนลบโปรเจกต์`
    })));
    const realProject = mobileProjects.find((item) => item.id === project.id || item.name === project.name);
    if (realProject?.id) await deleteProjectFromApi(realProject.id);
    await Promise.all([loadMobileTasks(), loadProjects()]);
    selectedProjectName = "";
    renderProjectsPage();
    showToast("ลบโปรเจกต์แล้ว งานถูกย้ายไป Inbox");
  } catch {
    showToast("ลบโปรเจกต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

initializeApp();

async function initializeApp() {
  const lineReady = await initializeLine();
  if (lineReady || isLocalPreview()) {
    await loadMobileTasks();
  } else {
    renderLineLoginRequired();
  }
}

function isLocalPreview() {
  return ["127.0.0.1", "localhost"].includes(window.location.hostname);
}

async function loginWithLine() {
  if (isLineLoginPending) return;
  isLineLoginPending = true;
  mobileElements.lineLoginButton.disabled = true;

  try {
    if (!window.liff) throw new Error("LIFF SDK is unavailable");

    if (!isLiffInitialized) {
      const response = await fetch("/api/line/config", { cache: "no-store" });
      if (!response.ok) throw new Error("Cannot load LIFF configuration");
      const config = await response.json();
      currentLiffId = config.liffId || "";
      currentLineLoginRedirectUri = config.loginRedirectUri || getLineLoginRedirectUri();
      if (!currentLiffId) throw new Error("LIFF ID is missing");
      await window.liff.init({
        liffId: currentLiffId,
        withLoginOnExternalBrowser: false
      });
      isLiffInitialized = true;
    }

    if (window.liff.isLoggedIn()) {
      window.location.replace(currentLineLoginRedirectUri || getLineLoginRedirectUri());
      return;
    }

    window.liff.login({
      redirectUri: currentLineLoginRedirectUri || getLineLoginRedirectUri()
    });
  } catch (error) {
    console.error("LINE login failed", error);
    const reason = error?.code || error?.message || "unknown error";
    setLineStatus(
      "เข้า LINE ไม่สำเร็จ",
      `ตรวจ Endpoint URL ของ MINI App ให้เป็น ${getLineLoginRedirectUri()} (${reason})`
    );
    mobileElements.lineLoginButton.classList.remove("hidden");
    mobileElements.lineLoginButton.disabled = false;
    isLineLoginPending = false;
  }
}

function getLineLoginRedirectUri() {
  const path = window.location.pathname === "/line.html" ? "/line.html" : "/line";
  return `${window.location.origin}${path}`;
}

async function initializeLine() {
  try {
    const response = await fetch("/api/line/config", { cache: "no-store" });
    const config = await response.json();
    currentLiffId = config.liffId || "";
    currentLineLoginRedirectUri = config.loginRedirectUri || getLineLoginRedirectUri();

    if (!config.isLiffConfigured) {
      setLineStatus("ยังไม่ตั้งค่า LIFF", "ใส่ LINE_LIFF_ID ในไฟล์ .env แล้ว restart server");
      return false;
    }

    if (!window.liff) {
      setLineStatus("โหลด LIFF SDK ไม่ได้", "ตรวจสอบ internet หรือเปิดผ่าน LINE อีกครั้ง");
      return false;
    }

    await window.liff.init({
      liffId: currentLiffId,
      withLoginOnExternalBrowser: false
    });
    isLiffInitialized = true;
    if (!window.liff.isLoggedIn()) {
      setLineStatus("ยังไม่ได้เข้า LINE", "กดเข้า LINE เพื่อยืนยันตัวตนและเปิดพื้นที่งานส่วนตัว");
      mobileElements.lineLoginButton.classList.remove("hidden");
      return false;
    }

    const profile = await window.liff.getProfile();
    currentLineUserId = profile.userId;
    currentLineIdToken = window.liff.getIDToken ? window.liff.getIDToken() || "" : "";
    currentLineAccessToken = window.liff.getAccessToken ? window.liff.getAccessToken() || "" : "";
    if (!currentLineIdToken && !currentLineAccessToken) {
      currentLineUserId = "";
      setLineStatus("ยืนยัน LINE ไม่สำเร็จ", "LINE ไม่ได้ส่ง token กลับมา กรุณาปิดหน้าต่างนี้แล้วเปิด MINI App ใหม่");
      mobileElements.lineLoginButton.classList.remove("hidden");
      return false;
    }
    const profileResponse = await fetch("/api/line/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(currentLineIdToken ? { "x-line-id-token": currentLineIdToken } : {}),
        ...(currentLineAccessToken ? { Authorization: `Bearer ${currentLineAccessToken}` } : {})
      },
      body: JSON.stringify(profile)
    });
    if (!profileResponse.ok) {
      const result = await profileResponse.json().catch(() => ({}));
      throw new Error(result.error || `Cannot verify LINE profile (${profileResponse.status})`);
    }
    isLineLoginPending = false;
    mobileElements.lineLoginButton.disabled = false;
    setLineStatus("เชื่อม LINE แล้ว", `สวัสดี ${profile.displayName}`);
    mobileElements.lineLoginButton.classList.add("hidden");
    await loadTeamState();
    handleInviteFromQuery();
    return true;
  } catch (error) {
    console.error(error);
    currentLineUserId = "";
    currentLineIdToken = "";
    currentLineAccessToken = "";
    const reason = error?.code || error?.message || "unknown error";
    setLineStatus("ยืนยัน LINE ไม่สำเร็จ", `ตรวจ LINE callback ไม่สำเร็จ (${reason})`);
    mobileElements.lineLoginButton.classList.remove("hidden");
    return false;
  }
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
      quietEnd: "08:00",
      defaultProject: "Inbox",
      defaultPriority: "medium",
      defaultReminderTime: "09:00",
      smartProjectEnabled: true
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

async function sendOneMinuteTestReminder() {
  const response = await apiFetch("/api/line/test-due-reminder", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Cannot create timed test reminder");
  return result.task;
}

function getBangkokDateKey(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function isOverdue(task) {
  return Boolean(task?.dueDate && task.dueDate < getBangkokDateKey());
}

function isDueSoon(task) {
  if (!task?.dueDate) return false;
  const today = getBangkokDateKey();
  const soon = getBangkokDateKey(3);
  return task.dueDate >= today && task.dueDate <= soon;
}

async function loadMobileTasks() {
  const allowLocalPreview = isLocalPreview();
  if (!hasLineAuthToken() && !allowLocalPreview) {
    mobileTasks = [];
    renderLineLoginRequired();
    showToast("กรุณาเปิดผ่าน LINE และเข้าสู่ระบบก่อนดูงาน");
    return;
  }
  try {
    const response = await apiFetch("/api/tasks");
    if (response.status === 401) {
      currentLineUserId = "";
      currentLineIdToken = "";
      currentLineAccessToken = "";
      renderLineLoginRequired();
      showToast("ต้องยืนยัน LINE ก่อนโหลดข้อมูลงาน");
      return;
    }
    if (!response.ok) throw new Error("Cannot load tasks");
    mobileTasks = await response.json();
    await loadProjects();
  } catch {
    mobileTasks = fallbackTasks;
    mobileProjects = deriveProjectsFromTasks();
    showToast("โหลด backend ไม่ได้ แสดงข้อมูลตัวอย่างก่อน");
  }
  renderMobile();
  openTaskFromQuery();
  handleInviteFromQuery();
}

function renderLineLoginRequired() {
  document.body.dataset.view = "line-login-required";
  mobileElements.filterText.textContent = "LINE login required";
  mobileElements.sectionTitle.textContent = "เข้าใช้ผ่าน LINE";
  mobileElements.sectionSubtitle.textContent = "BossBoard ต้องรู้ว่าเป็น LINE ของใครก่อน ถึงจะแยกงานให้ถูกคน";
  mobileElements.lineLoginButton.classList.remove("hidden");
  mobileElements.taskList.innerHTML = `
    <section class="login-required-card">
      <div class="login-required-icon">LINE</div>
      <h2>กรุณายืนยัน LINE ก่อนใช้งาน</h2>
      <p>เปิดจาก LINE MINI App หรือกดปุ่มด้านล่างเพื่อ login ผ่าน LINE แล้วระบบจะสร้างพื้นที่งานส่วนตัวให้ทันที</p>
      <button type="button" data-login-line>เข้า LINE</button>
      <small>ถ้าเพิ่งเพิ่มเพื่อน OA ให้เปิดจากลิงก์ MINI App อีกครั้งหลังเพิ่มเพื่อนแล้ว</small>
    </section>
  `;
  mobileElements.taskList.querySelector("[data-login-line]")?.addEventListener("click", loginWithLine);
}

async function loadProjects() {
  try {
    const response = await apiFetch("/api/projects");
    if (!response.ok) throw new Error("Cannot load projects");
    mobileProjects = await response.json();
  } catch {
    mobileProjects = deriveProjectsFromTasks();
  }
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
    ...(currentLineIdToken ? { "x-line-id-token": currentLineIdToken } : {}),
    ...(currentLineAccessToken ? { Authorization: `Bearer ${currentLineAccessToken}` } : {})
  };
  return fetch(url, { ...options, headers });
}

function hasLineAuthToken() {
  return Boolean(currentLineIdToken || currentLineAccessToken);
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
    openTaskDetail(task);
    if (action === "reschedule") {
      window.setTimeout(() => {
        openMobileDialog(task);
        window.setTimeout(() => {
          const dueDateInput = document.querySelector("#mobileTaskDueDate");
          dueDateInput?.focus();
          showToast("เลือกวันครบกำหนดใหม่ แล้วกดบันทึก");
        }, 100);
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

async function deleteTaskFromApi(taskId) {
  const response = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Cannot delete task");
  return response.json();
}

async function saveProjectToApi(project) {
  const response = await apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
  if (!response.ok) throw new Error("Cannot save project");
  const savedProject = await response.json();
  await loadProjects();
  return savedProject;
}

async function deleteProjectFromApi(projectId) {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Cannot delete project");
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
      openTaskDetail(mobileTasks.find((task) => task.id === card.dataset.cardEdit));
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTaskDetail(mobileTasks.find((task) => task.id === card.dataset.cardEdit));
    });
  });

  mobileElements.taskList.querySelectorAll("[data-done-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.doneTask);
      const confirmed = await confirmAction({
        title: "ยืนยันปิดงาน?",
        message: `ต้องการทำเครื่องหมายว่า “${task?.title || "งานนี้"}” เสร็จแล้วใช่ไหม`,
        confirmText: "ปิดงาน",
        danger: false
      });
      if (!confirmed) return;
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
      <section class="boss-greeting-card">
        <div>
          <h2>หวัดดี บอส!</h2>
          <p>ได้เวลาลุยเป้าหมายวันนี้แล้ว</p>
        </div>
        <div class="boss-greeting-avatar" aria-hidden="true">
          <img class="brand-mascot-img brand-mascot-mini" src="/brand/bossboard-mascot.png" alt="" />
        </div>
      </section>

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
          <img class="brand-mascot-img brand-mascot-hero" src="/brand/bossboard-mascot.png" alt="" />
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

      <section class="activity-section">
        <h2>ความเคลื่อนไหว</h2>
        <div class="activity-feed">
          ${renderDashboardActivityFeed(mobileTasks)}
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

function renderDashboardActivityFeed(tasks) {
  const feed = tasks
    .flatMap((task) =>
      (task.activity || []).slice(0, 2).map((activity) => ({
        task,
        activity
      }))
    )
    .sort((a, b) => new Date(b.activity.at || 0).getTime() - new Date(a.activity.at || 0).getTime())
    .slice(0, 3);

  if (!feed.length) {
    return `
      <article class="activity-note">
        <span class="activity-avatar">B</span>
        <div>
          <strong>ยังไม่มีประวัติการแก้ไข</strong>
          <p>เมื่อสร้างหรือแก้งาน ระบบจะบันทึกไว้ตรงนี้</p>
        </div>
      </article>
    `;
  }

  return feed
    .map(({ task, activity }, index) => {
      const initial = getInitials(activity.user?.name || task.assignee || "BossBoard");
      return `
        <article class="activity-note activity-note-${index + 1}" data-card-edit="${task.id}" tabindex="0" role="button" aria-label="เปิดประวัติงาน ${escapeMobileHtml(task.title)}">
          <span class="activity-avatar">${initial}</span>
          <div>
            <strong>${escapeMobileHtml(task.title)}</strong>
            <p>${escapeMobileHtml(activity.text || "อัปเดตงาน")} · ${formatActivityTime(activity)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderFeaturedTask(task) {
  const percent = task.status === "done" ? 100 : task.status === "progress" || task.status === "review" ? 65 : 20;
  const statusMeta = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const priorityMeta = mobilePriorityMeta[task.priority] || mobilePriorityMeta.medium;
  const isDone = task.status === "done";
  const progressTotal = 10;
  const progressDone = Math.min(progressTotal, Math.max(0, Math.round((percent / 100) * progressTotal)));
  const taskIcon = getTaskVisualIcon(task);
  return `
    <article class="featured-task-card" data-card-edit="${task.id}" tabindex="0" role="button" aria-label="เปิดงาน ${escapeMobileHtml(task.title)}">
      <div class="featured-head">
        <div class="featured-icon task-visual-icon ${taskIcon.className}">${isDone ? "✓" : taskIcon.icon}</div>
        <div class="featured-main">
          <div class="task-title">${escapeMobileHtml(task.title)}</div>
          <p class="task-description">${escapeMobileHtml(task.project || "โปรเจกต์ทั่วไป")}</p>
          <div class="featured-meta">
            <span class="pill ${statusMeta.className}">${statusMeta.label}</span>
          </div>
        </div>
        <div class="featured-progress">
          <div class="ring-progress" style="--progress: ${percent}%"><span>${percent}%</span></div>
          <small>ความคืบหน้า</small>
        </div>
      </div>
      <div class="featured-due-row">
        <span class="featured-date">▣ ครบกำหนด ${formatTaskDueAt(task)}</span>
        <span class="pill ${priorityMeta.className}">${priorityMeta.label}</span>
      </div>
      <div class="task-bottom">
        <span class="featured-assignee">${renderAssigneeAvatar(task, "assignee-avatar")}ผู้รับผิดชอบ ${escapeMobileHtml(task.assignee)}</span>
        <div class="task-actions">
          <button data-edit-task="${task.id}" type="button">แก้ไข</button>
          ${!isDone ? `<button data-done-task="${task.id}" type="button">ทำเสร็จ</button>` : ""}
        </div>
      </div>
      <div class="featured-progress-foot">
        <div class="featured-progress-line"><span style="width: ${percent}%"></span></div>
        <strong>${progressDone}/${progressTotal}</strong>
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
      const progressLabel = task.status === "done" ? "✓" : task.status === "progress" || task.status === "review" ? "65%" : "20%";
      const taskIcon = getTaskVisualIcon(task);
      return `
        <button class="dashboard-task-row" data-edit-task="${task.id}" type="button">
          <div class="dashboard-row-icon task-visual-icon ${taskIcon.className}">${task.status === "done" ? "✓" : taskIcon.icon}</div>
          <div>
            <strong>${escapeMobileHtml(task.title)}</strong>
            <span>ครบกำหนด ${formatTaskDueAt(task)}</span>
          </div>
          ${renderAssigneeAvatar(task, "task-avatar")}
          <span class="dashboard-row-badge ${task.status === "done" ? "done" : ""}" aria-label="ความคืบหน้า ${progressLabel}">${progressLabel}</span>
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
              <span>${formatTaskDueAt(task)}</span>
            </div>
          `
        )
        .join("")}
      <button class="mini-add" data-add-status="${status}" type="button">+ เพิ่มงาน</button>
    </div>
  `;
}

function getTaskVisualIcon(task = {}) {
  const text = `${task.title || ""} ${task.project || ""} ${(task.tags || []).join(" ")}`.toLowerCase();
  if (task.status === "done") return { icon: "✓", className: "task-icon-done" };
  if (text.includes("line") || text.includes("แจ้งเตือน") || text.includes("notification")) {
    return { icon: "💬", className: "task-icon-line" };
  }
  if (text.includes("โฆษณา") || text.includes("ads") || text.includes("campaign") || text.includes("แคมเปญ") || text.includes("marketing")) {
    return { icon: "📣", className: "task-icon-marketing" };
  }
  if (text.includes("ประชุม") || text.includes("meeting") || text.includes("คุย")) {
    return { icon: "👥", className: "task-icon-meeting" };
  }
  if (text.includes("design") || text.includes("ออกแบบ") || text.includes("ui") || text.includes("ux")) {
    return { icon: "✏️", className: "task-icon-design" };
  }
  if (text.includes("backend") || text.includes("database") || text.includes("api") || text.includes("schema")) {
    return { icon: "▣", className: "task-icon-tech" };
  }
  if (text.includes("รายงาน") || text.includes("สรุป") || text.includes("report")) {
    return { icon: "📄", className: "task-icon-report" };
  }
  if (task.priority === "high") return { icon: "⚑", className: "task-icon-urgent" };
  return { icon: "✦", className: "task-icon-general" };
}

function findAssigneeProfile(task = {}) {
  const currentUser = teamState.user || {};
  if (task.assigneeUserId && currentUser.id && task.assigneeUserId === currentUser.id) return currentUser;
  if (task.assigneeUserId && currentUser.lineUserId && task.assigneeUserId === currentUser.lineUserId) return currentUser;
  const member = (teamState.members || []).find((item) => {
    const user = item.user || {};
    return task.assigneeUserId && (task.assigneeUserId === user.id || task.assigneeUserId === user.lineUserId);
  });
  if (member?.user) return member.user;
  const assigneeName = String(task.assignee || "").trim().toLowerCase();
  if (assigneeName && String(currentUser.displayName || "").trim().toLowerCase() === assigneeName) return currentUser;
  return currentUser;
}

function renderAssigneeAvatar(task = {}, className = "task-avatar") {
  const profile = findAssigneeProfile(task);
  const imageUrl = profile?.avatarUrl || profile?.pictureUrl || "";
  const name = task.assignee || profile?.displayName || teamState.user?.displayName || "ฉัน";
  if (imageUrl) {
    return `<span class="${className} user-photo-avatar"><img src="${escapeMobileHtml(imageUrl)}" alt="${escapeMobileHtml(name)}" /></span>`;
  }
  return `<span class="${className}">${escapeMobileHtml(getInitials(name))}</span>`;
}

function renderMyTasksPageLegacyUnused() {
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
    button.addEventListener("click", () => openTaskDetail(mobileTasks.find((task) => task.id === button.dataset.rowEdit)));
  });
  mobileElements.taskList.querySelectorAll("[data-row-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.rowDone);
      const confirmed = await confirmAction({
        title: "ยืนยันปิดงาน?",
        message: `ต้องการทำเครื่องหมายว่า “${task?.title || "งานนี้"}” เสร็จแล้วใช่ไหม`,
        confirmText: "ปิดงาน"
      });
      if (!confirmed) return;
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

function sortTasksByDueDate(a, b) {
  return String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || String(a.dueTime || "").localeCompare(String(b.dueTime || ""));
}

function renderMissionEmptyCard(message) {
  return `
    <article class="mission-empty-card">
      <span class="material-symbols-outlined">task_alt</span>
      <strong>${escapeMobileHtml(message)}</strong>
    </article>
  `;
}

function renderMissionTaskCard(task, compact = false) {
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  return `
    <article class="mission-task-card ${compact ? "is-compact" : ""}">
      <button class="mission-task-main" data-row-edit="${task.id}" type="button">
        <strong>${escapeMobileHtml(task.title)}</strong>
        <span class="mission-task-time"><span class="material-symbols-outlined">schedule</span>${escapeMobileHtml(formatMissionTaskTime(task))}</span>
      </button>
      <span class="mission-task-status ${status.className}">${status.label}</span>
      ${compact ? `<button class="mission-task-next" data-row-edit="${task.id}" type="button" aria-label="เปิดรายละเอียด"><span class="material-symbols-outlined">chevron_right</span></button>` : ""}
    </article>
  `;
}

function formatMissionTaskTime(task) {
  if (task.dueTime) return `${task.dueTime} น.`;
  if (task.dueDate === getBangkokDateKey()) return "วันนี้";
  return task.dueDate ? formatTaskDueAt(task) : "ยังไม่กำหนดเวลา";
}

function renderMissionReportCard(title, percent, done, open) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  return `
    <article class="mission-report-card" style="--report-progress:${safePercent}%">
      <strong>${escapeMobileHtml(title)}</strong>
      <div class="mission-report-body">
        <div class="mission-ring"><span>${safePercent}%</span></div>
        <div class="mission-report-counts">
          <span>สำเร็จแล้ว: ${Number(done || 0)}</span>
          <span>คงค้าง: ${Number(open || 0)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderMissionFilteredTasks(tasks, todayKey) {
  const filteredTasks = tasks.filter((task) => {
    if (myTasksFilter === "done") return task.status === "done";
    if (myTasksFilter === "upcoming") return task.status !== "done" && task.dueDate > todayKey;
    return task.status !== "done" && task.dueDate <= todayKey;
  });
  return filteredTasks.length ? filteredTasks.map(renderPersonalTaskRow).join("") : renderEmptyPersonalTasks();
}

function renderMyTasksPage() {
  document.body.dataset.view = "tasks";
  mobileElements.sectionTitle.textContent = selectedProjectName ? selectedProjectName : "งานของฉัน";
  mobileElements.sectionSubtitle.textContent = selectedProjectName
    ? "งานในโปรเจกต์นี้ แตะการ์ดเพื่อดูรายละเอียด"
    : "สรุปภารกิจวันนี้ งานเร่ง และรายงานผลงานส่วนตัว";

  const todayKey = getBangkokDateKey();
  const projectScopedTasks = selectedProjectName
    ? mobileTasks.filter((task) => (task.project || "ทั่วไป") === selectedProjectName)
    : mobileTasks;
  const todayTasks = projectScopedTasks
    .filter((task) => task.status !== "done" && task.dueDate <= todayKey)
    .sort(sortTasksByDueDate)
    .slice(0, 3);
  const upcomingTasks = projectScopedTasks
    .filter((task) => task.status !== "done" && task.dueDate > todayKey)
    .sort(sortTasksByDueDate)
    .slice(0, 3);
  const doneCount = projectScopedTasks.filter((task) => task.status === "done").length;
  const openCount = projectScopedTasks.filter((task) => task.status !== "done").length;
  const totalCount = projectScopedTasks.length;
  const progressPercent = Math.round((doneCount / Math.max(totalCount, 1)) * 100);
  const weekDone = projectScopedTasks.filter((task) => task.status === "done" && task.dueDate >= getBangkokDateKey(-7)).length;
  const monthDone = projectScopedTasks.filter((task) => task.status === "done" && task.dueDate >= getBangkokDateKey(-30)).length;

  mobileElements.taskList.innerHTML = `
    <div class="my-tasks-screen my-mission-screen">
      ${selectedProjectName ? `<button class="view-all-link project-clear-button" data-clear-project type="button">← งานของฉันทั้งหมด</button>` : ""}

      <section class="mission-summary-card">
        <div>
          <h2>สรุปภารกิจ</h2>
          <p>${openCount ? `ยังมี ${openCount} งานที่ต้องจัดการ ลุยกันต่อเลย` : "วันนี้โล่งดี เพิ่มงานใหม่ได้เลย"}</p>
        </div>
        <img class="mission-summary-mascot" src="/brand/bossboard-mascot.png" alt="" />
      </section>

      <section class="mission-block">
        <h3 class="mission-sticker mission-cyan">งานวันนี้ & เร็ว ๆ นี้</h3>
        <div class="mission-group"><span class="mission-dot is-pink"></span><strong>วันนี้</strong></div>
        <div class="mission-task-list">
          ${todayTasks.length ? todayTasks.map(renderMissionTaskCard).join("") : renderMissionEmptyCard("ไม่มีงานที่ต้องทำวันนี้")}
        </div>
        <div class="mission-group"><span class="mission-dot is-yellow"></span><strong>เร็ว ๆ นี้</strong></div>
        <div class="mission-task-list">
          ${upcomingTasks.length ? upcomingTasks.map((task) => renderMissionTaskCard(task, true)).join("") : renderMissionEmptyCard("ยังไม่มีงานเร็ว ๆ นี้")}
        </div>
      </section>

      <section class="mission-block">
        <h3 class="mission-sticker mission-yellow">รายงานผลงาน</h3>
        <div class="mission-report-strip">
          ${renderMissionReportCard("รายสัปดาห์", progressPercent, doneCount, openCount)}
          ${renderMissionReportCard("รายเดือน", Math.round((monthDone / Math.max(totalCount, 1)) * 100), monthDone, openCount)}
          ${renderMissionReportCard("7 วันล่าสุด", Math.round((weekDone / Math.max(totalCount, 1)) * 100), weekDone, openCount)}
        </div>
      </section>

      <section class="mission-block">
        <h3 class="mission-sticker mission-pink">สรุปและส่งออกข้อมูล</h3>
        <div class="mission-action-list">
          <button class="mission-action-row" data-push-mission-summary type="button">
            <span class="material-symbols-outlined">description</span>
            <strong>สรุปโครงการ</strong>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
          <button class="mission-action-row is-green" data-export-mission-sheet type="button">
            <span class="material-symbols-outlined">backup_table</span>
            <strong>ส่งออกไปยัง Google Sheets</strong>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </section>

      <section class="mission-block">
        <h3 class="mission-sticker mission-orange">รายการทั้งหมด</h3>
        <div class="segmented-tabs mission-tabs">
          <button class="${myTasksFilter === "today" ? "active" : ""}" data-my-filter="today" type="button">วันนี้</button>
          <button class="${myTasksFilter === "upcoming" ? "active" : ""}" data-my-filter="upcoming" type="button">กำลังจะมาถึง</button>
          <button class="${myTasksFilter === "done" ? "active" : ""}" data-my-filter="done" type="button">เสร็จสิ้น</button>
        </div>
        <div class="personal-task-list">
          ${renderMissionFilteredTasks(projectScopedTasks, todayKey)}
        </div>
      </section>
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
  mobileElements.taskList.querySelector("[data-push-mission-summary]")?.addEventListener("click", pushSummaryToLine);
  mobileElements.taskList.querySelector("[data-export-mission-sheet]")?.addEventListener("click", () => {
    showToast("เตรียมระบบส่งออก Google Sheets ในขั้นถัดไป");
  });
  mobileElements.taskList.querySelectorAll("[data-row-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(mobileTasks.find((task) => task.id === button.dataset.rowEdit)));
  });
  mobileElements.taskList.querySelectorAll("[data-row-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.rowDone);
      const confirmed = await confirmAction({
        title: "ยืนยันปิดงาน?",
        message: `ต้องการทำเครื่องหมายว่า “${task?.title || "งานนี้"}” เสร็จแล้วใช่ไหม`,
        confirmText: "ปิดงาน"
      });
      if (!confirmed) return;
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
        <small>▣ ครบกำหนด ${formatTaskDueAt(task)}</small>
      </button>
      ${renderAssigneeAvatar(task, "task-avatar")}
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

function openTaskDetail(task) {
  if (!task) return;
  document.body.dataset.view = "task-detail";
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const priority = mobilePriorityMeta[task.priority] || mobilePriorityMeta.medium;
  const percent = task.status === "done" ? 100 : task.status === "progress" || task.status === "review" ? 65 : 20;
  const taskIcon = getTaskVisualIcon(task);
  mobileElements.sectionTitle.textContent = "รายละเอียดงาน";
  mobileElements.sectionSubtitle.textContent = "ข้อมูลครบและประวัติการแก้ไข";
  mobileElements.taskList.innerHTML = `
    <div class="task-detail-screen">
      <button class="detail-back-button" data-detail-back type="button">← กลับ</button>
      <section class="task-detail-hero">
        <div class="detail-hero-top">
          <div class="featured-icon task-visual-icon ${taskIcon.className}">${task.status === "done" ? "✓" : taskIcon.icon}</div>
          <div>
            <span class="settings-kicker">${escapeMobileHtml(task.project || "ทั่วไป")}</span>
            <h2>${escapeMobileHtml(task.title)}</h2>
            <p>${escapeMobileHtml(task.description || "ยังไม่มีรายละเอียดเพิ่มเติม")}</p>
          </div>
        </div>
        <div class="detail-status-row">
          <span class="pill ${status.className}">${status.label}</span>
          <span>ครบกำหนด ${formatTaskDueAt(task)}</span>
          <span class="pill ${priority.className}">${priority.label}</span>
        </div>
        <div class="featured-progress-foot">
          <div class="featured-progress-line"><span style="width: ${percent}%"></span></div>
          <strong>${percent}%</strong>
        </div>
      </section>

      <section class="task-detail-card">
        <div class="settings-card-head">
          <div>
            <span class="settings-kicker">Owner</span>
            <h2>ผู้รับผิดชอบ</h2>
          </div>
          ${renderAssigneeAvatar(task, "task-avatar")}
        </div>
        <div class="detail-info-list">
          ${renderDetailInfo("ผู้รับผิดชอบ", task.assignee || "-")}
          ${renderDetailInfo("โปรเจกต์", task.project || "-")}
          ${renderDetailInfo("สถานะ", status.label)}
          ${renderDetailInfo("ความสำคัญ", priority.label)}
          ${renderDetailInfo("ครบกำหนด", formatTaskDueAt(task))}
        </div>
      </section>

      <section class="task-detail-card">
        <div class="settings-card-head">
          <div>
            <span class="settings-kicker">History</span>
            <h2>ประวัติการแก้ไข</h2>
          </div>
          <span class="settings-status">${(task.activity || []).length} รายการ</span>
        </div>
        <div class="activity-timeline">${renderActivityTimeline(task)}</div>
      </section>

      <section class="task-detail-actions">
        <button class="save-button" data-detail-edit="${task.id}" type="button">แก้ไขงาน</button>
        ${task.status !== "progress" ? `<button data-detail-progress="${task.id}" type="button">กำลังทำ</button>` : ""}
        ${task.status !== "review" ? `<button data-detail-review="${task.id}" type="button">รอตรวจ</button>` : ""}
        ${task.status !== "done" ? `<button data-detail-done="${task.id}" type="button">ทำเสร็จ</button>` : ""}
        <button class="danger-outline-button" data-detail-delete="${task.id}" type="button">ลบงาน</button>
      </section>
    </div>
  `;
  wireTaskDetailActions(task.id);
}

function renderDetailInfo(label, value) {
  return `
    <div class="detail-info-row">
      <span>${escapeMobileHtml(label)}</span>
      <strong>${escapeMobileHtml(value || "-")}</strong>
    </div>
  `;
}

function renderActivityTimeline(task) {
  const activity = Array.isArray(task.activity) ? task.activity : [];
  if (!activity.length) return `<p class="task-description">ยังไม่มีประวัติการแก้ไข</p>`;
  return activity
    .slice(0, 12)
    .map((item) => `
      <article class="activity-item">
        <span></span>
        <div>
          <strong>${escapeMobileHtml(item.text || "อัปเดตงาน")}</strong>
          <small>${escapeMobileHtml(formatActivityTime(item))}${item.actorName ? ` · ${escapeMobileHtml(item.actorName)}` : ""}</small>
        </div>
      </article>
    `)
    .join("");
}

function formatActivityTime(item = {}) {
  if (!item.createdAt) return item.time || "ตอนนี้";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(item.createdAt));
  } catch {
    return item.time || "ตอนนี้";
  }
}

function wireTaskDetailActions(taskId) {
  const getTask = () => mobileTasks.find((task) => task.id === taskId);
  mobileElements.taskList.querySelector("[data-detail-back]")?.addEventListener("click", () => {
    if (selectedProjectName) {
      setActiveNav("projects");
      renderProjectDetailPage(selectedProjectName);
      return;
    }
    setActiveNav("home");
    renderMobile();
  });
  mobileElements.taskList.querySelector("[data-detail-edit]")?.addEventListener("click", () => openMobileDialog(getTask()));
  mobileElements.taskList.querySelector("[data-detail-delete]")?.addEventListener("click", () => deleteTaskWithConfirmation(taskId));
  [
    ["detail-progress", "progress", "เปลี่ยนสถานะเป็นกำลังทำจากหน้ารายละเอียด"],
    ["detail-review", "review", "เปลี่ยนสถานะเป็นรอตรวจจากหน้ารายละเอียด"],
    ["detail-done", "done", "ปิดงานจากหน้ารายละเอียด"]
  ].forEach(([key, status, activityText]) => {
    mobileElements.taskList.querySelector(`[data-${key}]`)?.addEventListener("click", async () => {
      const task = getTask();
      if (!task) return;
      if (status === "done") {
        const confirmed = await confirmAction({
          title: "ยืนยันปิดงาน?",
          message: `ต้องการทำเครื่องหมายว่า “${task.title}” เสร็จแล้วใช่ไหม`,
          confirmText: "ปิดงาน"
        });
        if (!confirmed) return;
      }
      try {
        const updatedTask = await patchTaskToApi(taskId, { status, activityText });
        mobileTasks = mobileTasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
        openTaskDetail(updatedTask);
        showToast("อัปเดตงานแล้ว");
      } catch {
        showToast("อัปเดตงานไม่สำเร็จ");
      }
    });
  });
}

function renderCreateTaskPage(seedTask = createMobileTask()) {
  document.body.dataset.view = "create";
  mobileElements.sectionTitle.textContent = seedTask.id && mobileTasks.some((task) => task.id === seedTask.id) ? "แก้ไขภารกิจ" : "สร้างภารกิจ";
  mobileElements.sectionSubtitle.textContent = "เพิ่มงานส่วนตัว แล้วให้ BossBoard เตือนผ่าน LINE";

  const userName = teamState.user?.displayName || "ฉัน";
  const projectNames = getProjectNames(seedTask.project);
  const selectedProject = projectNames.includes(seedTask.project) ? seedTask.project : "";
  mobileElements.taskList.innerHTML = `
    <form id="createTaskPageForm" class="create-task-page">
      <label>ชื่อภารกิจ
        <input id="createTaskTitle" value="${escapeMobileHtml(seedTask.title)}" placeholder="ชื่อภารกิจ" required />
      </label>
      <label>รายละเอียด
        <textarea id="createTaskDescription" placeholder="รายละเอียด">${escapeMobileHtml(seedTask.description || "")}</textarea>
      </label>
      <label>เลือกโปรเจกต์
        <select id="createTaskProject">
          ${projectNames.map((name) => `<option value="${escapeMobileHtml(name)}" ${name === selectedProject ? "selected" : ""}>${escapeMobileHtml(name)}</option>`).join("")}
          <option value="__new">+ สร้างโปรเจกต์ใหม่</option>
        </select>
      </label>
      <label id="newProjectLabel" class="${selectedProject ? "hidden" : ""}">ชื่อโปรเจกต์ใหม่
        <input id="newTaskProject" value="${selectedProject ? "" : escapeMobileHtml(seedTask.project || "")}" placeholder="เช่น งานลูกค้า A, แคมเปญ Q2" />
      </label>
      <div class="assignee-strip" aria-label="ผู้รับผิดชอบ">
        <span>ผู้รับผิดชอบ</span>
        <div class="avatar-choice active">${getInitials(userName)}</div>
      </div>
      <label>วันครบกำหนด
        <input id="createTaskDueDate" value="${escapeMobileHtml(seedTask.dueDate)}" type="date" required />
      </label>
      <label>เวลาแจ้งเตือน
        <input id="createTaskDueTime" value="${escapeMobileHtml(seedTask.dueTime || "")}" type="time" />
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
      <div class="form-actions-row">
        <button class="create-submit-button" type="submit">${seedTask.id && mobileTasks.some((task) => task.id === seedTask.id) ? "บันทึกภารกิจ" : "สร้างภารกิจ"}</button>
        ${seedTask.id && mobileTasks.some((task) => task.id === seedTask.id) ? `<button class="danger-outline-button" id="deleteTaskPageButton" type="button">ลบงาน</button>` : ""}
      </div>
    </form>
  `;

  document.querySelector("#createTaskProject")?.addEventListener("change", (event) => {
    document.querySelector("#newProjectLabel")?.classList.toggle("hidden", event.target.value !== "__new");
  });

  document.querySelector("#createTaskPageForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const exists = mobileTasks.some((task) => task.id === seedTask.id);
    const projectSelect = document.querySelector("#createTaskProject").value;
    const projectName = projectSelect === "__new"
      ? document.querySelector("#newTaskProject").value.trim()
      : projectSelect;
    if (!projectName) {
      showToast("กรุณาเลือกหรือสร้างโปรเจกต์");
      return;
    }
    const task = {
      ...seedTask,
      title: document.querySelector("#createTaskTitle").value.trim() || "Untitled task",
      description: document.querySelector("#createTaskDescription").value.trim(),
      project: projectName,
      assignee: userName,
      assigneeUserId: teamState.user?.id || "",
      organizationId: "",
      dueDate: document.querySelector("#createTaskDueDate").value,
      dueTime: document.querySelector("#createTaskDueTime").value,
      status: document.querySelector("#createTaskStatus").value,
      priority: document.querySelector("#createTaskPriority").value,
      tags: ["LIFF"],
      activity: []
    };
    try {
      if (projectSelect === "__new") {
        await saveProjectToApi({ name: projectName, description: "สร้างจากหน้าเพิ่มงาน" });
      }
      await persistTask(task, exists);
      if (selectedProjectName) {
        setActiveNav("projects");
        renderProjectDetailPage(selectedProjectName);
      } else {
        setActiveNav("tasks");
        myTasksFilter = task.status === "done" ? "done" : "upcoming";
        renderMyTasksPage();
      }
      showToast(exists ? "บันทึกงานแล้ว" : "สร้างภารกิจแล้ว");
    } catch {
      showToast("บันทึกงานไม่สำเร็จ");
    }
  });

  document.querySelector("#deleteTaskPageButton")?.addEventListener("click", () => deleteTaskWithConfirmation(seedTask.id));
}

async function renderPersonalSettings() {
  document.body.dataset.view = "settings";
  mobileElements.sectionTitle.textContent = "ตั้งค่า";
  mobileElements.sectionSubtitle.textContent = "ควบคุมว่า LINE จะช่วยจดและเตือนงานให้คุณยังไง";
  await loadReminderSettings();
  const settings = reminderSettings || {};
  const openTasks = mobileTasks.filter((task) => task.status !== "done").length;
  const dueSoonTasks = mobileTasks.filter((task) => task.status !== "done" && isDueSoon(task)).length;
  const overdueTasks = mobileTasks.filter((task) => task.status !== "done" && isOverdue(task)).length;
  const currentUser = teamState.user || {};
  const connectedName = currentUser.displayName || "ยังไม่ทราบชื่อ";
  const avatar = currentUser.avatarUrl || currentUser.pictureUrl || "";
  const isLineConnected = Boolean(currentUser.lineUserId || currentLineUserId);
  const defaultProject = settings.defaultProject || "Inbox";
  const projectOptions = ["Inbox", ...getProjectNames(defaultProject).filter((name) => name !== "Inbox")];
  const priorityOptions = Object.entries(mobilePriorityMeta).map(([value, meta]) => ({ value, label: meta.label }));
  const doneTasks = mobileTasks.filter((task) => task.status === "done").length;

  mobileElements.taskList.innerHTML = `
    <div class="settings-screen settings-control-center">
      <div class="settings-page-title">
        <span>BossBoard settings</span>
        <h2>ตั้งค่า</h2>
        <p>ทำให้บอทจำงานผ่าน LINE ได้ง่ายขึ้น และเตือนคุณในเวลาที่เหมาะที่สุด</p>
      </div>

      <section class="settings-profile-card">
        <div class="settings-profile-avatar">
          ${avatar ? `<img src="${escapeMobileHtml(avatar)}" alt="" />` : `<span>${escapeMobileHtml(getInitials(connectedName))}</span>`}
        </div>
        <div class="settings-profile-main">
          <span class="settings-kicker">โปรไฟล์และ LINE</span>
          <h2>${escapeMobileHtml(connectedName)}</h2>
          <p>${isLineConnected ? "เชื่อม LINE แล้ว ข้อมูลของคุณแยกจากผู้ใช้อื่น" : "ยังไม่ได้เชื่อม LINE เปิดผ่าน LIFF เพื่อใช้งานเต็มรูปแบบ"}</p>
          <div class="settings-profile-actions">
            <button id="openProfileSettingsButton" type="button">แก้โปรไฟล์</button>
            <button id="sendTestReminderButton" type="button">ทดสอบส่งแจ้งเตือน</button>
          </div>
        </div>
        <span class="settings-status ${settings.enabled && isLineConnected ? "is-on" : ""}">${isLineConnected ? "LINE พร้อม" : "รอเชื่อม"}</span>
      </section>

      <section class="settings-summary-grid" aria-label="สรุปการแจ้งเตือน">
        <article>
          <span>งานค้าง</span>
          <strong>${openTasks}</strong>
        </article>
        <article>
          <span>ใกล้ครบกำหนด</span>
          <strong>${dueSoonTasks}</strong>
        </article>
        <article>
          <span>เลยกำหนด</span>
          <strong>${overdueTasks}</strong>
        </article>
      </section>

      <form id="reminderSettingsForm" class="settings-card settings-form settings-coach-card">
        <div class="settings-card-head">
          <div>
            <span class="settings-kicker">LINE Reminder Coach</span>
            <h2>รอบแจ้งเตือนของฉัน</h2>
            <p>ตั้งให้ LINE สรุปงาน คอยกันลืม และพักการแจ้งในเวลาส่วนตัว</p>
          </div>
          <label class="app-switch" aria-label="เปิดใช้งานแจ้งเตือนทั้งหมด">
            <input id="reminderEnabledInput" type="checkbox" ${settings.enabled ? "checked" : ""} />
            <span></span>
          </label>
        </div>

        <div class="settings-list">
          <label class="settings-row">
            <input id="dailySummaryEnabledInput" type="checkbox" ${settings.dailySummaryEnabled ? "checked" : ""} />
            <span class="settings-row-icon">☀</span>
            <span class="settings-row-main">
              <strong>สรุปรายวัน</strong>
              <small>ส่งภาพรวมงานที่ต้องทำทุกเช้า</small>
            </span>
            <input class="settings-time-input" id="dailySummaryTimeInput" type="time" value="${escapeMobileHtml(settings.dailySummaryTime || "08:30")}" aria-label="เวลาสรุปรายวัน" />
          </label>
          <label class="settings-row">
            <input id="dueSoonEnabledInput" type="checkbox" ${settings.dueSoonEnabled ? "checked" : ""} />
            <span class="settings-row-icon">⏰</span>
            <span class="settings-row-main">
              <strong>เตือนก่อนครบกำหนด</strong>
              <small>กันลืมงานที่กำลังจะถึงเวลา</small>
            </span>
            <div class="inline-setting">
              <input id="dueSoonDaysInput" type="number" min="0" max="7" value="${escapeMobileHtml(settings.dueSoonDays ?? 1)}" aria-label="จำนวนวันก่อนครบกำหนด" />
              <small>วัน</small>
              <input id="dueSoonTimeInput" type="time" value="${escapeMobileHtml(settings.dueSoonTime || "18:00")}" aria-label="เวลาเตือนก่อนครบกำหนด" />
            </div>
          </label>
          <label class="settings-row">
            <input id="overdueEnabledInput" type="checkbox" ${settings.overdueEnabled ? "checked" : ""} />
            <span class="settings-row-icon">!</span>
            <span class="settings-row-main">
              <strong>เตือนงานเลยกำหนด</strong>
              <small>ส่งรายการที่ยังไม่ปิดงาน</small>
            </span>
            <input class="settings-time-input" id="reminderTimeInput" type="time" value="${escapeMobileHtml(settings.reminderTime || "09:00")}" aria-label="เวลาเตือนงานเลยกำหนด" />
          </label>
          <label class="settings-row">
            <input id="quietHoursEnabledInput" type="checkbox" ${settings.quietHoursEnabled ? "checked" : ""} />
            <span class="settings-row-icon">☾</span>
            <span class="settings-row-main">
              <strong>งดแจ้งช่วงพัก</strong>
              <small>พักการแจ้งเตือนในช่วงเวลาที่กำหนด</small>
            </span>
            <div class="inline-setting">
              <input id="quietStartInput" type="time" value="${escapeMobileHtml(settings.quietStart || "22:00")}" aria-label="เริ่มงดแจ้งเตือน" />
              <small>ถึง</small>
              <input id="quietEndInput" type="time" value="${escapeMobileHtml(settings.quietEnd || "08:00")}" aria-label="จบงดแจ้งเตือน" />
            </div>
          </label>
        </div>

        <section class="settings-subsection">
          <div class="settings-card-head compact">
            <div>
              <span class="settings-kicker">ค่าเริ่มต้นเวลาอ่านจาก LINE</span>
              <h3>ถ้าบอทอ่านไม่ครบ ให้ใช้ค่านี้</h3>
            </div>
          </div>
          <div class="settings-default-grid">
            <label>โปรเจกต์เริ่มต้น
              <select id="defaultProjectInput">
                ${projectOptions.map((name) => `<option value="${escapeMobileHtml(name)}" ${name === defaultProject ? "selected" : ""}>${escapeMobileHtml(name)}</option>`).join("")}
              </select>
            </label>
            <label>ความสำคัญเริ่มต้น
              <select id="defaultPriorityInput">
                ${priorityOptions.map((item) => `<option value="${item.value}" ${item.value === (settings.defaultPriority || "medium") ? "selected" : ""}>${escapeMobileHtml(item.label)}</option>`).join("")}
              </select>
            </label>
            <label>เวลาเตือนเริ่มต้น
              <input id="defaultReminderTimeInput" type="time" value="${escapeMobileHtml(settings.defaultReminderTime || "09:00")}" />
            </label>
          </div>
          <label class="settings-row settings-toggle-row">
            <input id="smartProjectEnabledInput" type="checkbox" ${settings.smartProjectEnabled === false ? "" : "checked"} />
            <span class="settings-row-icon">AI</span>
            <span class="settings-row-main">
              <strong>เดาโปรเจกต์จากข้อความ LINE</strong>
              <small>ถ้าเดาไม่ได้ ระบบจะส่งเข้า Inbox ก่อน</small>
            </span>
          </label>
        </section>

        <button class="save-button" type="submit">บันทึกการตั้งค่า</button>
      </form>

      <section class="settings-card settings-howto-card">
        <div class="settings-card-head">
          <div>
            <span class="settings-kicker">วิธีจดงานผ่าน LINE</span>
            <h2>พิมพ์ธรรมดาได้เลย</h2>
            <p>BossBoard จะพยายามจับชื่องาน วัน เวลา และโปรเจกต์ให้เอง</p>
          </div>
        </div>
        <div class="settings-example-list">
          <button type="button" data-example-text="ประชุมพรุ่งนี้ 10 โมง">ประชุมพรุ่งนี้ 10 โมง</button>
          <button type="button" data-example-text="ส่งรายงานวันที่ 31">ส่งรายงานวันที่ 31</button>
          <button type="button" data-example-text="เตือนกินยา 20:00">เตือนกินยา 20:00</button>
        </div>
        <p class="settings-hint">ถ้าข้อความไม่บอกโปรเจกต์ ระบบจะลง Inbox และใช้เวลาเตือนเริ่มต้นที่ตั้งไว้</p>
      </section>

      <section class="settings-card settings-menu-card">
        <button type="button" id="openProjectsSettingsButton" class="settings-action-row">
          <span>โปรเจกต์ / Inbox</span>
          <strong>จัดการ ›</strong>
        </button>
        <button type="button" id="pushSummaryButton" class="settings-action-row">
          <span>ส่งสรุปงานค้างเข้า LINE ตอนนี้</span>
          <strong>ส่งสรุป</strong>
        </button>
        <button type="button" id="exportDataButton" class="settings-action-row">
          <span>ส่งออกข้อมูลของฉัน</span>
          <strong>JSON</strong>
        </button>
        <button type="button" id="clearDoneTasksButton" class="settings-action-row">
          <span>ล้างงานที่เสร็จแล้ว</span>
          <strong>${doneTasks} งาน</strong>
        </button>
      </section>

      <article class="settings-note-card">
        <strong>ข้อมูลและความเป็นส่วนตัว</strong>
        <p>ข้อมูลแยกตาม LINE ของแต่ละคน ไม่แสดง LINE User ID ยาว ๆ ในหน้าผู้ใช้ และตอนนี้ BossBoard จะใช้เป็นแอปเตือนงานส่วนตัวก่อน</p>
      </article>

      <button id="deleteAllDataButton" class="settings-danger-button" type="button">ลบงานทั้งหมดของฉัน</button>
    </div>
  `;

  document.querySelector("#reminderSettingsForm")?.addEventListener("submit", saveReminderSettingsFromForm);
  document.querySelector("#openProfileSettingsButton")?.addEventListener("click", renderMyProfile);
  document.querySelector("#sendTestReminderButton")?.insertAdjacentHTML(
    "afterend",
    `<button id="sendOneMinuteTestButton" type="button">ทดสอบเตือนใน 1 นาที</button>`
  );
  document.querySelector("#sendTestReminderButton")?.addEventListener("click", async () => {
    try {
      await sendTestReminder();
      showToast("ส่งทดสอบเข้า LINE แล้ว");
    } catch {
      showToast("ส่งทดสอบไม่สำเร็จ ตรวจสอบว่าเพิ่ม OA เป็นเพื่อนแล้ว");
    }
  });
  document.querySelector("#sendOneMinuteTestButton")?.addEventListener("click", async () => {
    try {
      const task = await sendOneMinuteTestReminder();
      await loadMobileData();
      renderPersonalSettings();
      showToast(`สร้างงานทดสอบแล้ว รอ LINE แจ้งตอน ${task?.dueTime || "อีก 1 นาที"}`);
    } catch (error) {
      showToast(error.message || "สร้างงานทดสอบไม่สำเร็จ เปิดผ่าน LINE ก่อน");
    }
  });
  document.querySelector("#pushSummaryButton")?.addEventListener("click", pushSummaryToLine);
  document.querySelector("#openProjectsSettingsButton")?.addEventListener("click", () => {
    selectedProjectName = "";
    setActiveNav("projects");
    renderProjectsPage();
  });
  document.querySelector("#exportDataButton")?.addEventListener("click", exportBossBoardData);
  document.querySelector("#clearDoneTasksButton")?.addEventListener("click", clearCompletedTasksFromSettings);
  document.querySelector("#deleteAllDataButton")?.addEventListener("click", deleteAllTasksFromSettings);
  document.querySelectorAll("[data-example-text]").forEach((button) => {
    button.addEventListener("click", () => {
      navigator.clipboard?.writeText(button.dataset.exampleText || "");
      showToast(`ตัวอย่าง: ${button.dataset.exampleText}`);
    });
  });
}

async function saveReminderSettingsFromForm(event) {
  event.preventDefault();
  const payload = {
    enabled: document.querySelector("#reminderEnabledInput")?.checked ?? true,
    dailySummaryEnabled: document.querySelector("#dailySummaryEnabledInput")?.checked ?? true,
    dailySummaryTime: document.querySelector("#dailySummaryTimeInput")?.value || "08:30",
    dueSoonEnabled: document.querySelector("#dueSoonEnabledInput")?.checked ?? true,
    dueSoonDays: Number(document.querySelector("#dueSoonDaysInput")?.value || 1),
    dueSoonTime: document.querySelector("#dueSoonTimeInput")?.value || "18:00",
    overdueEnabled: document.querySelector("#overdueEnabledInput")?.checked ?? true,
    reminderTime: document.querySelector("#reminderTimeInput")?.value || "09:00",
    quietHoursEnabled: document.querySelector("#quietHoursEnabledInput")?.checked ?? false,
    quietStart: document.querySelector("#quietStartInput")?.value || "22:00",
    quietEnd: document.querySelector("#quietEndInput")?.value || "08:00",
    defaultProject: document.querySelector("#defaultProjectInput")?.value || "Inbox",
    defaultPriority: document.querySelector("#defaultPriorityInput")?.value || "medium",
    defaultReminderTime: document.querySelector("#defaultReminderTimeInput")?.value || "09:00",
    smartProjectEnabled: document.querySelector("#smartProjectEnabledInput")?.checked ?? true
  };
  try {
    await saveReminderSettings(payload);
    showToast("บันทึกการแจ้งเตือนแล้ว");
    renderPersonalSettings();
  } catch {
    showToast("บันทึกการแจ้งเตือนไม่สำเร็จ");
  }
}

function exportBossBoardData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    lineDisplayName: teamState.user?.displayName || "",
    tasks: mobileTasks,
    projects: deriveProjectsFromTasks(),
    reminderSettings: reminderSettings || {}
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bossboard-export-${getBangkokDateKey()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("ส่งออกข้อมูลแล้ว");
}

async function clearCompletedTasksFromSettings() {
  const doneTasks = mobileTasks.filter((task) => task.status === "done");
  if (!doneTasks.length) {
    showToast("ยังไม่มีงานที่เสร็จแล้วให้ล้าง");
    return;
  }
  const confirmed = await confirmAction({
    title: "ล้างงานที่เสร็จแล้ว?",
    message: `จะลบงานที่เสร็จแล้ว ${doneTasks.length} รายการออกจากบัญชีของคุณ`,
    confirmText: "ล้างงาน",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(doneTasks.map((task) => deleteTaskFromApi(task.id)));
    mobileTasks = mobileTasks.filter((task) => task.status !== "done");
    showToast("ล้างงานที่เสร็จแล้ว");
    renderPersonalSettings();
  } catch {
    showToast("ล้างงานไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteAllTasksFromSettings() {
  if (!mobileTasks.length) {
    showToast("ยังไม่มีงานให้ลบ");
    return;
  }
  const confirmed = await confirmAction({
    title: "ลบงานทั้งหมด?",
    message: `จะลบงานทั้งหมด ${mobileTasks.length} รายการของบัญชี LINE นี้ โปรไฟล์และการตั้งค่า LINE จะยังอยู่`,
    confirmText: "ลบทั้งหมด",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(mobileTasks.map((task) => deleteTaskFromApi(task.id)));
    mobileTasks = [];
    showToast("ลบงานทั้งหมดแล้ว");
    renderPersonalSettings();
  } catch {
    showToast("ลบงานทั้งหมดไม่สำเร็จ");
  }
}

function renderProjectsPageLegacyUnused() {
  document.body.dataset.view = "projects";
  mobileElements.sectionTitle.textContent = "โปรเจกต์";
  mobileElements.sectionSubtitle.textContent = "จัดกลุ่มงานส่วนตัวตามเรื่องที่ต้องทำ";
  const projects = deriveProjectsFromTasks();
  mobileElements.sectionTitle.textContent = "รายการโปรเจกต์";
  mobileElements.sectionSubtitle.textContent = "อัปเดตล่าสุดวันนี้ ลุยเลยลูกพี่!";
  mobileElements.taskList.innerHTML = `
    <div class="projects-screen">
      <section class="projects-title-panel">
        <div>
          <h2>รายการโปรเจกต์</h2>
          <p>อัปเดตล่าสุดวันนี้ ลุยเลยลูกพี่!</p>
        </div>
        <div class="projects-mascot-badge" aria-hidden="true">
          <img class="brand-mascot-img brand-mascot-project" src="/brand/bossboard-mascot.png" alt="" />
          <span>ดีมาก!</span>
        </div>
      </section>

      <div class="project-list-stack">
        ${projects.length ? projects.map(renderProjectCard).join("") : `
          <article class="empty-state-card">
            <strong>ยังไม่มีโปรเจกต์</strong>
            <p class="task-description">สร้างโปรเจกต์แรกเพื่อแยกงานเป็นเรื่อง เช่น ลูกค้า, แคมเปญ, งานส่วนตัว</p>
          </article>
        `}
      </div>

      <form class="project-create-card project-create-neo" id="projectCreateForm">
        <input id="projectNameInput" placeholder="ชื่อโครงการใหม่" />
        <button type="submit"><span class="material-symbols-outlined">add_circle</span> สร้างโครงการใหม่</button>
      </form>
    </div>
  `;
  mobileElements.taskList.querySelector("#projectCreateForm")?.addEventListener("submit", createProjectFromForm);
  mobileElements.taskList.querySelectorAll("[data-project-name]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedProjectName = card.dataset.projectName;
      myTasksFilter = "upcoming";
      setActiveNav("tasks");
      renderMyTasksPage();
    });
  });
  return;
  mobileElements.taskList.innerHTML = `
    <form class="project-create-card" id="projectCreateForm">
      <div>
        <strong>สร้างโปรเจกต์ใหม่</strong>
        <p class="task-description">ใช้แยกงานเป็นเรื่อง เช่น ลูกค้า, แคมเปญ, งานส่วนตัว</p>
      </div>
      <div class="project-create-row">
        <input id="projectNameInput" placeholder="ชื่อโปรเจกต์" />
        <button type="submit">สร้าง</button>
      </div>
    </form>
    <div class="dashboard-grid">
      ${projects.length ? projects.map(renderProjectCard).join("") : `
        <article class="empty-state-card">
          <strong>ยังไม่มีโปรเจกต์</strong>
          <p class="task-description">เมื่อสร้างงานใหม่ ระบบจะรวมเป็นโปรเจกต์ให้อัตโนมัติจากช่อง “เลือกโปรเจกต์”</p>
        </article>
      `}
    </div>
  `;
  mobileElements.taskList.querySelector("#projectCreateForm")?.addEventListener("submit", createProjectFromForm);
  mobileElements.taskList.querySelectorAll("[data-project-name]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedProjectName = card.dataset.projectName;
      setActiveNav("projects");
      renderProjectDetailPage(selectedProjectName);
    });
  });
}

function findProjectByName(name) {
  return deriveProjectsFromTasks().find((project) => project.name === name) || {
    id: name,
    name,
    description: "",
    icon: "folder",
    color: "#ff8a00",
    priority: "normal",
    total: 0,
    done: 0,
    nextDue: ""
  };
}

function getTasksForProject(name) {
  return mobileTasks.filter((task) => (task.project || "ทั่วไป") === name);
}

function getTaskProgressPercent(task) {
  if (task.status === "done") return 100;
  if (task.status === "review") return 80;
  if (task.status === "progress") return 55;
  return 15;
}

function renderProjectDetailPage(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const openTasks = projectTasks.filter((task) => task.status !== "done").sort(sortTasksByDueDate);
  const doneTasks = projectTasks.filter((task) => task.status === "done").sort(sortTasksByDueDate);
  const nextTask = openTasks[0];
  const total = projectTasks.length;
  const done = doneTasks.length;
  const percent = Math.round((done / Math.max(total, 1)) * 100);
  const projectColor = project.color || "#ff8a00";
  const projectIcon = PROJECT_ICON_OPTIONS.find((item) => item.value === project.icon)?.icon || project.icon || "folder";

  document.body.dataset.view = "project-detail";
  mobileElements.sectionTitle.textContent = project.name;
  mobileElements.sectionSubtitle.textContent = "ไทม์ไลน์ งานถัดไป และรายการทั้งหมดในโปรเจกต์นี้";
  mobileElements.taskList.innerHTML = `
    <div class="project-detail-screen" style="--project-color:${escapeMobileHtml(projectColor)}">
      <button class="detail-back-button" data-project-back type="button">← กลับรายการโปรเจกต์</button>

      <section class="project-detail-hero">
        <div class="project-detail-icon">
          <span class="material-symbols-outlined">${escapeMobileHtml(projectIcon)}</span>
        </div>
        <div class="project-detail-main">
          <span class="settings-kicker">PROJECT ACTIVE</span>
          <h2>${escapeMobileHtml(project.name)}</h2>
          <p>${escapeMobileHtml(project.description || "รวมงานและขั้นตอนทั้งหมดของโปรเจกต์นี้ไว้ที่เดียว")}</p>
          <div class="project-progress-bar"><span style="width:${percent}%"></span></div>
          <div class="project-detail-stats">
            <span>เสร็จแล้ว ${done}/${total}</span>
            <strong>${percent}%</strong>
          </div>
        </div>
      </section>

      <section class="project-next-card">
        <div class="section-title-row">
          <h2>งานถัดไป</h2>
          <button class="view-all-link" data-project-add-task type="button">+ เพิ่มงาน</button>
        </div>
        ${nextTask ? renderProjectNextTask(nextTask) : `
          <article class="mission-empty-card">
            <span class="material-symbols-outlined">task_alt</span>
            <strong>ยังไม่มีงานค้างในโปรเจกต์นี้</strong>
          </article>
        `}
      </section>

      <section class="project-timeline-card">
        <div class="section-title-row">
          <h2>ไทม์ไลน์โปรเจกต์</h2>
          <button class="view-all-link" data-project-view-tasks type="button">ดูงานทั้งหมด ›</button>
        </div>
        <div class="project-timeline">
          ${renderProjectTimelineStep("todo", "รอทำ", projectTasks.filter((task) => task.status === "todo"))}
          ${renderProjectTimelineStep("progress", "กำลังทำ", projectTasks.filter((task) => task.status === "progress"))}
          ${renderProjectTimelineStep("review", "รอตรวจ", projectTasks.filter((task) => task.status === "review"))}
          ${renderProjectTimelineStep("done", "เสร็จแล้ว", doneTasks)}
        </div>
      </section>

      <section class="project-task-list-card">
        <div class="section-title-row">
          <h2>งานในโปรเจกต์</h2>
          <span class="count-pill">${total}</span>
        </div>
        <div class="personal-task-list">
          ${projectTasks.length ? projectTasks.sort(sortTasksByDueDate).map(renderPersonalTaskRow).join("") : renderEmptyPersonalTasks()}
        </div>
      </section>
    </div>
  `;

  wireProjectDetailActions(project.name);
}

function renderProjectNextTask(task) {
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const percent = getTaskProgressPercent(task);
  return `
    <article class="project-next-task">
      <button class="project-next-main" data-project-task="${task.id}" type="button">
        <strong>${escapeMobileHtml(task.title)}</strong>
        <span>${escapeMobileHtml(task.description || "เปิดเพื่อดูรายละเอียดและประวัติการแก้ไข")}</span>
      </button>
      <div class="project-next-meta">
        <span class="pill ${status.className}">${status.label}</span>
        <span>ครบกำหนด ${formatTaskDueAt(task)}</span>
      </div>
      <div class="featured-progress-foot">
        <div class="featured-progress-line"><span style="width:${percent}%"></span></div>
        <strong>${percent}%</strong>
      </div>
      <div class="project-next-actions">
        <button data-project-progress="${task.id}" type="button">ทำต่อ</button>
        <button data-project-review="${task.id}" type="button">รอตรวจ</button>
        <button data-project-done="${task.id}" type="button">เสร็จ</button>
      </div>
    </article>
  `;
}

function renderProjectTimelineStep(status, label, tasks) {
  const activeTask = tasks[0];
  return `
    <article class="project-timeline-step ${tasks.length ? "has-task" : "is-empty"}">
      <span class="project-timeline-dot ${status}">${status === "done" ? "✓" : tasks.length}</span>
      <div>
        <strong>${escapeMobileHtml(label)}</strong>
        ${activeTask
          ? `<button data-project-task="${activeTask.id}" type="button">${escapeMobileHtml(activeTask.title)}<small>${formatTaskDueAt(activeTask)}</small></button>`
          : `<p>ยังไม่มีงานในขั้นนี้</p>`}
      </div>
    </article>
  `;
}

function wireProjectDetailActions(projectName) {
  mobileElements.taskList.querySelector("[data-project-back]")?.addEventListener("click", () => {
    selectedProjectName = "";
    renderProjectsPage();
  });
  mobileElements.taskList.querySelector("[data-project-add-task]")?.addEventListener("click", () => {
    selectedProjectName = projectName;
    setActiveNav("create");
    renderCreateTaskPage({ ...createMobileTask(), project: projectName });
  });
  mobileElements.taskList.querySelector("[data-project-view-tasks]")?.addEventListener("click", () => {
    selectedProjectName = projectName;
    setActiveNav("tasks");
    renderMyTasksPage();
  });
  mobileElements.taskList.querySelectorAll("[data-project-task], [data-row-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.projectTask || button.dataset.rowEdit;
      openTaskDetail(mobileTasks.find((task) => task.id === taskId));
    });
  });
  mobileElements.taskList.querySelectorAll("[data-row-done], [data-project-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.rowDone || button.dataset.projectDone;
      const task = mobileTasks.find((item) => item.id === taskId);
      const confirmed = await confirmAction({
        title: "ยืนยันปิดงาน?",
        message: `ต้องการทำเครื่องหมายว่า “${task?.title || "งานนี้"}” เสร็จแล้วใช่ไหม`,
        confirmText: "ปิดงาน"
      });
      if (!confirmed) return;
      await updateProjectTaskStatus(taskId, "done", "ปิดงานจากหน้าโปรเจกต์", projectName);
    });
  });
  [
    ["project-progress", "progress", "เปลี่ยนสถานะเป็นกำลังทำจากหน้าโปรเจกต์"],
    ["project-review", "review", "เปลี่ยนสถานะเป็นรอตรวจจากหน้าโปรเจกต์"]
  ].forEach(([key, status, activityText]) => {
    mobileElements.taskList.querySelectorAll(`[data-${key}]`).forEach((button) => {
      const taskId = key === "project-progress" ? button.dataset.projectProgress : button.dataset.projectReview;
      button.addEventListener("click", () => updateProjectTaskStatus(taskId, status, activityText, projectName));
    });
  });
}

async function updateProjectTaskStatus(taskId, status, activityText, projectName) {
  try {
    const updatedTask = await patchTaskToApi(taskId, { status, activityText });
    mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    renderProjectDetailPage(projectName);
    showToast("อัปเดตงานแล้ว");
  } catch {
    showToast("อัปเดตงานไม่สำเร็จ");
  }
}

async function createProjectFromFormLegacyUnused(event) {
  event.preventDefault();
  const input = document.querySelector("#projectNameInput");
  const name = input.value.trim();
  if (!name) {
    showToast("กรุณาใส่ชื่อโปรเจกต์");
    return;
  }
  try {
    await saveProjectToApi({ name });
    input.value = "";
    renderProjectsPage();
    showToast("สร้างโปรเจกต์แล้ว");
  } catch {
    showToast("สร้างโปรเจกต์ไม่สำเร็จ");
  }
}

function getCurrentProjectMember() {
  const user = teamState.user || {};
  return {
    id: String(user.id || currentLineUserId || "me"),
    name: String(user.displayName || user.name || "ฉัน"),
    avatarUrl: String(user.pictureUrl || user.avatarUrl || "")
  };
}

function getProjectPriorityLabel(value) {
  return PROJECT_PRIORITY_OPTIONS.find((item) => item.value === value)?.label || "ปกติ";
}

function getTodayInputDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function renderProjectsPage() {
  document.body.dataset.view = "projects";
  mobileElements.sectionTitle.textContent = "รายการโปรเจกต์";
  mobileElements.sectionSubtitle.textContent = "อัปเดตล่าสุดวันนี้ ลุยเลยลูกพี่!";
  const projects = deriveProjectsFromTasks();
  mobileElements.taskList.innerHTML = `
    <div class="projects-screen">
      <section class="projects-title-panel">
        <div>
          <h2>รายการโปรเจกต์</h2>
          <p>อัปเดตล่าสุดวันนี้ ลุยเลยลูกพี่!</p>
        </div>
        <div class="projects-mascot-badge" aria-hidden="true">
          <img class="brand-mascot-img brand-mascot-project" src="/brand/bossboard-mascot.png" alt="" />
          <span>ดีมาก!</span>
        </div>
      </section>

      <div class="project-list-stack">
        ${projects.length ? projects.map(renderProjectCard).join("") : `
          <article class="empty-state-card">
            <strong>ยังไม่มีโปรเจกต์</strong>
            <p class="task-description">สร้างโปรเจกต์แรกเพื่อแยกงานเป็นเรื่อง เช่น ลูกค้า แคมเปญ หรืองานส่วนตัว</p>
          </article>
        `}
      </div>

      <button class="project-create-card project-create-neo project-create-launch" data-open-project-create type="button">
        <span class="material-symbols-outlined">add_circle</span>
        <strong>สร้างโครงการใหม่</strong>
      </button>
    </div>
  `;
  mobileElements.taskList.querySelector("[data-open-project-create]")?.addEventListener("click", () => {
    renderCreateProjectPage();
  });
  mobileElements.taskList.querySelectorAll("[data-project-name]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedProjectName = card.dataset.projectName;
      setActiveNav("projects");
      renderProjectDetailPage(selectedProjectName);
    });
  });
}

function renderCreateProjectPage() {
  document.body.dataset.view = "project-create";
  mobileElements.sectionTitle.textContent = "สร้างโครงการใหม่";
  mobileElements.sectionSubtitle.textContent = "เริ่มโปรเจกต์ใหม่กันเถอะบอส!";
  const member = getCurrentProjectMember();
  const today = getTodayInputDate();
  mobileElements.taskList.innerHTML = `
    <form class="project-create-screen" id="projectCreateFullForm" style="--project-accent: ${PROJECT_COLOR_OPTIONS[0]}">
      <section class="project-create-hero-panel">
        <div>
          <h2>สร้างโครงการใหม่</h2>
          <p>ตั้งชื่อ เลือกสไตล์ และกำหนดช่วงเวลาของโปรเจกต์</p>
        </div>
        <img class="project-create-avatar" src="/brand/bossboard-mascot.png" alt="" />
      </section>

      <label class="project-field">
        <span>ชื่อโครงการ</span>
        <input id="projectNameInput" autocomplete="off" placeholder="เช่น รีแบรนด์บริษัท Q4" />
      </label>

      <label class="project-field">
        <span>รายละเอียด</span>
        <textarea id="projectDescriptionInput" rows="3" placeholder="สรุปเป้าหมาย งานที่ต้องทำ หรือลูกค้าที่เกี่ยวข้อง"></textarea>
      </label>

      <section class="project-picker-block">
        <h3>เลือกไอคอน</h3>
        <div class="project-icon-picker">
          ${PROJECT_ICON_OPTIONS.map((item, index) => `
            <button class="project-icon-choice ${index === 0 ? "active" : ""}" data-project-icon="${item.value}" type="button" aria-label="${item.label}">
              <span class="material-symbols-outlined">${item.icon}</span>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="project-picker-block">
        <h3>ธีมสี</h3>
        <div class="project-color-picker">
          ${PROJECT_COLOR_OPTIONS.map((color, index) => `
            <button class="project-color-choice ${index === 0 ? "active" : ""}" data-project-color="${color}" style="--choice-color:${color}" type="button" aria-label="เลือกสี ${color}"></button>
          `).join("")}
        </div>
      </section>

      <section class="project-picker-block">
        <h3>ความสำคัญ</h3>
        <div class="project-priority-segment">
          ${PROJECT_PRIORITY_OPTIONS.map((item, index) => `
            <button class="${index === 1 ? "active" : ""}" data-project-priority="${item.value}" type="button">${item.label}</button>
          `).join("")}
        </div>
      </section>

      <section class="project-date-grid">
        <label class="project-field">
          <span>วันที่เริ่ม</span>
          <input id="projectStartDateInput" type="date" value="${today}" />
        </label>
        <label class="project-field">
          <span>วันที่สิ้นสุด</span>
          <input id="projectEndDateInput" type="date" />
        </label>
      </section>

      <section class="project-picker-block">
        <h3>สมาชิกเริ่มต้น</h3>
        <div class="project-member-strip">
          <span class="project-member-avatar">${member.avatarUrl ? `<img src="${escapeMobileHtml(member.avatarUrl)}" alt="" />` : escapeMobileHtml(getInitials(member.name))}</span>
          <div>
            <strong>${escapeMobileHtml(member.name)}</strong>
            <p>เจ้าของโปรเจกต์</p>
          </div>
        </div>
      </section>

      <div class="project-create-actions">
        <button class="project-create-confirm" type="submit">
          <span class="material-symbols-outlined">check_circle</span>
          ยืนยันสร้างโครงการ
        </button>
        <button class="project-create-back" data-project-create-back type="button">กลับรายการโปรเจกต์</button>
      </div>
    </form>
  `;

  const form = mobileElements.taskList.querySelector("#projectCreateFullForm");
  form.querySelectorAll("[data-project-icon]").forEach((button) => {
    button.addEventListener("click", () => {
      form.querySelectorAll("[data-project-icon]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  form.querySelectorAll("[data-project-color]").forEach((button) => {
    button.addEventListener("click", () => {
      form.querySelectorAll("[data-project-color]").forEach((item) => item.classList.toggle("active", item === button));
      form.style.setProperty("--project-accent", button.dataset.projectColor || PROJECT_COLOR_OPTIONS[0]);
    });
  });
  form.querySelectorAll("[data-project-priority]").forEach((button) => {
    button.addEventListener("click", () => {
      form.querySelectorAll("[data-project-priority]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });
  form.addEventListener("submit", createProjectFromForm);
  form.querySelector("[data-project-create-back]")?.addEventListener("click", renderProjectsPage);
}

async function createProjectFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.querySelector("#projectNameInput")?.value.trim() || "";
  if (!name) {
    showToast("กรุณาใส่ชื่อโปรเจกต์");
    form.querySelector("#projectNameInput")?.focus();
    return;
  }
  const member = getCurrentProjectMember();
  const project = {
    name,
    description: form.querySelector("#projectDescriptionInput")?.value.trim() || "",
    icon: form.querySelector("[data-project-icon].active")?.dataset.projectIcon || "folder",
    color: form.querySelector("[data-project-color].active")?.dataset.projectColor || PROJECT_COLOR_OPTIONS[0],
    priority: form.querySelector("[data-project-priority].active")?.dataset.projectPriority || "normal",
    startDate: form.querySelector("#projectStartDateInput")?.value || "",
    endDate: form.querySelector("#projectEndDateInput")?.value || "",
    members: [member]
  };
  try {
    const savedProject = await saveProjectToApi(project);
    selectedProjectName = savedProject?.name || name;
    setActiveNav("projects");
    renderProjectsPage();
    showToast("สร้างโปรเจกต์แล้ว");
  } catch {
    showToast("สร้างโปรเจกต์ไม่สำเร็จ");
  }
}

function deriveProjectsFromTasks() {
  const projectMap = new Map();
  mobileProjects.forEach((project) => {
    if (!project?.name) return;
    projectMap.set(project.name, { ...project, total: 0, done: 0, nextDue: "" });
  });
  mobileTasks.forEach((task) => {
    const name = task.project || "ทั่วไป";
    const current = projectMap.get(name) || { id: name, name, total: 0, done: 0, nextDue: "" };
    current.total += 1;
    if (task.status === "done") current.done += 1;
    if (task.dueDate && (!current.nextDue || task.dueDate < current.nextDue)) current.nextDue = task.dueDate;
    projectMap.set(name, current);
  });
  return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function getProjectNames(extraProject = "") {
  const names = new Set(["LINE Mobile", "งานส่วนตัว"]);
  deriveProjectsFromTasks().forEach((project) => names.add(project.name));
  if (extraProject) names.add(extraProject);
  return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b, "th"));
}

function renderProjectCardLegacyUnused(project) {
  const percent = Math.round((project.done / Math.max(project.total, 1)) * 100);
  const projectTasks = mobileTasks.filter((task) => (task.project || "ทั่วไป") === project.name);
  const openTasks = projectTasks.filter((task) => task.status !== "done").length;
  const highTasks = projectTasks.filter((task) => task.priority === "high").length;
  const badgeLabel = percent >= 80 ? "ด่วนมาก" : highTasks ? "ด่วน" : percent === 0 ? "วางแผน" : "ปกติ";
  const toneClass = percent >= 80 ? "is-high" : percent === 0 ? "is-planning" : "is-normal";
  const dueLabel = project.nextDue ? formatMobileDate(project.nextDue) : "ยังไม่กำหนด";
  const description = project.description || `${openTasks} งานที่ยังต้องลุย${project.total ? ` จากทั้งหมด ${project.total} งาน` : ""}`;
  const assignees = Array.from(new Set(projectTasks.map((task) => task.assignee || "ฉัน").filter(Boolean))).slice(0, 2);
  const moreCount = Math.max(0, new Set(projectTasks.map((task) => task.assignee || "ฉัน").filter(Boolean)).size - assignees.length);
  return `
    <button class="project-overview-card project-neo-card ${toneClass}" data-project-name="${escapeMobileHtml(project.name)}" type="button">
      <div class="project-card-glow" aria-hidden="true"></div>
      <div class="project-percent-badge">
        <strong>${percent}</strong><span>%</span>
      </div>
      <div class="project-card-main">
        <div class="project-card-title-row">
          <h2>${escapeMobileHtml(project.name)}</h2>
          <span class="project-priority-badge">${badgeLabel}</span>
        </div>
        <p>${escapeMobileHtml(description)}</p>
        <div class="project-progress-bar"><span style="width: ${percent}%"></span></div>
        <div class="project-card-footer">
          <div class="project-avatars">
            ${assignees.map((name) => `<span>${escapeMobileHtml(getInitials(name))}</span>`).join("")}
            ${moreCount ? `<span>+${moreCount}</span>` : ""}
          </div>
          <span class="project-due"><span class="material-symbols-outlined">calendar_today</span>${escapeMobileHtml(dueLabel)}</span>
        </div>
      </div>
    </button>
  `;
  return `
    <button class="profile-card project-overview-card" data-project-name="${escapeMobileHtml(project.name)}" type="button">
      <div class="section-title-row">
        <h2>${escapeMobileHtml(project.name)}</h2>
        <span class="pill priority-medium">${percent}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
      <p class="task-description">${project.done}/${project.total} งานเสร็จแล้ว${project.nextDue ? ` · ใกล้สุด ${formatMobileDate(project.nextDue)}` : " · ยังไม่มีงาน"}</p>
    </button>
  `;
}

function renderProjectCard(project) {
  const percent = Math.round((Number(project.done || 0) / Math.max(Number(project.total || 0), 1)) * 100);
  const projectTasks = mobileTasks.filter((task) => (task.project || "ทั่วไป") === project.name);
  const openTasks = projectTasks.filter((task) => task.status !== "done").length;
  const priority = project.priority || (projectTasks.some((task) => task.priority === "high") ? "urgent" : "normal");
  const priorityClass = priority === "critical" ? "is-high" : priority === "urgent" ? "is-urgent" : "is-normal";
  const badgeLabel = getProjectPriorityLabel(priority);
  const toneClass = percent >= 80 ? "is-high" : percent === 0 ? "is-planning" : "is-normal";
  const dueLabel = project.endDate
    ? formatMobileDate(project.endDate)
    : project.nextDue
      ? formatMobileDate(project.nextDue)
      : "ยังไม่กำหนด";
  const description = project.description || `${openTasks} งานที่ยังต้องลุย${project.total ? ` จากทั้งหมด ${project.total} งาน` : ""}`;
  const projectMembers = Array.isArray(project.members) ? project.members : [];
  const taskAssignees = Array.from(new Set(projectTasks.map((task) => task.assignee || "").filter(Boolean)));
  const memberNames = taskAssignees.length
    ? taskAssignees
    : projectMembers.map((member) => member.name || member.id || "ฉัน").filter(Boolean);
  const visibleMembers = memberNames.slice(0, 2);
  const moreCount = Math.max(0, memberNames.length - visibleMembers.length);
  const projectColor = project.color || "#ff8a00";
  const projectIcon = PROJECT_ICON_OPTIONS.find((item) => item.value === project.icon)?.icon || project.icon || "folder";
  return `
    <button class="project-overview-card project-neo-card ${toneClass}" data-project-name="${escapeMobileHtml(project.name)}" style="--project-color:${escapeMobileHtml(projectColor)}" type="button">
      <div class="project-card-glow" aria-hidden="true"></div>
      <div class="project-percent-badge">
        <strong>${percent}</strong><span>%</span>
      </div>
      <div class="project-card-main">
        <div class="project-card-title-row">
          <h2><span class="material-symbols-outlined project-card-icon">${escapeMobileHtml(projectIcon)}</span>${escapeMobileHtml(project.name)}</h2>
          <span class="project-priority-badge ${priorityClass}">${badgeLabel}</span>
        </div>
        <p>${escapeMobileHtml(description)}</p>
        <div class="project-progress-bar"><span style="width: ${percent}%"></span></div>
        <div class="project-card-footer">
          <div class="project-avatars">
            ${visibleMembers.map((name) => `<span>${escapeMobileHtml(getInitials(name))}</span>`).join("")}
            ${moreCount ? `<span>+${moreCount}</span>` : ""}
          </div>
          <span class="project-due"><span class="material-symbols-outlined">calendar_today</span>${escapeMobileHtml(dueLabel)}</span>
        </div>
      </div>
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
  const safeKpi = kpi || { total: 0, done: 0, active: 0, overdue: 0, completionRate: 0, dueSoon: [] };
  mobileElements.taskList.innerHTML = `
    <div class="profile-screen">
      <section class="profile-hero-card">
        <div class="profile-hero-top">
          <div class="profile-avatar-wrap">
            ${avatar ? `<img class="profile-avatar-xl" src="${escapeMobileHtml(avatar)}" alt="avatar" />` : `<div class="profile-avatar-xl">👤</div>`}
            ${editable ? `<span class="profile-camera-dot">⌁</span>` : ""}
          </div>
          <div>
            <span class="settings-kicker">${editable ? "My profile" : "Member profile"}</span>
            <h2>${escapeMobileHtml(user?.displayName || "ยังไม่ตั้งชื่อ")}</h2>
            <p>${escapeMobileHtml(user?.position || "ยังไม่ระบุตำแหน่ง")}</p>
          </div>
        </div>
        <div class="profile-meta-pills">
          <span>${escapeMobileHtml(user?.department || "ยังไม่ระบุแผนก")}</span>
          <span>${escapeMobileHtml(user?.phone || "ยังไม่ใส่เบอร์")}</span>
          <span>LINE linked</span>
        </div>
        <p class="profile-bio">${escapeMobileHtml(user?.bio || "ยังไม่มีข้อมูลแนะนำตัว")}</p>
      </section>

      <section class="profile-kpi-strip">
        <article><span>ทั้งหมด</span><strong>${safeKpi.total}</strong></article>
        <article><span>เสร็จแล้ว</span><strong>${safeKpi.done}</strong></article>
        <article><span>กำลังทำ</span><strong>${safeKpi.active}</strong></article>
        <article><span>เลยกำหนด</span><strong>${safeKpi.overdue}</strong></article>
      </section>

      ${renderKpiCard(safeKpi)}
      ${editable ? renderProfileForm(user) : `<section class="settings-card"><p class="task-description">หัวหน้างานสามารถดู KPI และงานใกล้ครบกำหนดของสมาชิกได้จากหน้านี้</p></section>`}
    </div>
  `;
  document.querySelector("#saveProfileButton")?.addEventListener("click", saveMyProfile);
}

function renderProfileForm(user) {
  return `
    <section class="settings-card profile-edit-card">
      <div class="settings-card-head">
        <div>
          <span class="settings-kicker">Account</span>
          <h2>แก้ไขข้อมูลโปรไฟล์</h2>
        </div>
      </div>
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
      </div>
      <button id="saveProfileButton" class="save-button" type="button">บันทึกโปรไฟล์</button>
    </section>
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
        ${(safeKpi.dueSoon || []).length ? safeKpi.dueSoon.map((task) => `<div class="mini-task"><strong>${escapeMobileHtml(task.title)}</strong><span>${formatTaskDueAt(task)}</span></div>`).join("") : `<p class="task-description">ยังไม่มีงานใกล้ครบกำหนด</p>`}
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
        <span>${formatTaskDueAt(task)}</span>
      </div>
      <div class="task-actions" style="margin-top: 12px;">
        <button data-edit-task="${task.id}" type="button">แก้ไข</button>
        ${task.status !== "done" ? `<button data-done-task="${task.id}" type="button">ทำเสร็จ</button>` : ""}
      </div>
    </article>
  `;
}

function openMobileDialog(task) {
  const exists = mobileTasks.some((currentTask) => currentTask.id === task.id);
  document.querySelector("#mobileTaskId").value = task.id;
  document.querySelector("#mobileTaskTitle").value = task.title;
  document.querySelector("#mobileTaskDescription").value = task.description;
  renderProjectSelect(task);
  renderAssigneeSelect(task);
  document.querySelector("#mobileTaskDueDate").value = task.dueDate;
  document.querySelector("#mobileTaskDueTime").value = task.dueTime || "";
  document.querySelector("#mobileTaskStatus").value = task.status;
  document.querySelector("#mobileTaskPriority").value = task.priority;
  document.querySelector("#mobileTaskDeleteButton")?.classList.toggle("hidden", !exists);
  mobileElements.taskDialog.showModal();
}

function renderProjectSelect(task) {
  const select = document.querySelector("#mobileTaskProject");
  const names = getProjectNames(task.project);
  select.innerHTML = [
    ...names.map((name) => `<option value="${escapeMobileHtml(name)}" ${name === task.project ? "selected" : ""}>${escapeMobileHtml(name)}</option>`),
    `<option value="__new">+ สร้างโปรเจกต์ใหม่</option>`
  ].join("");
  document.querySelector("#mobileTaskNewProject").value = "";
  document.querySelector("#mobileTaskNewProjectLabel")?.classList.add("hidden");
  select.onchange = (event) => {
    document.querySelector("#mobileTaskNewProjectLabel")?.classList.toggle("hidden", event.target.value !== "__new");
  };
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
  const previousView = document.body.dataset.view;
  const existingTask = mobileTasks.find((currentTask) => currentTask.id === document.querySelector("#mobileTaskId").value);
  const task = {
    ...existingTask,
    id: document.querySelector("#mobileTaskId").value,
    title: document.querySelector("#mobileTaskTitle").value.trim() || "Untitled task",
    description: document.querySelector("#mobileTaskDescription").value.trim(),
    project: document.querySelector("#mobileTaskProject").value === "__new"
      ? document.querySelector("#mobileTaskNewProject").value.trim()
      : document.querySelector("#mobileTaskProject").value,
    assignee: document.querySelector("#mobileTaskAssigneeUserId").selectedOptions[0]?.dataset.name || "Unassigned",
    assigneeUserId: document.querySelector("#mobileTaskAssigneeUserId").value,
    organizationId: PERSONAL_MODE ? "" : document.querySelector("#mobileTaskAssigneeUserId").selectedOptions[0]?.dataset.organization || "",
    dueDate: document.querySelector("#mobileTaskDueDate").value,
    dueTime: document.querySelector("#mobileTaskDueTime").value,
    status: document.querySelector("#mobileTaskStatus").value,
    priority: document.querySelector("#mobileTaskPriority").value,
    tags: ["LIFF"],
    activity: existingTask?.activity || []
  };
  if (!task.project) {
    showToast("กรุณาเลือกหรือสร้างโปรเจกต์");
    return;
  }

  const exists = mobileTasks.some((currentTask) => currentTask.id === task.id);
  try {
    if (document.querySelector("#mobileTaskProject").value === "__new") {
      await saveProjectToApi({ name: task.project, description: "สร้างจากหน้าแก้ไขงาน" });
    }
    const savedTask = await persistTask(task, exists);
    mobileElements.taskDialog.close();
    if (previousView === "task-detail") openTaskDetail(savedTask);
    else if (previousView === "project-detail" && selectedProjectName) renderProjectDetailPage(selectedProjectName);
    else renderMobile();
    showToast("บันทึกงานแล้ว");
  } catch {
    showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

async function deleteTaskWithConfirmation(taskId) {
  const task = mobileTasks.find((item) => item.id === taskId);
  if (!task) return;
  const confirmed = await confirmAction({
    title: "ลบงานนี้?",
    message: `งาน “${task.title}” จะถูกลบออกจากรายการของคุณ`,
    confirmText: "ลบงาน",
    danger: true
  });
  if (!confirmed) return;
  try {
    await deleteTaskFromApi(taskId);
    mobileTasks = mobileTasks.filter((item) => item.id !== taskId);
    if (mobileElements.taskDialog.open) mobileElements.taskDialog.close();
    if (document.body.dataset.view === "project-detail" && selectedProjectName) {
      renderProjectDetailPage(selectedProjectName);
    } else if (document.body.dataset.view === "create") {
      setActiveNav("tasks");
      renderMyTasksPage();
    } else if (document.body.dataset.view === "tasks") {
      renderMyTasksPage();
    } else {
      renderMobile();
    }
    showToast("ลบงานแล้ว");
  } catch {
    showToast("ลบงานไม่สำเร็จ");
  }
}

function createMobileTask() {
  return {
    id: `task-${Date.now()}`,
    title: "",
    description: "",
    project: selectedProjectName || "Inbox",
    assignee: teamState.user?.displayName || "Narin",
    assigneeUserId: teamState.user?.id || "",
    organizationId: PERSONAL_MODE ? "" : teamState.activeOrganization?.id || "",
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    dueTime: "",
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

function confirmAction({ title, message, confirmText = "ยืนยัน", cancelText = "ยกเลิก", danger = false }) {
  return new Promise((resolve) => {
    const existing = document.querySelector(".confirm-sheet");
    existing?.remove();
    const sheet = document.createElement("div");
    sheet.className = "confirm-sheet";
    sheet.innerHTML = `
      <div class="confirm-card" role="dialog" aria-modal="true" aria-label="${escapeMobileHtml(title)}">
        <strong>${escapeMobileHtml(title)}</strong>
        <p>${escapeMobileHtml(message)}</p>
        <div class="confirm-actions">
          <button class="confirm-cancel" type="button">${escapeMobileHtml(cancelText)}</button>
          <button class="${danger ? "confirm-danger" : "confirm-primary"}" type="button">${escapeMobileHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    const close = (value) => {
      sheet.remove();
      resolve(value);
    };
    sheet.querySelector(".confirm-cancel")?.addEventListener("click", () => close(false));
    sheet.querySelector(danger ? ".confirm-danger" : ".confirm-primary")?.addEventListener("click", () => close(true));
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) close(false);
    });
  });
}

function formatMobileDate(value) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatTaskDueAt(task) {
  const dateText = formatMobileDate(task.dueDate);
  return task.dueTime ? `${dateText} ${task.dueTime}` : dateText;
}

function escapeMobileHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Reminder-first experience overrides.
// Keep projects as organization, but make the daily reminder flow the default mental model.
function renderMobile() {
  document.body.dataset.view = "dashboard reminder-home";
  const todayKey = getBangkokDateKey();
  const activeTasks = mobileTasks.filter((task) => task.status !== "done").sort(sortTasksByDueDate);
  const todayTasks = activeTasks.filter((task) => (task.dueDate || todayKey) <= todayKey);
  const nextTasks = activeTasks.filter((task) => (task.dueDate || todayKey) > todayKey).slice(0, 4);
  const doneToday = mobileTasks.filter((task) => task.status === "done" && (task.dueDate || todayKey) === todayKey);

  mobileElements.filterText.textContent = "Today";
  mobileElements.sectionTitle.textContent = "วันนี้ต้องทำอะไร";
  mobileElements.sectionSubtitle.textContent = "พิมพ์ใน LINE ให้ BossBoard ช่วยจดวัน เวลา และเตือนกลับ";
  mobileElements.taskList.innerHTML = renderReminderHome({ todayTasks, nextTasks, doneToday, activeTasks });

  mobileElements.taskList.querySelectorAll("[data-open-create]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = "";
      setActiveNav("create");
      renderCreateTaskPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-open-my-tasks]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = "";
      setActiveNav("tasks");
      renderMyTasksPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-open-projects]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectName = "";
      setActiveNav("projects");
      renderProjectsPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-open-line-settings]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNav("line");
      renderPersonalSettings();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-card-edit], [data-row-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(mobileTasks.find((task) => task.id === (button.dataset.cardEdit || button.dataset.rowEdit))));
  });
  mobileElements.taskList.querySelectorAll("[data-start-task]").forEach((button) => {
    button.addEventListener("click", () => updateReminderStatus(button.dataset.startTask, "progress", "เริ่มทำจากหน้าเตือนวันนี้", renderMobile));
  });
  mobileElements.taskList.querySelectorAll("[data-done-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.doneTask);
      const confirmed = await confirmAction({
        title: "ยืนยันว่าทำเสร็จแล้ว?",
        message: `งาน "${task?.title || "รายการนี้"}" จะถูกย้ายไปเสร็จแล้ว ถ้ากดผิดยังแก้กลับได้จากรายละเอียดงาน`,
        confirmText: "เสร็จจริง"
      });
      if (!confirmed) return;
      updateReminderStatus(button.dataset.doneTask, "done", "ปิดงานจากหน้าเตือนวันนี้", renderMobile);
    });
  });
}

function renderReminderHome({ todayTasks, nextTasks, doneToday, activeTasks }) {
  const totalToday = todayTasks.length + doneToday.length;
  const nextTask = todayTasks[0] || nextTasks[0];
  return `
    <div class="reminder-home-screen">
      <section class="reminder-command-card">
        <div>
          <span class="reminder-kicker">LINE reminder first</span>
          <h2>แค่พิมพ์ใน LINE</h2>
          <p>เช่น “ประชุมทีมวันนี้ 15:00”, “กินยาทุกวัน 20:00”, “ส่งใบเสนอราคาภายในอาทิตย์นี้” แล้วระบบจะจดและเตือนให้</p>
        </div>
        <button data-open-create type="button">เพิ่มเอง</button>
      </section>

      <section class="reminder-today-panel">
        <div class="reminder-panel-head">
          <div>
            <span>ภาพรวมวันนี้</span>
            <h2>${todayTasks.length ? `มี ${todayTasks.length} เรื่องต้องจัดการ` : "วันนี้ยังโล่งอยู่"}</h2>
          </div>
          <div class="reminder-count-badge">${doneToday.length}/${Math.max(totalToday, 1)}</div>
        </div>
        ${nextTask ? renderNextReminderCard(nextTask) : renderNoReminderCard()}
      </section>

      <section class="reminder-list-section">
        <div class="section-title-row">
          <h2>ต้องทำวันนี้</h2>
          <button class="view-all-link" data-open-my-tasks type="button">ดูทั้งหมด ›</button>
        </div>
        <div class="reminder-stack">
          ${todayTasks.length ? todayTasks.slice(0, 4).map(renderReminderTaskRow).join("") : renderReminderEmpty("ไม่มีงานครบกำหนดวันนี้ ลองพิมพ์ใน LINE เพื่อจดเตือนใหม่ได้เลย")}
        </div>
      </section>

      <section class="reminder-list-section">
        <div class="section-title-row">
          <h2>เร็ว ๆ นี้</h2>
          <button class="view-all-link" data-open-projects type="button">จัดตามโปรเจกต์ ›</button>
        </div>
        <div class="reminder-stack compact">
          ${nextTasks.length ? nextTasks.map(renderReminderTaskRow).join("") : renderReminderEmpty("ยังไม่มีรายการล่วงหน้า")}
        </div>
      </section>

      <section class="reminder-line-card">
        <div class="line-bubble">LINE</div>
        <div>
          <strong>LINE คือทางเข้าหลัก</strong>
          <p>บันทึกงาน ประชุม กินยา นัดหมาย หรือเรื่องส่วนตัวจากแชทเดียว แล้วเปิดแอปเพื่อดูรายการวันนี้</p>
        </div>
        <button data-open-line-settings type="button">ตั้งค่า</button>
      </section>
    </div>
  `;
}

function renderNextReminderCard(task) {
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const priority = mobilePriorityMeta[task.priority] || mobilePriorityMeta.medium;
  return `
    <article class="next-reminder-card" data-card-edit="${task.id}" role="button" tabindex="0">
      <div>
        <span class="project-chip">${escapeMobileHtml(task.project || "Inbox")}</span>
        <h3>${escapeMobileHtml(task.title)}</h3>
        <p>ครบกำหนด ${formatTaskDueAt(task)} · ${priority.label}</p>
      </div>
      <div class="next-reminder-actions">
        ${task.status === "todo" ? `<button data-start-task="${task.id}" type="button">เริ่มทำ</button>` : `<span class="pill ${status.className}">${status.label}</span>`}
        <button data-done-task="${task.id}" type="button">เสร็จ</button>
      </div>
    </article>
  `;
}

function renderNoReminderCard() {
  return `
    <article class="next-reminder-card is-empty">
      <div>
        <span class="project-chip">พร้อมรับงานใหม่</span>
        <h3>ยังไม่มีอะไรต้องรีบทำ</h3>
        <p>พิมพ์ใน LINE เช่น “เตือนกินยา 20:00” หรือกดเพิ่มเองได้เลย</p>
      </div>
      <button data-open-create type="button">+ เพิ่มเตือน</button>
    </article>
  `;
}

function renderReminderTaskRow(task) {
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  return `
    <article class="reminder-task-row">
      <button class="reminder-check ${task.status === "done" ? "checked" : ""}" data-done-task="${task.id}" type="button" aria-label="ทำเสร็จ"></button>
      <button class="reminder-task-main" data-row-edit="${task.id}" type="button">
        <strong>${escapeMobileHtml(task.title)}</strong>
        <span>${escapeMobileHtml(task.project || "Inbox")} · ${formatTaskDueAt(task)}</span>
      </button>
      <span class="pill ${status.className}">${status.label}</span>
    </article>
  `;
}

function renderReminderEmpty(message) {
  return `<article class="reminder-empty-card">${escapeMobileHtml(message)}</article>`;
}

function renderMyTasksPage() {
  document.body.dataset.view = "tasks reminder-list";
  selectedProjectName = "";
  const todayKey = getBangkokDateKey();
  const todayTasks = mobileTasks.filter((task) => task.status !== "done" && (task.dueDate || todayKey) <= todayKey).sort(sortTasksByDueDate);
  const upcomingTasks = mobileTasks.filter((task) => task.status !== "done" && (task.dueDate || todayKey) > todayKey).sort(sortTasksByDueDate);
  const doneTasks = mobileTasks.filter((task) => task.status === "done").sort(sortTasksByDueDate).reverse();
  const sourceTasks = myTasksFilter === "upcoming" ? upcomingTasks : myTasksFilter === "done" ? doneTasks : todayTasks;

  mobileElements.sectionTitle.textContent = "รายการเตือนของฉัน";
  mobileElements.sectionSubtitle.textContent = "รวมทุกเรื่องที่จดจาก LINE และเพิ่มเองในแอป";
  mobileElements.taskList.innerHTML = `
    <div class="my-tasks-screen reminder-list-screen">
      <section class="reminder-list-hero">
        <h2>วันนี้ ${todayTasks.length} · เร็ว ๆ นี้ ${upcomingTasks.length}</h2>
        <p>ใช้หน้านี้เช็คทุก reminder ส่วนโปรเจกต์มีไว้แยกงานชุดใหญ่เท่านั้น</p>
      </section>
      <div class="segmented-tabs mission-tabs">
        <button class="${myTasksFilter === "today" ? "active" : ""}" data-my-filter="today" type="button">วันนี้</button>
        <button class="${myTasksFilter === "upcoming" ? "active" : ""}" data-my-filter="upcoming" type="button">เร็ว ๆ นี้</button>
        <button class="${myTasksFilter === "done" ? "active" : ""}" data-my-filter="done" type="button">เสร็จแล้ว</button>
      </div>
      <div class="reminder-stack">
        ${sourceTasks.length ? sourceTasks.map(renderReminderTaskRow).join("") : renderReminderEmpty("ยังไม่มีรายการในหมวดนี้")}
      </div>
    </div>
  `;

  mobileElements.taskList.querySelectorAll("[data-my-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      myTasksFilter = button.dataset.myFilter;
      renderMyTasksPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-row-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(mobileTasks.find((task) => task.id === button.dataset.rowEdit)));
  });
  mobileElements.taskList.querySelectorAll("[data-done-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.doneTask);
      const confirmed = await confirmAction({
        title: "ยืนยันว่าทำเสร็จแล้ว?",
        message: `งาน "${task?.title || "รายการนี้"}" จะถูกย้ายไปเสร็จแล้ว`,
        confirmText: "เสร็จจริง"
      });
      if (!confirmed) return;
      updateReminderStatus(button.dataset.doneTask, "done", "ปิดงานจากหน้ารายการเตือน", renderMyTasksPage);
    });
  });
}

async function updateReminderStatus(taskId, status, activityText, afterRender) {
  try {
    const updatedTask = await patchTaskToApi(taskId, { status, activityText });
    mobileTasks = mobileTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    afterRender();
    showToast(status === "done" ? "บันทึกว่าเสร็จแล้ว" : "อัปเดตสถานะแล้ว");
  } catch {
    showToast("อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

function getInitials(value) {
  const text = String(value || "ฉัน").trim();
  if (!text) return "ฉัน";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function __bossboardUtilityOverridesLoaded() {
  return true;
}

function renderProjectDetailPage(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const openTasks = projectTasks.filter((task) => task.status !== "done").sort(sortTasksByDueDate);
  const doneTasks = projectTasks.filter((task) => task.status === "done").sort(sortTasksByDueDate);
  const nextTask = openTasks[0];
  const total = projectTasks.length;
  const done = doneTasks.length;
  const percent = Math.round((done / Math.max(total, 1)) * 100);
  const projectColor = project.color || "#ff8a00";
  const projectIcon = PROJECT_ICON_OPTIONS.find((item) => item.value === project.icon)?.icon || project.icon || "folder";

  document.body.dataset.view = "project-detail";
  mobileElements.sectionTitle.textContent = project.name;
  mobileElements.sectionSubtitle.textContent = "งานในโปรเจกต์นี้และขั้นตอนถัดไป";
  mobileElements.taskList.innerHTML = `
    <div class="project-detail-screen" style="--project-color:${escapeMobileHtml(projectColor)}">
      <div class="utility-topbar">
        <button class="detail-back-button" data-project-back type="button">← โปรเจกต์</button>
        <button class="danger-outline-button compact" data-project-delete type="button">ลบโปรเจกต์</button>
      </div>
      <section class="project-detail-hero">
        <div class="project-detail-icon">
          <span class="material-symbols-outlined">${escapeMobileHtml(projectIcon)}</span>
        </div>
        <div class="project-detail-main">
          <span class="settings-kicker">PROJECT</span>
          <h2>${escapeMobileHtml(project.name)}</h2>
          <p>${escapeMobileHtml(project.description || "รวมรายการเตือนและงานที่เกี่ยวกับเรื่องนี้ไว้ด้วยกัน")}</p>
          <div class="project-progress-bar"><span style="width:${percent}%"></span></div>
          <div class="project-detail-stats">
            <span>เสร็จแล้ว ${done}/${total}</span>
            <strong>${percent}%</strong>
          </div>
        </div>
      </section>
      <section class="project-next-card">
        <div class="section-title-row">
          <h2>งานถัดไป</h2>
          <button class="view-all-link" data-project-add-task type="button">+ เพิ่มงาน</button>
        </div>
        ${nextTask ? renderProjectNextTask(nextTask) : `<article class="mission-empty-card"><strong>ยังไม่มีงานค้างในโปรเจกต์นี้</strong></article>`}
      </section>
      <section class="project-task-list-card">
        <div class="section-title-row">
          <h2>งานในโปรเจกต์</h2>
          <span class="count-pill">${total}</span>
        </div>
        <div class="personal-task-list">
          ${projectTasks.length ? projectTasks.sort(sortTasksByDueDate).map(renderPersonalTaskRow).join("") : renderEmptyPersonalTasks()}
        </div>
      </section>
    </div>
  `;
  wireProjectDetailActions(project.name);
  mobileElements.taskList.querySelector("[data-project-delete]")?.addEventListener("click", () => deleteProjectWithConfirmation(project.name));
}

async function deleteProjectWithConfirmation(projectName) {
  const project = findProjectByName(projectName);
  const projectTasks = getTasksForProject(project.name);
  const confirmed = await confirmAction({
    title: `ลบโปรเจกต์ "${project.name}"?`,
    message: projectTasks.length
      ? `มีงานอยู่ ${projectTasks.length} รายการ ระบบจะย้ายงานเหล่านี้กลับไปที่ Inbox ก่อนลบโปรเจกต์`
      : "โปรเจกต์นี้จะถูกลบออกจากรายการ",
    confirmText: "ลบโปรเจกต์",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(projectTasks.map((task) => patchTaskToApi(task.id, {
      project: "Inbox",
      activityText: `ย้ายออกจากโปรเจกต์ ${project.name} ก่อนลบโปรเจกต์`
    })));
    const realProject = mobileProjects.find((item) => item.id === project.id || item.name === project.name);
    if (realProject?.id) await deleteProjectFromApi(realProject.id);
    await Promise.all([loadMobileTasks(), loadProjects()]);
    selectedProjectName = "";
    renderProjectsPage();
    showToast("ลบโปรเจกต์แล้ว งานถูกย้ายไป Inbox");
  } catch {
    showToast("ลบโปรเจกต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

function renderMyTasksPage() {
  document.body.dataset.view = "tasks reminder-list";
  selectedProjectName = "";
  const todayKey = getBangkokDateKey();
  const todayTasks = mobileTasks.filter((task) => task.status !== "done" && (task.dueDate || todayKey) <= todayKey).sort(sortTasksByDueDate);
  const upcomingTasks = mobileTasks.filter((task) => task.status !== "done" && (task.dueDate || todayKey) > todayKey).sort(sortTasksByDueDate);
  const doneTasks = mobileTasks.filter((task) => task.status === "done").sort(sortTasksByDueDate).reverse();
  const sourceTasks = myTasksFilter === "upcoming" ? upcomingTasks : myTasksFilter === "done" ? doneTasks : todayTasks;
  selectedReminderTaskIds = new Set([...selectedReminderTaskIds].filter((id) => sourceTasks.some((task) => task.id === id)));

  mobileElements.sectionTitle.textContent = "รายการเตือนของฉัน";
  mobileElements.sectionSubtitle.textContent = "เลือกหลายรายการ ลบรายการเก่า หรือเปิดดูรายละเอียดได้จากหน้านี้";
  mobileElements.taskList.innerHTML = `
    <div class="my-tasks-screen reminder-list-screen">
      <section class="reminder-list-hero">
        <h2>วันนี้ ${todayTasks.length} · เร็ว ๆ นี้ ${upcomingTasks.length}</h2>
        <p>หน้านี้คือศูนย์รวม reminder ทั้งหมด ส่วนโปรเจกต์เอาไว้จัดหมวดงานใหญ่</p>
      </section>
      <div class="segmented-tabs mission-tabs">
        <button class="${myTasksFilter === "today" ? "active" : ""}" data-my-filter="today" type="button">วันนี้</button>
        <button class="${myTasksFilter === "upcoming" ? "active" : ""}" data-my-filter="upcoming" type="button">เร็ว ๆ นี้</button>
        <button class="${myTasksFilter === "done" ? "active" : ""}" data-my-filter="done" type="button">เสร็จแล้ว</button>
      </div>
      <section class="bulk-action-bar">
        <button data-select-all-tasks type="button">เลือกทั้งหมด</button>
        <button data-clear-selected-tasks type="button">ล้าง</button>
        <strong>${selectedReminderTaskIds.size} รายการ</strong>
        <button class="danger" data-delete-selected-tasks type="button" ${selectedReminderTaskIds.size ? "" : "disabled"}>ลบที่เลือก</button>
      </section>
      <div class="reminder-stack">
        ${sourceTasks.length ? sourceTasks.map(renderSelectableReminderTaskRow).join("") : renderReminderEmpty("ยังไม่มีรายการในหมวดนี้")}
      </div>
    </div>
  `;

  mobileElements.taskList.querySelectorAll("[data-my-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      myTasksFilter = button.dataset.myFilter;
      selectedReminderTaskIds.clear();
      renderMyTasksPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-select-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.selectTask;
      if (selectedReminderTaskIds.has(id)) selectedReminderTaskIds.delete(id);
      else selectedReminderTaskIds.add(id);
      renderMyTasksPage();
    });
  });
  mobileElements.taskList.querySelectorAll("[data-row-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(mobileTasks.find((task) => task.id === button.dataset.rowEdit)));
  });
  mobileElements.taskList.querySelectorAll("[data-done-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.doneTask);
      const confirmed = await confirmAction({
        title: "ยืนยันว่าทำเสร็จแล้ว?",
        message: `งาน "${task?.title || "รายการนี้"}" จะถูกย้ายไปเสร็จแล้ว`,
        confirmText: "เสร็จจริง"
      });
      if (!confirmed) return;
      updateReminderStatus(button.dataset.doneTask, "done", "ปิดงานจากหน้ารายการเตือน", renderMyTasksPage);
    });
  });
  mobileElements.taskList.querySelector("[data-select-all-tasks]")?.addEventListener("click", () => {
    selectedReminderTaskIds = new Set(sourceTasks.map((task) => task.id));
    renderMyTasksPage();
  });
  mobileElements.taskList.querySelector("[data-clear-selected-tasks]")?.addEventListener("click", () => {
    selectedReminderTaskIds.clear();
    renderMyTasksPage();
  });
  mobileElements.taskList.querySelector("[data-delete-selected-tasks]")?.addEventListener("click", () => deleteSelectedReminderTasks());
}

function renderSelectableReminderTaskRow(task) {
  const status = mobileStatusMeta[task.status] || mobileStatusMeta.todo;
  const selected = selectedReminderTaskIds.has(task.id);
  return `
    <article class="reminder-task-row selectable ${selected ? "is-selected" : ""}">
      <button class="reminder-select ${selected ? "checked" : ""}" data-select-task="${task.id}" type="button" aria-label="เลือกรายการ"></button>
      <button class="reminder-task-main" data-row-edit="${task.id}" type="button">
        <strong>${escapeMobileHtml(task.title)}</strong>
        <span>${escapeMobileHtml(task.project || "Inbox")} · ${formatTaskDueAt(task)}</span>
      </button>
      <button class="mini-done-button" data-done-task="${task.id}" type="button">${task.status === "done" ? "✓" : "เสร็จ"}</button>
      <span class="pill ${status.className}">${status.label}</span>
    </article>
  `;
}

async function deleteSelectedReminderTasks() {
  const ids = [...selectedReminderTaskIds];
  if (!ids.length) return;
  const confirmed = await confirmAction({
    title: `ลบ ${ids.length} รายการ?`,
    message: "รายการที่เลือกจะถูกลบออกจาก BossBoard แต่จะไม่ลบข้อความเดิมใน LINE",
    confirmText: "ลบรายการ",
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all(ids.map((id) => deleteTaskFromApi(id)));
    mobileTasks = mobileTasks.filter((task) => !selectedReminderTaskIds.has(task.id));
    selectedReminderTaskIds.clear();
    renderMyTasksPage();
    showToast("ลบรายการที่เลือกแล้ว");
  } catch {
    showToast("ลบบางรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

function renderCreateTaskPage(seedTask = createMobileTask()) {
  document.body.dataset.view = "create";
  const exists = seedTask.id && mobileTasks.some((task) => task.id === seedTask.id);
  mobileElements.sectionTitle.textContent = exists ? "แก้ไขรายการเตือน" : "เพิ่มรายการเตือน";
  mobileElements.sectionSubtitle.textContent = "บันทึกเองได้ หรือพิมพ์จาก LINE ให้ระบบช่วยจดก็ได้";
  const userName = teamState.user?.displayName || "ฉัน";
  const projectNames = getProjectNames(seedTask.project);
  const selectedProject = projectNames.includes(seedTask.project) ? seedTask.project : "";
  mobileElements.taskList.innerHTML = `
    <form id="createTaskPageForm" class="create-task-page">
      <div class="utility-topbar">
        <button class="utility-back-button" data-create-back type="button">← กลับ</button>
        <button class="utility-ghost-button" data-create-cancel type="button">ยกเลิก</button>
      </div>
      <label>ชื่อรายการ
        <input id="createTaskTitle" value="${escapeMobileHtml(seedTask.title)}" placeholder="เช่น ประชุมลูกค้า, กินยา, ส่งรายงาน" required />
      </label>
      <label>รายละเอียด
        <textarea id="createTaskDescription" placeholder="ใส่รายละเอียดเพิ่ม ถ้ามี">${escapeMobileHtml(seedTask.description || "")}</textarea>
      </label>
      <label>หมวด / โปรเจกต์
        <select id="createTaskProject">
          ${projectNames.map((name) => `<option value="${escapeMobileHtml(name)}" ${name === selectedProject ? "selected" : ""}>${escapeMobileHtml(name)}</option>`).join("")}
          <option value="__new">+ สร้างโปรเจกต์ใหม่</option>
        </select>
      </label>
      <label id="newProjectLabel" class="${selectedProject ? "hidden" : ""}">ชื่อโปรเจกต์ใหม่
        <input id="newTaskProject" value="${selectedProject ? "" : escapeMobileHtml(seedTask.project || "")}" placeholder="เช่น งานส่วนตัว, ลูกค้า A" />
      </label>
      <label>วันครบกำหนด
        <input id="createTaskDueDate" value="${escapeMobileHtml(seedTask.dueDate)}" type="date" required />
      </label>
      <label>เวลาเตือน
        <input id="createTaskDueTime" value="${escapeMobileHtml(seedTask.dueTime || "")}" type="time" />
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
      <div class="form-actions-row">
        <button class="create-submit-button" type="submit">${exists ? "บันทึกการแก้ไข" : "สร้างรายการเตือน"}</button>
        ${exists ? `<button class="danger-outline-button" id="deleteTaskPageButton" type="button">ลบรายการนี้</button>` : ""}
      </div>
    </form>
  `;
  const goBack = () => {
    if (selectedProjectName) {
      setActiveNav("projects");
      renderProjectDetailPage(selectedProjectName);
      return;
    }
    setActiveNav("tasks");
    renderMyTasksPage();
  };
  document.querySelector("[data-create-back]")?.addEventListener("click", goBack);
  document.querySelector("[data-create-cancel]")?.addEventListener("click", async () => {
    const hasText = document.querySelector("#createTaskTitle")?.value.trim() || document.querySelector("#createTaskDescription")?.value.trim();
    if (hasText && !exists) {
      const confirmed = await confirmAction({
        title: "ยกเลิกการเพิ่มรายการ?",
        message: "ข้อมูลที่พิมพ์ไว้ในฟอร์มนี้จะไม่ถูกบันทึก",
        confirmText: "ยกเลิกเลย"
      });
      if (!confirmed) return;
    }
    goBack();
  });
  document.querySelector("#createTaskProject")?.addEventListener("change", (event) => {
    document.querySelector("#newProjectLabel")?.classList.toggle("hidden", event.target.value !== "__new");
  });
  document.querySelector("#createTaskPageForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const projectSelect = document.querySelector("#createTaskProject").value;
    const projectName = projectSelect === "__new"
      ? document.querySelector("#newTaskProject").value.trim()
      : projectSelect;
    if (!projectName) {
      showToast("กรุณาเลือกหรือสร้างโปรเจกต์");
      return;
    }
    const task = {
      ...seedTask,
      title: document.querySelector("#createTaskTitle").value.trim() || "Untitled task",
      description: document.querySelector("#createTaskDescription").value.trim(),
      project: projectName,
      assignee: userName,
      assigneeUserId: teamState.user?.id || "",
      organizationId: "",
      dueDate: document.querySelector("#createTaskDueDate").value,
      dueTime: document.querySelector("#createTaskDueTime").value,
      status: document.querySelector("#createTaskStatus").value,
      priority: document.querySelector("#createTaskPriority").value,
      tags: ["LIFF"],
      activity: []
    };
    try {
      if (projectSelect === "__new") {
        await saveProjectToApi({ name: projectName, description: "สร้างจากหน้าเพิ่มรายการเตือน" });
      }
      await persistTask(task, exists);
      goBack();
      showToast(exists ? "บันทึกการแก้ไขแล้ว" : "สร้างรายการเตือนแล้ว");
    } catch {
      showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  });
  document.querySelector("#deleteTaskPageButton")?.addEventListener("click", () => deleteTaskWithConfirmation(seedTask.id));
}

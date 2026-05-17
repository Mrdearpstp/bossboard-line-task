const statusMeta = {
  todo: { label: "To Do", className: "status-todo" },
  progress: { label: "In Progress", className: "status-progress" },
  review: { label: "Review", className: "status-review" },
  done: { label: "Done", className: "status-done" }
};

const priorityMeta = {
  high: { label: "High", className: "priority-high" },
  medium: { label: "Medium", className: "priority-medium" },
  low: { label: "Low", className: "priority-low" }
};

const initialTasks = [
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
    activity: [
      { id: "a1", text: "Narin ปรับข้อความแจ้งเตือนงานใกล้ครบกำหนด", time: "วันนี้ 10:15" },
      { id: "a2", text: "ระบบจำลองส่ง LINE preview สำเร็จ", time: "เมื่อวาน 16:40" }
    ]
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
    activity: [{ id: "a3", text: "Mali ส่งหน้า dashboard ให้ตรวจ", time: "วันนี้ 09:30" }]
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
    activity: [{ id: "a4", text: "Krit เพิ่มฟิลด์ lineUserId ใน draft schema", time: "เมื่อวาน 11:05" }]
  },
  {
    id: "task-4",
    title: "ทดสอบมุมมอง Kanban กับทีมขาย",
    description: "รวบรวม feedback เรื่อง column, filter, และข้อมูลที่ควรแสดงบนการ์ดงาน",
    project: "UX Research",
    status: "done",
    priority: "low",
    assignee: "Pim",
    dueDate: "2026-05-15",
    tags: ["Research"],
    activity: [{ id: "a5", text: "Pim ปิดรอบสัมภาษณ์และสรุป feedback", time: "15 พ.ค. 2026" }]
  },
  {
    id: "task-5",
    title: "เพิ่มตัวกรองงานของฉัน",
    description: "ให้ผู้ใช้ค้นหางานจากชื่อ โปรเจกต์ ผู้รับผิดชอบ สถานะ และ priority ได้จากทุก view",
    project: "Core App",
    status: "progress",
    priority: "medium",
    assignee: "Narin",
    dueDate: "2026-05-24",
    tags: ["Search", "Filter"],
    activity: [{ id: "a6", text: "Narin ผูก search กับ board view แล้ว", time: "วันนี้ 13:20" }]
  }
];

let tasks = [];
let currentView = "board";
let editingTaskId = null;

const elements = {
  searchInput: document.querySelector("#searchInput"),
  newTaskButton: document.querySelector("#newTaskButton"),
  projectFilter: document.querySelector("#projectFilter"),
  boardView: document.querySelector("#boardView"),
  listView: document.querySelector("#listView"),
  calendarView: document.querySelector("#calendarView"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  taskForm: document.querySelector("#taskForm"),
  closeDrawerButton: document.querySelector("#closeDrawerButton"),
  deleteTaskButton: document.querySelector("#deleteTaskButton"),
  linePreview: document.querySelector("#linePreview"),
  metricTotal: document.querySelector("#metricTotal"),
  metricActive: document.querySelector("#metricActive"),
  metricDueSoon: document.querySelector("#metricDueSoon"),
  metricDone: document.querySelector("#metricDone"),
  activityList: document.querySelector("#activityList")
};

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    currentView = tab.dataset.view;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
});

elements.searchInput.addEventListener("input", render);
elements.projectFilter.addEventListener("change", render);
elements.newTaskButton.addEventListener("click", () => openDrawer(createEmptyTask()));
elements.closeDrawerButton.addEventListener("click", closeDrawer);
elements.drawerBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.drawerBackdrop) closeDrawer();
});
elements.deleteTaskButton.addEventListener("click", deleteCurrentTask);
elements.taskForm.addEventListener("submit", saveTask);

loadTasksFromApi();

async function loadTasksFromApi() {
  try {
    const response = await fetch("/api/tasks");
    if (!response.ok) throw new Error("Cannot load tasks");
    tasks = await response.json();
  } catch {
    tasks = initialTasks;
  }
  render();
}

async function saveTaskToApi(task, exists) {
  const response = await fetch(exists ? `/api/tasks/${encodeURIComponent(task.id)}` : "/api/tasks", {
    method: exists ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });
  if (!response.ok) throw new Error("Cannot save task");
  return response.json();
}

async function patchTaskToApi(taskId, patch) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error("Cannot update task");
  return response.json();
}

async function deleteTaskFromApi(taskId) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE"
  });
  if (!response.ok) throw new Error("Cannot delete task");
}

function getVisibleTasks() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const project = elements.projectFilter.value;
  return tasks.filter((task) => {
    const matchesProject = !project || task.project === project;
    const matchesQuery =
      !query ||
      [
        task.title,
        task.description,
        task.project,
        task.assignee,
        task.status,
        task.priority,
        ...task.tags
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return matchesProject && matchesQuery;
  });
}

function render() {
  const visibleTasks = getVisibleTasks();
  renderMetrics();
  renderProjectFilter();
  renderLinePreview();
  elements.boardView.classList.toggle("hidden", currentView !== "board");
  elements.listView.classList.toggle("hidden", currentView !== "list");
  elements.calendarView.classList.toggle("hidden", currentView !== "calendar");

  if (currentView === "board") renderBoard(visibleTasks);
  if (currentView === "list") renderList(visibleTasks);
  if (currentView === "calendar") renderCalendar(visibleTasks);
}

function renderMetrics() {
  const today = new Date("2026-05-16T00:00:00+07:00");
  elements.metricTotal.textContent = tasks.length;
  elements.metricActive.textContent = tasks.filter((task) => task.status !== "done").length;
  elements.metricDone.textContent = tasks.filter((task) => task.status === "done").length;
  elements.metricDueSoon.textContent = tasks.filter((task) => {
    const dueDate = new Date(`${task.dueDate}T00:00:00+07:00`);
    const diff = (dueDate.getTime() - today.getTime()) / 86400000;
    return diff >= 0 && diff <= 3 && task.status !== "done";
  }).length;
}

function renderProjectFilter() {
  const currentValue = elements.projectFilter.value;
  const projects = [...new Set(tasks.map((task) => task.project))].sort();
  elements.projectFilter.innerHTML = `<option value="">ทุกโปรเจกต์</option>${projects
    .map((project) => `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`)
    .join("")}`;
  elements.projectFilter.value = projects.includes(currentValue) ? currentValue : "";
}

function renderLinePreview() {
  const nextTask = tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  elements.linePreview.innerHTML = nextTask
    ? `แจ้งเตือนงานใกล้ครบกำหนด<br><strong>${escapeHtml(nextTask.title)}</strong><br>${formatDate(nextTask.dueDate)}`
    : "ไม่มีงานค้าง";
}

function renderBoard(visibleTasks) {
  elements.boardView.innerHTML = Object.keys(statusMeta)
    .map((status) => {
      const columnTasks = visibleTasks.filter((task) => task.status === status);
      return `
        <div class="board-column">
          <div class="column-header">
            <span class="status-pill ${statusMeta[status].className}">${statusMeta[status].label}</span>
            <span class="count-pill">${columnTasks.length}</span>
          </div>
          ${
            columnTasks.length
              ? columnTasks.map(renderTaskCard).join("")
              : '<div class="task-description">ยังไม่มีงาน</div>'
          }
        </div>
      `;
    })
    .join("");

  elements.boardView.querySelectorAll("[data-open-task]").forEach((button) => {
    button.addEventListener("click", () => openDrawer(tasks.find((task) => task.id === button.dataset.openTask)));
  });
  elements.boardView.querySelectorAll("[data-move-task]").forEach((button) => {
    button.addEventListener("click", () => moveTask(button.dataset.moveTask, button.dataset.status));
  });
}

function renderTaskCard(task) {
  const moveButtons = Object.keys(statusMeta)
    .filter((status) => status !== task.status)
    .slice(0, 2)
    .map(
      (status) =>
        `<button class="status-button" data-move-task="${task.id}" data-status="${status}" type="button">${statusMeta[status].label}</button>`
    )
    .join("");

  return `
    <article class="task-card">
      <div class="card-top">
        <span class="priority-pill ${priorityMeta[task.priority].className}">${priorityMeta[task.priority].label}</span>
        <span class="tag">${escapeHtml(task.project)}</span>
      </div>
      <h3>${escapeHtml(task.title)}</h3>
      <p class="task-description">${escapeHtml(task.description)}</p>
      <div class="task-meta">
        <span class="avatar">${initials(task.assignee)}</span>
        <span>${escapeHtml(task.assignee)}</span>
        <span>${formatDate(task.dueDate)}</span>
      </div>
      <div class="status-actions">
        <button class="status-button" data-open-task="${task.id}" type="button">เปิดรายละเอียด</button>
        ${moveButtons}
      </div>
    </article>
  `;
}

function renderList(visibleTasks) {
  elements.listView.innerHTML = `
    <table class="task-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Status</th>
          <th>Assignee</th>
          <th>Due</th>
          <th>Priority</th>
        </tr>
      </thead>
      <tbody>
        ${visibleTasks
          .map(
            (task) => `
              <tr data-open-task="${task.id}">
                <td><strong>${escapeHtml(task.title)}</strong><div class="task-description">${escapeHtml(task.project)}</div></td>
                <td><span class="status-pill ${statusMeta[task.status].className}">${statusMeta[task.status].label}</span></td>
                <td>${escapeHtml(task.assignee)}</td>
                <td>${formatDate(task.dueDate)}</td>
                <td><span class="priority-pill ${priorityMeta[task.priority].className}">${priorityMeta[task.priority].label}</span></td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
  elements.listView.querySelectorAll("[data-open-task]").forEach((row) => {
    row.addEventListener("click", () => openDrawer(tasks.find((task) => task.id === row.dataset.openTask)));
  });
}

function renderCalendar(visibleTasks) {
  const days = Array.from({ length: 21 }, (_, index) => {
    const date = new Date("2026-05-12T00:00:00+07:00");
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  elements.calendarView.innerHTML = `
    <div class="calendar-grid">
      ${days
        .map((day) => {
          const dayTasks = visibleTasks.filter((task) => task.dueDate === day);
          return `
            <div class="calendar-cell">
              <div class="calendar-date">${formatDate(day)}</div>
              ${dayTasks
                .map((task) => `<button class="calendar-task" data-open-task="${task.id}" type="button">${escapeHtml(task.title)}</button>`)
                .join("")}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
  elements.calendarView.querySelectorAll("[data-open-task]").forEach((button) => {
    button.addEventListener("click", () => openDrawer(tasks.find((task) => task.id === button.dataset.openTask)));
  });
}

function openDrawer(task) {
  editingTaskId = task.id;
  document.querySelector("#taskId").value = task.id;
  document.querySelector("#taskTitle").value = task.title;
  document.querySelector("#taskDescription").value = task.description;
  document.querySelector("#taskProject").value = task.project;
  document.querySelector("#taskAssignee").value = task.assignee;
  document.querySelector("#taskStatus").value = task.status;
  document.querySelector("#taskPriority").value = task.priority;
  document.querySelector("#taskDueDate").value = task.dueDate;
  document.querySelector("#taskTags").value = task.tags.join(", ");
  elements.deleteTaskButton.classList.toggle("hidden", !tasks.some((currentTask) => currentTask.id === task.id));
  renderActivity(task);
  elements.drawerBackdrop.classList.remove("hidden");
}

function closeDrawer() {
  editingTaskId = null;
  elements.drawerBackdrop.classList.add("hidden");
}

async function saveTask(event) {
  event.preventDefault();
  const task = {
    id: document.querySelector("#taskId").value,
    title: document.querySelector("#taskTitle").value.trim() || "Untitled task",
    description: document.querySelector("#taskDescription").value.trim(),
    project: document.querySelector("#taskProject").value.trim() || "General",
    assignee: document.querySelector("#taskAssignee").value.trim() || "Unassigned",
    status: document.querySelector("#taskStatus").value,
    priority: document.querySelector("#taskPriority").value,
    dueDate: document.querySelector("#taskDueDate").value,
    tags: document
      .querySelector("#taskTags")
      .value.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    activity: [{ id: `activity-${Date.now()}`, text: "บันทึกการเปลี่ยนแปลง", time: "ตอนนี้" }]
  };

  const existingTask = tasks.find((currentTask) => currentTask.id === task.id);
  try {
    if (existingTask) {
      task.activity = [...task.activity, ...existingTask.activity];
    }
    const savedTask = await saveTaskToApi(task, Boolean(existingTask));
    tasks = existingTask
      ? tasks.map((currentTask) => (currentTask.id === savedTask.id ? savedTask : currentTask))
      : [savedTask, ...tasks];
    closeDrawer();
    render();
  } catch {
    alert("บันทึกไม่สำเร็จ กรุณาลองใหม่");
  }
}

async function deleteCurrentTask() {
  if (!editingTaskId) return;
  try {
    await deleteTaskFromApi(editingTaskId);
    tasks = tasks.filter((task) => task.id !== editingTaskId);
    closeDrawer();
    render();
  } catch {
    alert("ลบงานไม่สำเร็จ กรุณาลองใหม่");
  }
}

function moveTask(taskId, status) {
  tasks = tasks.map((task) => {
    if (task.id !== taskId) return task;
    return {
      ...task,
      status,
      activity: [
        { id: `activity-${Date.now()}`, text: `เปลี่ยนสถานะเป็น ${statusMeta[status].label}`, time: "ตอนนี้" },
        ...task.activity
      ]
    };
  });
  persistTasks();
  render();
}

moveTask = async function moveTaskWithApi(taskId, status) {
  try {
    const updatedTask = await patchTaskToApi(taskId, {
      status,
      activityText: `เปลี่ยนสถานะเป็น ${statusMeta[status].label}`
    });
    tasks = tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
    render();
  } catch {
    alert("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่");
  }
};

function createEmptyTask() {
  return {
    id: `task-${Date.now()}`,
    title: "",
    description: "",
    project: "Core App",
    status: "todo",
    priority: "medium",
    assignee: "Narin",
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    tags: [],
    activity: [{ id: `activity-${Date.now()}`, text: "สร้างงานใหม่", time: "ตอนนี้" }]
  };
}

function renderActivity(task) {
  elements.activityList.innerHTML = task.activity
    .map((activity) => `<div class="activity-item"><strong>${escapeHtml(activity.time)}</strong><div>${escapeHtml(activity.text)}</div></div>`)
    .join("");
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

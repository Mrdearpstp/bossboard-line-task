// BossBoard safety layer: undo risky task/project actions after the main app loads.
function showToast(message, action = null) {
  if (!mobileElements.toast) return;
  if (window.__bossboardToastTimer) window.clearTimeout(window.__bossboardToastTimer);
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
    if (window.__bossboardToastTimer) window.clearTimeout(window.__bossboardToastTimer);
    mobileElements.toast.classList.add("hidden");
    try {
      await actionConfig.run();
    } catch {
      showToast(actionConfig.errorMessage || "ย้อนกลับไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }, { once: true });
  window.__bossboardToastTimer = window.setTimeout(() => {
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
    if (mobileElements.taskDialog.open) mobileElements.taskDialog.close();
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

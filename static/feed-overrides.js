const DAILY_STATUS_LABELS = {
  todo: "รอทำ",
  progress: "กำลังทำ",
  review: "รอตรวจ",
  done: "เสร็จแล้ว"
};

const DAILY_PRIORITY_LABELS = {
  high: "ด่วน",
  medium: "ปกติ",
  low: "ไม่ด่วน"
};

renderMobile = function renderDailyWorkCoach() {
  document.body.dataset.view = "dashboard reminder-home daily-coach";

  const todayKey = getBangkokDateKey();
  const activeTasks = mobileTasks.filter((task) => task.status !== "done").sort(sortTasksByDueDate);
  const todayTasks = activeTasks.filter((task) => (task.dueDate || todayKey) <= todayKey);
  const upcomingTasks = activeTasks.filter((task) => (task.dueDate || todayKey) > todayKey);
  const doneToday = mobileTasks.filter((task) => task.status === "done" && (task.dueDate || todayKey) === todayKey);
  const nextTask = pickRecommendedTask(todayTasks, upcomingTasks);

  mobileElements.filterText.textContent = "Daily coach";
  mobileElements.sectionTitle.textContent = "วันนี้ต้องทำอะไร";
  mobileElements.sectionSubtitle.textContent = "สรุปงานจาก LINE และช่วยบอกว่ายังเหลืออะไรต้องจัดการ";
  mobileElements.taskList.innerHTML = renderDailyCoachHome({
    todayTasks,
    upcomingTasks,
    doneToday,
    nextTask
  });

  wireDailyCoachActions();
};

function renderDailyCoachHome({ todayTasks, upcomingTasks, doneToday, nextTask }) {
  const totalToday = todayTasks.length + doneToday.length;
  const doneCount = doneToday.length;
  const remainingCount = todayTasks.length;
  const progress = Math.round((doneCount / Math.max(totalToday, 1)) * 100);
  const urgentCount = todayTasks.filter((task) => task.priority === "high").length;

  return `
    <div class="daily-coach-screen">
      <section class="daily-coach-hero">
        <div class="daily-coach-copy">
          <span class="daily-chip">LINE Reminder Coach</span>
          <h2>${remainingCount ? `วันนี้เหลือ ${remainingCount} งาน` : "วันนี้เคลียร์แล้ว"}</h2>
          <p>${nextTask ? `แนะนำเริ่มจาก “${escapeMobileHtml(nextTask.title)}”` : "พิมพ์งานหรือนัดหมายใน LINE แล้ว BossBoard จะช่วยจดเตือนให้"}</p>
        </div>
        <img src="/brand/bossboard-mascot.png" alt="BossBoard mascot" />
      </section>

      <section class="daily-budget-card">
        <div class="daily-budget-head">
          <div>
            <span>สรุปวันนี้</span>
            <h3>${doneCount}/${Math.max(totalToday, 1)} งาน</h3>
          </div>
          <strong>${progress}%</strong>
        </div>
        <div class="daily-progress-track"><span style="width:${progress}%"></span></div>
        <div class="daily-metrics">
          <div><span>ต้องทำ</span><strong>${remainingCount}</strong></div>
          <div><span>ด่วน</span><strong>${urgentCount}</strong></div>
          <div><span>เสร็จแล้ว</span><strong>${doneCount}</strong></div>
        </div>
      </section>

      <section class="daily-recommend-card">
        <div class="section-title-row">
          <h2>ทำอะไรต่อดี</h2>
          <button class="view-all-link" data-open-my-tasks type="button">ดูทั้งหมด ›</button>
        </div>
        ${nextTask ? renderRecommendedTask(nextTask) : renderDailyEmptyRecommendation()}
      </section>

      <section class="daily-list-card">
        <div class="section-title-row">
          <h2>งานวันนี้</h2>
          <button class="view-all-link" data-open-create type="button">+ เพิ่ม</button>
        </div>
        <div class="daily-task-list">
          ${todayTasks.length ? todayTasks.slice(0, 5).map(renderDailyTaskRow).join("") : renderDailyEmptyRow("ไม่มีงานค้างสำหรับวันนี้")}
        </div>
      </section>

      <section class="daily-list-card">
        <div class="section-title-row">
          <h2>เร็วๆ นี้</h2>
          <button class="view-all-link" data-open-projects type="button">ดูโปรเจกต์ ›</button>
        </div>
        <div class="daily-task-list">
          ${upcomingTasks.length ? upcomingTasks.slice(0, 4).map(renderDailyTaskRow).join("") : renderDailyEmptyRow("ยังไม่มีงานล่วงหน้า")}
        </div>
      </section>

      <section class="daily-line-guide">
        <div class="line-bubble">LINE</div>
        <div>
          <strong>หลักการทำงาน</strong>
          <p>จดจากแชทก่อน แล้วแอปจะสรุปเหมือนเป้ารายวัน: วันนี้มีอะไร เสร็จไปเท่าไร เหลืออะไร และควรทำชิ้นไหนก่อน</p>
        </div>
        <button data-open-line-settings type="button">ตั้งค่า</button>
      </section>
    </div>
  `;
}

function renderRecommendedTask(task) {
  const status = DAILY_STATUS_LABELS[task.status] || "รอทำ";
  const priority = DAILY_PRIORITY_LABELS[task.priority] || "ปกติ";
  const dueText = task.dueDate ? formatTaskDueAt(task) : "ยังไม่ตั้งวัน";
  return `
    <article class="daily-next-task">
      <div class="daily-task-icon">${getDailyTaskEmoji(task)}</div>
      <div class="daily-task-content">
        <span>${escapeMobileHtml(task.project || "Inbox")}</span>
        <h3>${escapeMobileHtml(task.title)}</h3>
        <p>${escapeMobileHtml(dueText)} · ${escapeMobileHtml(priority)} · ${escapeMobileHtml(status)}</p>
      </div>
      <div class="daily-next-actions">
        <button data-task-edit="${task.id}" type="button">แก้ไข</button>
        <button data-task-start="${task.id}" type="button">ทำต่อ</button>
        <button data-task-done="${task.id}" type="button">เสร็จ</button>
      </div>
    </article>
  `;
}

function renderDailyTaskRow(task) {
  const priority = DAILY_PRIORITY_LABELS[task.priority] || "ปกติ";
  const status = DAILY_STATUS_LABELS[task.status] || "รอทำ";
  const dueText = task.dueDate ? formatTaskDueAt(task) : "ยังไม่ตั้งวัน";
  return `
    <article class="daily-task-row">
      <button class="daily-check" data-task-done="${task.id}" type="button" aria-label="ทำเสร็จ">✓</button>
      <button class="daily-row-main" data-task-edit="${task.id}" type="button">
        <strong>${escapeMobileHtml(task.title)}</strong>
        <span>${escapeMobileHtml(task.project || "Inbox")} · ${escapeMobileHtml(dueText)}</span>
      </button>
      <span class="daily-pill priority-${escapeMobileHtml(task.priority || "medium")}">${escapeMobileHtml(priority)}</span>
      <span class="daily-pill status">${escapeMobileHtml(status)}</span>
    </article>
  `;
}

function renderDailyEmptyRecommendation() {
  return `
    <article class="daily-empty-state">
      <strong>ยังไม่มีงานที่ต้องรีบทำ</strong>
      <p>ลองพิมพ์ใน LINE เช่น “ประชุมทีมวันนี้ 15:00” หรือ “กินยา 20:00”</p>
      <button data-open-create type="button">เพิ่มรายการเอง</button>
    </article>
  `;
}

function renderDailyEmptyRow(message) {
  return `<article class="daily-empty-row">${escapeMobileHtml(message)}</article>`;
}

function wireDailyCoachActions() {
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

  mobileElements.taskList.querySelectorAll("[data-task-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.taskEdit);
      if (task) openTaskDetail(task);
    });
  });

  mobileElements.taskList.querySelectorAll("[data-task-start]").forEach((button) => {
    button.addEventListener("click", () => {
      updateReminderStatus(button.dataset.taskStart, "progress", "เริ่มทำจากสรุปวันนี้", renderMobile);
    });
  });

  mobileElements.taskList.querySelectorAll("[data-task-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = mobileTasks.find((item) => item.id === button.dataset.taskDone);
      const confirmed = await confirmAction({
        title: "ยืนยันว่าเสร็จแล้ว?",
        message: `งาน "${task?.title || "รายการนี้"}" จะถูกนับว่าเสร็จในสรุปวันนี้ ถ้ากดผิดกด Undo ได้ทันที`,
        confirmText: "เสร็จจริง"
      });
      if (!confirmed) return;
      updateReminderStatus(button.dataset.taskDone, "done", "ปิดงานจากสรุปวันนี้", renderMobile);
    });
  });
}

function pickRecommendedTask(todayTasks, upcomingTasks) {
  const sortedToday = [...todayTasks].sort((a, b) => {
    const priorityScore = { high: 0, medium: 1, low: 2 };
    const priorityDelta = (priorityScore[a.priority] ?? 1) - (priorityScore[b.priority] ?? 1);
    if (priorityDelta !== 0) return priorityDelta;
    return sortTasksByDueDate(a, b);
  });
  return sortedToday[0] || upcomingTasks[0] || null;
}

function getDailyTaskEmoji(task) {
  const text = `${task.project || ""} ${task.title || ""} ${task.description || ""}`;
  if (/ยา|กินยา|health/i.test(text)) return "💊";
  if (/ประชุม|meeting/i.test(text)) return "👥";
  if (/line/i.test(text)) return "💬";
  if (/โฆษณา|campaign|marketing/i.test(text)) return "📣";
  if (/เงิน|งบ|budget/i.test(text)) return "💰";
  return "✓";
}

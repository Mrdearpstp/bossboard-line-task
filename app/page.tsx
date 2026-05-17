"use client";

import {
  Bell,
  CalendarDays,
  Check,
  CirclePlus,
  Clock3,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  PanelRightOpen,
  Search,
  Settings,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Status = "todo" | "progress" | "review" | "done";
type Priority = "high" | "medium" | "low";
type ViewMode = "board" | "list" | "calendar";

type Activity = {
  id: string;
  text: string;
  time: string;
};

type Task = {
  id: string;
  title: string;
  description: string;
  project: string;
  status: Status;
  priority: Priority;
  assignee: string;
  dueDate: string;
  tags: string[];
  checklistDone: number;
  checklistTotal: number;
  comments: number;
  activity: Activity[];
};

const statusMeta: Record<Status, { label: string; className: string }> = {
  todo: { label: "To Do", className: "status-todo" },
  progress: { label: "In Progress", className: "status-progress" },
  review: { label: "Review", className: "status-review" },
  done: { label: "Done", className: "status-done" }
};

const priorityMeta: Record<Priority, { label: string; className: string }> = {
  high: { label: "High", className: "priority-high" },
  medium: { label: "Medium", className: "priority-medium" },
  low: { label: "Low", className: "priority-low" }
};

const initialTasks: Task[] = [
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
    checklistDone: 3,
    checklistTotal: 5,
    comments: 4,
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
    checklistDone: 4,
    checklistTotal: 4,
    comments: 2,
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
    checklistDone: 1,
    checklistTotal: 6,
    comments: 1,
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
    checklistDone: 3,
    checklistTotal: 3,
    comments: 6,
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
    checklistDone: 2,
    checklistTotal: 5,
    comments: 3,
    activity: [{ id: "a6", text: "Narin ผูก search กับ board view แล้ว", time: "วันนี้ 13:20" }]
  }
];

const emptyTask = (): Task => ({
  id: `task-${Date.now()}`,
  title: "",
  description: "",
  project: "Core App",
  status: "todo",
  priority: "medium",
  assignee: "Narin",
  dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  tags: [],
  checklistDone: 0,
  checklistTotal: 0,
  comments: 0,
  activity: [{ id: `activity-${Date.now()}`, text: "สร้างงานใหม่", time: "ตอนนี้" }]
});

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("board");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    const storedTasks = window.localStorage.getItem("line-task-tracker.tasks");
    if (storedTasks) {
      setTasks(JSON.parse(storedTasks) as Task[]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("line-task-tracker.tasks", JSON.stringify(tasks));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) => {
      const haystack = [
        task.title,
        task.description,
        task.project,
        task.assignee,
        statusMeta[task.status].label,
        priorityMeta[task.priority].label,
        ...task.tags
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, tasks]);

  const metrics = useMemo(() => {
    const today = new Date("2026-05-16T00:00:00+07:00");
    return {
      total: tasks.length,
      active: tasks.filter((task) => task.status !== "done").length,
      dueSoon: tasks.filter((task) => {
        const dueDate = new Date(`${task.dueDate}T00:00:00+07:00`);
        const diff = (dueDate.getTime() - today.getTime()) / 86400000;
        return diff >= 0 && diff <= 3 && task.status !== "done";
      }).length,
      done: tasks.filter((task) => task.status === "done").length
    };
  }, [tasks]);

  function upsertTask(task: Task) {
    const normalizedTask = {
      ...task,
      title: task.title.trim() || "Untitled task",
      tags: task.tags.map((tag) => tag.trim()).filter(Boolean)
    };

    setTasks((currentTasks) => {
      const exists = currentTasks.some((currentTask) => currentTask.id === normalizedTask.id);
      if (exists) {
        return currentTasks.map((currentTask) =>
          currentTask.id === normalizedTask.id ? normalizedTask : currentTask
        );
      }
      return [normalizedTask, ...currentTasks];
    });
    setSelectedTask(null);
  }

  function moveTask(taskId: string, status: Status) {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              activity: [
                { id: `activity-${Date.now()}`, text: `เปลี่ยนสถานะเป็น ${statusMeta[status].label}`, time: "ตอนนี้" },
                ...task.activity
              ]
            }
          : task
      )
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LT</div>
          <div>
            <div className="brand-title">LineTask</div>
            <div className="brand-subtitle">ClickUp-style workspace</div>
          </div>
        </div>

        <nav className="nav-section" aria-label="Main navigation">
          <span className="nav-label">Workspace</span>
          <button className="nav-button active"><LayoutDashboard size={18} /> Dashboard</button>
          <button className="nav-button"><ListChecks size={18} /> Projects</button>
          <button className="nav-button"><Users size={18} /> Team</button>
          <button className="nav-button"><Bell size={18} /> Notifications</button>
          <button className="nav-button"><Settings size={18} /> Settings</button>
        </nav>

        <section className="sidebar-panel">
          <strong>LINE status</strong>
          <p className="brand-subtitle">Ready for Messaging API, group summary, and due-date reminders.</p>
        </section>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">ติดตามงานทีมผ่าน LINE</h1>
            <p className="muted">จัดการงาน โปรเจกต์ สถานะ และ notification ในที่เดียว</p>
          </div>
          <div className="topbar-actions">
            <input
              className="search"
              placeholder="ค้นหางาน โปรเจกต์ หรือผู้รับผิดชอบ"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="primary-button" onClick={() => setSelectedTask(emptyTask())}>
              <CirclePlus size={18} /> New task
            </button>
          </div>
        </header>

        <section className="metrics" aria-label="Workspace metrics">
          <Metric label="งานทั้งหมด" value={metrics.total} />
          <Metric label="กำลังทำ" value={metrics.active} />
          <Metric label="ครบกำหนด 3 วัน" value={metrics.dueSoon} />
          <Metric label="เสร็จแล้ว" value={metrics.done} />
        </section>

        <div className="workspace-band">
          <div>
            <section className="toolbar">
              <div className="view-tabs" aria-label="Task views">
                <button className={`tab ${view === "board" ? "active" : ""}`} onClick={() => setView("board")}>
                  Board
                </button>
                <button className={`tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
                  List
                </button>
                <button className={`tab ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}>
                  Calendar
                </button>
              </div>
              <button className="secondary-button">
                <Search size={17} /> Filter
              </button>
            </section>

            {view === "board" && (
              <Board tasks={filteredTasks} onSelect={setSelectedTask} onMove={moveTask} />
            )}
            {view === "list" && <ListView tasks={filteredTasks} onSelect={setSelectedTask} />}
            {view === "calendar" && <CalendarView tasks={filteredTasks} onSelect={setSelectedTask} />}
          </div>

          <LinePanel tasks={tasks} />
        </div>
      </section>

      {selectedTask && (
        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onSave={upsertTask} />
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <div className="muted">{label}</div>
      <div className="metric-value">{value}</div>
    </article>
  );
}

function Board({
  tasks,
  onSelect,
  onMove
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onMove: (taskId: string, status: Status) => void;
}) {
  return (
    <section className="board">
      {(Object.keys(statusMeta) as Status[]).map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status);
        return (
          <div className="board-column" key={status}>
            <div className="column-header">
              <div className="column-title">
                <span className={`status-pill ${statusMeta[status].className}`}>{statusMeta[status].label}</span>
              </div>
              <span className="count-pill">{columnTasks.length}</span>
            </div>

            {columnTasks.length === 0 ? (
              <div className="empty-state">ยังไม่มีงาน</div>
            ) : (
              columnTasks.map((task) => (
                <TaskCard key={task.id} task={task} onSelect={onSelect} onMove={onMove} />
              ))
            )}
          </div>
        );
      })}
    </section>
  );
}

function TaskCard({
  task,
  onSelect,
  onMove
}: {
  task: Task;
  onSelect: (task: Task) => void;
  onMove: (taskId: string, status: Status) => void;
}) {
  return (
    <article className="task-card">
      <div className="meta-row">
        <span className={`priority-pill ${priorityMeta[task.priority].className}`}>
          {priorityMeta[task.priority].label}
        </span>
        <span className="tag">{task.project}</span>
      </div>
      <button className="ghost-button" style={{ width: "100%", justifyContent: "flex-start", marginTop: 8 }} onClick={() => onSelect(task)}>
        <PanelRightOpen size={16} /> เปิดรายละเอียด
      </button>
      <h2 className="task-title">{task.title}</h2>
      <p className="task-description">{task.description}</p>
      <div className="meta-row">
        <span className="avatar">{initials(task.assignee)}</span>
        <span className="muted"><Clock3 size={13} /> {formatDate(task.dueDate)}</span>
      </div>
      <div className="task-actions" style={{ marginTop: 10 }}>
        {(Object.keys(statusMeta) as Status[])
          .filter((status) => status !== task.status)
          .slice(0, 2)
          .map((status) => (
            <button className="secondary-button" key={status} onClick={() => onMove(task.id, status)}>
              {statusMeta[status].label}
            </button>
          ))}
      </div>
    </article>
  );
}

function ListView({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  return (
    <section className="list-panel">
      <table className="task-table">
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
          {tasks.map((task) => (
            <tr key={task.id} onClick={() => onSelect(task)}>
              <td>
                <strong>{task.title}</strong>
                <div className="muted">{task.project}</div>
              </td>
              <td><span className={`status-pill ${statusMeta[task.status].className}`}>{statusMeta[task.status].label}</span></td>
              <td>{task.assignee}</td>
              <td>{formatDate(task.dueDate)}</td>
              <td><span className={`priority-pill ${priorityMeta[task.priority].className}`}>{priorityMeta[task.priority].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CalendarView({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  const days = Array.from({ length: 21 }, (_, index) => {
    const date = new Date("2026-05-12T00:00:00+07:00");
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  return (
    <section className="calendar-panel">
      <div className="calendar-grid">
        {days.map((day) => {
          const dayTasks = tasks.filter((task) => task.dueDate === day);
          return (
            <div className="calendar-cell" key={day}>
              <div className="calendar-date">{formatDate(day)}</div>
              {dayTasks.map((task) => (
                <button className="calendar-task" key={task.id} onClick={() => onSelect(task)}>
                  {task.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LinePanel({ tasks }: { tasks: Task[] }) {
  const nextTask = tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <aside className="line-panel">
      <div>
        <h2 className="panel-title"><MessageCircle size={19} /> LINE automation</h2>
        <p className="muted">ตัวอย่างการแจ้งเตือนที่จะต่อกับ LINE Messaging API</p>
      </div>
      <div className="line-preview">
        <strong>Preview message</strong>
        <div className="line-message">
          แจ้งเตือนงานใกล้ครบกำหนด<br />
          {nextTask ? `${nextTask.title} - ${formatDate(nextTask.dueDate)}` : "ไม่มีงานค้าง"}
        </div>
      </div>
      <div className="automation-list">
        <AutomationItem text="แจ้งเตือนเมื่อมีงานใหม่" />
        <AutomationItem text="สรุปงานประจำวันเข้ากลุ่ม LINE" />
        <AutomationItem text="เตือนงานเลยกำหนดทุกเช้า" />
        <AutomationItem text="รองรับ LINE user id ใน database รอบถัดไป" />
      </div>
    </aside>
  );
}

function AutomationItem({ text }: { text: string }) {
  return (
    <div className="automation-item">
      <span className="check-dot"><Check size={15} /></span>
      <span>{text}</span>
    </div>
  );
}

function TaskDrawer({
  task,
  onClose,
  onSave
}: {
  task: Task;
  onClose: () => void;
  onSave: (task: Task) => void;
}) {
  const [draft, setDraft] = useState<Task>(task);

  function setField<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="drawer-backdrop">
      <section className="drawer" aria-label="Task details">
        <div className="drawer-header">
          <div>
            <h2 className="panel-title">รายละเอียดงาน</h2>
            <p className="muted">แก้ไขข้อมูลและบันทึกลง local workspace</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>ชื่องาน</label>
            <input value={draft.title} onChange={(event) => setField("title", event.target.value)} />
          </div>
          <div className="field">
            <label>รายละเอียด</label>
            <textarea value={draft.description} onChange={(event) => setField("description", event.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>โปรเจกต์</label>
              <input value={draft.project} onChange={(event) => setField("project", event.target.value)} />
            </div>
            <div className="field">
              <label>ผู้รับผิดชอบ</label>
              <input value={draft.assignee} onChange={(event) => setField("assignee", event.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>สถานะ</label>
              <select value={draft.status} onChange={(event) => setField("status", event.target.value as Status)}>
                {(Object.keys(statusMeta) as Status[]).map((status) => (
                  <option key={status} value={status}>{statusMeta[status].label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select value={draft.priority} onChange={(event) => setField("priority", event.target.value as Priority)}>
                {(Object.keys(priorityMeta) as Priority[]).map((priority) => (
                  <option key={priority} value={priority}>{priorityMeta[priority].label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Due date</label>
              <input type="date" value={draft.dueDate} onChange={(event) => setField("dueDate", event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Tags</label>
            <input
              value={draft.tags.join(", ")}
              onChange={(event) => setField("tags", event.target.value.split(","))}
            />
          </div>
          <div className="status-actions">
            <button className="primary-button" onClick={() => onSave(draft)}>
              <Check size={18} /> Save task
            </button>
            <button className="secondary-button" onClick={onClose}>Cancel</button>
          </div>
        </div>

        <div className="activity">
          <h3 className="panel-title">Activity</h3>
          {draft.activity.map((activity) => (
            <div className="activity-item" key={activity.id}>
              <strong>{activity.time}</strong>
              <div>{activity.text}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

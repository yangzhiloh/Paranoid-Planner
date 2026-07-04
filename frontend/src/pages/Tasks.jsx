import { useCallback, useEffect, useState } from 'react';
import { modulesAPI, tasksAPI } from '../api/api';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import GuidedTaskCreator from '../components/tasks/GuidedTaskCreator';
import TaskForm from '../components/tasks/TaskForm';
import Toast from '../components/tasks/Toast';
import {
    EMPTY_GUIDED_FORM,
    EMPTY_TASK_FORM,
    buildGuidedTaskPayload,
    buildTaskPayload,
    formatDate,
    formatTime,
    getModule,
    getPriorityLabel,
    parseOptionalPositiveNumber,
} from '../components/tasks/taskConstants';
import './Dashboard.css';

const COMPLETED_STATUS = 'completed';
const IN_PROGRESS_STATUS = 'in_progress';
const PENDING_STATUS = 'pending';

const TASK_VIEW_FILTERS = {
    overdue: 'overdue',
    dueThisWeek: 'due-this-week',
    highPriority: 'high-priority',
    completed: 'completed',
};

const PRIORITY_BUCKETS = [
    {
        id: 'overdue',
        title: 'Overdue',
        emptyText: 'Nothing overdue. Good.',
        accent: 'bg-rose-300',
    },
    {
        id: 'dueThisWeek',
        title: 'Due this week',
        emptyText: 'No tasks due this week.',
        accent: 'bg-amber-300',
    },
    {
        id: 'highPriority',
        title: 'High priority',
        emptyText: 'No high-priority tasks left.',
        accent: 'bg-orange-300',
    },
    {
        id: 'upcomingNext14Days',
        title: 'Upcoming next 14 days',
        emptyText: 'No upcoming tasks in the next two weeks.',
        accent: 'bg-emerald-300',
    },
];

const isActiveTask = (task) => task.status !== COMPLETED_STATUS;
const isCompletedTask = (task) => task.status === COMPLETED_STATUS;

const parseDeadline = (deadline) => {
    if (!deadline) return null;

    const parsedDeadline = new Date(deadline);
    return Number.isNaN(parsedDeadline.getTime()) ? null : parsedDeadline;
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const isOverdue = (task, now) => {
    const deadline = parseDeadline(task.deadline);
    return Boolean(deadline && deadline < now);
};

const isDueThisWeek = (task, now) => {
    const deadline = parseDeadline(task.deadline);
    return Boolean(deadline && deadline >= now && deadline <= addDays(now, 7));
};

const isUpcoming = (task, now, days) => {
    const deadline = parseDeadline(task.deadline);
    return Boolean(deadline && deadline >= now && deadline <= addDays(now, days));
};

const isHighPriority = (task) => Number(task.priority) >= 5;

const sortTasksByDeadlineThenPriority = (firstTask, secondTask) => {
    const firstDeadline =
        parseDeadline(firstTask.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const secondDeadline =
        parseDeadline(secondTask.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;

    if (firstDeadline !== secondDeadline) return firstDeadline - secondDeadline;

    return Number(secondTask.priority || 0) - Number(firstTask.priority || 0);
};

const buildPriorityBuckets = (activeTasks, now = new Date()) => {
    const assignedTaskIds = new Set();
    const bucketTasks = {
        overdue: [],
        dueThisWeek: [],
        highPriority: [],
        upcomingNext14Days: [],
    };

    const assignMatchingTasks = (bucketId, predicate) => {
        activeTasks.forEach((task) => {
            // Buckets are assigned in priority order so each task appears once.
            if (assignedTaskIds.has(task.id) || !predicate(task)) return;

            bucketTasks[bucketId].push(task);
            assignedTaskIds.add(task.id);
        });
    };

    assignMatchingTasks('overdue', (task) => isOverdue(task, now));
    assignMatchingTasks('dueThisWeek', (task) => isDueThisWeek(task, now));
    assignMatchingTasks('highPriority', isHighPriority);
    assignMatchingTasks('upcomingNext14Days', (task) => isUpcoming(task, now, 14));

    Object.keys(bucketTasks).forEach((bucketId) => {
        bucketTasks[bucketId].sort(sortTasksByDeadlineThenPriority);
    });

    const laterHiddenCount = activeTasks.filter(
        (task) => !assignedTaskIds.has(task.id)
    ).length;

    return { bucketTasks, laterHiddenCount };
};

const getStatusLabel = (status) => {
    if (status === IN_PROGRESS_STATUS) return 'In Progress';
    if (status === COMPLETED_STATUS) return 'Completed';
    return 'Pending';
};

const getStatusBadgeClass = (status) => {
    if (status === IN_PROGRESS_STATUS) {
        return 'border-amber-300/20 bg-amber-300/15 text-amber-100';
    }
    if (status === COMPLETED_STATUS) {
        return 'border-emerald-300/20 bg-emerald-300/15 text-emerald-100';
    }
    return 'border-sky-300/20 bg-sky-300/15 text-sky-100';
};

const getPriorityBadgeClass = (priority) => {
    const numericPriority = Number(priority);
    if (numericPriority >= 5) {
        return 'border-rose-300/25 bg-rose-300/15 text-rose-100';
    }
    if (numericPriority >= 4) {
        return 'border-orange-300/25 bg-orange-300/15 text-orange-100';
    }
    if (numericPriority >= 3) {
        return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
    }
    return 'border-white/10 bg-white/[0.08] text-[#d8c8bb]';
};

const getDeadlineLabel = (task) =>
    task.deadline
        ? `${formatDate(task.deadline)} at ${formatTime(task.deadline)}`
        : 'No deadline';

const getModuleLabel = (modules, moduleId) => {
    const moduleInfo = getModule(modules, moduleId);
    return moduleInfo
        ? `${moduleInfo.module_code} - ${moduleInfo.module_name}`
        : 'No module assigned';
};

export const Tasks = () => {
    const [tasks, setTasks] = useState([]);
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingTask, setEditingTask] = useState(null);
    const [formData, setFormData] = useState(EMPTY_TASK_FORM);
    const [guidedTaskForm, setGuidedTaskForm] = useState(EMPTY_GUIDED_FORM);
    const [guidedDurationError, setGuidedDurationError] = useState('');
    const [showGuidedForm, setShowGuidedForm] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastAction, setToastAction] = useState(null);
    const [toastDuration, setToastDuration] = useState(2600);
    const [showToast, setShowToast] = useState(false);
    const [activeTaskView, setActiveTaskView] = useState(null);
    const [showCompletedTasks, setShowCompletedTasks] = useState(false);
    const [visiblePriorityBuckets, setVisiblePriorityBuckets] = useState([]);
    const [undoCompleteTask, setUndoCompleteTask] = useState(null);

    const resetTaskForm = () => setFormData(EMPTY_TASK_FORM);
    const resetGuidedForm = () => {
        setGuidedTaskForm(EMPTY_GUIDED_FORM);
        setGuidedDurationError('');
    };

    const loadTasksAndModules = useCallback(async () => {
        setLoading(true);
        try {
            const [taskRes, moduleRes] = await Promise.all([
                tasksAPI.getTasks(),
                modulesAPI.getModules(),
            ]);
            setTasks(taskRes.data.tasks || []);
            setModules(moduleRes.data.modules || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load tasks and modules');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTasksAndModules();
    }, [loadTasksAndModules]);

    useEffect(() => {
        if (!showToast) return undefined;
        const timer = setTimeout(() => {
            setShowToast(false);
            setToastAction(null);
            setUndoCompleteTask(null);
        }, toastDuration);
        return () => clearTimeout(timer);
    }, [showToast, toastDuration]);

    const now = new Date();
    const activeTasks = tasks.filter(isActiveTask);
    const completedTasks = tasks
        .filter(isCompletedTask)
        .sort(sortTasksByDeadlineThenPriority);
    const completedTaskCount = completedTasks.length;
    const { bucketTasks, laterHiddenCount } = buildPriorityBuckets(activeTasks, now);
    const visibleBuckets = PRIORITY_BUCKETS.filter(
        (bucket) =>
            bucketTasks[bucket.id].length > 0 ||
            visiblePriorityBuckets.includes(bucket.id)
    );

    useEffect(() => {
        if (loading) return;

        const { bucketTasks: currentBucketTasks } = buildPriorityBuckets(
            tasks.filter(isActiveTask)
        );
        const bucketsWithTasks = PRIORITY_BUCKETS
            .filter((bucket) => currentBucketTasks[bucket.id].length > 0)
            .map((bucket) => bucket.id);

        if (!bucketsWithTasks.length) return;

        setVisiblePriorityBuckets((current) => [
            ...new Set([...current, ...bucketsWithTasks]),
        ]);
    }, [loading, tasks]);

    const hideToast = () => {
        setShowToast(false);
        setToastAction(null);
    };

    const showSuccessToast = (msg, action = null, duration = 2600) => {
        setToastMessage(msg);
        setToastAction(action);
        setToastDuration(duration);
        setShowToast(true);
    };

    const handleGuidedTaskSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setGuidedDurationError('');

        if (!guidedTaskForm.module_id || !guidedTaskForm.deadline) {
            setError('Module and deadline required');
            return;
        }

        const estimated = parseOptionalPositiveNumber(
            guidedTaskForm.estimated_minutes
        );
        if (estimated !== null && (!Number.isFinite(estimated) || estimated <= 0)) {
            setGuidedDurationError('Estimated duration must be a positive number');
            return;
        }

        const shouldValidateRevisionSessions =
            guidedTaskForm.requires_revision || guidedTaskForm.taskType === 'exam_revision';
        if (shouldValidateRevisionSessions) {
            const revisionSessions = Number(guidedTaskForm.revision_sessions_needed);
            if (!Number.isInteger(revisionSessions) || revisionSessions < 0) {
                setError('Revision sessions needed must be zero or more');
                return;
            }
        }

        try {
            await tasksAPI.createTask(buildGuidedTaskPayload(guidedTaskForm, modules));
            resetGuidedForm();
            setShowGuidedForm(false);
            showSuccessToast('Task added successfully');
            loadTasksAndModules();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add task');
        }
    };

    const handleCreateOrUpdate = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.module_id || !formData.title || !formData.deadline) {
            setError('Module, title, and deadline required');
            return;
        }

        const payload = buildTaskPayload(formData);
        const estimated = parseOptionalPositiveNumber(formData.estimated_minutes);
        if (estimated !== null && (!Number.isFinite(estimated) || estimated <= 0)) {
            setError('Estimated minutes must be a positive number');
            return;
        }

        try {
            if (editingTask) {
                await tasksAPI.updateTask(editingTask.id, payload);
                setEditingTask(null);
                showSuccessToast('Task updated successfully');
            }
            resetTaskForm();
            loadTasksAndModules();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save task');
        }
    };

    const handleUpdateTaskStatus = async (taskId, status) => {
        try {
            await tasksAPI.updateTask(taskId, { status });
            showSuccessToast('Task status updated');
            loadTasksAndModules();
        } catch (err) {
            setError(err.response?.data?.error || 'Status update failed');
        }
    };

    const handleCompleteTask = async (task) => {
        const previousStatus = task.status;

        try {
            await tasksAPI.updateTask(task.id, { status: COMPLETED_STATUS });
            setTasks((currentTasks) =>
                currentTasks.map((currentTask) =>
                    currentTask.id === task.id
                        ? { ...currentTask, status: COMPLETED_STATUS }
                        : currentTask
                )
            );
            setUndoCompleteTask({ taskId: task.id, previousStatus });
            showSuccessToast('Task marked complete.', { label: 'Undo' }, 4500);
            loadTasksAndModules();
        } catch (err) {
            setError(err.response?.data?.error || 'Status update failed');
        }
    };

    const handleUndoComplete = async () => {
        if (!undoCompleteTask) return;

        const { taskId, previousStatus } = undoCompleteTask;
        hideToast();
        setUndoCompleteTask(null);

        try {
            await tasksAPI.updateTask(taskId, { status: previousStatus });
            setTasks((currentTasks) =>
                currentTasks.map((currentTask) =>
                    currentTask.id === taskId
                        ? { ...currentTask, status: previousStatus }
                        : currentTask
                )
            );
            loadTasksAndModules();
        } catch (err) {
            setError(err.response?.data?.error || 'Undo failed');
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!confirm('Delete this task?')) return;
        try {
            await tasksAPI.deleteTask(taskId);
            showSuccessToast('Task deleted successfully');
            loadTasksAndModules();
        } catch (err) {
            setError(err.response?.data?.error || 'Delete failed');
        }
    };

    const startEdit = (task) => {
        setEditingTask(task);
        setFormData({
            ...task,
            deadline: task.deadline
                ? new Date(task.deadline).toISOString().slice(0, 16)
                : '',
            estimated_minutes: task.estimated_minutes || '',
        });
    };

    const closeEditModal = () => {
        setEditingTask(null);
        resetTaskForm();
    };

    const renderSummaryCards = () => {
        const taskSummaryCards = [
            {
                id: TASK_VIEW_FILTERS.overdue,
                label: 'Overdue',
                count: activeTasks.filter((task) => isOverdue(task, now)).length,
                accent: 'bg-rose-300',
                onClick: () => setActiveTaskView(TASK_VIEW_FILTERS.overdue),
            },
            {
                id: TASK_VIEW_FILTERS.dueThisWeek,
                label: 'Due this week',
                count: activeTasks.filter((task) => isDueThisWeek(task, now)).length,
                accent: 'bg-amber-300',
                onClick: () => setActiveTaskView(TASK_VIEW_FILTERS.dueThisWeek),
            },
            {
                id: TASK_VIEW_FILTERS.highPriority,
                label: 'High priority',
                count: activeTasks.filter(isHighPriority).length,
                accent: 'bg-orange-300',
                onClick: () => setActiveTaskView(TASK_VIEW_FILTERS.highPriority),
            },
            {
                id: TASK_VIEW_FILTERS.completed,
                label: 'Completed',
                count: completedTaskCount,
                accent: 'bg-emerald-300',
                onClick: () => {
                    setActiveTaskView(TASK_VIEW_FILTERS.completed);
                    setShowCompletedTasks((current) => !current);
                },
            },
        ];

        return (
            <section
                aria-label="Task summary"
                className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
                {taskSummaryCards.map((card) => {
                    const isCardActive =
                        card.id === TASK_VIEW_FILTERS.completed
                            ? showCompletedTasks
                            : activeTaskView === card.id;

                    return (
                        <button
                            key={card.id}
                            type="button"
                            onClick={card.onClick}
                            aria-pressed={isCardActive}
                            className={`group rounded-[11px] border p-5 text-left shadow-[0_12px_26px_rgba(12,6,4,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-amber-200/30 focus:outline-none focus:ring-2 focus:ring-amber-200/35 ${
                                isCardActive
                                    ? 'border-amber-200/35 bg-[#1d120ee8]'
                                    : 'border-white/10 bg-[#160e0be6]'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b9a99d]">
                                    {card.label}
                                </span>
                                <span
                                    className={`h-2.5 w-2.5 rounded-full ${card.accent} shadow-[0_0_18px_rgba(251,191,36,0.24)]`}
                                />
                            </div>
                            <div className="mt-4 text-3xl font-bold tracking-tight text-[#fff7ed]">
                                {card.count}
                            </div>
                        </button>
                    );
                })}
            </section>
        );
    };

    const renderTaskCard = (task) => (
        <article
            key={task.id}
            className="rounded-[10px] border border-white/10 bg-[#120b08]/80 p-4 shadow-[0_10px_22px_rgba(12,6,4,0.18)]"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h3 className="mb-0 text-base font-semibold text-[#fff7ed]">
                        {task.title}
                    </h3>
                    <p className="mb-0 mt-1 text-sm text-[#b9a99d]">
                        {getModuleLabel(modules, task.module_id)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityBadgeClass(
                            task.priority
                        )}`}
                    >
                        {getPriorityLabel(task.priority)}
                    </span>
                    <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                            task.status
                        )}`}
                    >
                        {getStatusLabel(task.status)}
                    </span>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-sm text-[#d8c8bb]">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    {getDeadlineLabel(task)}
                </span>
                {task.estimated_minutes && (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                        {task.estimated_minutes} min
                    </span>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => handleUpdateTaskStatus(task.id, IN_PROGRESS_STATUS)}
                    className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-[#fff7ed] transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200/35"
                >
                    {task.status === IN_PROGRESS_STATUS ? 'Resume' : 'Start'}
                </button>
                <button
                    type="button"
                    onClick={() => handleCompleteTask(task)}
                    className="rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 focus:outline-none focus:ring-2 focus:ring-emerald-200/35"
                >
                    Complete
                </button>
                <button
                    type="button"
                    onClick={() => startEdit(task)}
                    className="rounded-full bg-amber-300/15 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/25 focus:outline-none focus:ring-2 focus:ring-amber-200/35"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onClick={() => handleDeleteTask(task.id)}
                    className="rounded-full bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/25 focus:outline-none focus:ring-2 focus:ring-rose-200/35"
                >
                    Delete
                </button>
            </div>
        </article>
    );

    const renderPriorityBucket = (bucket) => {
        const tasksInBucket = bucketTasks[bucket.id];

        return (
            <div
                key={bucket.id}
                className="overflow-hidden rounded-[11px] border border-white/10 bg-[#160e0be6] shadow-[0_12px_26px_rgba(12,6,4,0.22)]"
            >
                <div className="border-b border-white/10 bg-[#0f0907]/70 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="mb-0 text-lg font-semibold text-[#fff7ed]">
                                {bucket.title}
                            </h2>
                            <p className="mb-0 mt-1 text-sm text-[#b9a99d]">
                                {tasksInBucket.length}{' '}
                                {tasksInBucket.length === 1 ? 'task' : 'tasks'}
                            </p>
                        </div>
                        <span
                            className={`h-2.5 w-2.5 rounded-full ${bucket.accent} shadow-[0_0_18px_rgba(251,191,36,0.24)]`}
                        />
                    </div>
                </div>

                <div className="space-y-3 p-4">
                    {tasksInBucket.length === 0 ? (
                        <div className="rounded-[10px] border border-dashed border-white/10 bg-white/[0.04] p-6 text-center text-sm font-medium text-[#d8c8bb]">
                            {bucket.emptyText}
                        </div>
                    ) : (
                        tasksInBucket.map(renderTaskCard)
                    )}
                </div>
            </div>
        );
    };

    const renderPriorityView = () => {
        if (visibleBuckets.length === 0) {
            return (
                <section className="replica-card grid min-h-72 place-items-center p-12 text-center">
                    <div>
                        <span className="card-kicker">Priority View</span>
                        <p className="mb-0 mt-3 text-lg font-semibold text-[#fff7ed]">
                            No active priority tasks right now.
                        </p>
                    </div>
                </section>
            );
        }

        return (
            <>
                <section
                    aria-label="Priority task buckets"
                    className="grid gap-3 xl:grid-cols-2"
                >
                    {visibleBuckets.map(renderPriorityBucket)}
                </section>

                {laterHiddenCount > 0 && (
                    <div className="mt-3 rounded-[11px] border border-white/10 bg-[#160e0be6] px-5 py-4 text-sm font-medium text-[#b9a99d] shadow-[0_12px_26px_rgba(12,6,4,0.22)]">
                        {laterHiddenCount}{' '}
                        {laterHiddenCount === 1
                            ? 'later task hidden'
                            : 'later tasks hidden'}
                    </div>
                )}
            </>
        );
    };

    const renderActiveTaskView = () => {
        if (loading) {
            return (
                <section
                    className="replica-card grid min-h-72 place-items-center p-12 text-center"
                    aria-live="polite"
                >
                    <div>
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-300/20 border-t-amber-300" />
                        <p className="mb-0 mt-4 font-medium text-[#b9a99d]">
                            Loading tasks...
                        </p>
                    </div>
                </section>
            );
        }

        return renderPriorityView();
    };

    const renderCompletedTaskItem = (task) => (
        <div
            key={task.id}
            className="flex flex-col gap-3 rounded-[10px] border border-white/10 bg-[#120b08]/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <div className="min-w-0">
                <h3 className="mb-0 text-sm font-semibold text-[#fff7ed]">
                    {task.title}
                </h3>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#b9a99d]">
                    <span>{getModuleLabel(modules, task.module_id)}</span>
                    {task.deadline && <span>{getDeadlineLabel(task)}</span>}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                        task.status
                    )}`}
                >
                    {getStatusLabel(task.status)}
                </span>
                <button
                    type="button"
                    onClick={() => handleUpdateTaskStatus(task.id, PENDING_STATUS)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#fff7ed] transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200/35"
                >
                    Reopen
                </button>
            </div>
        </div>
    );

    const renderCompletedTasks = () => {
        if (loading) return null;

        return (
            <section className="mt-3 overflow-hidden rounded-[11px] border border-white/10 bg-[#160e0be6] shadow-[0_12px_26px_rgba(12,6,4,0.22)]">
                <button
                    type="button"
                    onClick={() => setShowCompletedTasks((current) => !current)}
                    aria-expanded={showCompletedTasks}
                    className="flex w-full flex-col gap-3 bg-[#0f0907]/70 px-5 py-4 text-left transition hover:bg-[#140c09]/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-200/35 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div>
                        <span className="card-kicker">Completed tasks</span>
                        <p className="mb-0 mt-1 text-sm font-semibold text-[#fff7ed]">
                            Show {completedTaskCount} completed{' '}
                            {completedTaskCount === 1 ? 'task' : 'tasks'}
                        </p>
                    </div>
                    <span className="self-start rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100 sm:self-center">
                        {showCompletedTasks ? 'Hide' : completedTaskCount}
                    </span>
                </button>

                {showCompletedTasks && (
                    <div className="space-y-2 p-4">
                        {completedTasks.length === 0 ? (
                            <div className="rounded-[10px] border border-dashed border-white/10 bg-white/[0.04] p-5 text-center text-sm font-medium text-[#d8c8bb]">
                                No completed tasks yet.
                            </div>
                        ) : (
                            completedTasks.map(renderCompletedTaskItem)
                        )}
                    </div>
                )}
            </section>
        );
    };

    const renderEditModal = () => {
        if (!editingTask) return null;

        return (
            <div
                className="fixed inset-0 z-50 grid place-items-center bg-[#090504]/75 px-4 py-6 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-task-modal-title"
            >
                <button
                    type="button"
                    className="absolute inset-0 cursor-default"
                    aria-label="Close edit task modal"
                    onClick={closeEditModal}
                />
                <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[14px] border border-white/10 bg-[#160e0bf7] p-5 shadow-[0_24px_60px_rgba(6,3,2,0.45)] sm:p-6">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                            <span className="card-kicker">Task editor</span>
                            <h2
                                id="edit-task-modal-title"
                                className="mb-0 mt-1 text-2xl font-bold tracking-tight text-[#fff7ed]"
                            >
                                Edit Task
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={closeEditModal}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-semibold text-[#d8c8bb] transition hover:bg-white/10 hover:text-[#fff7ed] focus:outline-none focus:ring-2 focus:ring-amber-200/35"
                        >
                            Close
                        </button>
                    </div>

                    <div className="[&>form]:!mb-0 [&>form]:!rounded-[11px] [&>form]:!border-white/10 [&>form]:!bg-[#120b08]/80 [&>form]:!p-5 [&>form]:!shadow-none sm:[&>form]:!p-6">
                        <TaskForm
                            modules={modules}
                            formData={formData}
                            setFormData={setFormData}
                            onSubmit={handleCreateOrUpdate}
                            editingTask={editingTask}
                            onCancel={closeEditModal}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="replica-stage">
            <div className="replica-shell">
                <DashboardSidebar />

                <main className="replica-main">
                    <header className="replica-card mb-3 p-6 sm:p-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <span className="card-kicker">Task management</span>
                                <h1 className="mb-0 mt-1 text-3xl font-bold tracking-tight text-[#fff7ed] sm:text-4xl">
                                    Tasks
                                </h1>
                                <p className="mb-0 mt-2 max-w-2xl text-sm text-[#b9a99d]">
                                    Organize, prioritize, and track your work in one focused workspace.
                                </p>
                            </div>
                        </div>
                    </header>

                    {renderSummaryCards()}

                    <Toast
                        message={showToast ? toastMessage : ''}
                        actionLabel={toastAction?.label}
                        onAction={
                            toastAction?.label === 'Undo' ? handleUndoComplete : null
                        }
                    />

                    {error && (
                        <div className="replica-error" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="[&>form]:!mb-3 [&>form]:!rounded-[11px] [&>form]:!border-white/10 [&>form]:!bg-[#160e0be6] [&>form]:!p-6 [&>form]:!shadow-[0_12px_26px_rgba(12,6,4,0.22)] sm:[&>form]:!p-8">
                        <GuidedTaskCreator
                            modules={modules}
                            guidedTaskForm={guidedTaskForm}
                            setGuidedTaskForm={setGuidedTaskForm}
                            showGuidedForm={showGuidedForm}
                            setShowGuidedForm={setShowGuidedForm}
                            onCreateTask={handleGuidedTaskSubmit}
                            onCancel={resetGuidedForm}
                            guidedDurationError={guidedDurationError}
                        />
                    </div>

                    {renderEditModal()}
                    {renderActiveTaskView()}
                    {renderCompletedTasks()}
                </main>
            </div>
        </div>
    );
};

export default Tasks;

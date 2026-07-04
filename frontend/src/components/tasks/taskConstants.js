export const EMPTY_TASK_FORM = {
    module_id: '',
    title: '',
    description: '',
    deadline: '',
    estimated_minutes: '',
    priority: 3,
    status: 'pending'
};

export const EMPTY_GUIDED_FORM = {
    module_id: '',
    taskType: 'assignment',
    difficulty: 'medium',
    requires_revision: false,
    revision_sessions_needed: 0,
    schedule_notes: '',
    title: '',
    urgency: 'Medium',
    deadline: '',
    estimated_minutes: '',
    description: ''
};

export const URGENCY_PRIORITY = { Low: 1, Medium: 3, High: 5, Critical: 5 };
export const URGENCY_STYLES = {
    Low: 'border border-emerald-300/25 bg-emerald-300/15 text-emerald-100 shadow-[0_0_18px_rgba(110,231,183,0.10)]',
    Medium: 'border border-amber-300/25 bg-amber-300/15 text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.14)]',
    High: 'border border-orange-300/30 bg-orange-300/15 text-orange-100 shadow-[0_0_18px_rgba(251,146,60,0.16)]',
    Critical: 'border border-rose-300/30 bg-rose-300/15 text-rose-100 shadow-[0_0_18px_rgba(251,113,133,0.14)]'
};

export const TASK_TYPES = [
    { label: 'Assignment', value: 'assignment' },
    { label: 'Quiz', value: 'quiz' },
    { label: 'Exam Revision', value: 'exam_revision' },
    { label: 'Lecture Review', value: 'lecture_review' },
    { label: 'Tutorial Preparation', value: 'tutorial_prep' },
    { label: 'Project', value: 'project' },
    { label: 'Reading', value: 'reading' },
    { label: 'Other', value: 'other' }
];

export const DIFFICULTY_OPTIONS = [
    { label: 'Easy', value: 'easy' },
    { label: 'Medium', value: 'medium' },
    { label: 'Hard', value: 'hard' }
];

export const getTaskTypeLabel = (value) =>
    TASK_TYPES.find((type) => type.value === value)?.label || 'Other';

export const getDifficultyLabel = (value) =>
    DIFFICULTY_OPTIONS.find((difficulty) => difficulty.value === value)?.label || 'Medium';

export const TASK_COLUMNS = [
    {
        title: 'To Do',
        status: 'pending',
        color: 'blue',
        icon: '📋',
        emptyText: 'No tasks waiting. Add one with guided creator.'
    },
    {
        title: 'In Progress',
        status: 'in_progress',
        color: 'amber',
        icon: '⚡',
        emptyText: 'No tasks in progress. Start one from To Do.'
    },
    {
        title: 'Completed',
        status: 'completed',
        color: 'emerald',
        icon: '✅',
        emptyText: 'No completed tasks yet. Mark a task complete.'
    }
];

export const BOARD_STYLES = {
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    emerald: 'bg-emerald-50 border-emerald-200'
};

export const HEADER_STYLES = {
    blue: 'from-blue-500 to-blue-600',
    amber: 'from-amber-500 to-amber-600',
    emerald: 'from-emerald-500 to-emerald-600'
};

export const PRIORITY_LABEL = {
    1: 'Low',
    2: 'Low-Medium',
    3: 'Medium',
    4: 'Medium-High',
    5: 'High'
};

export const getPriorityLabel = (priority) => PRIORITY_LABEL[Number(priority)] || 'Medium';

export const getModule = (modules, id) => modules.find((module) => module.id === id) || null;
export const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '');
export const formatTime = (value) =>
    value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export const parseOptionalPositiveNumber = (value) => {
    if (value === '' || value === null || value === undefined) return null;

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) return NaN;

    return number;
};

export const buildTaskPayload = (data) => {
    const estimated = parseOptionalPositiveNumber(data.estimated_minutes);
    return { ...data, priority: Number(data.priority), estimated_minutes: estimated };
};

export const buildGuidedTaskPayload = (guided, modules) => {
    const moduleCode = getModule(modules, guided.module_id)?.module_code || 'Task';
    const estimated = parseOptionalPositiveNumber(guided.estimated_minutes);
    const taskType = guided.taskType || 'assignment';
    const difficulty = guided.difficulty || 'medium';
    const revisionSessions = Number(guided.revision_sessions_needed);
    const revisionSessionsNeeded =
        guided.requires_revision || taskType === 'exam_revision'
            ? Number.isFinite(revisionSessions) && revisionSessions >= 0
                ? revisionSessions
                : 0
            : 0;

    return {
        module_id: guided.module_id,
        title: guided.title.trim() || `${moduleCode} ${getTaskTypeLabel(guided.taskType)}`,
        description: guided.description,
        deadline: guided.deadline,
        priority: URGENCY_PRIORITY[guided.urgency] ?? 3,
        estimated_minutes: estimated,
        task_type: taskType,
        difficulty,
        requires_revision: Boolean(guided.requires_revision),
        revision_sessions_needed: revisionSessionsNeeded,
        schedule_notes: guided.schedule_notes || '',
        status: 'pending'
    };
};

export const generateTaskTitle = (guided, modules) => {
    const moduleCode = getModule(modules, guided.module_id)?.module_code || 'Task';
    return guided.title.trim() || `${moduleCode} ${getTaskTypeLabel(guided.taskType)}`;
};

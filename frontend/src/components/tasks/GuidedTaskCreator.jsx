import PrimaryButton from '../PrimaryButton';
import {
    DIFFICULTY_OPTIONS,
    TASK_TYPES,
    URGENCY_PRIORITY,
    URGENCY_STYLES,
    getDifficultyLabel,
    getModule,
    getTaskTypeLabel,
    generateTaskTitle,
    formatDate,
    formatTime
} from './taskConstants';

const GuidedTaskCreator = ({
    modules,
    guidedTaskForm,
    setGuidedTaskForm,
    showGuidedForm,
    setShowGuidedForm,
    onCreateTask,
    onCancel,
    guidedDurationError
}) => {
    const previewTitle = generateTaskTitle(guidedTaskForm, modules);
    const moduleInfo = getModule(modules, guidedTaskForm.module_id);
    const showRevisionSessions =
        guidedTaskForm.requires_revision || guidedTaskForm.taskType === 'exam_revision';

    return (
        <form
            onSubmit={onCreateTask}
            className="mb-8 overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-glow backdrop-blur-2xl text-slate-100"
        >
            <div className="mb-6 space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    <label className="text-lg font-semibold text-white">Smart Guided Task Creator</label>
                </div>
                <p className="max-w-2xl text-slate-400">
                    Build a task quickly using module, task type, urgency, deadline, and optional duration.
                </p>
            </div>

            {!showGuidedForm ? (
                <PrimaryButton
                    type="button"
                    onClick={() => setShowGuidedForm(true)}
                    className="w-auto rounded-full px-8 py-4 font-bold"
                    variant="glass"
                >
                    + Create with Guided Form
                </PrimaryButton>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
                    <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Module *</label>
                                <select
                                    value={guidedTaskForm.module_id}
                                    onChange={(e) => setGuidedTaskForm((s) => ({ ...s, module_id: e.target.value }))}
                                    className="glass-input w-full"
                                >
                                    <option value="">Select Module</option>
                                    {modules.map((module) => (
                                        <option key={module.id} value={module.id}>
                                            {module.module_code} - {module.module_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Task Type</label>
                                <select
                                    value={guidedTaskForm.taskType}
                                    onChange={(e) => {
                                        const nextTaskType = e.target.value;
                                        setGuidedTaskForm((s) => ({
                                            ...s,
                                            taskType: nextTaskType,
                                            requires_revision:
                                                nextTaskType === 'exam_revision' ? true : s.requires_revision,
                                            revision_sessions_needed:
                                                nextTaskType === 'exam_revision' && Number(s.revision_sessions_needed) === 0
                                                    ? 1
                                                    : s.revision_sessions_needed
                                        }));
                                    }}
                                    className="glass-input w-full"
                                >
                                    {TASK_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Difficulty</label>
                                <select
                                    value={guidedTaskForm.difficulty}
                                    onChange={(e) => setGuidedTaskForm((s) => ({ ...s, difficulty: e.target.value }))}
                                    className="glass-input w-full"
                                >
                                    {DIFFICULTY_OPTIONS.map((difficulty) => (
                                        <option key={difficulty.value} value={difficulty.value}>
                                            {difficulty.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Urgency *</label>
                                <select
                                    value={guidedTaskForm.urgency}
                                    onChange={(e) => setGuidedTaskForm((s) => ({ ...s, urgency: e.target.value }))}
                                    className="glass-input w-full"
                                >
                                    {Object.keys(URGENCY_PRIORITY).map((option) => (
                                        <option key={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Deadline *</label>
                                <input
                                    type="datetime-local"
                                    value={guidedTaskForm.deadline}
                                    onChange={(e) => setGuidedTaskForm((s) => ({ ...s, deadline: e.target.value }))}
                                    className="glass-input w-full"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Estimated Duration (mins)</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={guidedTaskForm.estimated_minutes}
                                    onChange={(e) => setGuidedTaskForm((s) => ({ ...s, estimated_minutes: e.target.value }))}
                                    placeholder="Optional"
                                    className="glass-input w-full"
                                />
                                {guidedDurationError && <p className="mt-1 text-xs text-rose-300">{guidedDurationError}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Task Title (Optional)</label>
                                <input
                                    type="text"
                                    value={guidedTaskForm.title}
                                    onChange={(e) => setGuidedTaskForm((s) => ({ ...s, title: e.target.value }))}
                                    placeholder={`e.g., ${previewTitle}`}
                                    className="glass-input w-full"
                                />
                                <p className="mt-1 text-xs text-slate-400">Leave blank to use: {previewTitle}</p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label
                                className={`flex min-h-[54px] items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-semibold text-[#fff7ed] transition ${
                                    guidedTaskForm.requires_revision
                                        ? 'border-amber-300/35 bg-amber-300/10 shadow-[0_0_18px_rgba(245,158,11,0.10)]'
                                        : 'border-white/10 bg-[#160d0a]/80 hover:bg-[#1f130f]'
                                }`}
                            >
                                <span>Requires revision?</span>
                                <input
                                    type="checkbox"
                                    checked={guidedTaskForm.requires_revision}
                                    onChange={(e) =>
                                        setGuidedTaskForm((s) => ({
                                            ...s,
                                            requires_revision: e.target.checked,
                                            revision_sessions_needed:
                                                e.target.checked && Number(s.revision_sessions_needed) === 0
                                                    ? 1
                                                    : s.revision_sessions_needed
                                        }))
                                    }
                                    className="h-5 w-5 cursor-pointer rounded border-[#7c4a2c] bg-[#2a1a14] text-amber-500 accent-amber-500 focus:ring-2 focus:ring-amber-300/40"
                                />
                            </label>

                            {showRevisionSessions && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-2">Revision sessions needed</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={guidedTaskForm.revision_sessions_needed}
                                        onChange={(e) => setGuidedTaskForm((s) => ({ ...s, revision_sessions_needed: e.target.value }))}
                                        className="glass-input w-full"
                                    />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-2">Scheduling notes</label>
                            <textarea
                                value={guidedTaskForm.schedule_notes}
                                onChange={(e) => setGuidedTaskForm((s) => ({ ...s, schedule_notes: e.target.value }))}
                                rows="2"
                                placeholder="Split into shorter sessions"
                                className="glass-input w-full min-h-[80px] resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-2">Notes</label>
                            <textarea
                                value={guidedTaskForm.description}
                                onChange={(e) => setGuidedTaskForm((s) => ({ ...s, description: e.target.value }))}
                                rows="3"
                                placeholder="Optional details to help you stay on track"
                                className="glass-input w-full min-h-[100px]"
                            />
                        </div>

                        <div className="flex flex-col gap-3 justify-end pt-4 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => {
                                    onCancel();
                                    setShowGuidedForm(false);
                                }}
                                className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <PrimaryButton type="submit" className="w-full sm:w-auto rounded-full px-6 py-3 font-bold">
                                Add Task
                            </PrimaryButton>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-[#5a3524]/80 bg-[#120b08]/90 p-5 text-[#f5e6d3] shadow-[0_0_30px_rgba(245,158,11,0.08),0_18px_40px_rgba(8,4,2,0.35)]">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] text-[#c9a77a]">Live Preview</p>
                                <h3 className="text-xl font-semibold text-[#fff7ed]">Guided task summary</h3>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${URGENCY_STYLES[guidedTaskForm.urgency]}`}>
                                {guidedTaskForm.urgency}
                            </span>
                        </div>

                        <div className="space-y-3 text-[#f5e6d3]">
                            <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Module</p>
                                <p className="mt-2 font-semibold text-[#fff7ed]">
                                    {moduleInfo?.module_code || 'Select a module'}
                                    {guidedTaskForm.module_id && ` — ${moduleInfo?.module_name}`}
                                </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                    <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Type</p>
                                    <p className="mt-2 font-semibold text-[#fff7ed]">{getTaskTypeLabel(guidedTaskForm.taskType)}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                    <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Deadline</p>
                                    <p className="mt-2 font-semibold text-[#fff7ed]">
                                        {guidedTaskForm.deadline ? `${formatDate(guidedTaskForm.deadline)} • ${formatTime(guidedTaskForm.deadline)}` : 'Not set'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                    <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Difficulty</p>
                                    <p className="mt-2 font-semibold text-[#fff7ed]">{getDifficultyLabel(guidedTaskForm.difficulty)}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                    <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Revision</p>
                                    <p className="mt-2 font-semibold text-[#fff7ed]">
                                        {showRevisionSessions
                                            ? `${guidedTaskForm.revision_sessions_needed || 0} session${Number(guidedTaskForm.revision_sessions_needed) === 1 ? '' : 's'}`
                                            : 'Not required'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                    <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Title</p>
                                    <p className="mt-2 font-semibold text-[#fff7ed]">{previewTitle}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                    <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Duration</p>
                                    <p className="mt-2 font-semibold text-[#fff7ed]">
                                        {guidedTaskForm.estimated_minutes ? `${guidedTaskForm.estimated_minutes} mins` : 'Optional'}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-[#241611]/85 p-4 shadow-[inset_0_1px_0_rgba(255,247,237,0.04)]">
                                <p className="text-xs uppercase tracking-[0.2em] text-[#a98562]">Scheduling Notes</p>
                                <p className="mt-2 font-semibold text-[#fff7ed]">
                                    {(guidedTaskForm.schedule_notes || '').trim() || 'None added'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
};

export default GuidedTaskCreator;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { scheduleAPI, tasksAPI } from '../api/api';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import PrimaryButton from '../components/PrimaryButton';
import './Dashboard.css';

const ACTIVITY_STYLES = {
  LEC: { backgroundColor: '#1e3a8a', borderColor: '#3b82f6', label: 'Lecture' },
  TUT: { backgroundColor: '#5b21b6', borderColor: '#8b5cf6', label: 'Tutorial' },
  LAB: { backgroundColor: '#0f766e', borderColor: '#2dd4bf', label: 'Lab' },
};

const AUTO_SCHEDULE_SIGNATURE_KEY = 'paranoidplanner.scheduleSignature';
const ACTIVE_TASK_STATUSES = new Set(['pending', 'in_progress']);

const buildTaskSignature = (tasks = []) =>
  JSON.stringify(
    tasks
      .filter((task) => ACTIVE_TASK_STATUSES.has(task.status))
      .map((task) => ({
        id: task.id,
        status: task.status,
        deadline: task.deadline,
        priority: task.priority,
        estimated_minutes: task.estimated_minutes,
        module_id: task.module_id,
        updated_at: task.updated_at,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );

const buildLessonSignature = (lessons = []) =>
  JSON.stringify(
    lessons
      .map((lesson) => ({
        id: lesson.id,
        module_id: lesson.module_id,
        day_of_week: lesson.day_of_week,
        start_time: lesson.start_time,
        end_time: lesson.end_time,
        activity_type: lesson.activity_type,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );

const getAssignmentStyle = (priority) => {
  const value = Number(priority);

  if (value >= 5) return { backgroundColor: '#991b1b', borderColor: '#ef4444' };
  if (value >= 3) return { backgroundColor: '#92400e', borderColor: '#f59e0b' };
  return { backgroundColor: '#334155', borderColor: '#64748b' };
};

const toCalendarDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toCalendarTime = (value) => (value ? String(value).slice(0, 8) : null);

const formatDateTime = (value) => {
  const date = toCalendarDate(value);

  return date
    ? date.toLocaleString([], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not set';
};

const getAIScheduleNotice = (data = {}) => {
  const count = data.count ?? data.sessions?.length ?? 0;
  const sessionLabel = `${count} study session${count === 1 ? '' : 's'}`;

  if (data.fallback_used) {
    return `Rule-based fallback used: AI unavailable, generated ${sessionLabel} instead.`;
  }

  if (data.ai_used) {
    return `AI-assisted schedule generated with ${sessionLabel}.`;
  }

  return data.message || `Schedule generated with ${sessionLabel}.`;
};

const getGenerationMethodLabel = (method) => {
  const labels = {
    ai_assisted: 'AI-assisted',
    rule_based: 'Rule-based',
    rule_based_fallback: 'Rule-based fallback',
  };

  return labels[method] || 'Rule-based';
};

const getDefaultGenerationReason = (method) => {
  if (method === 'ai_assisted') return 'AI-assisted planning recommendation';
  if (method === 'rule_based_fallback') return 'Rule-based fallback used';
  return 'Rule-based schedule generation';
};

// Lessons become recurring, read-only FullCalendar events.
const lessonToEvent = (lesson = {}, index = 0) => {
  const activityType = String(lesson.activity_type || 'LEC').toUpperCase();
  const style = ACTIVITY_STYLES[activityType] || ACTIVITY_STYLES.LEC;
  const dayOfWeek = Number(lesson.day_of_week);
  const startTime = toCalendarTime(lesson.start_time || lesson.start);
  const endTime = toCalendarTime(lesson.end_time || lesson.end);
  const moduleCode = lesson.module_code || lesson.module?.module_code || 'Module';
  const moduleName =
    lesson.module_name || lesson.module?.module_name || 'Module name unavailable';

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime || !endTime) {
    return null;
  }

  return {
    id: `lesson-${lesson.id ?? `${moduleCode}-${dayOfWeek}-${startTime}-${index}`}`,
    daysOfWeek: [dayOfWeek],
    startTime,
    endTime,
    title: `${moduleCode} ${style.label}`,
    editable: false,
    startEditable: false,
    durationEditable: false,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    textColor: '#ffffff',
    extendedProps: {
      eventType: 'lesson',
      moduleCode,
      moduleName,
      activityLabel: style.label,
      startTime,
      endTime,
    },
  };
};

// Generated study sessions become draggable FullCalendar events.
const sessionToEvent = (session = {}, index = 0) => {
  const start = toCalendarDate(
    session.scheduled_start || session.start || session.task?.scheduled_start
  );
  const providedEnd = toCalendarDate(
    session.scheduled_end || session.end || session.task?.scheduled_end
  );
  const end = start && !providedEnd
    ? new Date(start.getTime() + 60 * 60 * 1000)
    : providedEnd;
  const assignmentTitle =
    session.task_title || session.title || session.task?.title || 'Study session';
  const priority = session.task_priority ?? session.priority;
  const moduleCode =
    session.module_code || session.module?.module_code || session.task?.module_code || 'Module';
  const moduleName =
    session.module_name ||
    session.module?.module_name ||
    session.task?.module_name ||
    'Module name unavailable';

  if (!start || !end) return null;

  return {
    id: `session-${session.id ?? `${moduleCode}-${start.toISOString()}-${index}`}`,
    title: `${moduleCode} - ${assignmentTitle}`,
    start,
    end,
    editable: true,
    ...getAssignmentStyle(priority),
    textColor: '#ffffff',
    extendedProps: {
      eventType: 'session',
      moduleCode,
      moduleName,
      assignmentTitle,
      priority,
      generationMethod: session.generation_method,
      generationReason: session.generation_reason,
      aiStrategy: session.ai_strategy,
    },
  };
};

export const Schedule = () => {
  const [lessons, setLessons] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedEventDetails, setSelectedEventDetails] = useState(null);
  const autoGenerationRef = useRef({ inFlight: false, signature: '' });
  const [autoUpdating, setAutoUpdating] = useState(false);
  const [autoUpdateError, setAutoUpdateError] = useState('');

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await scheduleAPI.getSchedule();
      const data = response.data || {};

      const nextLessons = Array.isArray(data.lessons) ? data.lessons : [];
      const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];

      setLessons(nextLessons);
      setSessions(nextSessions);
      setSelectedEventDetails(null);

      return { lessons: nextLessons, sessions: nextSessions };
    } catch (err) {
      setLessons([]);
      setSessions([]);
      setError(err.response?.data?.error || 'Failed to fetch the schedule. Please try again.');
      return { lessons: [], sessions: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScheduleWithAutoUpdate = useCallback(async () => {
    const scheduleData = await fetchSchedule();

    try {
      const taskResponse = await tasksAPI.getTasks();
      const allTasks = taskResponse.data?.tasks || [];
      const activeTasks = allTasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status));

      if (!activeTasks.length) return;

      const taskSignature = buildTaskSignature(allTasks);
      const lessonSignature = buildLessonSignature(scheduleData.lessons);
      const currentSignature = `${taskSignature}:${lessonSignature}`;
      const storedSignature = localStorage.getItem(AUTO_SCHEDULE_SIGNATURE_KEY);
      const hasGeneratedSessions = scheduleData.sessions.length > 0;

      const shouldGenerate =
        !hasGeneratedSessions || storedSignature !== currentSignature;

      if (
        !shouldGenerate ||
        autoGenerationRef.current.inFlight ||
        autoGenerationRef.current.signature === currentSignature
      ) {
        return;
      }

      autoGenerationRef.current = { inFlight: true, signature: autoGenerationRef.current.signature };
      setAutoUpdating(true);
      setAutoUpdateError('');

      await scheduleAPI.generateSchedule();
      localStorage.setItem(AUTO_SCHEDULE_SIGNATURE_KEY, currentSignature);
      autoGenerationRef.current.signature = currentSignature;
      await fetchSchedule();
    } catch (err) {
      setAutoUpdateError('Schedule could not update automatically. Try Refresh Schedule.');
    } finally {
      autoGenerationRef.current.inFlight = false;
      setAutoUpdating(false);
    }
  }, [fetchSchedule]);

  useEffect(() => {
    loadScheduleWithAutoUpdate();
  }, [loadScheduleWithAutoUpdate]);

  const calendarEvents = useMemo(() => {
    const lessonEvents = lessons.map(lessonToEvent).filter(Boolean);
    const sessionEvents = sessions.map(sessionToEvent).filter(Boolean);

    return [...lessonEvents, ...sessionEvents];
  }, [lessons, sessions]);

  const handleGenerateSchedule = async () => {
    if (generating || aiGenerating) return;

    try {
      setGenerating(true);
      setError('');
      setNotice('');
      setAutoUpdateError('');
      await scheduleAPI.generateSchedule();
      const scheduleData = await fetchSchedule();
      const taskResponse = await tasksAPI.getTasks();
      const currentSignature = `${buildTaskSignature(taskResponse.data?.tasks || [])}:${buildLessonSignature(scheduleData.lessons)}`;

      localStorage.setItem(AUTO_SCHEDULE_SIGNATURE_KEY, currentSignature);
      autoGenerationRef.current.signature = currentSignature;
      setNotice('Schedule refreshed successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to refresh the schedule. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAISchedule = async () => {
    if (aiGenerating || generating) return;

    try {
      setAiGenerating(true);
      setError('');
      setNotice('');
      setAutoUpdateError('');

      const response = await scheduleAPI.generateAISchedule();
      const scheduleData = await fetchSchedule();
      const taskResponse = await tasksAPI.getTasks();
      const currentSignature = `${buildTaskSignature(taskResponse.data?.tasks || [])}:${buildLessonSignature(scheduleData.lessons)}`;

      localStorage.setItem(AUTO_SCHEDULE_SIGNATURE_KEY, currentSignature);
      autoGenerationRef.current.signature = currentSignature;
      setNotice(getAIScheduleNotice(response.data || {}));
    } catch (err) {
      setError(err.response?.data?.error || 'AI schedule generation failed. Please try Refresh Schedule.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleEventMount = ({ event, el }) => {
    const details = event.extendedProps;

    if (details.eventType === 'lesson') {
      el.title = `${details.moduleCode} - ${details.moduleName}\n${details.activityLabel}\n${details.startTime} - ${details.endTime}`;
      return;
    }

    el.title = `${details.moduleCode} - ${details.moduleName}\n${details.assignmentTitle}\n${formatDateTime(event.start)} - ${formatDateTime(event.end)}`;
  };

  const handleEventClick = ({ event }) => {
    const details = event.extendedProps || {};

    if (details.eventType === 'lesson') {
      setSelectedEventDetails({
        eventType: 'lesson',
        title: event.title,
        moduleCode: details.moduleCode,
        moduleName: details.moduleName,
        activityLabel: details.activityLabel,
        startTime: details.startTime,
        endTime: details.endTime,
      });
      return;
    }

    setSelectedEventDetails({
      eventType: 'session',
      title: event.title,
      moduleCode: details.moduleCode,
      moduleName: details.moduleName,
      assignmentTitle: details.assignmentTitle,
      start: event.start,
      end: event.end,
      generationMethod: details.generationMethod,
      generationReason: details.generationReason,
      aiStrategy: details.aiStrategy,
    });
  };

  const handleSessionMove = (changeInfo) => {
    changeInfo.revert();
    setNotice('Session rescheduling is ready for a future backend update.');
  };

  const renderEventContent = ({ event, timeText }) => {
    const details = event.extendedProps;
    const subtitle =
      details.eventType === 'session' ? details.assignmentTitle : details.activityLabel;

    return (
      <div className="min-w-0 overflow-hidden px-1 py-0.5 leading-tight">
        {timeText && <p className="truncate text-[10px] font-medium opacity-80">{timeText}</p>}
        <p className="truncate text-xs font-bold">{details.moduleCode}</p>
        <p className="truncate text-[11px] opacity-90">{subtitle}</p>
      </div>
    );
  };

  const scheduleActionLoading = generating || aiGenerating;

  return (
    <div className="replica-stage">
      <div className="replica-shell">
        <DashboardSidebar />

        <main className="replica-main">
          <header className="replica-card mb-3 p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="card-kicker">Study schedule</span>
                <h1 className="mb-0 mt-1 text-3xl font-bold tracking-tight text-[#fff7ed] sm:text-4xl">
                  Schedule
                </h1>
                <p className="mb-0 mt-2 max-w-2xl text-sm text-[#b9a99d]">
                  Your weekly plan updates automatically when tasks or lessons change.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <PrimaryButton
                  type="button"
                  onClick={handleGenerateAISchedule}
                  loading={aiGenerating}
                  disabled={scheduleActionLoading}
                  className="w-full shrink-0 px-6 py-3 font-semibold sm:w-auto"
                  style={{
                    boxShadow: aiGenerating
                      ? '0 16px 40px rgba(245,158,11,0.16)'
                      : '0 18px 46px rgba(245,158,11,0.30)',
                  }}
                >
                  {aiGenerating ? 'Planning with AI...' : 'Plan with AI'}
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateSchedule}
                  loading={generating}
                  disabled={scheduleActionLoading}
                  className="w-full shrink-0 px-6 py-3 font-semibold sm:w-auto"
                >
                  {generating ? 'Updating schedule...' : 'Refresh Schedule'}
                </PrimaryButton>
              </div>
            </div>
          </header>

          {error && (
            <div className="replica-error" role="alert">
              {error}
            </div>
          )}
          {autoUpdating && !error && (
            <div
              className="mb-3 rounded-lg border border-amber-300/25 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
              role="status"
            >
              Updating schedule...
            </div>
          )}
          {autoUpdateError && !error && !autoUpdating && (
            <div
              className="mb-3 rounded-lg border border-[#ff744c]/35 bg-[#701f10]/25 px-4 py-3 text-sm font-medium text-[#ffc1ae]"
              role="alert"
            >
              {autoUpdateError}
            </div>
          )}
          {notice && !error && (
            <div
              className="mb-3 rounded-lg border border-amber-300/25 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
              role="status"
            >
              {notice}
            </div>
          )}

          {!loading && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#b9a99d]">
              <span className="rounded-full border border-blue-300/20 bg-blue-950/30 px-3 py-1.5 text-blue-100">
                {lessons.length} fixed timetable event{lessons.length === 1 ? '' : 's'}
              </span>
              <span className="rounded-full border border-amber-300/20 bg-amber-950/30 px-3 py-1.5 text-amber-100">
                {sessions.length} study session{sessions.length === 1 ? '' : 's'}
              </span>
              {lessons.length === 0 && (
                <span>Import a NUSMods share link with selected class groups to add lessons.</span>
              )}
            </div>
          )}

          {selectedEventDetails && (
            <section
              className="replica-card mb-3 border-[#5a3524]/70 bg-[#160d0a]/90 p-4 sm:p-5"
              aria-label="Selected schedule event details"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <span className="card-kicker">
                    {selectedEventDetails.eventType === 'session' ? 'Study session' : 'Fixed timetable'}
                  </span>
                  <h2 className="mb-0 mt-1 text-lg font-bold text-[#fff7ed]">
                    {selectedEventDetails.eventType === 'session'
                      ? selectedEventDetails.assignmentTitle || 'Study session'
                      : selectedEventDetails.title}
                  </h2>
                  <p className="mb-0 mt-1 text-sm text-[#b9a99d]">
                    {selectedEventDetails.moduleCode} - {selectedEventDetails.moduleName}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedEventDetails(null)}
                  className="min-h-[44px] rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#f5e6d3] transition hover:bg-white/[0.08]"
                >
                  Close
                </button>
              </div>

              {selectedEventDetails.eventType === 'session' ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-[#21130f]/75 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c9a77a]">
                      Time
                    </p>
                    <p className="mb-0 text-sm font-semibold text-[#fff7ed]">
                      {formatDateTime(selectedEventDetails.start)} - {formatDateTime(selectedEventDetails.end)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#21130f]/75 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c9a77a]">
                      Generation method
                    </p>
                    <p className="mb-0 text-sm font-semibold text-[#fff7ed]">
                      {getGenerationMethodLabel(selectedEventDetails.generationMethod)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#21130f]/75 p-3 md:col-span-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c9a77a]">
                      Scheduling reason
                    </p>
                    <p className="mb-0 text-sm text-[#f5e6d3]">
                      {selectedEventDetails.generationReason ||
                        getDefaultGenerationReason(selectedEventDetails.generationMethod)}
                    </p>
                  </div>
                  {selectedEventDetails.aiStrategy && (
                    <div className="rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 md:col-span-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#f2c27c]">
                        AI strategy
                      </p>
                      <p className="mb-0 text-sm text-amber-100">
                        {selectedEventDetails.aiStrategy}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-[#21130f]/75 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c9a77a]">
                      Lesson type
                    </p>
                    <p className="mb-0 text-sm font-semibold text-[#fff7ed]">
                      {selectedEventDetails.activityLabel}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#21130f]/75 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c9a77a]">
                      Time
                    </p>
                    <p className="mb-0 text-sm font-semibold text-[#fff7ed]">
                      {selectedEventDetails.startTime} - {selectedEventDetails.endTime}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="schedule-calendar replica-card p-3 sm:p-6" aria-label="Study calendar">
            {loading ? (
              <div className="grid min-h-[560px] place-items-center text-center" aria-live="polite">
                <div>
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-300/20 border-t-amber-300" />
                  <p className="mb-0 mt-4 font-medium text-[#b9a99d]">Loading schedule...</p>
                </div>
              </div>
            ) : (
              <>
                {calendarEvents.length === 0 && (
                  <div className="mb-4 rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-[#b9a99d]">
                    No lessons or study sessions yet. Import a NUSMods timetable or generate a schedule to populate the calendar.
                  </div>
                )}
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="timeGridWeek"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay',
                  }}
                  events={calendarEvents}
                  editable
                  eventClick={handleEventClick}
                  eventDrop={handleSessionMove}
                  eventResize={handleSessionMove}
                  eventContent={renderEventContent}
                  eventDidMount={handleEventMount}
                  nowIndicator
                  allDaySlot={false}
                  slotMinTime="07:00:00"
                  slotMaxTime="23:00:00"
                  slotDuration="00:30:00"
                  scrollTime="08:00:00"
                  height="auto"
                  expandRows
                  stickyHeaderDates
                  dayMaxEvents
                  eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: 'short' }}
                />
              </>
            )}
          </section>

        <style>{`
          .schedule-calendar {
            --fc-border-color: rgba(255, 255, 255, 0.1);
            --fc-page-bg-color: transparent;
            --fc-neutral-bg-color: rgba(255, 255, 255, 0.04);
            --fc-list-event-hover-bg-color: rgba(255, 255, 255, 0.08);
            --fc-today-bg-color: rgba(245, 158, 11, 0.08);
            --fc-now-indicator-color: #f59e0b;
          }
          .schedule-calendar .fc { color: #d8c9bd; }
          .schedule-calendar .fc-toolbar-title { color: #fff7ed; font-size: 1.05rem; font-weight: 700; }
          .schedule-calendar .fc-button-primary {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 236, 217, 0.11);
            border-radius: 0.55rem;
            box-shadow: none;
            text-transform: capitalize;
          }
          .schedule-calendar .fc-button-primary:hover,
          .schedule-calendar .fc-button-primary:not(:disabled).fc-button-active {
            background: rgba(255, 100, 54, 0.3);
            border-color: rgba(255, 157, 77, 0.5);
          }
          .schedule-calendar .fc-col-header-cell-cushion,
          .schedule-calendar .fc-daygrid-day-number { color: #d8c9bd; padding: 0.5rem; }
          .schedule-calendar .fc-timegrid-slot-label-cushion { color: #8f7d70; font-size: 0.75rem; }
          .schedule-calendar .fc-event { border-radius: 0.5rem; cursor: default; overflow: hidden; }
          .schedule-calendar .fc-event.fc-event-draggable { cursor: grab; }
          @media (max-width: 767px) {
            .schedule-calendar .fc-header-toolbar { align-items: stretch; flex-direction: column; gap: 0.75rem; }
            .schedule-calendar .fc-toolbar-chunk { display: flex; justify-content: center; }
            .schedule-calendar .fc-toolbar-title { font-size: 1rem; }
            .schedule-calendar .fc-button { font-size: 0.75rem; padding: 0.4rem 0.55rem; }
          }
        `}</style>
        </main>
      </div>
    </div>
  );
};

export default Schedule;

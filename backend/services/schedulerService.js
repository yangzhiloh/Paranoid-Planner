const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const addHours = (date, hours) => {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
};

const addMinutes = (date, minutes) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const SCHEDULE_INTERVAL_MINUTES = 15;
const FALLBACK_SCHEDULE_DAYS = 7;

const roundUpToNextInterval = (date, intervalMinutes = SCHEDULE_INTERVAL_MINUTES) => {
  const rounded = new Date(date);
  const intervalMs = intervalMinutes * 60 * 1000;
  const roundedTime = Math.ceil(rounded.getTime() / intervalMs) * intervalMs;
  rounded.setTime(roundedTime);
  rounded.setSeconds(0, 0);
  return rounded;
};

const getStudyBlockStartTime = (date, preferredStart) => {
  const defaultStart = 9; // 9 AM default

  if (preferredStart) {
    const [hours, minutes] = preferredStart.split(':').map(Number);
    const blockStart = new Date(date);
    blockStart.setHours(hours, minutes, 0, 0);
    return blockStart;
  }

  const blockStart = new Date(date);
  blockStart.setHours(defaultStart, 0, 0, 0);
  return blockStart;
};

// Rank incomplete tasks by deadline, then priority, then shorter duration.
function compareTasks(a, b) {
  if (a.status === 'completed' && b.status !== 'completed') return 1;
  if (b.status === 'completed' && a.status !== 'completed') return -1;

  const dateA = a.deadline ? new Date(a.deadline) : null;
  const dateB = b.deadline ? new Date(b.deadline) : null;
  const hasValidDeadlineA = dateA && !Number.isNaN(dateA.getTime());
  const hasValidDeadlineB = dateB && !Number.isNaN(dateB.getTime());

  if (hasValidDeadlineA && hasValidDeadlineB) {
    if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
  }
  if (hasValidDeadlineA && !hasValidDeadlineB) return -1;
  if (!hasValidDeadlineA && hasValidDeadlineB) return 1;

  if (a.priority !== b.priority) return b.priority - a.priority;
  return (a.estimated_minutes || 60) - (b.estimated_minutes || 60);
}

const blocksOverlap = (startA, endA, startB, endB) => startA < endB && endA > startB;

const isTimeAvailable = (proposedStart, proposedEnd, blockedTimes) => {
  for (const { start, end } of blockedTimes) {
    if (blocksOverlap(proposedStart, proposedEnd, start, end)) return false;
  }
  return true;
};
const hasOverlap = (start, end, blockedTimes) =>
  blockedTimes.some((blockedTime) => blocksOverlap(start, end, blockedTime.start, blockedTime.end));

const getIncompleteTasks = async (userId, database) => {
  const { rows } = await database.query(
    `SELECT id, user_id, module_id, title, deadline, estimated_minutes,
            priority, status, preferred_start_time, preferred_end_time
     FROM tasks
     WHERE user_id = $1 AND status NOT IN ('completed', 'cancelled')`,
    [userId]
  );

  return rows;
};

const getFixedLessons = async (userId, database) => {
  const { rows } = await database.query(
    `SELECT id, day_of_week, start_time, end_time, activity_type, module_id
     FROM lessons
     WHERE user_id = $1`,
    [userId]
  );

  return rows;
};

const deleteGeneratedStudySessions = async (userId, database) => {
  await database.query(
    `DELETE FROM study_sessions
     WHERE user_id = $1 AND status = 'scheduled'`,
    [userId]
  );
};

const getExistingStudySessions = async (userId, database) => {
  const { rows } = await database.query(
    `SELECT task_id, scheduled_start, scheduled_end, status
     FROM study_sessions
     WHERE user_id = $1 AND status != 'cancelled'`,
    [userId]
  );

  return rows;
};

const sortTasksForScheduling = (tasks) => [...tasks].sort(compareTasks);

const convertLessonsToBlockedTime = (lessons, date) => {
  if (!date) return [];

  return lessons
    .filter((lesson) => Number(lesson.day_of_week) === date.getDay())
    .map(({ start_time, end_time }) => {
      const [startHour, startMinute] = String(start_time).split(':').map(Number);
      const [endHour, endMinute] = String(end_time).split(':').map(Number);
      const start = new Date(date);
      const end = new Date(date);
      start.setHours(startHour, startMinute, 0, 0);
      end.setHours(endHour, endMinute, 0, 0);
      return { start, end };
    });
};

const convertSessionsToBlockedTime = (sessions) =>
  sessions.map((session) => ({
    start: new Date(session.start || session.scheduled_start),
    end: new Date(session.end || session.scheduled_end),
  }));

const buildBlockedTime = ({ lessons = [], sessions = [], date = null }) => [
  ...convertLessonsToBlockedTime(lessons, date),
  ...convertSessionsToBlockedTime(sessions),
];

const getTaskWindowEnd = (task, now) => {
  const taskDeadline = task.deadline ? new Date(task.deadline) : null;
  const hasValidDeadline = taskDeadline && !Number.isNaN(taskDeadline.getTime());
  const isOverdue = hasValidDeadline && taskDeadline < now;

  if (isOverdue) return addDays(now, 1);
  if (hasValidDeadline) return taskDeadline;
  return addDays(now, FALLBACK_SCHEDULE_DAYS);
};

const getTaskDayWindowEnd = ({ task, currentDay, windowEnd }) => {
  const dayEnd = new Date(currentDay);

  if (task.preferred_end_time) {
    const [hours, minutes] = String(task.preferred_end_time).split(':').map(Number);
    dayEnd.setHours(hours, minutes, 0, 0);
  } else {
    dayEnd.setHours(23, 59, 59, 999);
  }

  return dayEnd < windowEnd ? dayEnd : windowEnd;
};

const splitTaskIntoSessions = (task, settings = {}) => {
  const estimatedMinutes = task.estimated_minutes || 60;
  const maxSessionMinutes = settings.max_session_minutes || 120;
  const blockDuration = Math.min(maxSessionMinutes, estimatedMinutes);
  const numBlocks = Math.ceil(estimatedMinutes / blockDuration);

  return Array.from({ length: numBlocks }, (_, index) => {
    const remainingMinutes = estimatedMinutes - (index * blockDuration);
    return Math.min(blockDuration, remainingMinutes);
  });
};

const findAvailableSlot = ({
  task,
  durationMinutes,
  blockedTimes,
  currentDay,
  windowEnd,
  now = new Date(),
}) => {
  let candidate = roundUpToNextInterval(
    getStudyBlockStartTime(currentDay, task.preferred_start_time)
  );
  if (candidate < now) candidate = roundUpToNextInterval(now);

  const candidateWindowEnd = getTaskDayWindowEnd({ task, currentDay, windowEnd });

  while (true) {
    const blockEnd = addMinutes(candidate, durationMinutes);
    if (blockEnd > candidateWindowEnd) return null;

    if (!hasOverlap(candidate, blockEnd, blockedTimes)) {
      return { start: candidate, end: blockEnd };
    }

    candidate = roundUpToNextInterval(addMinutes(candidate, SCHEDULE_INTERVAL_MINUTES));
  }
};

const insertStudySession = async (database, sessionData) => {
  const { userId, taskId, scheduledStart, scheduledEnd } = sessionData;

  const sessionResult = await database.query(
    `INSERT INTO study_sessions
      (user_id, task_id, scheduled_start, scheduled_end, status)
      VALUES ($1, $2, $3, $4, 'scheduled')
      RETURNING id, user_id, task_id, scheduled_start, scheduled_end, status`,
    [userId, taskId, scheduledStart.toISOString(), scheduledEnd.toISOString()]
  );

  return sessionResult.rows[0];
};

const getLessonBlocksForDay = async (userId, date, database) => {
  const lessons = await getFixedLessons(userId, database);
  return convertLessonsToBlockedTime(lessons, date);
};

async function generateSchedule(userId, database) {
  try {
    const tasks = await getIncompleteTasks(userId, database);

    await deleteGeneratedStudySessions(userId, database);

    const [existingSessions, fixedLessons] = await Promise.all([
      getExistingStudySessions(userId, database),
      getFixedLessons(userId, database),
    ]);

    if (!tasks.length) return { message: 'No incomplete tasks', sessions: [] };

    const sortedTasks = sortTasksForScheduling(tasks);

    const sessions = [];
    const activeSessionBlocks = convertSessionsToBlockedTime(existingSessions);
    const now = new Date();

    for (const task of sortedTasks) {
      const sessionDurations = splitTaskIntoSessions(task);
      const windowEnd = getTaskWindowEnd(task, now);
      let currentDay = startOfDay(now);
      let blocksAllocated = 0;

      while (blocksAllocated < sessionDurations.length && currentDay <= windowEnd) {
        const blockedTimes = buildBlockedTime({
          lessons: fixedLessons,
          sessions: activeSessionBlocks,
          date: currentDay,
        });

        while (blocksAllocated < sessionDurations.length) {
          const slot = findAvailableSlot({
            task,
            durationMinutes: sessionDurations[blocksAllocated],
            blockedTimes,
            currentDay,
            windowEnd,
            now,
          });

          if (!slot) break;

          const insertedSession = await insertStudySession(database, {
            userId,
            taskId: task.id,
            scheduledStart: slot.start,
            scheduledEnd: slot.end,
          });

          sessions.push(insertedSession);
          // Block the newly generated session immediately for the rest of this run.
          const generatedBlock = { start: new Date(slot.start), end: new Date(slot.end) };
          activeSessionBlocks.push(generatedBlock);
          blockedTimes.push(generatedBlock);
          blocksAllocated++;
        }

        currentDay = addDays(currentDay, 1);
      }

      if (blocksAllocated < sessionDurations.length) {
        console.warn(`Only allocated ${blocksAllocated}/${sessionDurations.length} blocks for "${task.title}"`);
      }
    }

    return { message: `Schedule generated with ${sessions.length} session(s)`, sessions };
  } catch (err) {
    console.error('Schedule generation error:', err);
    throw err;
  }
}

const getSchedule = async (userId, database) => {
  try {
    const [sessionResult, lessonResult] = await Promise.all([
      database.query(
        `SELECT
          ss.id, ss.user_id, ss.task_id, ss.scheduled_start, ss.scheduled_end,
          ss.actual_start, ss.actual_end, ss.status, ss.created_at,
          t.title AS task_title, t.priority AS task_priority, t.module_id, m.module_code, m.module_name, m.color AS module_color
        FROM study_sessions ss
        LEFT JOIN tasks t ON ss.task_id = t.id
        LEFT JOIN modules m ON t.module_id = m.id
        WHERE ss.user_id = $1
          AND ss.status != 'cancelled'
          AND (t.id IS NULL OR t.status NOT IN ('completed', 'cancelled'))
        ORDER BY ss.scheduled_start ASC`,
        [userId]
      ),
      database.query(
        `SELECT
          l.id, l.day_of_week, l.start_time, l.end_time, l.activity_type,
          l.module_id, m.module_code, m.module_name, m.color AS module_color
        FROM lessons l
        LEFT JOIN modules m ON l.module_id = m.id
        WHERE l.user_id = $1
        ORDER BY l.day_of_week ASC, l.start_time ASC`,
        [userId]
      ),
    ]);

    return { sessions: sessionResult.rows, lessons: lessonResult.rows };
  } catch (err) {
    console.error('Get schedule error:', err);
    throw err;
  }
};

const updateSession = async (userId, sessionId, fields, database) => {
  const { scheduled_start, scheduled_end, status } = fields;
 
  const updates = [];
  const params = [];
  let paramCount = 1;
 
  if (scheduled_start !== undefined) {
    updates.push(`scheduled_start = $${paramCount++}`);
    params.push(scheduled_start);
  }
 
  if (scheduled_end !== undefined) {
    updates.push(`scheduled_end = $${paramCount++}`);
    params.push(scheduled_end);
  }
 
  if (status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    params.push(status);
  }
 
  if (updates.length === 0) {
    return { error: 'NO_FIELDS' };
  }
 
  updates.push(`updated_at = CURRENT_TIMESTAMP`);
 
  params.push(sessionId);
  const sessionIdParam = paramCount++;
 
  params.push(userId);
  const userIdParam = paramCount++;
 
  const result = await database.query(
    `UPDATE study_sessions
     SET ${updates.join(', ')}
     WHERE id = $${sessionIdParam} AND user_id = $${userIdParam}
     RETURNING id, user_id, task_id, scheduled_start, scheduled_end, actual_start, actual_end, status, created_at, updated_at`,
    params
  );
 
  if (result.rows.length === 0) {
    return { error: 'NOT_FOUND' };
  }
 
  return { session: result.rows[0] };
};

module.exports = {
  compareTasks,
  blocksOverlap,
  buildBlockedTime,
  convertLessonsToBlockedTime,
  findAvailableSlot,
  generateSchedule,
  getExistingStudySessions,
  getFixedLessons,
  getIncompleteTasks,
  getSchedule,
  updateSession,
  getLessonBlocksForDay,
  hasOverlap,
  insertStudySession,
  isTimeAvailable,
  roundUpToNextInterval,
  sortTasksForScheduling,
  splitTaskIntoSessions,
};

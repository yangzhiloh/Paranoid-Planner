const aiSchedulingService = require('./aiSchedulingService');
const crypto = require('crypto');

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
const GENERATION_METHODS = {
  RULE_BASED: 'rule_based',
  AI_ASSISTED: 'ai_assisted',
  RULE_BASED_FALLBACK: 'rule_based_fallback',
};

const createGenerationId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
    `SELECT
       t.id, t.user_id, t.module_id, t.title, t.deadline, t.estimated_minutes,
       t.priority, t.status, t.preferred_start_time, t.preferred_end_time,
       t.task_type, t.difficulty, t.requires_revision, t.revision_sessions_needed,
       t.min_session_minutes, t.max_session_minutes, t.ai_estimated_minutes,
       t.schedule_notes, m.module_code
     FROM tasks t
     LEFT JOIN modules m ON t.module_id = m.id
     WHERE t.user_id = $1 AND t.status NOT IN ('completed', 'cancelled')`,
    [userId]
  );

  return rows;
};

const getFixedLessons = async (userId, database) => {
  const { rows } = await database.query(
    `SELECT l.id, l.day_of_week, l.start_time, l.end_time, l.activity_type,
            l.module_id, m.module_code
     FROM lessons l
     LEFT JOIN modules m ON l.module_id = m.id
     WHERE l.user_id = $1`,
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

const getUserSettings = async (userId, database) => {
  const { rows } = await database.query(
    `SELECT preferred_study_start_time, preferred_study_end_time,
            max_session_minutes, break_minutes, avoid_weekends, deadline_buffer_days
     FROM user_settings
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
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

const getTaskWindowEnd = (task, now, settings = {}) => {
  const taskDeadline = task.deadline ? new Date(task.deadline) : null;
  const hasValidDeadline = taskDeadline && !Number.isNaN(taskDeadline.getTime());
  const isOverdue = hasValidDeadline && taskDeadline < now;

  if (isOverdue) return addDays(now, 1);
  if (hasValidDeadline) {
    const bufferDays = Number(settings.deadline_buffer_days || 0);
    if (Number.isFinite(bufferDays) && bufferDays > 0) {
      const bufferedDeadline = addDays(taskDeadline, -bufferDays);
      if (bufferedDeadline > now) return bufferedDeadline;
    }
    return taskDeadline;
  }
  return addDays(now, FALLBACK_SCHEDULE_DAYS);
};

const getTaskDayWindowEnd = ({ task, currentDay, windowEnd, settings = {} }) => {
  const dayEnd = new Date(currentDay);
  const preferredEnd = task.preferred_end_time || settings.preferred_study_end_time;

  if (preferredEnd) {
    const [hours, minutes] = String(preferredEnd).split(':').map(Number);
    dayEnd.setHours(hours, minutes, 0, 0);
  } else {
    dayEnd.setHours(23, 59, 59, 999);
  }

  return dayEnd < windowEnd ? dayEnd : windowEnd;
};

const getMaxSessionMinutes = (settings = {}) => {
  const parsedMax = Number(settings.max_session_minutes);
  return Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 120;
};

const getTaskSessionMaxMinutes = (task = {}, settings = {}) => {
  const settingsMax = getMaxSessionMinutes(settings);
  const taskMax = Number(task.max_session_minutes);
  return Number.isFinite(taskMax) && taskMax > 0
    ? Math.min(settingsMax, taskMax)
    : settingsMax;
};

const isRevisionTask = (task = {}) =>
  task.task_type === 'exam_revision' ||
  task.requires_revision === true ||
  Number(task.revision_sessions_needed) > 0;

const buildBalancedSessionDurations = (totalMinutes, sessionCount, maxSessionMinutes) => {
  let remainingMinutes = totalMinutes;

  return Array.from({ length: sessionCount }, (_, index) => {
    const remainingSessions = sessionCount - index;
    const balancedMinutes = Math.ceil(remainingMinutes / remainingSessions);
    const duration = Math.min(maxSessionMinutes, balancedMinutes, remainingMinutes);
    remainingMinutes -= duration;
    return duration;
  }).filter((duration) => duration > 0);
};

const splitTaskIntoSessions = (task, settings = {}, taskPlan = null) => {
  const estimatedMinutes = taskPlan?.recommended_total_minutes ||
    task.ai_estimated_minutes ||
    task.estimated_minutes ||
    60;
  const recommendedSessionCount = Number(taskPlan?.recommended_session_count);
  const recommendedSessionMinutes = Number(taskPlan?.recommended_session_minutes);
  const maxSessionMinutes = getTaskSessionMaxMinutes(task, settings);

  if (
    taskPlan &&
    Number.isInteger(recommendedSessionCount) &&
    recommendedSessionCount > 0 &&
    Number.isFinite(recommendedSessionMinutes) &&
    recommendedSessionMinutes > 0
  ) {
    const targetSessionMinutes = Math.min(recommendedSessionMinutes, maxSessionMinutes);
    return buildBalancedSessionDurations(estimatedMinutes, recommendedSessionCount, targetSessionMinutes);
  }

  if (isRevisionTask(task)) {
    const requestedSessionCount = Number(task.revision_sessions_needed);
    const maxBoundedSessionCount = Math.ceil(estimatedMinutes / maxSessionMinutes);
    const sessionCount = Math.max(
      2,
      Number.isInteger(requestedSessionCount) && requestedSessionCount > 0
        ? requestedSessionCount
        : 0,
      maxBoundedSessionCount
    );

    return buildBalancedSessionDurations(estimatedMinutes, sessionCount, maxSessionMinutes);
  }

  const blockDuration = Math.min(maxSessionMinutes, estimatedMinutes);
  const numBlocks = Math.ceil(estimatedMinutes / blockDuration);

  return Array.from({ length: numBlocks }, (_, index) => {
    const remainingMinutes = estimatedMinutes - (index * blockDuration);
    return Math.min(blockDuration, remainingMinutes);
  });
};

const getRuleBasedGenerationReason = (task, sessionCount) => {
  if (Number(task.priority) >= 5) return 'High priority task scheduled before deadline';
  if (task.task_type === 'exam_revision') {
    return sessionCount > 1
      ? 'Exam revision scheduled with spaced practice windows'
      : 'Exam revision scheduled for focused study';
  }
  if (task.requires_revision || Number(task.revision_sessions_needed) > 0) {
    return sessionCount > 1
      ? 'Revision task split across multiple sessions before deadline'
      : 'Revision task scheduled for focused study';
  }
  if (task.deadline) return 'Task scheduled before deadline using rule-based planning';
  return 'Scheduled during available study time';
};

const buildSessionGenerationMetadata = ({
  task,
  taskPlan,
  sessionCount,
  generationMethod,
  generationReason,
  generationId,
}) => {
  if (generationMethod === GENERATION_METHODS.AI_ASSISTED && taskPlan) {
    return {
      generationMethod,
      generationReason: taskPlan.reason || 'AI-assisted planning recommendation',
      aiStrategy: taskPlan.recommended_strategy || null,
      generationId,
    };
  }

  return {
    generationMethod,
    generationReason: generationReason || getRuleBasedGenerationReason(task, sessionCount),
    aiStrategy: null,
    generationId,
  };
};

const findAvailableSlot = ({
  task,
  durationMinutes,
  blockedTimes,
  currentDay,
  windowEnd,
  settings = {},
  now = new Date(),
}) => {
  const preferredStart = task.preferred_start_time || settings.preferred_study_start_time;
  let candidate = roundUpToNextInterval(
    getStudyBlockStartTime(currentDay, preferredStart)
  );
  if (candidate < now) candidate = roundUpToNextInterval(now);

  const candidateWindowEnd = getTaskDayWindowEnd({ task, currentDay, windowEnd, settings });

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
  const {
    userId,
    taskId,
    scheduledStart,
    scheduledEnd,
    generationMethod = GENERATION_METHODS.RULE_BASED,
    generationReason = null,
    aiStrategy = null,
    generationId = null,
  } = sessionData;

  const sessionResult = await database.query(
    `INSERT INTO study_sessions
      (
        user_id, task_id, scheduled_start, scheduled_end, status,
        generation_method, generation_reason, ai_strategy, generation_id
      )
      VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8)
      RETURNING id, user_id, task_id, scheduled_start, scheduled_end, status,
        generation_method, generation_reason, ai_strategy, generation_id`,
    [
      userId,
      taskId,
      scheduledStart.toISOString(),
      scheduledEnd.toISOString(),
      generationMethod,
      generationReason,
      aiStrategy,
      generationId,
    ]
  );

  return sessionResult.rows[0];
};

const getLessonBlocksForDay = async (userId, date, database) => {
  const lessons = await getFixedLessons(userId, database);
  return convertLessonsToBlockedTime(lessons, date);
};

const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

const getTaskPlanMap = (taskPlans = []) =>
  new Map(taskPlans.map((taskPlan) => [Number(taskPlan.task_id), taskPlan]));

const getCandidateSchedulingDays = ({ now, windowEnd, settings = {} }) => {
  const days = [];
  let currentDay = startOfDay(now);

  while (currentDay <= windowEnd) {
    if (!settings.avoid_weekends || !isWeekend(currentDay)) {
      days.push(new Date(currentDay));
    }
    currentDay = addDays(currentDay, 1);
  }

  return days;
};

const selectRevisionTargetDays = (candidateDays, sessionCount) => {
  if (candidateDays.length <= sessionCount) return candidateDays;

  const selectedDays = [];
  const usedIndexes = new Set();
  const step = candidateDays.length / sessionCount;

  for (let index = 0; index < sessionCount; index++) {
    let targetIndex = Math.min(candidateDays.length - 1, Math.floor(index * step));

    while (usedIndexes.has(targetIndex) && targetIndex < candidateDays.length - 1) {
      targetIndex++;
    }

    usedIndexes.add(targetIndex);
    selectedDays.push(candidateDays[targetIndex]);
  }

  return selectedDays;
};

const insertScheduledBlock = async ({
  userId,
  database,
  task,
  durationMinutes,
  currentDay,
  windowEnd,
  fixedLessons,
  activeSessionBlocks,
  settings,
  now,
  sessionMetadata,
}) => {
  const blockedTimes = buildBlockedTime({
    lessons: fixedLessons,
    sessions: activeSessionBlocks,
    date: currentDay,
  });

  const slot = findAvailableSlot({
    task,
    durationMinutes,
    blockedTimes,
    currentDay,
    windowEnd,
    settings,
    now,
  });

  if (!slot) return null;

  const insertedSession = await insertStudySession(database, {
    userId,
    taskId: task.id,
    scheduledStart: slot.start,
    scheduledEnd: slot.end,
    ...sessionMetadata,
  });

  const generatedBlock = { start: new Date(slot.start), end: new Date(slot.end) };
  activeSessionBlocks.push(generatedBlock);

  return insertedSession;
};

const placeRevisionSessionsForTask = async ({
  userId,
  database,
  task,
  sessionDurations,
  fixedLessons,
  activeSessionBlocks,
  settings,
  sessionMetadata,
  now,
}) => {
  const windowEnd = getTaskWindowEnd(task, now, settings);
  const candidateDays = getCandidateSchedulingDays({ now, windowEnd, settings });
  const targetDays = selectRevisionTargetDays(candidateDays, sessionDurations.length);
  const sessions = [];
  let blocksAllocated = 0;

  const tryPlaceOnDay = async (currentDay) => {
    const insertedSession = await insertScheduledBlock({
      userId,
      database,
      task,
      durationMinutes: sessionDurations[blocksAllocated],
      currentDay,
      windowEnd,
      fixedLessons,
      activeSessionBlocks,
      settings,
      now,
      sessionMetadata,
    });

    if (!insertedSession) return false;

    sessions.push(insertedSession);
    blocksAllocated++;
    return true;
  };

  for (const targetDay of targetDays) {
    if (blocksAllocated >= sessionDurations.length) break;

    let currentDay = new Date(targetDay);
    while (currentDay <= windowEnd) {
      if (!settings.avoid_weekends || !isWeekend(currentDay)) {
        const placed = await tryPlaceOnDay(currentDay);
        if (placed) break;
      }
      currentDay = addDays(currentDay, 1);
    }
  }

  while (blocksAllocated < sessionDurations.length) {
    let placedThisPass = false;

    for (const candidateDay of candidateDays) {
      if (blocksAllocated >= sessionDurations.length) break;

      const placed = await tryPlaceOnDay(candidateDay);
      if (placed) placedThisPass = true;
    }

    if (!placedThisPass) break;
  }

  return { sessions, blocksAllocated };
};

const placeSessionsForTasks = async ({
  userId,
  database,
  tasks,
  fixedLessons,
  existingSessions,
  settings = {},
  taskPlanMap = new Map(),
  generationMethod = GENERATION_METHODS.RULE_BASED,
  generationReason = null,
  generationId = createGenerationId(),
  now = new Date(),
}) => {
  const sortedTasks = sortTasksForScheduling(tasks);

  const sessions = [];
  const activeSessionBlocks = convertSessionsToBlockedTime(existingSessions);

  for (const task of sortedTasks) {
    const taskPlan = taskPlanMap.get(Number(task.id));
    const sessionDurations = splitTaskIntoSessions(task, settings, taskPlan);
    const sessionMetadata = buildSessionGenerationMetadata({
      task,
      taskPlan,
      sessionCount: sessionDurations.length,
      generationMethod,
      generationReason,
      generationId,
    });
    const windowEnd = getTaskWindowEnd(task, now, settings);
    let currentDay = startOfDay(now);
    let blocksAllocated = 0;

    if (isRevisionTask(task)) {
      const revisionPlacement = await placeRevisionSessionsForTask({
        userId,
        database,
        task,
        sessionDurations,
        fixedLessons,
        activeSessionBlocks,
        settings,
        sessionMetadata,
        now,
      });

      sessions.push(...revisionPlacement.sessions);
      blocksAllocated = revisionPlacement.blocksAllocated;

      if (blocksAllocated < sessionDurations.length) {
        console.warn(`Only allocated ${blocksAllocated}/${sessionDurations.length} blocks for "${task.title}"`);
      }

      continue;
    }

    while (blocksAllocated < sessionDurations.length && currentDay <= windowEnd) {
      if (settings.avoid_weekends && isWeekend(currentDay)) {
        currentDay = addDays(currentDay, 1);
        continue;
      }

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
          settings,
          now,
        });

        if (!slot) break;

        const insertedSession = await insertStudySession(database, {
          userId,
          taskId: task.id,
          scheduledStart: slot.start,
          scheduledEnd: slot.end,
          ...sessionMetadata,
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

  return sessions;
};

async function generateSchedule(userId, database) {
  try {
    const tasks = await getIncompleteTasks(userId, database);

    await deleteGeneratedStudySessions(userId, database);

    const [existingSessions, fixedLessons, settings] = await Promise.all([
      getExistingStudySessions(userId, database),
      getFixedLessons(userId, database),
      getUserSettings(userId, database),
    ]);

    if (!tasks.length) return { message: 'No incomplete tasks', sessions: [] };

    const sessions = await placeSessionsForTasks({
      userId,
      database,
      tasks,
      fixedLessons,
      existingSessions,
      settings: settings || {},
      generationMethod: GENERATION_METHODS.RULE_BASED,
      generationId: createGenerationId(),
    });

    return { message: `Schedule generated with ${sessions.length} session(s)`, sessions };
  } catch (err) {
    console.error('Schedule generation error:', err);
    throw err;
  }
}

async function generateAISchedule(userId, database) {
  try {
    const tasks = await getIncompleteTasks(userId, database);

    if (!tasks.length) {
      return {
        message: 'No incomplete tasks',
        sessions: [],
        ai_used: false,
        fallback_used: false,
      };
    }

    await deleteGeneratedStudySessions(userId, database);

    const [fixedLessons, existingSessions, settings] = await Promise.all([
      getFixedLessons(userId, database),
      getExistingStudySessions(userId, database),
      getUserSettings(userId, database),
    ]);

    let aiPlan;
    try {
      aiPlan = await aiSchedulingService.getAISchedulingPlan({
        tasks,
        lessons: fixedLessons,
        settings,
        existingSessions,
      });
    } catch (err) {
      console.warn('AI scheduling unavailable; using deterministic fallback', {
        code: err.code || 'AI_SCHEDULING_UNAVAILABLE',
      });

      const fallbackSessions = await placeSessionsForTasks({
        userId,
        database,
        tasks,
        fixedLessons,
        existingSessions: await getExistingStudySessions(userId, database),
        settings: settings || {},
        generationMethod: GENERATION_METHODS.RULE_BASED_FALLBACK,
        generationReason: 'Rule-based fallback used because AI was unavailable',
        generationId: createGenerationId(),
      });

      return {
        message: `Schedule generated with ${fallbackSessions.length} session(s) (AI unavailable; used deterministic fallback)`,
        sessions: fallbackSessions,
        ai_used: false,
        fallback_used: true,
      };
    }

    const taskPlanMap = getTaskPlanMap(aiPlan.task_plans);
    const sessions = await placeSessionsForTasks({
      userId,
      database,
      tasks,
      fixedLessons,
      existingSessions,
      settings: settings || {},
      taskPlanMap,
      generationMethod: GENERATION_METHODS.AI_ASSISTED,
      generationId: createGenerationId(),
    });

    return {
      message: `AI-guided schedule generated with ${sessions.length} session(s)`,
      sessions,
      ai_used: true,
      fallback_used: false,
    };
  } catch (err) {
    console.error('AI schedule generation error:', err);
    throw err;
  }
}

const getSchedule = async (userId, database) => {
  try {
    const [sessionResult, lessonResult] = await Promise.all([
      database.query(
        `SELECT
          ss.id, ss.user_id, ss.task_id, ss.scheduled_start, ss.scheduled_end,
          ss.actual_start, ss.actual_end, ss.status, ss.generation_method,
          ss.generation_reason, ss.ai_strategy, ss.generation_id, ss.created_at,
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
     RETURNING id, user_id, task_id, scheduled_start, scheduled_end, actual_start,
       actual_end, status, generation_method, generation_reason, ai_strategy,
       generation_id, created_at, updated_at`,
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
  generateAISchedule,
  generateSchedule,
  getExistingStudySessions,
  getFixedLessons,
  getIncompleteTasks,
  getUserSettings,
  getSchedule,
  updateSession,
  getLessonBlocksForDay,
  hasOverlap,
  insertStudySession,
  isTimeAvailable,
  placeSessionsForTasks,
  roundUpToNextInterval,
  sortTasksForScheduling,
  splitTaskIntoSessions,
};

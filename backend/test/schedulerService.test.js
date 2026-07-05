const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBlockedTime,
  findAvailableSlot,
  generateSchedule,
  hasOverlap,
  splitTaskIntoSessions,
} = require('../services/schedulerService');

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const makeMockDatabase = ({ tasks, lessons, existingSessions = [] }) => {
  const calls = [];
  const insertedSessions = [];

  return {
    calls,
    insertedSessions,
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql.includes('FROM tasks')) {
        return { rows: tasks };
      }

      if (sql.includes('DELETE FROM study_sessions')) {
        return { rows: [] };
      }

      if (sql.includes('FROM study_sessions') && !sql.includes('INSERT INTO study_sessions')) {
        return { rows: existingSessions };
      }

      if (sql.includes('FROM lessons')) {
        return { rows: lessons };
      }

      if (sql.includes('INSERT INTO study_sessions')) {
        const session = {
          id: insertedSessions.length + 1,
          user_id: params[0],
          task_id: params[1],
          scheduled_start: params[2],
          scheduled_end: params[3],
          status: 'scheduled',
        };
        insertedSessions.push(session);
        return { rows: [session] };
      }

      return { rows: [] };
    },
  };
};

test('splitTaskIntoSessions preserves two-hour default blocks', () => {
  assert.deepEqual(splitTaskIntoSessions({ estimated_minutes: 250 }), [120, 120, 10]);
  assert.deepEqual(splitTaskIntoSessions({ estimated_minutes: 90 }), [90]);
});

test('findAvailableSlot skips blocked time', () => {
  const currentDay = new Date(2026, 7, 3, 0, 0, 0, 0);
  const blockedTimes = [
    {
      start: new Date(2026, 7, 3, 9, 0, 0, 0),
      end: new Date(2026, 7, 3, 10, 0, 0, 0),
    },
  ];

  const slot = findAvailableSlot({
    task: { preferred_start_time: '09:00', preferred_end_time: '12:00' },
    durationMinutes: 60,
    blockedTimes,
    currentDay,
    windowEnd: new Date(2026, 7, 3, 23, 59, 0, 0),
    now: new Date(2026, 7, 3, 8, 0, 0, 0),
  });

  assert.equal(slot.start.getHours(), 10);
  assert.equal(slot.end.getHours(), 11);
});

test('buildBlockedTime converts lessons and existing sessions into overlap blocks', () => {
  const date = new Date(2026, 7, 3, 0, 0, 0, 0);
  const blockedTimes = buildBlockedTime({
    date,
    lessons: [
      {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '11:30',
      },
    ],
    sessions: [
      {
        scheduled_start: '2026-08-03T13:00:00.000Z',
        scheduled_end: '2026-08-03T14:00:00.000Z',
      },
    ],
  });

  assert.equal(blockedTimes.length, 2);
  assert.equal(hasOverlap(
    new Date(2026, 7, 3, 10, 30, 0, 0),
    new Date(2026, 7, 3, 11, 0, 0, 0),
    blockedTimes
  ), true);
});

test('generateSchedule deletes old scheduled sessions and avoids fixed lessons', async () => {
  const now = new Date();
  const userId = 42;
  const database = makeMockDatabase({
    tasks: [
      {
        id: 7,
        user_id: userId,
        module_id: 3,
        title: 'Blocked-day task',
        deadline: addDays(now, 2).toISOString(),
        estimated_minutes: 60,
        priority: 3,
        status: 'pending',
        preferred_start_time: '09:00',
        preferred_end_time: null,
      },
    ],
    lessons: [
      {
        id: 1,
        day_of_week: now.getDay(),
        start_time: '00:00',
        end_time: '23:59',
        activity_type: 'lecture',
        module_id: 3,
      },
    ],
  });

  const result = await generateSchedule(userId, database);

  assert.equal(result.sessions.length, 1);
  assert.equal(database.insertedSessions.length, 1);
  assert.equal(database.calls.some((call) => call.sql.includes('DELETE FROM study_sessions')), true);

  const inserted = database.insertedSessions[0];
  const insertedStart = new Date(inserted.scheduled_start);
  const insertedEnd = new Date(inserted.scheduled_end);
  const lessonBlocks = buildBlockedTime({
    date: startOfCurrentDay(now),
    lessons: database.calls.find((call) => call.sql.includes('FROM lessons')) ? [
      {
        day_of_week: now.getDay(),
        start_time: '00:00',
        end_time: '23:59',
      },
    ] : [],
  });

  assert.equal(hasOverlap(insertedStart, insertedEnd, lessonBlocks), false);
});

const startOfCurrentDay = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAISchedulePrompt,
  buildPromptData,
} = require('../services/aiSchedulePromptBuilder');

test('buildAISchedulePrompt includes hard constraints and output schema', () => {
  const prompt = buildAISchedulePrompt({
    tasks: [
      {
        id: 12,
        title: 'Final essay',
        module_code: 'CS1010',
        deadline: '2026-08-15T23:59:00.000Z',
        priority: 5,
        estimated_minutes: 240,
        task_type: 'assignment',
        difficulty: 'hard',
        requires_revision: true,
        revision_sessions_needed: 2,
        schedule_notes: 'Split into shorter sessions',
        password: 'do-not-include',
        jwt: 'secret-token',
      },
    ],
    lessons: [
      {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '12:00',
        module_code: 'CS1010',
        activity_type: 'lecture',
      },
    ],
    settings: {
      preferred_study_start_time: '09:00',
      preferred_study_end_time: '22:00',
      max_session_minutes: 120,
      break_minutes: 15,
      avoid_weekends: true,
      deadline_buffer_days: 1,
      email: 'student@example.com',
      database_url: 'postgres://secret',
    },
    existingSessions: [
      {
        task_id: 3,
        scheduled_start: '2026-08-10T13:00:00.000Z',
        scheduled_end: '2026-08-10T14:00:00.000Z',
        status: 'scheduled',
      },
    ],
  });

  assert.match(prompt, /Role: You are helping create an academic study plan/);
  assert.match(prompt, /Do not suggest sessions that overlap fixed lessons/);
  assert.match(prompt, /Do not suggest sessions after a task deadline unless unavoidable/);
  assert.match(prompt, /Respect preferred study hours/);
  assert.match(prompt, /Respect max session length/);
  assert.match(prompt, /Respect avoid weekends preference/);
  assert.match(prompt, /Return JSON only/);
  assert.match(prompt, /"task_id": "number"/);
  assert.match(prompt, /"recommended_total_minutes": "number"/);
  assert.match(prompt, /Final essay/);
  assert.match(prompt, /CS1010/);
  assert.match(prompt, /Monday/);
  assert.match(prompt, /Split into shorter sessions/);

  assert.doesNotMatch(prompt, /do-not-include/);
  assert.doesNotMatch(prompt, /secret-token/);
  assert.doesNotMatch(prompt, /student@example\.com/);
  assert.doesNotMatch(prompt, /postgres:\/\/secret/);
});

test('buildPromptData keeps only scheduling-relevant fields', () => {
  const promptData = buildPromptData({
    tasks: [
      {
        id: 4,
        title: 'Quiz prep',
        user_id: 99,
        module_code: 'MA1521',
        estimated_minutes: 90,
        task_type: 'quiz',
        difficulty: 'medium',
        auth_token: 'token',
      },
    ],
    lessons: [
      {
        day_of_week: 5,
        start_time: '14:00',
        end_time: '16:00',
        module_code: 'MA1521',
        room: 'hidden-room',
      },
    ],
    settings: {
      max_session_minutes: 90,
      jwt: 'hidden-jwt',
    },
    existingSessions: [],
  });

  assert.deepEqual(promptData.tasks[0], {
    task_id: 4,
    title: 'Quiz prep',
    module_code: 'MA1521',
    estimated_duration: 90,
    task_type: 'quiz',
    difficulty: 'medium',
  });
  assert.equal(promptData.fixed_lessons[0].day, 'Friday');
  assert.equal(promptData.fixed_lessons[0].room, undefined);
  assert.equal(promptData.settings.max_session_minutes, 90);
  assert.equal(promptData.settings.jwt, undefined);
});

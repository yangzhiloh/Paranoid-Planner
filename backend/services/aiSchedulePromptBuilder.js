const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OUTPUT_SCHEMA = {
  task_plans: [
    {
      task_id: 'number',
      recommended_total_minutes: 'number',
      recommended_session_count: 'number',
      recommended_session_minutes: 'number',
      recommended_strategy: 'string',
      reason: 'string',
    },
  ],
};

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const pickSchedulingFields = (item, fieldMap) => {
  if (!item || typeof item !== 'object') return {};

  return Object.entries(fieldMap).reduce((picked, [sourceField, targetField]) => {
    if (hasValue(item[sourceField])) {
      picked[targetField] = item[sourceField];
    }
    return picked;
  }, {});
};

const normalizeDay = (day) => {
  if (!hasValue(day)) return undefined;

  const numericDay = Number(day);
  if (Number.isInteger(numericDay) && numericDay >= 0 && numericDay <= 6) {
    return DAY_NAMES[numericDay];
  }

  return String(day);
};

const buildPromptData = ({ tasks = [], lessons = [], settings = null, existingSessions = [] }) => ({
  tasks: tasks.map((task) =>
    pickSchedulingFields(task, {
      id: 'task_id',
      title: 'title',
      module_code: 'module_code',
      deadline: 'deadline',
      priority: 'priority',
      estimated_minutes: 'estimated_duration',
      task_type: 'task_type',
      difficulty: 'difficulty',
      requires_revision: 'requires_revision',
      revision_sessions_needed: 'revision_sessions_needed',
      schedule_notes: 'schedule_notes',
    })
  ),
  fixed_lessons: lessons.map((lesson) => ({
    ...pickSchedulingFields(lesson, {
      start_time: 'start_time',
      end_time: 'end_time',
      module_code: 'module_code',
      activity_type: 'activity_type',
    }),
    ...(hasValue(lesson?.day_of_week) ? { day: normalizeDay(lesson.day_of_week) } : {}),
  })),
  settings: settings
    ? pickSchedulingFields(settings, {
        preferred_study_start_time: 'preferred_study_start_time',
        preferred_study_end_time: 'preferred_study_end_time',
        max_session_minutes: 'max_session_minutes',
        break_minutes: 'break_minutes',
        avoid_weekends: 'avoid_weekends',
        deadline_buffer_days: 'deadline_buffer_days',
      })
    : {},
  existing_sessions: existingSessions.map((session) =>
    pickSchedulingFields(session, {
      task_id: 'task_id',
      scheduled_start: 'scheduled_start',
      scheduled_end: 'scheduled_end',
      status: 'status',
    })
  ),
});

const buildAISchedulePrompt = ({ tasks = [], lessons = [], settings = null, existingSessions = [] }) => {
  const promptData = buildPromptData({ tasks, lessons, settings, existingSessions });

  return [
    'Role: You are helping create an academic study plan.',
    '',
    'Hard constraints:',
    '- Do not suggest sessions that overlap fixed lessons.',
    '- Do not suggest sessions after a task deadline unless unavoidable.',
    '- Respect preferred study hours.',
    '- Respect max session length.',
    '- Respect avoid weekends preference.',
    '- Recommend task-level scheduling strategy only; do not create final calendar sessions.',
    '- Use only the task IDs provided in Task data.',
    '- Return JSON only. Do not include markdown, code fences, or explanatory text outside JSON.',
    '',
    'Privacy/data minimisation:',
    '- Use only the scheduling-relevant data below.',
    '- Do not use or request passwords, JWT tokens, database connection details, or unnecessary user profile data.',
    '',
    'Task data:',
    JSON.stringify(promptData.tasks, null, 2),
    '',
    'Fixed lessons:',
    JSON.stringify(promptData.fixed_lessons, null, 2),
    '',
    'Settings:',
    JSON.stringify(promptData.settings, null, 2),
    '',
    'Existing sessions:',
    JSON.stringify(promptData.existing_sessions, null, 2),
    '',
    'Output schema:',
    JSON.stringify(OUTPUT_SCHEMA, null, 2),
  ].join('\n');
};

module.exports = {
  OUTPUT_SCHEMA,
  buildAISchedulePrompt,
  buildPromptData,
};

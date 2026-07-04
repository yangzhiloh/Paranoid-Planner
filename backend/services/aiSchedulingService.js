const { getAISchedulingConfig } = require('../config/aiConfig');

class AISchedulingError extends Error {
  constructor(message, code, statusCode = 503) {
    super(message);
    this.name = 'AISchedulingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const EXPECTED_OUTPUT_DESCRIPTION = {
  task_plans: [
    {
      task_id: 12,
      recommended_total_minutes: 240,
      recommended_session_count: 3,
      recommended_session_minutes: 80,
      recommended_strategy: 'split across multiple days before deadline',
      reason: 'High priority assignment due soon',
    },
  ],
};

const safeLogAIError = (message, error) => {
  console.error(message, {
    code: error.code,
    statusCode: error.statusCode,
    message: error.message,
  });
};

const stripCodeFence = (value) =>
  String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const extractFirstJSONObject = (value) => {
  const text = stripCodeFence(value);
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return text;
  }

  return text.slice(firstBrace, lastBrace + 1);
};

const parseJSONText = (value) => {
  try {
    return JSON.parse(extractFirstJSONObject(value));
  } catch (err) {
    throw new AISchedulingError('AI provider returned invalid JSON', 'AI_INVALID_JSON', 502);
  }
};

const parseProviderResponse = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== 'object') {
    throw new AISchedulingError('AI provider returned an empty response', 'AI_EMPTY_RESPONSE', 502);
  }

  if (Array.isArray(providerResponse.task_plans)) {
    return providerResponse;
  }

  const choice = providerResponse.choices?.[0];
  const messageContent = choice?.message?.content;

  if (typeof messageContent === 'string') {
    return parseJSONText(messageContent);
  }

  if (Array.isArray(messageContent)) {
    const textContent = messageContent
      .map((part) => part.text || part.content || '')
      .join('');
    return parseJSONText(textContent);
  }

  if (typeof choice?.text === 'string') {
    return parseJSONText(choice.text);
  }

  if (typeof providerResponse.output_text === 'string') {
    return parseJSONText(providerResponse.output_text);
  }

  throw new AISchedulingError('AI provider response did not include JSON content', 'AI_NO_JSON_CONTENT', 502);
};

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const isPositiveInteger = (value) => isPositiveNumber(value) && Number.isInteger(Number(value));

const validateAIPlan = (plan) => {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.task_plans)) {
    throw new AISchedulingError('AI plan must include a task_plans array', 'AI_INVALID_PLAN', 502);
  }

  plan.task_plans.forEach((taskPlan, index) => {
    if (!taskPlan || typeof taskPlan !== 'object') {
      throw new AISchedulingError(`AI task plan at index ${index} must be an object`, 'AI_INVALID_PLAN', 502);
    }

    if (!Number.isInteger(Number(taskPlan.task_id))) {
      throw new AISchedulingError(`AI task plan at index ${index} is missing a valid task_id`, 'AI_INVALID_PLAN', 502);
    }

    const positiveFields = ['recommended_total_minutes', 'recommended_session_minutes'];

    positiveFields.forEach((field) => {
      if (!isPositiveNumber(taskPlan[field])) {
        throw new AISchedulingError(
          `AI task plan for task ${taskPlan.task_id} is missing a positive ${field}`,
          'AI_INVALID_PLAN',
          502
        );
      }
    });

    if (!isPositiveInteger(taskPlan.recommended_session_count)) {
      throw new AISchedulingError(
        `AI task plan for task ${taskPlan.task_id} is missing a positive integer recommended_session_count`,
        'AI_INVALID_PLAN',
        502
      );
    }

    if (typeof taskPlan.recommended_strategy !== 'string' || !taskPlan.recommended_strategy.trim()) {
      throw new AISchedulingError(
        `AI task plan for task ${taskPlan.task_id} is missing recommended_strategy`,
        'AI_INVALID_PLAN',
        502
      );
    }

    if (typeof taskPlan.reason !== 'string' || !taskPlan.reason.trim()) {
      throw new AISchedulingError(
        `AI task plan for task ${taskPlan.task_id} is missing reason`,
        'AI_INVALID_PLAN',
        502
      );
    }
  });

  return {
    task_plans: plan.task_plans.map((taskPlan) => ({
      task_id: Number(taskPlan.task_id),
      recommended_total_minutes: Number(taskPlan.recommended_total_minutes),
      recommended_session_count: Number(taskPlan.recommended_session_count),
      recommended_session_minutes: Number(taskPlan.recommended_session_minutes),
      recommended_strategy: taskPlan.recommended_strategy.trim(),
      reason: taskPlan.reason.trim(),
    })),
  };
};

const pickFields = (item, fields) => {
  if (!item || typeof item !== 'object') return {};

  return fields.reduce((picked, field) => {
    if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
      picked[field] = item[field];
    }
    return picked;
  }, {});
};

const buildAIContext = ({ tasks = [], lessons = [], settings = null, existingSessions = [] }) => ({
  tasks: tasks.map((task) =>
    pickFields(task, [
      'id',
      'title',
      'deadline',
      'estimated_minutes',
      'priority',
      'status',
      'task_type',
      'difficulty',
      'requires_revision',
      'revision_sessions_needed',
      'min_session_minutes',
      'max_session_minutes',
      'ai_estimated_minutes',
      'schedule_notes',
    ])
  ),
  lessons: lessons.map((lesson) =>
    pickFields(lesson, [
      'day_of_week',
      'start_time',
      'end_time',
      'activity_type',
      'module_id',
    ])
  ),
  settings: settings
    ? pickFields(settings, [
        'preferred_study_start_time',
        'preferred_study_end_time',
        'max_session_minutes',
        'break_minutes',
        'avoid_weekends',
        'deadline_buffer_days',
      ])
    : null,
  existing_sessions: existingSessions.map((session) =>
    pickFields(session, [
      'task_id',
      'scheduled_start',
      'scheduled_end',
      'status',
    ])
  ),
});

const buildMessages = (context) => [
  {
    role: 'system',
    content: [
      'You are an AI planning assistant for a study planner.',
      'Return JSON only. Do not include markdown, commentary, or code fences.',
      'Recommend task-level study effort only; do not create calendar sessions.',
      'Do not invent task IDs. Use only task IDs from the supplied tasks.',
    ].join(' '),
  },
  {
    role: 'user',
    content: JSON.stringify({
      instruction:
        'Create scheduling recommendations for each incomplete task. Respect task difficulty, task type, revision needs, deadlines, estimated duration, user settings, fixed lessons, and existing sessions.',
      expected_output_shape: EXPECTED_OUTPUT_DESCRIPTION,
      context,
    }),
  },
];

const buildProviderRequestBody = (config, context) => ({
  model: config.model,
  messages: buildMessages(context),
  max_tokens: config.maxTokens,
  response_format: { type: 'json_object' },
});

const assertAIAvailable = (config) => {
  if (!config.enabled) {
    throw new AISchedulingError('AI scheduling is disabled', 'AI_DISABLED');
  }

  if (!config.providerUrl) {
    throw new AISchedulingError('AI provider URL is not configured', 'AI_MISSING_PROVIDER_URL');
  }

  if (!config.apiKey) {
    throw new AISchedulingError('AI provider API key is not configured', 'AI_MISSING_API_KEY');
  }

  if (!config.model) {
    throw new AISchedulingError('AI model is not configured', 'AI_MISSING_MODEL');
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new AISchedulingError('AI requests require a runtime with fetch support', 'AI_FETCH_UNAVAILABLE');
  }
};

const fetchProviderResponse = async (config, context) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await globalThis.fetch(config.providerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildProviderRequestBody(config, context)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AISchedulingError(
        `AI provider request failed with status ${response.status}`,
        'AI_PROVIDER_ERROR',
        502
      );
    }

    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AISchedulingError('AI provider request timed out', 'AI_TIMEOUT', 504);
    }
    if (err instanceof AISchedulingError) {
      throw err;
    }
    throw new AISchedulingError('AI provider request failed', 'AI_REQUEST_FAILED', 502);
  } finally {
    clearTimeout(timeout);
  }
};

const getAISchedulingPlan = async ({ tasks, lessons, settings, existingSessions }) => {
  const config = getAISchedulingConfig();

  try {
    assertAIAvailable(config);

    const context = buildAIContext({ tasks, lessons, settings, existingSessions });
    const providerResponse = await fetchProviderResponse(config, context);
    const parsedPlan = parseProviderResponse(providerResponse);

    return validateAIPlan(parsedPlan);
  } catch (err) {
    if (err instanceof AISchedulingError) {
      safeLogAIError('AI scheduling unavailable:', err);
      throw err;
    }

    const controlledError = new AISchedulingError('AI scheduling failed', 'AI_UNKNOWN_ERROR', 500);
    safeLogAIError('AI scheduling failed:', controlledError);
    throw controlledError;
  }
};

module.exports = {
  AISchedulingError,
  buildAIContext,
  buildMessages,
  buildProviderRequestBody,
  getAISchedulingPlan,
  parseProviderResponse,
  validateAIPlan,
};

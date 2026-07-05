const DEFAULT_MAX_SESSION_MINUTES = 120;
const MIN_SESSION_MINUTES = 15;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const isPositiveInteger = (value) => isPositiveNumber(value) && Number.isInteger(Number(value));
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const getMaxSessionMinutes = (settings = {}) => {
  const parsedMax = Number(settings?.max_session_minutes);
  if (!Number.isFinite(parsedMax) || parsedMax <= 0) {
    return DEFAULT_MAX_SESSION_MINUTES;
  }

  return Math.max(MIN_SESSION_MINUTES, parsedMax);
};

const buildKnownTaskIdSet = (tasks = []) =>
  new Set(
    tasks
      .map((task) => Number(task?.id))
      .filter((taskId) => Number.isInteger(taskId))
      .map(String)
  );

const fallbackResult = (warnings) => ({
  valid: false,
  taskPlans: [],
  warnings: warnings.includes('No valid AI task plans returned')
    ? warnings
    : [...warnings, 'No valid AI task plans returned'],
});

const validateAISchedulePlan = (aiPlan, tasks = [], settings = {}) => {
  const warnings = [];

  if (!isObject(aiPlan)) {
    return fallbackResult(['AI schedule plan must be an object']);
  }

  if (!Array.isArray(aiPlan.task_plans)) {
    return fallbackResult(['AI schedule plan must include a task_plans array']);
  }

  const knownTaskIds = buildKnownTaskIdSet(tasks);
  const maxSessionMinutes = getMaxSessionMinutes(settings);

  const taskPlans = aiPlan.task_plans.reduce((validPlans, taskPlan, index) => {
    if (!isObject(taskPlan)) {
      warnings.push(`Task plan at index ${index} must be an object`);
      return validPlans;
    }

    const taskId = Number(taskPlan.task_id);
    if (!Number.isInteger(taskId)) {
      warnings.push(`Task plan at index ${index} has an invalid task_id`);
      return validPlans;
    }

    if (!knownTaskIds.has(String(taskId))) {
      warnings.push(`Task plan for unknown task_id ${taskPlan.task_id} was ignored`);
      return validPlans;
    }

    if (!isPositiveNumber(taskPlan.recommended_total_minutes)) {
      warnings.push(`Task plan for task_id ${taskId} has invalid recommended_total_minutes`);
      return validPlans;
    }

    if (!isPositiveInteger(taskPlan.recommended_session_count)) {
      warnings.push(`Task plan for task_id ${taskId} has invalid recommended_session_count`);
      return validPlans;
    }

    if (!isPositiveNumber(taskPlan.recommended_session_minutes)) {
      warnings.push(`Task plan for task_id ${taskId} has invalid recommended_session_minutes`);
      return validPlans;
    }

    const requestedSessionMinutes = Number(taskPlan.recommended_session_minutes);
    if (requestedSessionMinutes < MIN_SESSION_MINUTES) {
      warnings.push(
        `Task plan for task_id ${taskId} recommended a session shorter than ${MIN_SESSION_MINUTES} minutes`
      );
      return validPlans;
    }

    const normalizedSessionMinutes = Math.min(requestedSessionMinutes, maxSessionMinutes);
    if (normalizedSessionMinutes !== requestedSessionMinutes) {
      warnings.push(
        `Task plan for task_id ${taskId} exceeded max_session_minutes and was capped at ${maxSessionMinutes}`
      );
    }

    if (!isNonEmptyString(taskPlan.recommended_strategy)) {
      warnings.push(`Task plan for task_id ${taskId} has invalid recommended_strategy`);
      return validPlans;
    }

    if (!isNonEmptyString(taskPlan.reason)) {
      warnings.push(`Task plan for task_id ${taskId} has invalid reason`);
      return validPlans;
    }

    validPlans.push({
      task_id: taskId,
      recommended_total_minutes: Number(taskPlan.recommended_total_minutes),
      recommended_session_count: Number(taskPlan.recommended_session_count),
      recommended_session_minutes: normalizedSessionMinutes,
      recommended_strategy: taskPlan.recommended_strategy.trim(),
      reason: taskPlan.reason.trim(),
    });

    return validPlans;
  }, []);

  if (!taskPlans.length) {
    return fallbackResult(warnings);
  }

  return {
    valid: true,
    taskPlans,
    warnings,
  };
};

module.exports = {
  DEFAULT_MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  validateAISchedulePlan,
};

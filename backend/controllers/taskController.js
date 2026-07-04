const pool = require('../config/db');
const {
  awardTaskCompletion,
  reverseTaskCompletion,
} = require('../services/pointsService');

const VALID_TASK_TYPES = [
  'assignment',
  'quiz',
  'exam_revision',
  'lecture_review',
  'tutorial_prep',
  'project',
  'reading',
  'other',
];

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

const DEFAULT_SCHEDULING_METADATA = {
  task_type: 'assignment',
  difficulty: 'medium',
  requires_revision: false,
  revision_sessions_needed: 0,
  min_session_minutes: 30,
  max_session_minutes: 120,
};

const TASK_RETURN_FIELDS = `
  id, user_id, module_id, title, description, deadline, estimated_minutes,
  priority, status, preferred_start_time, preferred_end_time, task_type,
  difficulty, requires_revision, revision_sessions_needed,
  min_session_minutes, max_session_minutes, ai_estimated_minutes,
  schedule_notes, created_at, updated_at
`;

const parseIntegerField = (value, fieldName, { nullable = false } = {}) => {
  if (value === undefined) return { exists: false };
  if (value === null || value === '') {
    return nullable ? { exists: true, value: null } : { error: `${fieldName} is required when provided` };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return { error: `${fieldName} must be an integer` };
  }

  return { exists: true, value: parsed };
};

const validateTaskSchedulingMetadata = (body, existingValues = {}) => {
  const values = {};

  if (body.task_type !== undefined) {
    if (!VALID_TASK_TYPES.includes(body.task_type)) {
      return { error: `Task type must be one of: ${VALID_TASK_TYPES.join(', ')}` };
    }
    values.task_type = body.task_type;
  }

  if (body.difficulty !== undefined) {
    if (!VALID_DIFFICULTIES.includes(body.difficulty)) {
      return { error: `Difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}` };
    }
    values.difficulty = body.difficulty;
  }

  if (body.requires_revision !== undefined) {
    if (typeof body.requires_revision !== 'boolean') {
      return { error: 'Requires revision must be a boolean' };
    }
    values.requires_revision = body.requires_revision;
  }

  const integerRules = [
    ['revision_sessions_needed', 'Revision sessions needed', { min: 0 }],
    ['min_session_minutes', 'Minimum session minutes', { min: 15 }],
    ['max_session_minutes', 'Maximum session minutes', { max: 240 }],
    ['ai_estimated_minutes', 'AI estimated minutes', { min: 1, nullable: true }],
  ];

  for (const [field, label, rule] of integerRules) {
    const parsed = parseIntegerField(body[field], label, { nullable: rule.nullable });
    if (parsed.error) return { error: parsed.error };
    if (!parsed.exists) continue;

    if (parsed.value !== null) {
      if (rule.min !== undefined && parsed.value < rule.min) {
        return { error: `${label} must be at least ${rule.min}` };
      }
      if (rule.max !== undefined && parsed.value > rule.max) {
        return { error: `${label} must be no more than ${rule.max}` };
      }
    }

    values[field] = parsed.value;
  }

  const nextMin =
    values.min_session_minutes ??
    existingValues.min_session_minutes ??
    DEFAULT_SCHEDULING_METADATA.min_session_minutes;
  const nextMax =
    values.max_session_minutes ??
    existingValues.max_session_minutes ??
    DEFAULT_SCHEDULING_METADATA.max_session_minutes;

  if (Number(nextMin) > Number(nextMax)) {
    return { error: 'Minimum session minutes must not exceed maximum session minutes' };
  }

  if (body.schedule_notes !== undefined) {
    if (body.schedule_notes !== null && typeof body.schedule_notes !== 'string') {
      return { error: 'Schedule notes must be text' };
    }
    values.schedule_notes = body.schedule_notes?.trim() || null;
  }

  return { values };
};

/* Get all tasks for the current user
 *
 * Query params:
 *  - module_id (optional): filter tasks by module id
 *  - status (optional): filter by task status
 *
 * Return:
 *  - JSON { tasks: [...] } where each task includes joined module fields (module_code, module_name, color)
 */
const getTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { module_id, status } = req.query;

    let query = `
      SELECT
        t.id, t.user_id, t.module_id, t.title, t.description,
        t.deadline, t.estimated_minutes, t.priority, t.status,
        t.preferred_start_time, t.preferred_end_time, t.task_type,
        t.difficulty, t.requires_revision, t.revision_sessions_needed,
        t.min_session_minutes, t.max_session_minutes, t.ai_estimated_minutes,
        t.schedule_notes, t.created_at, t.updated_at,
        m.module_code, m.module_name, m.color
      FROM tasks t
      LEFT JOIN modules m ON t.module_id = m.id
      WHERE t.user_id = $1
    `;
    const params = [userId];
    let paramCount = 2;

    if (module_id) {
      query += ` AND t.module_id = $${paramCount++}`;
      params.push(module_id);
    }

    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      params.push(status);
    }

    query += ` ORDER BY t.deadline ASC, t.priority DESC`;

    const result = await pool.query(query, params);

    res.json({
      tasks: result.rows,
    });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
};

// Create a new task
const createTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      description,
      module_id,
      deadline,
      estimated_minutes,
      priority,
      preferred_start_time,
      preferred_end_time,
      task_type,
      difficulty,
      requires_revision,
      revision_sessions_needed,
      min_session_minutes,
      max_session_minutes,
      ai_estimated_minutes,
      schedule_notes
    } = req.body;

    // Validate required inputs
    if (!title || !module_id) {
      return res.status(400).json({ error: 'Title and module_id are required' });
    }

    if (title.length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }

    if (description && description.length > 1000) {
      return res.status(400).json({ error: 'Description must be 1000 characters or less' });
    }

    
    if (
      estimated_minutes !== undefined &&
      estimated_minutes !== null &&
      estimated_minutes !== ''
    ) {
      const estimated = Number(estimated_minutes);

      if (!Number.isFinite(estimated) || estimated <= 0) {
        return res.status(400).json({ error: 'Estimated minutes must be a positive number' });
      }
    }


    if (priority !== undefined) {
      if (typeof priority !== 'number' || priority < 1 || priority > 5) {
        return res.status(400).json({ error: 'Priority must be between 1 and 5' });
      }
    }

   //self-explanatory: check if module exists and belongs to user
    const moduleCheck = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND user_id = $2',
      [module_id, userId]
    );

    if (moduleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Sanitising time inputs into preferred format (HH:MM or HH:MM:SS)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (preferred_start_time && !timeRegex.test(preferred_start_time)) {
      return res.status(400).json({ error: 'Preferred start time must be in HH:MM or HH:MM:SS format' });
    }
    if (preferred_end_time && !timeRegex.test(preferred_end_time)) {
      return res.status(400).json({ error: 'Preferred end time must be in HH:MM or HH:MM:SS format' });
    }

    const metadataValidation = validateTaskSchedulingMetadata({
      task_type,
      difficulty,
      requires_revision,
      revision_sessions_needed,
      min_session_minutes,
      max_session_minutes,
      ai_estimated_minutes,
      schedule_notes,
    });

    if (metadataValidation.error) {
      return res.status(400).json({ error: metadataValidation.error });
    }

    const schedulingMetadata = {
      ...DEFAULT_SCHEDULING_METADATA,
      ai_estimated_minutes: null,
      schedule_notes: null,
      ...metadataValidation.values,
    };

    // Prepare estimated value for insertion (null when empty)
    const estimatedValue =
      estimated_minutes === '' || estimated_minutes === null || estimated_minutes === undefined
        ? null
        : Number(estimated_minutes);

    
    const result = await pool.query(
      `INSERT INTO tasks
        (
          user_id, module_id, title, description, deadline, estimated_minutes,
          priority, preferred_start_time, preferred_end_time, task_type,
          difficulty, requires_revision, revision_sessions_needed,
          min_session_minutes, max_session_minutes, ai_estimated_minutes,
          schedule_notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING ${TASK_RETURN_FIELDS}`,
      [
        userId,
        module_id,
        title,
        description || null,
        deadline || null,
        estimatedValue,
        priority || 1,
        preferred_start_time || null,
        preferred_end_time || null,
        schedulingMetadata.task_type,
        schedulingMetadata.difficulty,
        schedulingMetadata.requires_revision,
        schedulingMetadata.revision_sessions_needed,
        schedulingMetadata.min_session_minutes,
        schedulingMetadata.max_session_minutes,
        schedulingMetadata.ai_estimated_minutes,
        schedulingMetadata.schedule_notes,
      ]
    );

    const newTask = result.rows[0];

    res.status(201).json({
      message: 'Task created successfully',
      task: newTask,
    });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

/* Updating tasks
 *
 * Path param:
 *  -  update by id
 *
 * Request body may include any updatable fields (same validation as create).
 *
 * Important behavior:
 *  - Ensure task belongs to the user.
 *  - Affects a DB  to update the task and record point events.
 *  - If status transitions from non-completed -> completed: call awardTaskCompletion
 *  - If status transitions from completed -> non-completed: call reverseTaskCompletion
 *
 * Returns:
 *  - JSON { message, task, productivity: { awarded, reversed } }
 */
const updateTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const {
      title,
      description,
      deadline,
      estimated_minutes,
      priority,
      status,
      preferred_start_time,
      preferred_end_time,
    } = req.body;

    // Verify task belongs to user
    const taskExists = await pool.query(
      'SELECT id, status, min_session_minutes, max_session_minutes FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId]
    );

    if (taskExists.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const previousTask = taskExists.rows[0];

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title !== undefined) {
      if (title.length > 255) {
        return res.status(400).json({ error: 'Title must be 255 characters or less' });
      }
      updates.push(`title = $${paramCount++}`);
      params.push(title);
    }

    if (description !== undefined) {
      if (description.length > 1000) {
        return res.status(400).json({ error: 'Description must be 1000 characters or less' });
      }
      updates.push(`description = $${paramCount++}`);
      params.push(description || null);
    }

    if (deadline !== undefined) {
      updates.push(`deadline = $${paramCount++}`);
      params.push(deadline || null);
    }

    if (estimated_minutes !== undefined) {
      if (estimated_minutes !== null && estimated_minutes !== '') {
        const estimated = Number(estimated_minutes);
        if (!Number.isFinite(estimated) || estimated <= 0) {
          return res.status(400).json({ error: 'Estimated minutes must be a positive number' });
        }
      }
      updates.push(`estimated_minutes = $${paramCount++}`);
      params.push(estimated_minutes === '' || estimated_minutes === null ? null : Number(estimated_minutes));
    }

    if (priority !== undefined) {
      if (typeof priority !== 'number' || priority < 1 || priority > 5) {
        return res.status(400).json({ error: 'Priority must be between 1 and 5' });
      }
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }

    if (status !== undefined) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status must be one of: pending, in_progress, completed, cancelled' });
      }
      updates.push(`status = $${paramCount++}`);
      params.push(status);
    }

    if (preferred_start_time !== undefined) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
      if (preferred_start_time && !timeRegex.test(preferred_start_time)) {
        return res.status(400).json({ error: 'Preferred start time must be in HH:MM or HH:MM:SS format' });
      }
      updates.push(`preferred_start_time = $${paramCount++}`);
      params.push(preferred_start_time || null);
    }

    if (preferred_end_time !== undefined) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
      if (preferred_end_time && !timeRegex.test(preferred_end_time)) {
        return res.status(400).json({ error: 'Preferred end time must be in HH:MM or HH:MM:SS format' });
      }
      updates.push(`preferred_end_time = $${paramCount++}`);
      params.push(preferred_end_time || null);
    }

    const metadataValidation = validateTaskSchedulingMetadata(req.body, previousTask);
    if (metadataValidation.error) {
      return res.status(400).json({ error: metadataValidation.error });
    }

    Object.entries(metadataValidation.values).forEach(([field, value]) => {
      updates.push(`${field} = $${paramCount++}`);
      params.push(value);
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(taskId);
    const taskIdParam = paramCount++;

    params.push(userId);
    const userIdParam = paramCount++;

    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${taskIdParam} AND user_id = $${userIdParam}
      RETURNING ${TASK_RETURN_FIELDS}
    `;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(query, params);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Task not found' });
      }

      const updatedTask = result.rows[0];
      let awardedPoints = null;
      let reversedPoints = [];

      if (previousTask.status !== 'completed' && updatedTask.status === 'completed') {
        awardedPoints = await awardTaskCompletion(client, userId, updatedTask);
      }

      if (previousTask.status === 'completed' && updatedTask.status !== 'completed') {
        reversedPoints = await reverseTaskCompletion(
          client,
          userId,
          taskId,
          'Task moved out of completed'
        );
      }

      await client.query('COMMIT');

      res.json({
        message: 'Task updated successfully',
        task: updatedTask,
        productivity: {
          awarded: awardedPoints,
          reversed: reversedPoints,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

/* Deleting tasks
 *
 * Path param:
 *  - delete by id
 *
 * Behavior:
 *  - check if task belongs to user
 *  - edge case: reverse point rewards (if any) and deletes the task.
 *  - Return summary of reversed productivity events.
 */
const deleteTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;

    // Verify task belongs to user
    const taskExists = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId]
    );

    if (taskExists.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const reversedPoints = await reverseTaskCompletion(
        client,
        userId,
        taskId,
        'Task deleted after completion'
      );

      await client.query(
        'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Task deleted successfully',
        productivity: {
          reversed: reversedPoints,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};

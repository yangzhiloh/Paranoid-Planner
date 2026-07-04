-- Add structured metadata for future AI-assisted task scheduling.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type VARCHAR(50) DEFAULT 'assignment',
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS requires_revision BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_sessions_needed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_session_minutes INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS max_session_minutes INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS ai_estimated_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS schedule_notes TEXT;

UPDATE tasks
SET
  task_type = COALESCE(task_type, 'assignment'),
  difficulty = COALESCE(difficulty, 'medium'),
  requires_revision = COALESCE(requires_revision, false),
  revision_sessions_needed = COALESCE(revision_sessions_needed, 0),
  min_session_minutes = COALESCE(min_session_minutes, 30),
  max_session_minutes = COALESCE(max_session_minutes, 120);

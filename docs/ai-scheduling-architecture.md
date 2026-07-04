# AI Scheduling Architecture and Constraints

## Purpose

ParanoidPlanner currently uses a deterministic scheduler in `backend/services/schedulerService.js`. That scheduler is reliable for straightforward study blocks, but academic work often needs more flexible planning:

- Revision may need multiple spaced sessions instead of one large block.
- Assignments may need different work windows, such as planning, drafting, editing, and final review.
- Tasks can have different urgency, difficulty, and expected effort patterns.
- A fully deterministic scheduler for every possible study pattern would become difficult to maintain.

AI-assisted scheduling is intended to help recommend a study strategy for each task. It is not intended to directly write final calendar events.

## Core Architecture Rule

**AI recommends the scheduling strategy; deterministic code validates and places the final sessions.**

The backend remains responsible for final scheduling safety. AI output is advisory input only. The final sessions inserted into `study_sessions` must be produced by deterministic backend logic after validation.

## Current Scheduling Flow

Today, `POST /api/schedule/generate` calls the rule-based scheduler through:

- `backend/routes/scheduleRoutes.js`
- `backend/controllers/scheduleController.js`
- `backend/services/schedulerService.js`

The frontend schedule page at `frontend/src/pages/Schedule.jsx` requests schedule generation and displays generated sessions and fixed lesson blocks.

The AI-assisted version should extend this flow without removing the deterministic scheduler fallback.

## AI Responsibilities

AI may recommend scheduling strategy for tasks, including:

- Total time needed per task.
- Number of sessions.
- Suggested session duration.
- Whether a task should be split.
- Whether revision should be spaced out across multiple days.
- Whether assignments need planning, drafting, editing, and review windows.
- A short scheduling reason for each task.

AI should return structured recommendations only. AI must not insert sessions into the database and must not decide final calendar placement without deterministic validation.

## Deterministic Scheduler Responsibilities

The backend scheduler must still enforce all hard constraints before sessions are created:

- No overlap with fixed lessons.
- No overlap with existing generated sessions.
- No scheduling after task deadline unless unavoidable.
- User study preferences from Settings.
- Maximum session length.
- Break duration between sessions.
- Avoid weekends preference.
- Deadline buffer days.
- Valid database task IDs only.
- Safe fallback if AI fails, is disabled, times out, or returns invalid data.

The deterministic scheduler should treat AI recommendations as proposed planning hints. It must reject or adjust recommendations that violate hard constraints.

## Data Sent to AI

Only scheduling-relevant data should be sent to an AI provider:

- Task ID.
- Task title.
- Task type.
- Deadline.
- Priority.
- Estimated duration.
- Difficulty, if available.
- Fixed lesson blocks.
- User study preferences.
- Existing generated sessions, if needed to avoid poor recommendations.

Do not send:

- Passwords.
- JWT tokens.
- Database credentials.
- Raw connection strings.
- Unnecessary personal information.
- Any secret environment variables.

## Expected AI Output Shape

AI responses should be JSON only. The backend should parse and validate the response before using it.

Example response:

```json
{
  "task_plans": [
    {
      "task_id": 12,
      "recommended_total_minutes": 240,
      "recommended_session_count": 3,
      "recommended_session_minutes": 80,
      "recommended_strategy": "split across multiple days before deadline",
      "reason": "High priority assignment due soon"
    }
  ]
}
```

Suggested validation rules:

- `task_plans` must be an array.
- `task_id` must match a task owned by the authenticated user.
- Recommended minutes and session counts must be positive integers.
- Recommended session minutes must not exceed the user's maximum session length.
- Unknown task IDs must be ignored.
- Extra fields should not be trusted for scheduling decisions.

## Fallback Strategy

AI-assisted scheduling must be optional. If AI scheduling is disabled, not configured, fails, times out, returns invalid JSON, or returns recommendations that cannot be validated, the existing rule-based scheduler should still run.

Fallback behavior should be safe and user-visible where appropriate:

- Do not fail schedule generation only because AI is unavailable.
- Use deterministic scheduling as the source of truth.
- Log enough server-side detail for debugging without logging secrets or full AI prompts containing user data.
- Return the generated schedule from the deterministic scheduler as usual.

## Implementation Boundary for Future Work

Future implementation should introduce AI in stages:

1. Gather scheduling-relevant task, lesson, settings, and existing session data.
2. If AI is enabled and configured, ask for JSON scheduling recommendations.
3. Validate the AI response against schema and user-owned task IDs.
4. Pass validated recommendations into deterministic placement logic.
5. Enforce all hard constraints before inserting final sessions.
6. Fall back to the current rule-based scheduler whenever AI cannot be used safely.

This issue defines the architecture only. It does not implement AI provider calls, API keys, package installs, or scheduler logic changes.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell, FaBookOpen, FaSignOutAlt, FaUserCog } from 'react-icons/fa';
import { settingsAPI } from '../api/api';
import PrimaryButton from '../components/PrimaryButton';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const EMPTY_STUDY_FORM = {
  preferred_study_start_time: '09:00',
  preferred_study_end_time: '22:00',
  max_session_minutes: '120',
  break_minutes: '15',
  avoid_weekends: false,
  deadline_buffer_days: '1',
};

const EMPTY_REMINDER_FORM = {
  enable_overdue_reminders: true,
  enable_due_soon_reminders: true,
  enable_study_session_reminders: true,
  reminder_lead_hours: '24',
};

const inputClass =
  'mt-2.5 min-h-[44px] w-full appearance-none rounded-xl border border-[#fff0e0]/[0.10] bg-[#100905]/90 px-4 py-2.5 text-sm text-[#fff7ed] shadow-[inset_0_1px_rgba(255,247,237,0.03)] outline-none transition placeholder:text-[#9b897b] focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/20 disabled:cursor-not-allowed disabled:opacity-70';

const formatTimeForInput = (value, fallback) => {
  if (!value) return fallback;
  return String(value).slice(0, 5);
};

const formatBooleanForInput = (value, fallback) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

const buildStudyForm = (settings = {}) => ({
  preferred_study_start_time: formatTimeForInput(
    settings.preferred_study_start_time,
    EMPTY_STUDY_FORM.preferred_study_start_time
  ),
  preferred_study_end_time: formatTimeForInput(
    settings.preferred_study_end_time,
    EMPTY_STUDY_FORM.preferred_study_end_time
  ),
  max_session_minutes: String(
    settings.max_session_minutes ?? EMPTY_STUDY_FORM.max_session_minutes
  ),
  break_minutes: String(settings.break_minutes ?? EMPTY_STUDY_FORM.break_minutes),
  avoid_weekends: formatBooleanForInput(
    settings.avoid_weekends,
    EMPTY_STUDY_FORM.avoid_weekends
  ),
  deadline_buffer_days: String(
    settings.deadline_buffer_days ?? EMPTY_STUDY_FORM.deadline_buffer_days
  ),
});

const buildReminderForm = (settings = {}) => ({
  enable_overdue_reminders: formatBooleanForInput(
    settings.enable_overdue_reminders,
    EMPTY_REMINDER_FORM.enable_overdue_reminders
  ),
  enable_due_soon_reminders: formatBooleanForInput(
    settings.enable_due_soon_reminders,
    EMPTY_REMINDER_FORM.enable_due_soon_reminders
  ),
  enable_study_session_reminders: formatBooleanForInput(
    settings.enable_study_session_reminders,
    EMPTY_REMINDER_FORM.enable_study_session_reminders
  ),
  reminder_lead_hours: String(
    settings.reminder_lead_hours ?? EMPTY_REMINDER_FORM.reminder_lead_hours
  ),
});

const timeToMinutes = (value) => {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
};

const validateStudyForm = (form) => {
  if (!form.preferred_study_start_time || !form.preferred_study_end_time) {
    return 'Preferred study start and end times are required.';
  }

  if (
    timeToMinutes(form.preferred_study_end_time) <=
    timeToMinutes(form.preferred_study_start_time)
  ) {
    return 'Preferred study end time should be after the start time.';
  }

  if (form.max_session_minutes === '') {
    return 'Maximum study session length is required.';
  }

  if (Number(form.break_minutes) < 0) {
    return 'Break duration cannot be negative.';
  }

  if (Number(form.deadline_buffer_days) < 0) {
    return 'Deadline buffer days cannot be negative.';
  }

  return '';
};

const validateReminderForm = (form) => {
  if (form.reminder_lead_hours === '') {
    return 'Reminder lead time is required.';
  }

  const leadHours = Number(form.reminder_lead_hours);
  if (!Number.isInteger(leadHours) || leadHours < 1 || leadHours > 168) {
    return 'Reminder lead time must be between 1 and 168 hours.';
  }

  return '';
};

const SettingsField = ({ id, label, ...props }) => (
  <label htmlFor={id} className="block w-full max-w-[360px] text-sm font-semibold text-[#d9c8ba]">
    {label}
    <input id={id} className={inputClass} {...props} />
  </label>
);

const SettingsToggle = ({ label, checked, disabled, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onToggle}
    className={`flex min-h-[70px] w-full max-w-[360px] items-center justify-between gap-5 rounded-xl border border-[#fff0e0]/[0.10] bg-[#100905]/90 px-5 py-4 text-left shadow-[inset_0_1px_rgba(255,247,237,0.03)] outline-none transition hover:border-amber-200/25 focus-visible:ring-2 focus-visible:ring-[#f59e0b]/40 ${
      disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
    }`}
  >
    <span className="text-sm font-semibold leading-5 text-[#d9c8ba]">
      {label}
    </span>
    <span className="flex shrink-0 items-center gap-3" aria-hidden="true">
      <span
        className={`text-xs font-bold uppercase tracking-[0.08em] transition ${
          checked ? 'text-[#fbbf24]' : 'text-[#9f8e80]'
        }`}
      >
        {checked ? 'On' : 'Off'}
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          checked
            ? 'border-amber-300/50 bg-[#f59e0b]'
            : 'border-[#fff0e0]/15 bg-[#211511]'
        }`}
      >
        <span
          className={`absolute top-[3px] block h-4 w-4 rounded-full bg-[#fff7ed] shadow transition ${
            checked ? 'left-[22px]' : 'left-[4px]'
          }`}
        />
      </span>
    </span>
  </button>
);

const AccountRow = ({ label, value }) => (
  <div className="flex min-h-[64px] flex-col justify-center rounded-xl border border-[#fff0e0]/[0.10] bg-[#100905]/90 px-5 py-4 shadow-[inset_0_1px_rgba(255,247,237,0.03)]">
    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#9f8e80]">
      {label}
    </span>
    <span className="mt-1 break-words text-sm font-semibold text-[#fff7ed]">
      {value || 'Not available'}
    </span>
  </div>
);

export const Settings = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [studyForm, setStudyForm] = useState(EMPTY_STUDY_FORM);
  const [reminderForm, setReminderForm] = useState(EMPTY_REMINDER_FORM);
  const [loading, setLoading] = useState(true);
  const [studySaving, setStudySaving] = useState(false);
  const [studyError, setStudyError] = useState('');
  const [studySuccess, setStudySuccess] = useState('');
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState('');
  const [reminderSuccess, setReminderSuccess] = useState('');

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        setLoading(true);
        setStudyError('');
        setReminderError('');
        const response = await settingsAPI.getSettings();

        if (active) {
          setStudyForm(buildStudyForm(response.data?.settings));
          setReminderForm(buildReminderForm(response.data?.settings));
        }
      } catch (err) {
        if (active) {
          setStudyError(
            err.response?.data?.error ||
              'Settings could not be loaded. Please try again.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (field) => (event) => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;

    setStudySuccess('');
    setStudyError('');
    setStudyForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleReminderChange = (field) => (event) => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;

    setReminderSuccess('');
    setReminderError('');
    setReminderForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleStudyToggle = (field) => () => {
    setStudySuccess('');
    setStudyError('');
    setStudyForm((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleReminderToggle = (field) => () => {
    setReminderSuccess('');
    setReminderError('');
    setReminderForm((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateStudyForm(studyForm);

    if (validationError) {
      setStudySuccess('');
      setStudyError(validationError);
      return;
    }

    try {
      setStudySaving(true);
      setStudyError('');
      setStudySuccess('');

      const response = await settingsAPI.updateSettings({
        preferred_study_start_time: studyForm.preferred_study_start_time,
        preferred_study_end_time: studyForm.preferred_study_end_time,
        max_session_minutes: Number(studyForm.max_session_minutes),
        break_minutes: Number(studyForm.break_minutes || 0),
        avoid_weekends: studyForm.avoid_weekends,
        deadline_buffer_days: Number(studyForm.deadline_buffer_days || 0),
      });

      setStudyForm(buildStudyForm(response.data?.settings));
      setStudySuccess('Study preferences saved.');
    } catch (err) {
      setStudyError(
        err.response?.data?.error ||
          'Study preferences could not be saved. Please try again.'
      );
    } finally {
      setStudySaving(false);
    }
  };

  const handleReminderSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateReminderForm(reminderForm);

    if (validationError) {
      setReminderSuccess('');
      setReminderError(validationError);
      return;
    }

    try {
      setReminderSaving(true);
      setReminderError('');
      setReminderSuccess('');

      const response = await settingsAPI.updateSettings({
        enable_overdue_reminders: reminderForm.enable_overdue_reminders,
        enable_due_soon_reminders: reminderForm.enable_due_soon_reminders,
        enable_study_session_reminders:
          reminderForm.enable_study_session_reminders,
        reminder_lead_hours: Number(reminderForm.reminder_lead_hours),
      });

      setReminderForm(buildReminderForm(response.data?.settings));
      setReminderSuccess('Reminder preferences saved.');
    } catch (err) {
      setReminderError(
        err.response?.data?.error ||
          'Reminder preferences could not be saved. Please try again.'
      );
    } finally {
      setReminderSaving(false);
    }
  };

  const accountName = user?.name || user?.displayName || user?.username;
  const accountEmail = user?.email;
  const accountStatus = isAuthenticated ? 'Signed in' : 'Signed out';

  return (
    <div className="replica-stage">
      <div className="replica-shell">
        <DashboardSidebar />

        <main className="replica-main">
          <header className="replica-card mb-3 p-6 sm:p-8">
            <div>
              <span className="card-kicker">Preferences</span>
              <h1 className="mb-0 mt-1 text-3xl font-bold tracking-tight text-[#fff7ed] sm:text-4xl">
                Settings
              </h1>
              <p className="mb-0 mt-2 max-w-2xl text-sm text-[#b9a99d]">
                Manage your study preferences, reminders, and account options.
              </p>
            </div>
          </header>

          {loading ? (
            <section className="replica-card grid min-h-[360px] place-items-center p-8 text-center">
              <div aria-live="polite">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-300/20 border-t-amber-300" />
                <p className="mb-0 mt-4 font-medium text-[#b9a99d]">
                  Loading settings...
                </p>
              </div>
            </section>
          ) : (
            <div className="grid gap-3">
              <form
                onSubmit={handleSubmit}
                className="replica-card p-6 sm:p-8"
                aria-label="Study preferences"
                noValidate
              >
                <div className="flex flex-col gap-5 border-b border-[#fff0e0]/[0.10] pb-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className="card-kicker">Planning</span>
                    <h2 className="mb-0 mt-2 text-2xl font-bold tracking-tight text-[#fff7ed]">
                      Study Preferences
                    </h2>
                    <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-[#b9a99d]">
                      Control when and how ParanoidPlanner creates study sessions.
                    </p>
                  </div>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-200">
                    <FaBookOpen aria-hidden="true" />
                  </div>
                </div>

                {studyError && (
                  <div
                    className="mt-5 rounded-lg border border-[#ff744c]/35 bg-[#701f10]/25 px-4 py-3 text-sm font-medium text-[#ffc1ae]"
                    role="alert"
                  >
                    {studyError}
                  </div>
                )}

                {studySuccess && !studyError && (
                  <div
                    className="mt-5 rounded-lg border border-emerald-300/25 bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-100"
                    role="status"
                  >
                    {studySuccess}
                  </div>
                )}

                <div className="mt-7 grid max-w-[780px] gap-x-8 gap-y-6 md:grid-cols-2">
                  <SettingsField
                    id="preferred-study-start-time"
                    label="Preferred study start time"
                    type="time"
                    value={studyForm.preferred_study_start_time}
                    onChange={handleChange('preferred_study_start_time')}
                    disabled={studySaving}
                  />
                  <SettingsField
                    id="preferred-study-end-time"
                    label="Preferred study end time"
                    type="time"
                    value={studyForm.preferred_study_end_time}
                    onChange={handleChange('preferred_study_end_time')}
                    disabled={studySaving}
                  />
                  <SettingsField
                    id="max-session-minutes"
                    label="Maximum study session length"
                    type="number"
                    min="30"
                    max="240"
                    step="1"
                    value={studyForm.max_session_minutes}
                    onChange={handleChange('max_session_minutes')}
                    disabled={studySaving}
                  />
                  <SettingsField
                    id="break-minutes"
                    label="Break duration"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={studyForm.break_minutes}
                    onChange={handleChange('break_minutes')}
                    disabled={studySaving}
                  />
                  <SettingsField
                    id="deadline-buffer-days"
                    label="Deadline buffer days"
                    type="number"
                    min="0"
                    max="14"
                    step="1"
                    value={studyForm.deadline_buffer_days}
                    onChange={handleChange('deadline_buffer_days')}
                    disabled={studySaving}
                  />

                  <SettingsToggle
                    label="Avoid weekends"
                    checked={studyForm.avoid_weekends}
                    onToggle={handleStudyToggle('avoid_weekends')}
                    disabled={studySaving}
                  />
                </div>

                <div className="mt-8 flex max-w-[780px] justify-end border-t border-[#fff0e0]/[0.08] pt-5">
                  <PrimaryButton
                    type="submit"
                    loading={studySaving}
                    disabled={studySaving}
                    className="w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
                  >
                    {studySaving ? 'Saving...' : 'Save Study Preferences'}
                  </PrimaryButton>
                </div>
              </form>

              <section className="grid gap-3" aria-label="More settings categories">
                <form
                  onSubmit={handleReminderSubmit}
                  className="replica-card p-6 sm:p-8"
                  aria-label="Reminder preferences"
                  noValidate
                >
                  <div className="flex flex-col gap-5 border-b border-[#fff0e0]/[0.10] pb-6 md:flex-row md:items-start md:justify-between">
                    <div>
                      <span className="card-kicker">Reminders</span>
                      <h2 className="mb-0 mt-2 text-2xl font-bold tracking-tight text-[#fff7ed]">
                        Reminder Preferences
                      </h2>
                      <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-[#b9a99d]">
                        Choose which in-app reminders should appear across Dashboard, Tasks, and Schedule.
                      </p>
                    </div>
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-200">
                      <FaBell aria-hidden="true" />
                    </div>
                  </div>

                  {reminderError && (
                    <div
                      className="mt-5 rounded-lg border border-[#ff744c]/35 bg-[#701f10]/25 px-4 py-3 text-sm font-medium text-[#ffc1ae]"
                      role="alert"
                    >
                      {reminderError}
                    </div>
                  )}

                  {reminderSuccess && !reminderError && (
                    <div
                      className="mt-5 rounded-lg border border-emerald-300/25 bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-100"
                      role="status"
                    >
                      {reminderSuccess}
                    </div>
                  )}

                  <div className="mt-7 grid max-w-[780px] gap-x-8 gap-y-6 md:grid-cols-2">
                    <SettingsToggle
                      label="Enable overdue reminders"
                      checked={reminderForm.enable_overdue_reminders}
                      onToggle={handleReminderToggle('enable_overdue_reminders')}
                      disabled={reminderSaving}
                    />
                    <SettingsToggle
                      label="Enable due-soon reminders"
                      checked={reminderForm.enable_due_soon_reminders}
                      onToggle={handleReminderToggle('enable_due_soon_reminders')}
                      disabled={reminderSaving}
                    />
                    <SettingsToggle
                      label="Enable study-session reminders"
                      checked={reminderForm.enable_study_session_reminders}
                      onToggle={handleReminderToggle(
                        'enable_study_session_reminders'
                      )}
                      disabled={reminderSaving}
                    />
                    <SettingsField
                      id="reminder-lead-hours"
                      label="Reminder lead time in hours"
                      type="number"
                      min="1"
                      max="168"
                      step="1"
                      value={reminderForm.reminder_lead_hours}
                      onChange={handleReminderChange('reminder_lead_hours')}
                      disabled={reminderSaving}
                    />
                  </div>

                  <div className="mt-8 flex max-w-[780px] justify-end border-t border-[#fff0e0]/[0.08] pt-5">
                    <PrimaryButton
                      type="submit"
                      loading={reminderSaving}
                      disabled={reminderSaving}
                      className="w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
                    >
                      {reminderSaving ? 'Saving...' : 'Save Reminder Preferences'}
                    </PrimaryButton>
                  </div>
                </form>
                <section
                  className="replica-card p-6 sm:p-8"
                  aria-label="Account settings"
                >
                  <div className="flex flex-col gap-5 border-b border-[#fff0e0]/[0.10] pb-6 md:flex-row md:items-start md:justify-between">
                    <div>
                      <span className="card-kicker">Account</span>
                      <h2 className="mb-0 mt-2 text-2xl font-bold tracking-tight text-[#fff7ed]">
                        Account Settings
                      </h2>
                      <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-[#b9a99d]">
                        View your account details and manage your session.
                      </p>
                    </div>
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-200">
                      <FaUserCog aria-hidden="true" />
                    </div>
                  </div>

                  <div className="mt-7 grid max-w-[780px] gap-x-8 gap-y-5 md:grid-cols-2">
                    <AccountRow label="Name" value={accountName} />
                    <AccountRow label="Email" value={accountEmail} />
                    <AccountRow label="Session" value={accountStatus} />
                  </div>

                  <div className="mt-8 flex max-w-[780px] justify-end border-t border-[#fff0e0]/[0.08] pt-5">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[#ff744c]/35 bg-[#701f10]/20 px-5 py-2.5 text-sm font-semibold text-[#ffc1ae] transition hover:border-[#ff9d4d]/50 hover:bg-[#701f10]/32 focus:outline-none focus:ring-2 focus:ring-[#ff9d4d]/30 sm:w-auto"
                    >
                      <FaSignOutAlt aria-hidden="true" />
                      Log out
                    </button>
                  </div>
                </section>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Settings;

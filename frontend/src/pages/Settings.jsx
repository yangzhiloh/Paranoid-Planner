import { useEffect, useState } from 'react';
import { FaBell, FaBookOpen, FaUserCog } from 'react-icons/fa';
import { settingsAPI } from '../api/api';
import PrimaryButton from '../components/PrimaryButton';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import './Dashboard.css';

const EMPTY_STUDY_FORM = {
  preferred_study_start_time: '09:00',
  preferred_study_end_time: '22:00',
  max_session_minutes: '120',
  break_minutes: '15',
  avoid_weekends: false,
  deadline_buffer_days: '1',
};

const inputClass =
  'mt-2.5 min-h-[44px] w-full rounded-xl border border-[#fff0e0]/[0.10] bg-[#100905]/75 px-4 py-2.5 text-sm text-[#fff7ed] shadow-[inset_0_1px_rgba(255,247,237,0.03)] outline-none transition placeholder:text-[#9b897b] focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/20 disabled:cursor-not-allowed disabled:opacity-70';

const formatTimeForInput = (value, fallback) => {
  if (!value) return fallback;
  return String(value).slice(0, 5);
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
  avoid_weekends: Boolean(settings.avoid_weekends),
  deadline_buffer_days: String(
    settings.deadline_buffer_days ?? EMPTY_STUDY_FORM.deadline_buffer_days
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

const StudyField = ({ id, label, helper, ...props }) => (
  <label htmlFor={id} className="block w-full max-w-[360px] text-sm font-semibold text-[#d9c8ba]">
    {label}
    <input id={id} className={inputClass} {...props} />
    {helper && (
      <span className="mt-2 block text-xs font-normal leading-5 text-[#9f8e80]">
        {helper}
      </span>
    )}
  </label>
);

const PlaceholderCard = ({ title, label, description, icon: Icon }) => (
  <article className="replica-card p-6 sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <div>
        <span className="card-kicker">{label}</span>
        <h2 className="mb-0 mt-2 text-xl font-bold tracking-tight text-[#fff7ed]">
          {title}
        </h2>
      </div>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-200">
        <Icon aria-hidden="true" />
      </div>
    </div>
    <p className="mb-0 mt-4 text-sm leading-6 text-[#b9a99d]">
      {description}
    </p>
    <div className="mt-6 rounded-lg border border-dashed border-amber-200/15 bg-[#fff7ed]/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#ffb074]">
      Coming soon
    </div>
  </article>
);

export const Settings = () => {
  const [studyForm, setStudyForm] = useState(EMPTY_STUDY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await settingsAPI.getSettings();

        if (active) {
          setStudyForm(buildStudyForm(response.data?.settings));
        }
      } catch (err) {
        if (active) {
          setError(
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

    setSuccess('');
    setError('');
    setStudyForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateStudyForm(studyForm);

    if (validationError) {
      setSuccess('');
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await settingsAPI.updateSettings({
        preferred_study_start_time: studyForm.preferred_study_start_time,
        preferred_study_end_time: studyForm.preferred_study_end_time,
        max_session_minutes: Number(studyForm.max_session_minutes),
        break_minutes: Number(studyForm.break_minutes || 0),
        avoid_weekends: studyForm.avoid_weekends,
        deadline_buffer_days: Number(studyForm.deadline_buffer_days || 0),
      });

      setStudyForm(buildStudyForm(response.data?.settings));
      setSuccess('Study preferences saved.');
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Study preferences could not be saved. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

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
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
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

                {error && (
                  <div
                    className="mt-5 rounded-lg border border-[#ff744c]/35 bg-[#701f10]/25 px-4 py-3 text-sm font-medium text-[#ffc1ae]"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                {success && !error && (
                  <div
                    className="mt-5 rounded-lg border border-emerald-300/25 bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-100"
                    role="status"
                  >
                    {success}
                  </div>
                )}

                <div className="mt-7 grid max-w-[780px] gap-x-8 gap-y-6 md:grid-cols-2">
                  <StudyField
                    id="preferred-study-start-time"
                    label="Preferred study start time"
                    type="time"
                    value={studyForm.preferred_study_start_time}
                    onChange={handleChange('preferred_study_start_time')}
                    disabled={saving}
                  />
                  <StudyField
                    id="preferred-study-end-time"
                    label="Preferred study end time"
                    type="time"
                    value={studyForm.preferred_study_end_time}
                    onChange={handleChange('preferred_study_end_time')}
                    disabled={saving}
                  />
                  <StudyField
                    id="max-session-minutes"
                    label="Maximum study session length"
                    type="number"
                    min="30"
                    max="240"
                    step="1"
                    value={studyForm.max_session_minutes}
                    onChange={handleChange('max_session_minutes')}
                    disabled={saving}
                  />
                  <StudyField
                    id="break-minutes"
                    label="Break duration"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={studyForm.break_minutes}
                    onChange={handleChange('break_minutes')}
                    disabled={saving}
                  />
                  <StudyField
                    id="deadline-buffer-days"
                    label="Deadline buffer days"
                    type="number"
                    min="0"
                    max="14"
                    step="1"
                    value={studyForm.deadline_buffer_days}
                    onChange={handleChange('deadline_buffer_days')}
                    disabled={saving}
                  />

                  <label
                    htmlFor="avoid-weekends"
                    className="flex min-h-[70px] w-full max-w-[360px] items-center justify-between gap-5 rounded-xl border border-[#fff0e0]/[0.10] bg-[#100905]/75 px-5 py-4 shadow-[inset_0_1px_rgba(255,247,237,0.03)]"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[#d9c8ba]">
                        Avoid weekends
                      </span>
                    </span>
                    <input
                      id="avoid-weekends"
                      type="checkbox"
                      checked={studyForm.avoid_weekends}
                      onChange={handleChange('avoid_weekends')}
                      disabled={saving}
                      className="h-5 w-5 rounded border-[#fff0e0]/20 bg-[#211511] text-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>
                </div>

                <div className="mt-8 flex max-w-[780px] flex-col gap-4 border-t border-[#fff0e0]/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="mb-0 max-w-md text-xs leading-5 text-[#9f8e80]">
                    These preferences affect future planner behavior once scheduling uses them.
                  </p>
                  <PrimaryButton
                    type="submit"
                    loading={saving}
                    disabled={saving}
                    className="w-full px-5 py-2.5 text-sm font-semibold sm:w-auto"
                  >
                    {saving ? 'Saving...' : 'Save Study Preferences'}
                  </PrimaryButton>
                </div>
              </form>

              <section className="grid gap-3" aria-label="More settings categories">
                <PlaceholderCard
                  title="Reminder Preferences"
                  label="Reminders"
                  description="Notification timing, nudges, and schedule reminder options."
                  icon={FaBell}
                />
                <PlaceholderCard
                  title="Account Settings"
                  label="Account"
                  description="Profile, sign-in, and account management options."
                  icon={FaUserCog}
                />
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Settings;

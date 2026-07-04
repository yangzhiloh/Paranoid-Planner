import { FaBell, FaBookOpen, FaUserCog } from 'react-icons/fa';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import './Dashboard.css';

const settingsCards = [
  {
    title: 'Study Preferences',
    label: 'Planning',
    description: 'Default planning rhythm, study focus, and workload preferences.',
    icon: FaBookOpen,
  },
  {
    title: 'Reminder Preferences',
    label: 'Reminders',
    description: 'Notification timing, nudges, and schedule reminder options.',
    icon: FaBell,
  },
  {
    title: 'Account Settings',
    label: 'Account',
    description: 'Profile, sign-in, and account management options.',
    icon: FaUserCog,
  },
];

export const Settings = () => (
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

        <section
          className="grid gap-3 lg:grid-cols-3"
          aria-label="Settings categories"
        >
          {settingsCards.map(({ title, label, description, icon: Icon }) => (
            <article key={title} className="replica-card p-6 sm:p-7">
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
          ))}
        </section>
      </main>
    </div>
  </div>
);

export default Settings;

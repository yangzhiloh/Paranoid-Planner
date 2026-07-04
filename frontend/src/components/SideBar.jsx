import { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaBook,
  FaCalendarAlt,
  FaCog,
  FaSignOutAlt,
  FaTachometerAlt,
  FaTasks,
} from 'react-icons/fa';
import { AuthContext } from '../context/AuthContext';

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const navItems = [
    { path: '/dashboard', icon: FaTachometerAlt, label: 'Dashboard' },
    { path: '/modules', icon: FaBook, label: 'Modules' },
    { path: '/tasks', icon: FaTasks, label: 'Tasks' },
    { path: '/schedule', icon: FaCalendarAlt, label: 'Schedule' },
  ];
  const settingsActive = location.pathname === '/settings';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="fixed top-4 left-4 z-40 h-[calc(100vh-2rem)] w-[72px] flex flex-col items-center py-5 rounded-[24px] border border-white/8 bg-white/4 backdrop-blur-2xl shadow-panel">
      <Link
        to="/dashboard"
        className="mb-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300"
        aria-label="Paranoid Planner dashboard"
      >
        <span className="text-base font-bold">P</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-3" aria-label="Primary navigation">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                isActive
                  ? 'bg-orange-500/80 text-white shadow-[0_8px_24px_rgba(200,80,20,0.35)]'
                  : 'text-slate-400 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={18} aria-hidden="true" />
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3">
        <Link
          to="/settings"
          aria-label="Settings"
          aria-current={settingsActive ? 'page' : undefined}
          title="Settings"
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
            settingsActive
              ? 'bg-orange-500/80 text-white shadow-[0_8px_24px_rgba(200,80,20,0.35)]'
              : 'text-slate-400 hover:bg-white/8 hover:text-white'
          }`}
        >
          <FaCog size={16} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/8 hover:text-white"
        >
          <FaSignOutAlt size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

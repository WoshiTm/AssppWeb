import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import {
  AccountsIcon,
  DownloadsIcon,
  HomeIcon,
  SearchIcon,
  SettingsIcon,
} from '../common/icons';
import { useActiveDownloadCount } from '../../hooks/useActiveDownloadCount';

const navItems = [
  { to: '/', label: 'home', icon: HomeIcon },
  { to: '/accounts', label: 'accounts', icon: AccountsIcon },
  { to: '/search', label: 'search', icon: SearchIcon },
  { to: '/downloads', label: 'downloads', icon: DownloadsIcon },
  { to: '/settings', label: 'settings', icon: SettingsIcon },
];

/**
 * Floating pill dock: a detached rounded bar hovering above the home
 * indicator, icon-only (the accessible name carries the label). The bar sits
 * clear of the safe area; the page container's bottom padding accounts for
 * its height plus this offset, and toasts stack above it.
 */
export default function MobileNav() {
  const { t } = useTranslation();
  const activeDownloadCount = useActiveDownloadCount();

  return (
    <nav className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 md:hidden">
      <div className="pointer-events-auto mx-auto flex h-14 max-w-md items-center justify-around rounded-full border border-gray-200/70 bg-gray-50/85 px-2 shadow-[0_12px_32px_rgba(28,28,30,0.14)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-200 dark:border-gray-800/80 dark:bg-gray-950/85 dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            aria-label={t(`nav.${item.label}`)}
            title={t(`nav.${item.label}`)}
            className={({ isActive }) =>
              `relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                isActive
                  ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon className="h-6 w-6 shrink-0" />
            {item.to === '/downloads' && activeDownloadCount > 0 && (
              <span
                aria-hidden="true"
                data-testid="downloads-tab-badge"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white"
              >
                {activeDownloadCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

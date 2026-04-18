import { LogOut, Moon, Sun, Download, Upload } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { UserProfile as UserProfileType, ThemeMode } from '@/types';

interface Props {
  user: UserProfileType;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onExport: () => void;
  onImport: () => void;
  onSignOut: () => void;
}

export function UserProfile({ user, theme, onToggleTheme, onExport, onImport, onSignOut }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white font-medium">
              {user.name[0]}
            </div>
          )}
          <span className="max-w-[120px] truncate hidden sm:block">{user.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="h-4 w-4" />
          Export JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImport}>
          <Upload className="h-4 w-4" />
          Import JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-red-400 focus:text-red-400 focus:bg-red-500/10">
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

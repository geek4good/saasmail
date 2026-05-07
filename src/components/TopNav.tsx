import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Mail,
  Inbox as InboxIcon,
  FileText,
  ListOrdered,
  Key,
  Settings as SettingsIcon,
  Shield,
  Users,
  Menu,
  User,
  LogOut,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  end?: boolean;
}

// Top-level nav: just the daily-driver tabs. Admin/settings stuff lives
// in the user dropdown so the nav stays scannable.
const PRIMARY_NAV: NavItem[] = [
  { label: "Inbox", path: "/", icon: Mail, end: true },
  { label: "Templates", path: "/templates", icon: FileText },
  { label: "Sequences", path: "/sequences", icon: ListOrdered },
];

export default function TopNav() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-3 md:px-6">
      <nav
        className={`w-full max-w-[1600px] rounded-[8px] border border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-xl transition-shadow duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
          scrolled ? "shadow-2xl shadow-black/40" : ""
        }`}
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          {/* Brand — Mail glyph in lime; keeps the SAASMAIL wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2 pl-3 text-xl font-extrabold uppercase tracking-tight text-white transition-opacity duration-150 hover:opacity-80"
          >
            <Mail
              className="h-[18px] w-[18px]"
              strokeWidth={2.5}
              style={{ color: "#BFFF00" }}
              aria-hidden
            />
            saasmail
          </Link>

          {/* Primary nav (desktop) */}
          <div className="hidden items-center gap-1 sm:flex">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? "bg-white/[0.12] text-white"
                        : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1">
            {isAdmin && (
              <span className="hidden items-center rounded-[8px] bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white sm:inline-flex">
                Admin
              </span>
            )}

            {/* User dropdown — also holds secondary nav (API, Inboxes, Users, Settings) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title={session?.user?.email}
                  className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-white/[0.12]">
                    <User className="h-3.5 w-3.5 text-white/60" />
                  </span>
                  <span className="hidden max-w-[160px] truncate sm:inline">
                    {session?.user?.name || session?.user?.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium text-text-primary">
                    {session?.user?.name || "Account"}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {session?.user?.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/api-keys")}
                  className="cursor-pointer"
                >
                  <Key className="h-4 w-4" />
                  API keys
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuItem
                      onClick={() => navigate("/inboxes")}
                      className="cursor-pointer"
                    >
                      <InboxIcon className="h-4 w-4" />
                      Inboxes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => navigate("/admin/users")}
                      className="cursor-pointer"
                    >
                      <Users className="h-4 w-4" />
                      Users
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/settings")}
                  className="cursor-pointer"
                >
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate("/admin/users")}
                    className="cursor-pointer"
                  >
                    <Shield className="h-4 w-4" />
                    Admin tools
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sign-out (always-visible icon button on desktop) */}
            <button
              onClick={() => signOut()}
              className="hidden items-center gap-1.5 rounded-[8px] px-3 py-2 text-sm font-medium text-white/60 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 sm:flex"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open menu"
              className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-white/80 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white sm:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileOpen && (
          <div className="border-t border-white/[0.06] sm:hidden">
            <div className="flex flex-col py-2">
              {PRIMARY_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-4 py-2.5 text-sm font-medium ${
                        isActive
                          ? "bg-white/[0.08] text-white"
                          : "text-white/60 hover:text-white"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
              <div className="my-2 border-t border-white/[0.06]" />
              <button
                onClick={() => navigate("/api-keys")}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white"
              >
                <Key className="h-4 w-4" />
                API keys
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => navigate("/inboxes")}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white"
                  >
                    <InboxIcon className="h-4 w-4" />
                    Inboxes
                  </button>
                  <button
                    onClick={() => navigate("/admin/users")}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white"
                  >
                    <Users className="h-4 w-4" />
                    Users
                  </button>
                </>
              )}
              <button
                onClick={() => navigate("/settings")}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white"
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </button>
              <div className="my-2 border-t border-white/[0.06]" />
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-400"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}

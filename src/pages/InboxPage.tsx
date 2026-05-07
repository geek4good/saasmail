import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { ArrowLeft, PenSquare } from "lucide-react";

interface InboxOutletContext {
  onCompose: () => void;
}
import PersonList from "./PersonList";
import PersonDetail from "./PersonDetail";
import InboxToolbar, {
  type InboxFilters,
  type InboxView,
} from "@/components/InboxToolbar";
import PeopleTable from "@/components/PeopleTable";
import SelectionBar from "@/components/SelectionBar";
import {
  fetchPerson,
  fetchStats,
  fetchGroupedPeople,
  markPeopleRead,
  type GroupedPerson,
  type Stats,
} from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import { PushOptInBanner } from "@/components/PushOptInBanner";
import { isPushSupported, hasDismissedPrompt } from "@/lib/push";

const PEOPLE_PAGE_SIZE = 40;

export default function InboxPage() {
  const outlet = useOutletContext<InboxOutletContext | null>();
  const onCompose = outlet?.onCompose ?? (() => {});
  const [selectedPerson, setSelectedPerson] = useState<GroupedPerson | null>(
    null,
  );
  const [people, setPeople] = useState<GroupedPerson[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peoplePage, setPeoplePage] = useState(1);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<InboxFilters>({});
  const [search, setSearch] = useState("");
  const [view, setView] = useState<InboxView>("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Reset to page 1 whenever the query inputs change.
  useEffect(() => {
    setPeoplePage(1);
  }, [search, filters.recipient, filters.unread, filters.hasAttachment]);

  // Fetch the people list at the InboxPage level so both Table view
  // (PeopleTable) and List view (PersonList sidebar) see the same data.
  // Previously the fetch lived inside PersonList, which meant Table view
  // showed an empty state because PersonList wasn't mounted.
  useEffect(() => {
    setPeopleLoading(true);
    const t = setTimeout(() => {
      fetchGroupedPeople({
        q: search || undefined,
        recipient: filters.recipient,
        unread: filters.unread,
        hasAttachment: filters.hasAttachment,
        page: peoplePage,
        limit: PEOPLE_PAGE_SIZE,
      })
        .then((res) => {
          setPeople(res.data);
          setPeopleTotal(res.total);
        })
        .finally(() => setPeopleLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [
    search,
    peoplePage,
    filters.recipient,
    filters.unread,
    filters.hasAttachment,
  ]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allOnPage = people.every((p) => prev.has(p.id));
      if (allOnPage) {
        const next = new Set(prev);
        for (const p of people) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of people) next.add(p.id);
      return next;
    });
  }, [people]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Optimistic mark-read: clear unread locally, fire API, refresh on success.
  async function applyMarkRead(personIds: string[]) {
    if (personIds.length === 0) return;
    setBulkBusy(true);
    const before = people;
    setPeople(
      people.map((p) =>
        personIds.includes(p.id) ? { ...p, unreadCount: 0 } : p,
      ),
    );
    try {
      await markPeopleRead(personIds);
      incrementRefreshKey();
    } catch {
      setPeople(before);
    } finally {
      setBulkBusy(false);
    }
  }

  function handleMarkPersonRead(id: string) {
    applyMarkRead([id]);
  }

  function handleBulkMarkRead() {
    const ids = Array.from(selectedIds);
    applyMarkRead(ids);
    clearSelection();
  }
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const { data: session } = useSession();
  // When the user arrives via a Web Push notification (URL shape:
  // /inbox/:inbox/:personId — see worker/src/do/notifications.ts and
  // the route in App.tsx), pre-select that person so the tab shows the
  // intended conversation rather than the empty default view.
  const { personId: routePersonId } = useParams<{
    inbox: string;
    personId: string;
  }>();
  const lastProcessedPersonId = useRef<string | null>(null);

  useEffect(() => {
    if (!routePersonId) return;
    if (lastProcessedPersonId.current === routePersonId) return;
    if (selectedPerson?.id === routePersonId) {
      lastProcessedPersonId.current = routePersonId;
      return;
    }
    lastProcessedPersonId.current = routePersonId;

    // Prefer a hit in the already-loaded list (cheaper, has full grouped
    // stats); fall back to fetching the person directly so we can still
    // open the conversation when it isn't on the current page.
    const found = people.find((p) => p.id === routePersonId);
    if (found) {
      setSelectedPerson(found);
      return;
    }
    let cancelled = false;
    fetchPerson(routePersonId)
      .then((p) => {
        if (cancelled) return;
        setSelectedPerson({
          id: p.id,
          email: p.email,
          name: p.name,
          lastEmailAt: p.lastEmailAt,
          unreadCount: p.unreadCount,
          totalCount: p.totalCount,
          // recipientCount/hasAttachment aren't returned by /api/people/:id;
          // the grouped list will overwrite this object with full stats once
          // it loads. PersonDetail only needs `id` to fetch emails.
          recipientCount: 1,
          hasAttachment: 0,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [routePersonId, people, selectedPerson?.id]);

  function handleEmailRead(personId: string) {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? { ...p, unreadCount: Math.max(0, p.unreadCount - 1) }
          : p,
      ),
    );
  }

  function handleEmailDelete(personId: string, wasUnread: boolean) {
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              totalCount: Math.max(0, p.totalCount - 1),
              unreadCount: wasUnread
                ? Math.max(0, p.unreadCount - 1)
                : p.unreadCount,
            }
          : p,
      ),
    );
  }

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const incrementRefreshKey = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  function onShouldPromptPush() {
    if (!isPushSupported()) return;
    if (hasDismissedPrompt()) return;
    if (Notification.permission !== "default") return;
    setShowBanner(true);
  }

  useRealtimeUpdates(incrementRefreshKey, onShouldPromptPush);

  const isAdmin = session?.user?.role === "admin";

  if (stats && stats.recipients.length === 0 && !isAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-center justify-center px-4 py-16 md:px-6">
        <div className="rounded-2xl bg-card p-12 text-center ring-1 ring-border">
          <h2 className="text-lg font-semibold text-text-primary">
            No inboxes assigned yet
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Ask an admin to grant you access to an inbox.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 pb-12 md:px-6">
      {/* Page header — compact on mobile, expansive on desktop. Compose
          button is hidden on mobile (the floating FAB replaces it).
          On mobile we hide the header entirely when a person is open so
          the conversation gets full-screen real estate. */}
      <div
        className={`mb-3 items-end justify-between gap-4 pt-4 sm:mb-4 sm:pt-6 ${selectedPerson ? "hidden sm:flex" : "flex"}`}
      >
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl md:text-4xl">
            Inbox
          </h1>
          <p className="mt-0.5 text-xs font-light text-text-secondary sm:mt-1 sm:text-sm">
            One unified timeline per customer.
          </p>
        </div>
        <button
          onClick={onCompose}
          className="hidden shrink-0 items-center gap-2 rounded-[8px] bg-text-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-text-primary/90 sm:inline-flex"
        >
          <PenSquare className="h-3.5 w-3.5" />
          Compose
        </button>
      </div>

      {/* Toolbar — search + filters + view toggle, all on one row.
          Hidden when a person is open in table view to keep the focus on
          the conversation. (Toggle stays accessible via the back button.) */}
      {!(view === "table" && selectedPerson) && (
        <div className={`mb-3 ${selectedPerson ? "hidden sm:block" : ""}`}>
          <InboxToolbar
            filters={filters}
            onFiltersChange={setFilters}
            inboxes={stats?.senderIdentities ?? []}
            search={search}
            onSearchChange={setSearch}
            view={view}
            onViewChange={(v) => {
              setView(v);
              setSelectedPerson(null);
              clearSelection();
            }}
          />
        </div>
      )}

      {/* Selection bar — desktop: above the inbox card. Mobile: floats at
          the bottom of the screen so the user's thumb can reach it. */}
      {selectedIds.size > 0 && !selectedPerson && (
        <>
          <div className="mb-3 hidden sm:block">
            <SelectionBar
              count={selectedIds.size}
              busy={bulkBusy}
              onMarkRead={handleBulkMarkRead}
              onClear={clearSelection}
            />
          </div>
          <div
            className="fixed inset-x-3 bottom-3 z-40 sm:hidden"
            style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <SelectionBar
              count={selectedIds.size}
              busy={bulkBusy}
              onMarkRead={handleBulkMarkRead}
              onClear={clearSelection}
            />
          </div>
        </>
      )}

      <div
        className={`-mx-4 flex flex-col overflow-hidden rounded-none bg-card shadow-sm ring-0 sm:mx-0 sm:rounded-[8px] sm:ring-1 sm:ring-border ${
          selectedPerson
            ? "h-[calc(100vh-7rem)] min-h-[420px] sm:h-[calc(100vh-19rem)] sm:min-h-[520px]"
            : "h-[calc(100vh-19rem)] min-h-[480px] sm:h-[calc(100vh-19rem)] sm:min-h-[520px]"
        }`}
      >
        {view === "table" ? (
          selectedPerson ? (
            // Table view + person open → full-width person detail.
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-subtle/60 px-4 py-2">
                <button
                  onClick={() => setSelectedPerson(null)}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
                >
                  <ArrowLeft size={13} />
                  Back to all
                </button>
                <span className="text-[11px] font-light text-text-tertiary">
                  Viewing {selectedPerson.name || selectedPerson.email}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <PersonDetail
                  person={selectedPerson}
                  onEmailRead={handleEmailRead}
                  onEmailDelete={handleEmailDelete}
                  refreshKey={refreshKey}
                />
              </div>
            </div>
          ) : (
            // Table view, no selection → full table. `min-h-0 overflow-hidden`
            // is required so the inner ScrollArea actually constrains and the
            // table can scroll instead of pushing the page taller.
            <div className="flex min-h-0 flex-1 overflow-hidden bg-card">
              <PeopleTable
                people={people}
                onSelectPerson={(p) => setSelectedPerson(p)}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onToggleSelectAll={toggleSelectAll}
                onMarkPersonRead={handleMarkPersonRead}
              />
            </div>
          )
        ) : (
          // List view — sidebar + detail (or empty state).
          <div className="flex h-full min-h-0">
            <div
              className={`w-full shrink-0 border-r border-border bg-bg-subtle md:w-96 ${
                selectedPerson ? "hidden md:block" : "block"
              }`}
            >
              {showBanner && (
                <PushOptInBanner onClose={() => setShowBanner(false)} />
              )}
              <PersonList
                people={people}
                setPeople={setPeople}
                loading={peopleLoading}
                total={peopleTotal}
                pageSize={PEOPLE_PAGE_SIZE}
                page={peoplePage}
                onPageChange={setPeoplePage}
                selectedPersonId={selectedPerson?.id ?? null}
                onSelectPerson={setSelectedPerson}
                onPersonDeleted={(id) => {
                  if (selectedPerson?.id === id) setSelectedPerson(null);
                }}
                isAdmin={isAdmin}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onMarkPersonRead={handleMarkPersonRead}
              />
            </div>

            <div
              className={`min-w-0 flex-1 bg-card ${
                selectedPerson ? "block" : "hidden md:block"
              }`}
            >
              {selectedPerson ? (
                <div className="flex h-full flex-col">
                  <button
                    onClick={() => setSelectedPerson(null)}
                    className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs text-text-secondary hover:text-text-primary md:hidden"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                  <div className="flex-1 overflow-hidden">
                    <PersonDetail
                      person={selectedPerson}
                      onEmailRead={handleEmailRead}
                      onEmailDelete={handleEmailDelete}
                      refreshKey={refreshKey}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                  <span
                    className="text-3xl leading-none"
                    style={{ color: "#7c5cfc" }}
                    aria-hidden
                  >
                    ✦
                  </span>
                  <p className="max-w-[280px] text-sm font-light text-text-tertiary">
                    Select a person to view emails, or switch to{" "}
                    <span className="font-medium">Table</span> view for an
                    overview.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

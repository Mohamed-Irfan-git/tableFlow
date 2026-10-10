"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  LayoutDashboard,
  Map,
  Plus,
  RefreshCw,
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { apiRequest, restaurantId } from "@/lib/api";

type ApiTableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
type ApiTable = {
  id: number;
  number: string;
  capacity: number;
  status: ApiTableStatus;
  location: string | null;
};
type QueueEntry = {
  id: number;
  queue_number: string;
  customer_name: string;
  guest_count: number;
  arrived_at: string;
  status: "WAITING" | "CALLED";
};
type Reservation = {
  id: number;
  table_number: string;
  guest_name: string;
  guest_email: string;
  reservation_date: string;
  slot_start: string;
  guest_count: number;
  status: "CONFIRMED" | "CHECKED_IN";
};
type HostSession = {
  accessToken: string;
  user: { full_name: string; role: string };
};
type HostDeskRole = "HOST" | "MANAGER" | "ADMIN";
type TokenResponse = { access_token: string; user: HostSession["user"] };
type HostView =
  | "Overview"
  | "Floor"
  | "Reservations"
  | "Walk-ins"
  | "Queue"
  | "Reports";

const tablePositions: Record<string, string> = {
  T01: "floor-table--1",
  T02: "floor-table--2",
  T03: "floor-table--3",
  T04: "floor-table--4",
  T05: "floor-table--5",
  T06: "floor-table--6",
  T07: "floor-table--7",
  T08: "floor-table--8",
  T09: "floor-table--9",
  T10: "floor-table--10",
};
const nav: ReadonlyArray<readonly [typeof LayoutDashboard, HostView]> = [
  [LayoutDashboard, "Overview"],
  [Map, "Floor"],
  [CalendarDays, "Reservations"],
  [UsersRound, "Walk-ins"],
  [UsersRound, "Queue"],
  [Clock3, "Reports"],
];
const sessionEvent = "tableflow-host-session-change";
const hostDeskRoles = new Set<HostDeskRole>(["HOST", "MANAGER", "ADMIN"]);
const hostAccessError =
  "This is a guest account. Sign in with a host, manager, or admin account to use the host desk.";
let cachedSessionValue: string | null | undefined;
let cachedSession: HostSession | null = null;

function readStoredSession() {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem("tableflow-host-session");
  if (value === cachedSessionValue) return cachedSession;
  cachedSessionValue = value;
  try {
    cachedSession = value ? (JSON.parse(value) as HostSession) : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

function subscribeToSession(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(sessionEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(sessionEvent, notify);
  };
}

function canAccessHostDesk(role: string): role is HostDeskRole {
  return hostDeskRoles.has(role as HostDeskRole);
}

function displayStatus(
  status: ApiTableStatus | QueueEntry["status"] | Reservation["status"],
) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
function waitLabel(arrivedAt: string) {
  return `${Math.max(0, Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60000))} min`;
}
function reservationMoment(reservation: Reservation) {
  return `${reservation.reservation_date} · ${reservation.slot_start.slice(0, 5)}`;
}

function FloorBoard({
  tables,
  queue,
  selectedTableId,
  isSubmitting,
  onSelectTable,
  onClearTable,
  onSeatParty,
}: {
  tables: ApiTable[];
  queue: QueueEntry[];
  selectedTableId: number | null;
  isSubmitting: boolean;
  onSelectTable: (tableId: number) => void;
  onClearTable: () => void;
  onSeatParty: (entry: QueueEntry, table: ApiTable) => void;
}) {
  const selectedTable =
    tables.find((table) => table.id === selectedTableId) ?? null;
  const nextParty = selectedTable
    ? queue.find((entry) => entry.guest_count <= selectedTable.capacity)
    : undefined;
  return (
    <section className="floor-shell">
      <div className="floor-heading">
        <div>
          <p>Service now</p>
          <h2>Live floor</h2>
        </div>
        <div className="floor-legend">
          <span>
            <i className="available" />
            Available
          </span>
          <span>
            <i className="reserved" />
            Reserved
          </span>
          <span>
            <i className="occupied" />
            Occupied
          </span>
        </div>
      </div>
      <div className="floor-layout">
        <div
          className="floor-map"
          aria-label="Interactive restaurant floor overview, including main dining, window seating, terrace, service pass, and host stand"
        >
          <span className="floor-zone floor-zone--window" aria-hidden="true">
            Window seating
          </span>
          <span className="floor-zone floor-zone--main" aria-hidden="true">
            Main dining
          </span>
          <span className="floor-zone floor-zone--terrace" aria-hidden="true">
            Terrace
          </span>
          <span className="floor-zone floor-zone--host" aria-hidden="true">
            Host stand
          </span>
          <span className="floor-zone floor-zone--pass" aria-hidden="true">
            Service pass
          </span>
          <span className="floor-aisle floor-aisle--one" aria-hidden="true" />
          <span className="floor-aisle floor-aisle--two" aria-hidden="true" />
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className={`floor-table ${table.capacity <= 2 || table.capacity === 6 ? "round" : "wide"} ${table.capacity >= 6 ? "floor-table--large" : ""} ${tablePositions[table.number] ?? ""} ${table.status.toLowerCase()} ${selectedTable?.id === table.id ? "selected" : ""}`}
              aria-label={`${table.number}, ${table.capacity} seats, ${displayStatus(table.status)}${table.location ? `, ${table.location}` : ""}`}
            >
              <strong>{table.number}</strong>
              <span>{table.capacity} seats</span>
              <em>{displayStatus(table.status)}</em>
            </button>
          ))}
        </div>
        <aside className="table-inspector">
          {selectedTable ? (
            <>
              <button
                className="inspector-close"
                aria-label="Clear selected table"
                onClick={onClearTable}
              >
                <X />
              </button>
              <p>Selected table</p>
              <h2>{selectedTable.number}</h2>
              <div className="table-illustration">
                <UtensilsCrossed />
              </div>
              <dl>
                <div>
                  <dt>Capacity</dt>
                  <dd>{selectedTable.capacity}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd className={selectedTable.status.toLowerCase()}>
                    {displayStatus(selectedTable.status)}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{selectedTable.location ?? "—"}</dd>
                </div>
              </dl>
              <div className="inspector-booking">
                <span>Next action</span>
                <strong>
                  {selectedTable.status === "AVAILABLE" && nextParty
                    ? `Seat ${nextParty.customer_name} · ${nextParty.guest_count} guests`
                    : selectedTable.status === "AVAILABLE"
                      ? "No compatible party is waiting"
                      : "Table is not ready for seating"}
                </strong>
              </div>
              <button
                className="assign-table"
                disabled={
                  !nextParty ||
                  selectedTable.status !== "AVAILABLE" ||
                  isSubmitting
                }
                onClick={() =>
                  nextParty && onSeatParty(nextParty, selectedTable)
                }
              >
                Assign next party <ChevronRight />
              </button>
            </>
          ) : (
            <div className="inspector-empty">
              <p>Select a table</p>
              <span>
                Choose a table on the floor to see the live seating action.
              </span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function QueueList({
  queue,
  tables,
  isSubmitting,
  onSeatParty,
  onViewQueue,
  title = "Waiting queue",
}: {
  queue: QueueEntry[];
  tables: ApiTable[];
  isSubmitting: boolean;
  onSeatParty: (entry: QueueEntry, table: ApiTable) => void;
  onViewQueue?: () => void;
  title?: string;
}) {
  return (
    <div className="queue-card">
      <div className="queue-card__title">
        <div>
          <p>Up next</p>
          <h2>{title}</h2>
        </div>
        {onViewQueue && (
          <button onClick={onViewQueue}>
            View all <ChevronRight />
          </button>
        )}
      </div>
      {queue.length ? (
        queue.map((guest) => {
          const firstFit = tables.find(
            (table) =>
              table.status === "AVAILABLE" &&
              table.capacity >= guest.guest_count,
          );
          return (
            <div className="queue-row" key={guest.id}>
              <strong>{guest.queue_number}</strong>
              <div>
                <b>{guest.customer_name}</b>
                <span>Party of {guest.guest_count}</span>
              </div>
              <div>
                <b>{waitLabel(guest.arrived_at)}</b>
                <span>Wait time</span>
              </div>
              <span className="waiting">
                <i />
                {displayStatus(guest.status)}
              </span>
              <button
                disabled={!firstFit || isSubmitting}
                onClick={() => firstFit && onSeatParty(guest, firstFit)}
              >
                Assign
              </button>
            </div>
          );
        })
      ) : (
        <p className="queue-empty">
          No parties waiting. Add a walk-in when they arrive.
        </p>
      )}
    </div>
  );
}

function ActivityPanel({
  tableCount,
  queueCount,
}: {
  tableCount: number;
  queueCount: number;
}) {
  return (
    <aside className="activity-card">
      <div className="queue-card__title">
        <div>
          <p>Connected</p>
          <h2>Service status</h2>
        </div>
      </div>
      <ol>
        <li>
          <time>NOW</time>
          <span>
            Live floor loaded
            <small>{tableCount} tables from the operational API</small>
          </span>
        </li>
        <li>
          <time>LIVE</time>
          <span>
            Queue is synced
            <small>
              {queueCount} active {queueCount === 1 ? "party" : "parties"}
            </small>
          </span>
        </li>
        <li>
          <time>API</time>
          <span>
            Role-checked seating
            <small>Table and queue updates commit together</small>
          </span>
        </li>
      </ol>
      <div className="activity-alert">
        <CircleAlert /> No service issues reported
      </div>
    </aside>
  );
}

function ReservationLedger({ reservations }: { reservations: Reservation[] }) {
  return (
    <section className="host-task-panel">
      <div className="host-task-heading">
        <p>Upcoming service</p>
        <h2>Reservations</h2>
        <span>Confirmed arrivals across the dining room.</span>
      </div>
      {reservations.length ? (
        <div className="reservation-ledger">
          {reservations.map((reservation) => (
            <article key={reservation.id}>
              <strong>{reservationMoment(reservation)}</strong>
              <div>
                <b>{reservation.guest_name}</b>
                <span>
                  {reservation.guest_count} guests · {reservation.guest_email}
                </span>
              </div>
              <em>{reservation.table_number}</em>
              <small>{displayStatus(reservation.status)}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="queue-empty">No upcoming reservations are recorded.</p>
      )}
    </section>
  );
}

function ServiceReport({
  tables,
  queue,
  reservations,
}: {
  tables: ApiTable[];
  queue: QueueEntry[];
  reservations: Reservation[];
}) {
  const statuses: ApiTableStatus[] = [
    "AVAILABLE",
    "RESERVED",
    "OCCUPIED",
    "UNAVAILABLE",
  ];
  return (
    <section className="host-task-panel service-report">
      <div className="host-task-heading">
        <p>At a glance</p>
        <h2>Service report</h2>
        <span>A compact live readout for the current shift.</span>
      </div>
      <div className="service-report__rows">
        {statuses.map((status) => (
          <div key={status}>
            <span>
              <i className={status.toLowerCase()} />
              {displayStatus(status)} tables
            </span>
            <strong>
              {tables.filter((table) => table.status === status).length}
            </strong>
          </div>
        ))}
        <div>
          <span>
            <i className="waiting" />
            Waiting parties
          </span>
          <strong>{queue.length}</strong>
        </div>
        <div>
          <span>
            <i className="reserved" />
            Active reservations
          </span>
          <strong>{reservations.length}</strong>
        </div>
      </div>
    </section>
  );
}

export function HostDesk() {
  const session = useSyncExternalStore(
    subscribeToSession,
    readStoredSession,
    () => null,
  );
  const accessDenied = Boolean(
    session && !canAccessHostDesk(session.user.role),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [activeNav, setActiveNav] = useState<HostView>("Overview");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInParty, setWalkInParty] = useState(2);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDesk = useCallback(async (accessToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [nextTables, nextQueue, nextReservations] = await Promise.all([
        apiRequest<ApiTable[]>(`/tables?restaurant_id=${restaurantId}`, {
          headers,
        }),
        apiRequest<QueueEntry[]>(`/queue?restaurant_id=${restaurantId}`, {
          headers,
        }),
        apiRequest<Reservation[]>(
          `/reservations?restaurant_id=${restaurantId}`,
          { headers },
        ),
      ]);
      setTables(nextTables);
      setQueue(nextQueue);
      setReservations(nextReservations);
      setSelectedTableId((current) => current ?? nextTables[0]?.id ?? null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load the host desk.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session || accessDenied) return;
    const timer = window.setTimeout(
      () => void loadDesk(session.accessToken),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [accessDenied, loadDesk, session]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!canAccessHostDesk(response.user.role)) {
        setError(hostAccessError);
        return;
      }
      window.sessionStorage.setItem(
        "tableflow-host-session",
        JSON.stringify({
          accessToken: response.access_token,
          user: response.user,
        }),
      );
      window.dispatchEvent(new Event(sessionEvent));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = () => {
    window.sessionStorage.removeItem("tableflow-host-session");
    window.dispatchEvent(new Event(sessionEvent));
    setTables([]);
    setQueue([]);
    setReservations([]);
    setSelectedTableId(null);
    setNotice(null);
  };

  const addWalkIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!walkInName.trim() || !session) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const entry = await apiRequest<QueueEntry>("/queue", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_name: walkInName.trim(),
          guest_count: walkInParty,
        }),
      });
      setQueue((current) => [...current, entry]);
      setWalkInName("");
      setWalkInParty(2);
      setShowWalkIn(false);
      setNotice(
        `${entry.customer_name} joined the queue as ${entry.queue_number}.`,
      );
      setActiveNav("Queue");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add the walk-in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const seatParty = async (entry: QueueEntry, table: ApiTable) => {
    if (!session) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest<QueueEntry>(`/queue/${entry.id}/seat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ table_id: table.id }),
      });
      setNotice(`${entry.customer_name} is seated at ${table.number}.`);
      await loadDesk(session.accessToken);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to seat this party.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const chooseView = (view: HostView) => {
    setActiveNav(view);
    if (view === "Walk-ins") setShowWalkIn(true);
  };

  if (!session || accessDenied)
    return (
      <main className="host-login">
        <Link className="host-login__brand" href="/">
          <span>TF</span> TableFlow
        </Link>
        <form onSubmit={login}>
          <p>Staff sign in</p>
          <h1>The room, in view.</h1>
          <span>
            Use your TableFlow host account to open the live floor and queue.
          </span>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="host@restaurant.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
          </label>
          {(accessDenied ? hostAccessError : error) && (
            <p className="host-form-error" role="alert">
              {accessDenied ? hostAccessError : error}
            </p>
          )}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Open host desk"}
            <ChevronRight />
          </button>
          <Link href="/">Return to guest experience</Link>
        </form>
      </main>
    );

  const floor = (
    <FloorBoard
      tables={tables}
      queue={queue}
      selectedTableId={selectedTableId}
      isSubmitting={isSubmitting}
      onSelectTable={setSelectedTableId}
      onClearTable={() => setSelectedTableId(null)}
      onSeatParty={(entry, table) => void seatParty(entry, table)}
    />
  );
  const queueList = (
    <QueueList
      queue={queue}
      tables={tables}
      isSubmitting={isSubmitting}
      onSeatParty={(entry, table) => void seatParty(entry, table)}
    />
  );
  let content = floor;
  if (activeNav === "Overview")
    content = (
      <>
        {floor}
        <section className="host-bottom">
          {queueList}
          <ActivityPanel tableCount={tables.length} queueCount={queue.length} />
        </section>
      </>
    );
  if (activeNav === "Reservations")
    content = <ReservationLedger reservations={reservations} />;
  if (activeNav === "Walk-ins")
    content = (
      <section className="host-task-panel">
        <div className="host-task-heading">
          <p>Front door</p>
          <h2>Walk-ins</h2>
          <span>Add a party, then assign it from the live queue.</span>
        </div>
        {queueList}
      </section>
    );
  if (activeNav === "Queue")
    content = (
      <section className="host-task-panel">
        <div className="host-task-heading">
          <p>Front door</p>
          <h2>Queue</h2>
          <span>
            Assign each party to the next compatible, available table.
          </span>
        </div>
        {queueList}
      </section>
    );
  if (activeNav === "Reports")
    content = (
      <ServiceReport
        tables={tables}
        queue={queue}
        reservations={reservations}
      />
    );

  return (
    <main className="host-app">
      <aside className="host-sidebar">
        <Link className="host-brand" href="/">
          <span>TF</span>
          <strong>TableFlow</strong>
          <small>HOST DESK</small>
        </Link>
        <nav>
          {nav.map(([Icon, label]) => (
            <button
              key={label}
              aria-current={activeNav === label ? "page" : undefined}
              className={activeNav === label ? "active" : ""}
              onClick={() => chooseView(label)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="host-sign-out" onClick={logout}>
          Sign out
        </button>
        <Link className="back-to-site" href="/">
          Visit public site <ChevronRight />
        </Link>
      </aside>
      <section className="host-content">
        <header className="host-header">
          <div>
            <p>{activeNav === "Overview" ? "Service now" : activeNav}</p>
            <h1>
              {activeNav === "Overview"
                ? `Good evening, ${session.user.full_name.split(" ")[0]}`
                : activeNav}
            </h1>
          </div>
          <div className="host-header-actions">
            <button
              className="host-refresh"
              onClick={() => void loadDesk(session.accessToken)}
              disabled={isLoading}
            >
              <RefreshCw className={isLoading ? "is-spinning" : ""} />{" "}
              {isLoading ? "Refreshing" : "Refresh"}
            </button>
            <span className="live-status">
              <i /> Live data connected
            </span>
            <button
              className="add-walkin"
              onClick={() => {
                setShowWalkIn(true);
                setActiveNav("Walk-ins");
              }}
            >
              <Plus /> Add walk-in
            </button>
          </div>
        </header>
        {showWalkIn && (
          <motion.form
            className="walkin-form"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={addWalkIn}
          >
            <label>
              Guest name
              <input
                required
                value={walkInName}
                onChange={(event) => setWalkInName(event.target.value)}
                placeholder="Name"
              />
            </label>
            <label>
              Party size
              <input
                required
                min="1"
                max="20"
                type="number"
                value={walkInParty}
                onChange={(event) => setWalkInParty(Number(event.target.value))}
              />
            </label>
            <button disabled={isSubmitting} type="submit">
              Add to queue
            </button>
            <button
              className="walkin-form__cancel"
              type="button"
              onClick={() => setShowWalkIn(false)}
            >
              Cancel
            </button>
          </motion.form>
        )}
        {error && (
          <p className="host-api-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <motion.p
            className="host-notice"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {notice}
          </motion.p>
        )}
        {content}
      </section>
    </main>
  );
}

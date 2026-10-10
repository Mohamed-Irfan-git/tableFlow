"use client";

import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { apiRequest, restaurantId } from "@/lib/api";

type ApiTableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE";
type ApiTable = { id: number; number: string; capacity: number; status: ApiTableStatus; location: string | null };
type QueueEntry = { id: number; queue_number: string; customer_name: string; guest_count: number; arrived_at: string; status: "WAITING" | "CALLED" };
type HostSession = { accessToken: string; user: { full_name: string; role: string } };
type TokenResponse = { access_token: string; user: HostSession["user"] };

const tablePositions: Record<string, string> = {
  T01: "floor-table--1", T02: "floor-table--2", T03: "floor-table--3", T04: "floor-table--4", T05: "floor-table--5",
  T06: "floor-table--6", T07: "floor-table--7", T08: "floor-table--8", T09: "floor-table--9", T10: "floor-table--10",
};
const nav = [[LayoutDashboard, "Overview"], [Map, "Floor"], [CalendarDays, "Reservations"], [UsersRound, "Walk-ins"], [UsersRound, "Queue"], [Clock3, "Reports"]] as const;
const sessionEvent = "tableflow-host-session-change";
let cachedSessionValue: string | null | undefined;
let cachedSession: HostSession | null = null;

function readStoredSession() {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem("tableflow-host-session");
  if (value === cachedSessionValue) return cachedSession;
  cachedSessionValue = value;
  try {
    cachedSession = value ? JSON.parse(value) as HostSession : null;
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

function displayStatus(status: ApiTableStatus | QueueEntry["status"]) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function waitLabel(arrivedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60000));
  return `${minutes} min`;
}

export function HostDesk() {
  const session = useSyncExternalStore(subscribeToSession, readStoredSession, () => null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tables, setTables] = useState<ApiTable[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [activeNav, setActiveNav] = useState("Floor");
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
      const [nextTables, nextQueue] = await Promise.all([
        apiRequest<ApiTable[]>(`/tables?restaurant_id=${restaurantId}`, { headers }),
        apiRequest<QueueEntry[]>(`/queue?restaurant_id=${restaurantId}`, { headers }),
      ]);
      setTables(nextTables);
      setQueue(nextQueue);
      setSelectedTableId((current) => current ?? nextTables[0]?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load the host desk.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => void loadDesk(session.accessToken), 0);
    return () => window.clearTimeout(timer);
  }, [loadDesk, session]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const nextSession = { accessToken: response.access_token, user: response.user };
      window.sessionStorage.setItem("tableflow-host-session", JSON.stringify(nextSession));
      window.dispatchEvent(new Event(sessionEvent));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = () => {
    window.sessionStorage.removeItem("tableflow-host-session");
    window.dispatchEvent(new Event(sessionEvent));
    setTables([]);
    setQueue([]);
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
        body: JSON.stringify({ restaurant_id: restaurantId, customer_name: walkInName.trim(), guest_count: walkInParty }),
      });
      setQueue((current) => [...current, entry]);
      setWalkInName("");
      setWalkInParty(2);
      setShowWalkIn(false);
      setNotice(`${entry.customer_name} joined the queue as ${entry.queue_number}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add the walk-in.");
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
      setError(requestError instanceof Error ? requestError.message : "Unable to seat this party.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const nextParty = selectedTable ? queue.find((entry) => entry.guest_count <= selectedTable.capacity) : undefined;

  if (!session) {
    return <main className="host-login"><Link className="host-login__brand" href="/"><span>TF</span> TableFlow</Link><form onSubmit={login}><p>Staff sign in</p><h1>The room, in view.</h1><span>Use your TableFlow host account to open the live floor and queue.</span><label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="host@restaurant.com" /></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>{error && <p className="host-form-error" role="alert">{error}</p>}<button type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Open host desk"}<ChevronRight /></button><Link href="/">Return to guest experience</Link></form></main>;
  }

  return <main className="host-app">
    <aside className="host-sidebar"><Link className="host-brand" href="/"><span>TF</span><strong>TableFlow</strong><small>HOST DESK</small></Link><nav>{nav.map(([Icon, label]) => <button key={label} aria-current={activeNav === label ? "page" : undefined} className={activeNav === label ? "active" : ""} onClick={() => setActiveNav(label)}><Icon /><span>{label}</span></button>)}</nav><button className="host-sign-out" onClick={logout}>Sign out</button><Link className="back-to-site" href="/">Visit public site <ChevronRight /></Link></aside>
    <section className="host-content"><header className="host-header"><div><p>Friday, 16 October 2026</p><h1>Good evening, {session.user.full_name.split(" ")[0]}</h1></div><div className="host-header-actions"><span className="live-status"><i /> {isLoading ? "Refreshing…" : "Live data connected"}</span><button className="add-walkin" onClick={() => setShowWalkIn((open) => !open)}><Plus /> Add walk-in</button></div></header>
      {showWalkIn && <motion.form className="walkin-form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} onSubmit={addWalkIn}><label>Guest name<input required value={walkInName} onChange={(event) => setWalkInName(event.target.value)} placeholder="Name" /></label><label>Party size<input required min="1" max="20" type="number" value={walkInParty} onChange={(event) => setWalkInParty(Number(event.target.value))} /></label><button disabled={isSubmitting} type="submit">Add to queue</button><button className="walkin-form__cancel" type="button" onClick={() => setShowWalkIn(false)}>Cancel</button></motion.form>}
      {error && <p className="host-api-error" role="alert">{error}</p>}{notice && <motion.p className="host-notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>{notice}</motion.p>}
      <section className="floor-shell"><div className="floor-heading"><div><p>Service now</p><h2>Live floor</h2></div><div className="floor-legend"><span><i className="available" />Available</span><span><i className="reserved" />Reserved</span><span><i className="occupied" />Occupied</span></div></div><div className="floor-layout"><div className="floor-map" aria-label="Interactive restaurant floor overview">{tables.map((table) => <button key={table.id} onClick={() => setSelectedTableId(table.id)} className={`floor-table ${table.capacity <= 2 || table.capacity === 6 ? "round" : "wide"} ${tablePositions[table.number] ?? ""} ${table.status.toLowerCase()} ${selectedTable?.id === table.id ? "selected" : ""}`}><strong>{table.number}</strong><span>{table.capacity} seats</span><em>{displayStatus(table.status)}</em></button>)}</div><aside className="table-inspector">{selectedTable ? <><button className="inspector-close" aria-label="Clear selected table" onClick={() => setSelectedTableId(null)}><X /></button><p>Selected table</p><h2>{selectedTable.number}</h2><div className="table-illustration"><UtensilsCrossed /></div><dl><div><dt>Capacity</dt><dd>{selectedTable.capacity}</dd></div><div><dt>Status</dt><dd className={selectedTable.status.toLowerCase()}>{displayStatus(selectedTable.status)}</dd></div><div><dt>Location</dt><dd>{selectedTable.location ?? "—"}</dd></div></dl><div className="inspector-booking"><span>Next action</span><strong>{selectedTable.status === "AVAILABLE" && nextParty ? `Seat ${nextParty.customer_name} · ${nextParty.guest_count} guests` : selectedTable.status === "AVAILABLE" ? "No compatible party is waiting" : "Table is not ready for seating"}</strong></div><button className="assign-table" disabled={!nextParty || selectedTable.status !== "AVAILABLE" || isSubmitting} onClick={() => nextParty && void seatParty(nextParty, selectedTable)}>Assign next party <ChevronRight /></button></> : <div className="inspector-empty"><p>Select a table</p><span>Choose a table on the floor to see the live seating action.</span></div>}</aside></div></section>
      <section className="host-bottom"><div className="queue-card"><div className="queue-card__title"><div><p>Up next</p><h2>Waiting queue</h2></div><button onClick={() => setActiveNav("Queue")}>View all <ChevronRight /></button></div>{queue.length ? queue.map((guest) => { const firstFit = tables.find((table) => table.status === "AVAILABLE" && table.capacity >= guest.guest_count); return <div className="queue-row" key={guest.id}><strong>{guest.queue_number}</strong><div><b>{guest.customer_name}</b><span>Party of {guest.guest_count}</span></div><div><b>{waitLabel(guest.arrived_at)}</b><span>Wait time</span></div><span className="waiting"><i />{displayStatus(guest.status)}</span><button disabled={!firstFit || isSubmitting} onClick={() => firstFit && void seatParty(guest, firstFit)}>Assign</button></div>; }) : <p className="queue-empty">No parties waiting. Add a walk-in when they arrive.</p>}</div><aside className="activity-card"><div className="queue-card__title"><div><p>Connected</p><h2>Service status</h2></div></div><ol><li><time>NOW</time><span>Live floor loaded<small>{tables.length} tables from the operational API</small></span></li><li><time>LIVE</time><span>Queue is synced<small>{queue.length} active {queue.length === 1 ? "party" : "parties"}</small></span></li><li><time>API</time><span>Role-checked seating<small>Table and queue updates commit together</small></span></li></ol><div className="activity-alert"><CircleAlert /> No service issues reported</div></aside></section>
    </section>
  </main>;
}

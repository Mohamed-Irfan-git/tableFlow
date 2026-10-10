"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, ChevronRight, CircleAlert, Clock3, LayoutDashboard, Map, Plus, UsersRound, UtensilsCrossed, X } from "lucide-react";

type TableStatus = "Available" | "Reserved" | "Occupied" | "Unavailable";

const tables: { id: string; capacity: number; status: TableStatus; shape: "round" | "wide"; position: string }[] = [
  { id: "T01", capacity: 2, status: "Available", shape: "round", position: "floor-table--1" },
  { id: "T02", capacity: 4, status: "Available", shape: "wide", position: "floor-table--2" },
  { id: "T03", capacity: 6, status: "Occupied", shape: "round", position: "floor-table--3" },
  { id: "T04", capacity: 2, status: "Unavailable", shape: "round", position: "floor-table--4" },
  { id: "T05", capacity: 6, status: "Available", shape: "wide", position: "floor-table--5" },
  { id: "T06", capacity: 4, status: "Reserved", shape: "wide", position: "floor-table--6" },
  { id: "T07", capacity: 6, status: "Occupied", shape: "round", position: "floor-table--7" },
  { id: "T08", capacity: 4, status: "Available", shape: "wide", position: "floor-table--8" },
  { id: "T09", capacity: 4, status: "Available", shape: "round", position: "floor-table--9" },
  { id: "T10", capacity: 8, status: "Unavailable", shape: "wide", position: "floor-table--10" },
];

const queue = [
  { number: "Q-021", name: "Danielle Park", party: 4, wait: "12 min" },
  { number: "Q-022", name: "Miguel Torres", party: 2, wait: "18 min" },
  { number: "Q-023", name: "Avery Chen", party: 5, wait: "22 min" },
];

const nav = [
  [LayoutDashboard, "Overview"], [Map, "Floor"], [CalendarDays, "Reservations"], [UsersRound, "Walk-ins"], [UsersRound, "Queue"], [Clock3, "Reports"],
] as const;

export function HostDesk() {
  const [selectedTable, setSelectedTable] = useState(tables[5]);
  const [seated, setSeated] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("Floor");

  return <main className="host-app">
    <aside className="host-sidebar"><a className="host-brand" href="/"><span>TF</span><strong>TableFlow</strong><small>HOST DESK</small></a><nav>{nav.map(([Icon, label]) => <button key={label} className={activeNav === label ? "active" : ""} onClick={() => setActiveNav(label)}><Icon /><span>{label}</span></button>)}</nav><a className="back-to-site" href="/">Visit public site <ChevronRight /></a></aside>
    <section className="host-content"><header className="host-header"><div><p>Monday, 28 April 2025</p><h1>Good evening, Maya</h1></div><div className="host-header-actions"><span className="live-status"><i /> Live updates on</span><button className="add-walkin"><Plus /> Add walk-in</button></div></header>
      <section className="floor-shell"><div className="floor-heading"><div><p>Service now</p><h2>Live floor</h2></div><div className="floor-legend"><span><i className="available" />Available</span><span><i className="reserved" />Reserved</span><span><i className="occupied" />Occupied</span></div></div><div className="floor-layout"><div className="floor-map" aria-label="Interactive restaurant floor overview">{tables.map((table) => <button key={table.id} onClick={() => setSelectedTable(table)} className={`floor-table ${table.shape} ${table.position} ${table.status.toLowerCase()} ${selectedTable.id === table.id ? "selected" : ""}`}><strong>{table.id}</strong><span>{table.capacity} seats</span><em>{table.status}</em></button>)}</div><aside className="table-inspector"><button className="inspector-close" aria-label="Clear selected table"><X /></button><p>Selected table</p><h2>{selectedTable.id}</h2><div className="table-illustration"><UtensilsCrossed /></div><dl><div><dt>Capacity</dt><dd>{selectedTable.capacity}</dd></div><div><dt>Status</dt><dd className={selectedTable.status.toLowerCase()}>{selectedTable.status}</dd></div><div><dt>Location</dt><dd>Main Dining</dd></div></dl><div className="inspector-booking"><span>Current booking</span><strong>{selectedTable.status === "Reserved" ? "Alvarez · 4 guests · 7:30 PM" : selectedTable.status === "Occupied" ? "Currently seated" : "Open for seating"}</strong></div><button className="assign-table" onClick={() => setSeated(`${selectedTable.id} marked for next guest`)}>Assign a table <ChevronRight /></button>{seated && <motion.p className="seat-confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{seated}</motion.p>}</aside></div></section>
      <section className="host-bottom"><div className="queue-card"><div className="queue-card__title"><div><p>Up next</p><h2>Waiting queue</h2></div><button>View all <ChevronRight /></button></div>{queue.map((guest) => <div className="queue-row" key={guest.number}><strong>{guest.number}</strong><div><b>{guest.name}</b><span>Party of {guest.party}</span></div><div><b>{guest.wait}</b><span>Wait time</span></div><span className="waiting"><i />Waiting</span><button onClick={() => { setSelectedTable(tables.find((table) => table.status === "Available" && table.capacity >= guest.party) ?? tables[0]); setSeated(`${guest.name} is ready to be seated`); }}>Assign</button></div>)}</div><aside className="activity-card"><div className="queue-card__title"><div><p>Moments ago</p><h2>Activity</h2></div></div><ol><li><time>7:12 PM</time><span>Walk-in added to queue<small>Party of 4 · Priya Shah</small></span></li><li><time>7:08 PM</time><span>Table T03 seated<small>Party of 6</small></span></li><li><time>6:59 PM</time><span>Reservation checked in<small>Table T06 · Alvarez</small></span></li></ol><div className="activity-alert"><CircleAlert /> No service issues reported</div></aside></section>
    </section>
  </main>;
}

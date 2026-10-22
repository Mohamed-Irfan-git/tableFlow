"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, fetchFloorAvailability, restaurantId } from "@/lib/api";
import type { TableFloorInfo } from "@/lib/api";

export type FoodItem = { id: number; name: string; detail: string; price_cents: number; available: boolean; category: string; image: string };
type Mode = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
type Line = { item_id: string; name: string; quantity: number; unit_cents: number };
type Order = { id: number; tracking_token: string; status: string; payment_status?: string; order_type: Mode; items: Line[]; total_cents: number; table_number: string | null };
const KEY = "tableflow.order.tracking";
export const ORDERS_KEY = "tableflow.orders.tokens.v1";
function saveOrderToken(token: string) {
  try {
    const old = JSON.parse(window.localStorage.getItem(ORDERS_KEY) || "[]") as unknown;
    const tokens = Array.isArray(old) ? old.filter((value): value is string => typeof value === "string") : [];
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify([token, ...tokens.filter(t => t !== token)].slice(0, 100)));
    window.dispatchEvent(new Event("tableflow-orders-updated"));
  } catch { window.localStorage.setItem(ORDERS_KEY, JSON.stringify([token])); }
}

export function FoodOrder({ items }: { items: FoodItem[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("DINE_IN");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [table, setTable] = useState("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<"CASH" | "CARD_ON_ARRIVAL" | "CARD_ONLINE">("CASH");
  const [available, setAvailable] = useState<TableFloorInfo[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showTrack, setShowTrack] = useState(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [showCart, setShowCart] = useState(false);
  const categories = useMemo(() => ["All", ...Array.from(new Set(items.filter(item => item.available).map(item => item.category.trim() || "Other")))], [items]);
  const visibleItems = items.filter(item => item.available && (category === "All" || (item.category.trim() || "Other") === category) && `${item.name} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()));

  const refresh = async (token: string) => {
    try { setOrder(await apiRequest<Order>(`/orders/track/${encodeURIComponent(token)}`)); }
    catch { /* A removed or expired order can be retried manually. */ }
  };
  useEffect(() => {
    const onOpen = (event: Event) => { const id = (event as CustomEvent<number>).detail; if (typeof id === "number") change(String(id), 1); setOpen(true); setShowTrack(false); };
    window.addEventListener("tableflow-open-order", onOpen);
    const params = new URLSearchParams(window.location.search);
    const qrTable = params.get("table");
    if (qrTable && /^[\w-]{1,16}$/.test(qrTable)) { setMode("DINE_IN"); setTable(qrTable); setOpen(true); }
    if (params.has("order")) setOpen(true);
    const token = window.localStorage.getItem(KEY);
    if (token) { saveOrderToken(token); void refresh(token); }
    return () => window.removeEventListener("tableflow-open-order", onOpen);
  }, []);
  useEffect(() => {
    if (!open || mode !== "DINE_IN") return;
    let live = true;
    // Today's physical availability, not a future reservation slot.
    const load = async () => {
      try {
        const result = await fetchFloorAvailability(new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), "19:00:00", 2);
        const occupied = await apiRequest<{table_numbers: string[]}>(`/orders/occupied-tables?restaurant_id=${restaurantId}`);
        if (live) setAvailable(result.map(t => ({...t, available: t.available && !occupied.table_numbers.includes(t.number)})));
      } catch { if (live) setError("Could not load tables. Please try again."); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [open, mode]);
  useEffect(() => {
    if (!open || !order || order.status === "COMPLETED" || order.status === "CANCELLED") return;
    const id = window.setInterval(() => void refresh(order.tracking_token), 8000);
    return () => window.clearInterval(id);
  }, [open, order]);
  useEffect(() => {
    if (mode === "DINE_IN" && table && available.length && !available.some(t => t.number === table && t.available)) {
      setTable("");
      setError("That table is no longer available. Please select another table.");
    }
  }, [available, mode, table]);
  const quantity = items.filter(i => i.available).reduce((sum, i) => sum + (cart[String(i.id)] || 0), 0);
  const total = items.filter(item => item.available).reduce((sum, item) => sum + (cart[String(item.id)] || 0) * item.price_cents, 0) / 100;
  const change = (id: string, delta: number) => setCart((prev) => ({ ...prev, [id]: Math.max(0, Math.min(30, (prev[id] || 0) + delta)) }));
  const place = async () => {
    setError("");
    if (name.trim().length < 2 || !quantity || (mode === "DINE_IN" && !table) || (mode === "DELIVERY" && !address.trim())) {
      setError("Enter your name, add a dish, and complete the required delivery or table details."); return;
    }
    setBusy(true);
    try {
      const created = await apiRequest<Order>("/orders", { method: "POST", body: JSON.stringify({
        restaurant_id: restaurantId, customer_name: name.trim(), order_type: mode,
        table_number: mode === "DINE_IN" ? table : null,
        delivery_address: mode === "DELIVERY" ? address.trim() : null,
        payment_method: payment,
        items: items.filter((i) => i.available && cart[String(i.id)]).map((i) => ({ item_id: i.id, quantity: cart[String(i.id)] })),
      }) });
      setOrder(created); window.localStorage.setItem(KEY, created.tracking_token); saveOrderToken(created.tracking_token);
      setCart({}); setShowTrack(true);
      if (payment === "CARD_ONLINE") {
        const session = await apiRequest<{ checkout_url: string }>(`/orders/${created.id}/checkout`, { method: "POST", body: JSON.stringify({ tracking_token: created.tracking_token }) });
        window.location.assign(session.checkout_url);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Order could not be placed."); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!order || !window.confirm("Cancel this order?")) return;
    setBusy(true); setError("");
    try { const next = await apiRequest<Order>(`/orders/track/${encodeURIComponent(order.tracking_token)}/cancel`, { method: "POST" }); setOrder(next); }
    catch (err) { setError(err instanceof Error ? err.message : "Cannot cancel this order."); }
    finally { setBusy(false); }
  };
  return <>
    <div className="food-order-actions">
      <button onClick={() => { setOpen(true); setShowTrack(false); }}>Order food {quantity ? `(${quantity})` : ""} →</button>
      <Link href="/orders" className="tf-my-orders-link">My orders <span aria-hidden="true">↗</span></Link>
    </div>
    {open && <div className="food-order-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="food-order-dialog" role="dialog" aria-modal="true" aria-label="Food ordering">
        <div className="food-order-top"><span className="section-mark">TABLEFLOW · ORDERING</span><button onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
        <h2>{showTrack && order ? `Order #${order.id}` : "Order at your pace."}</h2>
        {showTrack && order ? <div className="food-order-track">
          <p>Your order status</p><strong>{order.status.replaceAll("_", " ")}</strong>
          <p>{order.order_type.replaceAll("_", " ")} {order.table_number ? `· Table ${order.table_number}` : ""}</p>
          <p>{order.items.map((line) => `${line.quantity} × ${line.name}`).join(" · ")}</p>
          <p>Total: ${(order.total_cents / 100).toFixed(2)}</p>
          <p>Payment status: {order.payment_status || "UNPAID"}</p>
          {order.order_type === "DELIVERY" && <div className="tf-delivery-progress"><p>Delivery progress</p>{["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"].map((step, index, list) => <div key={step} className={list.indexOf(order.status) >= index ? "reached" : ""}>● {step.replaceAll("_", " ")}</div>)}<small>Live rider GPS is not enabled. Your restaurant updates each delivery stage.</small></div>}
          <p>Your order updates automatically every few seconds.</p>
          {(["PLACED", "CONFIRMED"].includes(order.status)) && <button className="food-order-secondary" disabled={busy} onClick={cancel}>Cancel order</button>}
          <button onClick={() => setShowTrack(false)}>Create another order</button>
        </div> : <>
          <div className="food-order-modes">{(["DINE_IN", "TAKEAWAY", "DELIVERY"] as Mode[]).map((m) => <button className={mode === m ? "selected" : ""} onClick={() => { setMode(m); setError(""); }} key={m}>{m === "DINE_IN" ? "Dine-in" : m === "TAKEAWAY" ? "Takeaway" : "Delivery"}</button>)}</div>
          <label>Your name<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Name for your order" /></label>
          {mode === "DINE_IN" && <label>Available table<select value={table} onChange={(e) => setTable(e.target.value)}><option value="">Select a table</option>{available.filter(t => t.available).map((t) => <option key={t.id} value={t.number}>{t.number} · {t.capacity} seats</option>)}</select></label>}
          {mode === "DELIVERY" && <label>Delivery address<textarea value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} placeholder="Street, town and delivery instructions" /></label>}
          <div className="tf-shop-heading"><div><span className="section-mark">EXPLORE THE MENU</span><h3>What would you like?</h3></div><span>{items.filter(i => i.available).length} dishes</span></div>
          <div className="tf-shop-search"><span aria-hidden="true">⌕</span><input aria-label="Search dishes" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search dishes, ingredients…" /></div>
          <div className="tf-shop-categories" role="group" aria-label="Menu categories">{categories.map(c => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>
          <div className="tf-shop-grid">{visibleItems.map(item => <article className="tf-shop-dish" key={item.id}>
            <div className="tf-shop-photo">{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <span aria-hidden="true">✦</span>}</div>
            <div className="tf-shop-copy"><span className="tf-shop-category">{item.category || "Other"}</span><strong>{item.name}</strong><small>{item.detail || "Freshly prepared"}</small><div className="tf-shop-item-bottom"><b>${(item.price_cents / 100).toFixed(2)}</b><div className="food-order-qty">{cart[String(item.id)] ? <><button aria-label={`Remove ${item.name}`} onClick={() => change(String(item.id), -1)}>−</button><span>{cart[String(item.id)]}</span></> : null}<button aria-label={`Add ${item.name}`} onClick={() => change(String(item.id), 1)}>{cart[String(item.id)] ? "+" : "+ Add"}</button></div></div></div>
          </article>)}</div>
          {visibleItems.length === 0 && <p className="tf-shop-empty">No dishes match this selection. Try another category or search.</p>}
          <button className="tf-cart-toggle" onClick={() => setShowCart(v => !v)} aria-expanded={showCart}>🛒 Your cart <span>{quantity} items · ${total.toFixed(2)} {showCart ? "⌃" : "⌄"}</span></button>
          {showCart && <div className="tf-cart-review">{items.filter(i => i.available && cart[String(i.id)]).map(i => <div key={i.id}><span>{cart[String(i.id)]} × {i.name}</span><strong>${((cart[String(i.id)] || 0) * i.price_cents / 100).toFixed(2)}</strong></div>)}{quantity === 0 && <p>Choose a dish to start your order.</p>}</div>}
          <label>Payment method<select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}><option value="CASH">{mode === "TAKEAWAY" ? "Cash on collection" : mode === "DELIVERY" ? "Cash on delivery" : "Cash at restaurant"}</option><option value="CARD_ON_ARRIVAL">{mode === "TAKEAWAY" ? "Card on collection" : mode === "DELIVERY" ? "Card to rider (if supported)" : "Card at restaurant"}</option><option value="CARD_ONLINE">Pay now by card (secure Stripe checkout)</option></select></label>
          {payment === "CARD_ONLINE" && <div className="tf-card-notice"><strong>Secure card payment</strong><p>After clicking Place order, Stripe opens a protected checkout to enter your card number, expiry date and CVC. Stripe validates the details. TableFlow never collects or stores your card number.</p><small>Requires Stripe keys configured by the restaurant. Your order remains unpaid until payment is confirmed.</small></div>}
          <div className="food-order-total"><span>{quantity} items</span><strong>${total.toFixed(2)}</strong></div>
          {error && <p className="food-order-error" role="alert">{error}</p>}
          <button className="food-order-submit" disabled={busy || quantity === 0} onClick={() => void place()}>{busy ? "Placing…" : "Place order"} →</button>
        </>}
      </section>
    </div>}
  </>;
}

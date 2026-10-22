"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";

type Order = { id:number; tracking_token:string; status:string; payment_status:string; order_type:string; table_number:string|null; items:{name:string;quantity:number}[]; total_cents:number; created_at:string|null; payment_method:string };
const STORAGE = "tableflow.orders.tokens.v1";
const OLD = "tableflow.order.tracking";
export default function MyOrders() {
 const [orders,setOrders] = useState<Order[]>([]);
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState("");
 const load = async () => {
  let tokens:string[] = [];
  try {const saved:unknown = JSON.parse(localStorage.getItem(STORAGE) || "[]"); if(Array.isArray(saved)) tokens = saved.filter((s):s is string => typeof s === "string");} catch {}
  const legacy = localStorage.getItem(OLD);
  if (legacy && !tokens.includes(legacy)) tokens.unshift(legacy);
  const results = await Promise.allSettled(tokens.map(t => apiRequest<Order>(`/orders/track/${encodeURIComponent(t)}`)));
  setOrders(results.filter((r):r is PromiseFulfilledResult<Order> => r.status === "fulfilled").map(r => r.value).sort((a,b) => b.id-a.id));
  setLoading(false);
 };
 useEffect(() => {void load(); const t = window.setInterval(() => void load(),10000); const onFocus = () => void load(); window.addEventListener("focus", onFocus); return () => {clearInterval(t);window.removeEventListener("focus",onFocus)};},[]);
 const retryPayment = async (o:Order) => {
  setError("");
  try {const session = await apiRequest<{checkout_url:string}>(`/orders/${o.id}/checkout`,{method:"POST",body:JSON.stringify({tracking_token:o.tracking_token})});window.location.assign(session.checkout_url);}
  catch(e){setError(e instanceof Error ? e.message : "Payment is unavailable");}
 };
 const cancel = async(o:Order) => {
  if (!confirm(`Cancel order #${o.id}?`)) return;
  setError("");
  try {await apiRequest(`/orders/track/${encodeURIComponent(o.tracking_token)}/cancel`,{method:"POST"}); await load();}
  catch(e) {setError(e instanceof Error ? e.message : "Cancellation failed");}
 };
 return <main className="tf-orders-page"><div className="tf-orders-shell"><Link href="/menu" className="tf-full-menu-back">← Back to menu</Link><p className="section-mark">TABLEFLOW · YOUR ORDERS</p><h1>My orders.</h1><p>Track every order placed in this browser. Updates refresh automatically.</p>
 {error && <p role="alert" className="food-order-error">{error}</p>}
 {loading ? <p>Loading your orders…</p> : orders.length === 0 ? <div className="tf-order-history-card"><h2>No orders on this device yet.</h2><p>Orders appear here once you place them.</p><Link href="/menu">Explore menu →</Link></div> : <div className="tf-order-history-list">{orders.map(o => <article className="tf-order-history-card" key={o.id}><div className="tf-order-history-title"><h2>Order #{o.id}</h2><span className="tf-order-pill">{o.status.replaceAll("_"," ")}</span></div><p>{o.order_type.replaceAll("_"," ")}{o.table_number ? ` · Table ${o.table_number}` : ""}{o.created_at ? ` · ${new Date(o.created_at).toLocaleString()}` : ""}</p><p>{o.items.map(i=>`${i.quantity} × ${i.name}`).join(" · ")}</p><div className="tf-order-history-foot"><strong>${(o.total_cents/100).toFixed(2)}</strong><span>Payment: {o.payment_status || "UNPAID"}</span>{o.payment_method === "CARD_ONLINE" && o.payment_status !== "PAID" && o.status !== "CANCELLED" && <button onClick={()=>void retryPayment(o)}>Pay securely by card ↗</button>}{["PLACED","CONFIRMED"].includes(o.status) && o.payment_status !== "PAID" && <button onClick={()=>void cancel(o)}>Cancel order</button>}</div>{o.order_type === "DELIVERY" && <div className="tf-order-status-path">{["PLACED","CONFIRMED","PREPARING","READY","OUT_FOR_DELIVERY","COMPLETED"].map((step,index,list)=><span key={step} className={list.indexOf(o.status)>=index ? "reached" : ""}>{step.replaceAll("_"," ")}</span>)}<small>Delivery status updates from restaurant; GPS rider location is not available.</small></div>}</article>)}</div>}
 <p className="tf-order-history-note">For privacy, this page shows orders stored in this browser only. Clearing browser data or using a different device may hide previous orders.</p></div></main>;
}

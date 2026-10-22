"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiBaseUrl, apiRequest, restaurantId } from "@/lib/api";
import { FoodOrder } from "@/components/site/food-order";

type Dish = { id: number; name: string; detail: string; category: string; image: string; price_cents: number; available: boolean };
export default function FullMenuPage() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [category, setCategory] = useState("All");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const data = await apiRequest<Dish[]>(`/menu?restaurant_id=${restaurantId}`); if (active) setDishes(data); }
      catch { if (active) setError("Unable to load the menu. Please refresh and try again."); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const available = dishes.filter(d => d.available);
  const shown = category === "All" ? available : available.filter(d => d.category === category);
  const openDish = (id: number) => window.dispatchEvent(new CustomEvent("tableflow-open-order", { detail: id }));
  return <main className="tf-full-menu-page">
    <header className="tf-full-menu-header shell">
      <Link href="/" className="tf-full-menu-back">← Back to TableFlow</Link>
      <p className="section-mark">TABLEFLOW · SEASONAL DINING</p>
      <h1>Explore our menu.</h1>
      <p>Every dish, beautifully prepared. Choose your favorites and order at your pace.</p>
    </header>
    <section className="menu-section" aria-label="Full food menu"><div className="shell">
      <div className="menu-filter" aria-label="Menu categories">
        {["All", ...Array.from(new Set(available.map(d => d.category)))].map(c =>
          <button key={c} onClick={() => setCategory(c)} className={category === c ? "is-active" : ""}>{c}</button>)}
      </div>
      {error && <p role="alert">{error}</p>}
      {shown.length === 0 && !error && <p>No dishes in this category yet.</p>}
      <div className="dish-grid">{shown.map((dish, index) => <article key={dish.id} className="dish-card">
        <div className="dish-card__media"><Image className="dish-card__photo" src={dish.image.startsWith("/api/v1/") ? `${apiBaseUrl.replace(/\/api\/v1$/, "")}${dish.image}` : dish.image} alt={dish.name} fill unoptimized sizes="(max-width: 590px) 100vw, (max-width: 900px) 50vw, 33vw" /><span className="dish-card__count">{String(index + 1).padStart(2,"0")}</span></div>
        <div className="dish-card__body"><div><h3>{dish.name}</h3><p>{dish.detail}</p></div><div className="dish-card__bottom"><strong>${(dish.price_cents/100).toFixed(2)}</strong><button aria-label={`Add ${dish.name} to order`} onClick={() => openDish(dish.id)}>→</button></div></div>
      </article>)}</div>
    </div></section>
    <div className="shell"><FoodOrder items={dishes} /></div>
  </main>;
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Menu,
  Minus,
  Phone,
  Plus,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

gsap.registerPlugin(ScrollTrigger);

const menuItems = [
  { name: "Ember-roasted scallop", detail: "Brown butter · sea herbs · smoked leek", price: "$28", tone: "scallop", category: "Small plates", image: "/images/dish-scallop.png" },
  { name: "Black garlic pappardelle", detail: "Wild mushroom · aged parmesan · pepper leaf", price: "$32", tone: "pasta", category: "Mains", image: "/images/dish-pasta.png" },
  { name: "Pistachio mille-feuille", detail: "Lemon verbena · salted caramel · late berries", price: "$18", tone: "dessert", category: "Dessert", image: "/images/dish-dessert.png" },
];

const times = ["5:30 PM", "7:00 PM", "8:30 PM"];

function Monogram({ inverse = false }: { inverse?: boolean }) {
  return <span className={`monogram ${inverse ? "monogram--inverse" : ""}`}>TF</span>;
}

function MagneticButton({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <button className={`gold-button ${className}`} onClick={onClick} onMouseMove={(event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    gsap.to(target, { x: (event.clientX - rect.left - rect.width / 2) * 0.08, y: (event.clientY - rect.top - rect.height / 2) * 0.1, duration: 0.24 });
  }} onMouseLeave={(event) => gsap.to(event.currentTarget, { x: 0, y: 0, duration: 0.55, ease: "power3.out" })}>{children}</button>;
}

export function DiningHome() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState("7:00 PM");
  const [guestCount, setGuestCount] = useState(2);
  const [activeCategory, setActiveCategory] = useState("All");
  const [reservationMade, setReservationMade] = useState(false);

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline.from(".site-header", { y: -20, opacity: 0, duration: 0.7 }).from(".hero__copy > *", { y: 42, opacity: 0, duration: 0.9, stagger: 0.14 }, "-=0.35").from(".availability-card", { y: 30, opacity: 0, duration: 0.85 }, "-=0.55").from(".hero__scroll-cue", { opacity: 0, duration: 0.5 }, "-=0.2");
      gsap.utils.toArray<HTMLElement>(".reveal-up").forEach((element) => gsap.from(element, { y: 42, opacity: 0, duration: 0.95, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 84%" } }));
      gsap.utils.toArray<HTMLElement>(".image-mask").forEach((element) => gsap.fromTo(element, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 1.15, ease: "power4.inOut", scrollTrigger: { trigger: element, start: "top 80%" } }));
      gsap.to(".hero__image", { yPercent: 12, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    }, pageRef);
    return () => context.revert();
  }, []);

  const filteredItems = activeCategory === "All" ? menuItems : menuItems.filter((item) => item.category === activeCategory);
  const openReservation = () => { setReservationMade(false); setSheetOpen(true); };

  return <main ref={pageRef} className="dining-site">
    <section className="hero" id="experience">
      <Image className="hero__image" src="/images/tableflow-hero.png" alt="Candlelit TableFlow dining room" fill priority sizes="100vw" />
      <div className="hero__shade" />
      <header className="site-header shell"><a className="brand" href="#experience" aria-label="TableFlow home"><Monogram inverse /><span>TableFlow</span></a><nav className="desktop-nav" aria-label="Primary navigation"><a href="#experience">Experience</a><a href="#menu">Menu</a><a href="#reservations">Reservations</a><a href="#visit">Visit</a></nav><button className="nav-reserve" onClick={openReservation}>Reserve a table</button><button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu /></button></header>
      <div className="shell hero__content"><div className="hero__copy"><p className="hero__kicker">An evening of intention</p><h1>A table, timed<br />to perfection.</h1><p className="hero__lede">TableFlow coordinates every arrival with the ease of true hospitality.</p><MagneticButton onClick={openReservation}>Reserve a table <ArrowRight aria-hidden="true" /></MagneticButton></div><div className="availability-card" aria-label="Reservation availability"><div className="availability-card__top"><span>Find your moment</span><CalendarDays aria-hidden="true" /></div><div className="booking-fields"><button className="booking-field"><span>Date</span><strong>Fri, 25 Apr</strong><ChevronDown /></button><button className="booking-field"><span>Guests</span><strong>{guestCount}</strong><ChevronDown /></button></div><div className="time-label">One-hour arrival windows</div><div className="time-options">{times.map((time) => <button key={time} onClick={() => setSelectedTime(time)} className={`time-option ${selectedTime === time ? "is-selected" : ""}`}><strong>{time}</strong><span>{time === "8:30 PM" ? "Limited" : "Available"}</span></button>)}</div></div></div>
      <a className="hero__scroll-cue" href="#story">Scroll to explore <ArrowDownRight aria-hidden="true" /></a>
    </section>

    <section id="story" className="story-section shell"><div className="story-copy reveal-up"><p className="section-mark">Our kitchen</p><h2>The evening begins<br />before the first course.</h2><p>Long before the room fills, seasonal ingredients and considered techniques begin to shape an experience designed to unfold at your pace.</p><a href="#menu" className="text-link">Meet the menu <ArrowRight aria-hidden="true" /></a></div><div className="story-media image-mask"><Image src="/images/tableflow-chef.png" alt="Chef finishing a dish in the TableFlow kitchen" fill sizes="(max-width: 900px) 100vw, 42vw" /></div></section>

    <section id="menu" className="menu-section"><div className="shell"><div className="menu-heading reveal-up"><div><p className="section-mark">Seasonal menu</p><h2>Made for the<br />unhurried table.</h2></div><p>Distinctive, seasonal dishes with one simple purpose: leave room for the conversation.</p></div><div className="menu-filter" aria-label="Menu categories">{["All", "Small plates", "Mains", "Dessert"].map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={activeCategory === category ? "is-active" : ""}>{category}</button>)}</div><div className="dish-grid">{filteredItems.map((item, index) => <article className={`dish-card dish-card--${item.tone} reveal-up`} key={item.name} style={{ transitionDelay: `${index * 70}ms` }}><div className="dish-card__media"><Image className="dish-card__photo" src={item.image} alt={item.name} fill sizes="(max-width: 590px) 100vw, (max-width: 900px) 50vw, 33vw" /><span className="dish-card__count">0{index + 1}</span></div><div className="dish-card__body"><div><h3>{item.name}</h3><p>{item.detail}</p></div><div className="dish-card__bottom"><strong>{item.price}</strong><button aria-label={`View ${item.name}`}><ArrowRight /></button></div></div></article>)}</div></div></section>

    <section id="reservations" className="reservation-section"><div className="reservation-image image-mask"><Image src="/images/tableflow-hero.png" alt="An intimate TableFlow dining setting" fill sizes="(max-width: 900px) 100vw, 50vw" /></div><div className="reservation-panel"><div className="reservation-panel__inner reveal-up"><p className="section-mark">Reservations</p><h2>Your table is<br />waiting.</h2><p>Choose a one-hour arrival window, then let our team make the rest feel effortless.</p><div className="stepper" aria-label="Reservation steps"><span className="is-current">1<small>Date</small></span><i /><span>2<small>Guests</small></span><i /><span>3<small>Time</small></span><i /><span>4<small>Table</small></span></div><div className="reservation-preview"><div><span>Friday, 25 Apr</span><strong>{guestCount} guests · {selectedTime}</strong></div><button onClick={() => setGuestCount((count) => Math.max(1, count - 1))} aria-label="Decrease guest count"><Minus /></button><button onClick={() => setGuestCount((count) => Math.min(12, count + 1))} aria-label="Increase guest count"><Plus /></button></div><MagneticButton onClick={openReservation} className="reservation-cta">Start your reservation <ArrowRight /></MagneticButton></div></div></section>

    <section id="visit" className="visit-section shell"><div className="visit-intro reveal-up"><p className="section-mark">Find us</p><h2>Come in from<br />the city.</h2><p>A quieter corner, a warmer table. We are open for the moments that deserve the long way home.</p></div><div className="visit-details reveal-up"><div><Clock3 /><span>Opening hours</span><strong>Mon–Thu · 5:00–10:00<br />Fri–Sat · 5:00–11:00<br />Sun · 5:00–9:00</strong></div><div><MapPin /><span>The Meridian</span><strong>123 Kensington Road<br />London W8 5QY</strong><a href="https://maps.google.com" target="_blank" rel="noreferrer">Get directions <ArrowRight /></a></div><div><Phone /><span>Reservations</span><strong>+44 20 7946 0123</strong><a href="https://wa.me/442079460123" target="_blank" rel="noreferrer">WhatsApp <ArrowRight /></a></div></div></section>
    <footer className="site-footer"><div className="shell"><div className="footer-brand"><Monogram inverse /><span>TableFlow</span></div><p>Thoughtful service, from the first click to the final pour.</p><nav><a href="#reservations">Reservations</a><a href="#menu">Menu</a><Link href="/host">Host desk</Link></nav></div></footer>

    <AnimatePresence>{mobileMenu && <motion.div className="mobile-nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X /></button><Monogram inverse /><a onClick={() => setMobileMenu(false)} href="#experience">Experience</a><a onClick={() => setMobileMenu(false)} href="#menu">Menu</a><a onClick={() => setMobileMenu(false)} href="#reservations">Reservations</a><a onClick={() => setMobileMenu(false)} href="#visit">Visit</a><MagneticButton onClick={() => { setMobileMenu(false); openReservation(); }}>Reserve a table <ArrowRight /></MagneticButton></motion.div>}</AnimatePresence>
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}><SheetContent side="right" className="reservation-sheet"><SheetHeader><SheetTitle>{reservationMade ? "Your table is held." : "Complete your reservation"}</SheetTitle><SheetDescription>{reservationMade ? "We will send confirmation details to your email shortly." : "This one-minute reservation holds a one-hour arrival window."}</SheetDescription></SheetHeader>{reservationMade ? <motion.div className="reservation-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}><span><Check /></span><h3>Friday, 25 April<br />{selectedTime}</h3><p>{guestCount} guests · Table 4</p><button className="sheet-action" onClick={() => setSheetOpen(false)}>Done</button></motion.div> : <div className="sheet-form"><label><span>Date</span><button>Friday, 25 April <ChevronDown /></button></label><label><span>Guests</span><button>{guestCount} guests <ChevronDown /></button></label><label><span>Arrival time</span><div className="sheet-times">{times.map((time) => <button key={time} onClick={() => setSelectedTime(time)} className={selectedTime === time ? "selected" : ""}>{time}</button>)}</div></label><div className="table-choice"><span>Suggested table</span><strong>Table 4 · Semi-private · 2–4 guests</strong></div><button className="sheet-action" onClick={() => setReservationMade(true)}>Confirm reservation <ArrowRight /></button></div>}</SheetContent></Sheet>
  </main>;
}

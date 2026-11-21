"use client";
import { enV, hiV } from "./i18n-visitor";
import { hiStaff } from "./i18n-staff";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "hi";
const en = {
  "nav.destinations": "Destinations", "nav.plan": "Plan a visit", "nav.crowd": "Crowd status", "nav.about": "About", "nav.contact": "Contact",
  "nav.signin": "Sign in", "nav.register": "Create account", "nav.account": "My account", "nav.signout": "Sign out", "nav.lang": "हिन्दी",
  "hero.title": "Walk into history, not a queue.", "hero.sub": "Book timed tickets for India's heritage sites and see how busy each hour is expected to be before you leave your hotel.",
  "hero.placeholder": "Search Taj Mahal, Jaipur, museums", "hero.search": "Search", "hero.quiet": "Quieter today",
  "level.low": "Low", "level.moderate": "Moderate", "level.high": "High", "level.very_high": "Very High",
  "land.see": "See the day before you go", "land.how": "From search to gate in four steps", "land.featured": "Featured destinations", "land.all": "See all destinations",
  "land.cta": "Pick your hour. Skip the queue.", "land.create": "Create free account", "land.browse": "Browse destinations", "land.plan": "Plan my day",
  "book.title": "Book tickets", "book.date": "Visit date", "book.slot": "Time slot", "book.tickets": "Tickets", "book.visitors": "Visitor details", "book.continue": "Continue to payment",
  "book.total": "Total", "book.left": "left", "book.soldout": "Sold out", "book.closed": "Closed", "book.ended": "Ended", "book.notify": "Notify me",
  "pay.title": "Complete your payment", "pay.button": "Pay", "pay.release": "Release seats",
  "card.from": "From", "card.quietest": "Quietest", "card.closed": "Closed on this date",
  "d.overview": "Overview", "d.bookings": "Bookings", "d.tickets": "Tickets", "d.profile": "Profile", "d.trips": "Your trips",
  "d.today": "Today", "d.scan": "Scan tickets", "d.passes": "Passes", "d.groups": "Group requests", "d.parking": "Parking", "d.devices": "Gate devices", "d.operators": "Operators", "d.operator": "Operator", "d.mypasses": "My passes", "d.counter": "Counter sales", "d.settlements": "Settlements and GST", "d.occupancy": "Occupancy", "d.staff": "Site staff",
  "d.destinations": "Destinations", "d.slots": "Slots and capacity", "d.crowd": "Crowd", "d.users": "Users and staff", "d.reports": "Reports", "d.audit": "Audit log", "d.settings": "Settings", "d.admin": "Administration",
  "d.public": "Public site", "d.signout": "Sign out", "d.security": "Security", "d.privacy": "Your data", "d.reconcile": "UPI reconciliation", "d.einvoice": "E-invoices",
  "staff.today": "Today at your sites", "staff.report": "Report an issue", "staff.inside": "Inside now", "staff.checkedin": "checked in today",
  "scan.title": "Scan tickets", "scan.placeholder": "Scan QR or type reference e.g. HH-ABCD-2345", "scan.verify": "Verify", "scan.checkin": "Check in", "scan.checkout": "Check out",
  "scan.valid": "Valid ticket", "scan.inside": "Visitors are inside", "scan.invalid": "Not valid for entry", "scan.people": "People", "scan.camera": "Scan with camera",
  "occ.title": "Live occupancy",
  "adm.overview": "Overview", "adm.dest": "Active destinations", "adm.visits": "Visits booked today", "adm.checkedin": "Checked in now", "adm.capacity": "Capacity left today", "adm.revenue": "Net revenue (14 days)", "adm.cancel": "Cancellation rate", "adm.alerts": "Alerts",
  "d.lookup": "Visitor lookup", "d.shift": "Shift and cash", "d.incidents": "Incidents", "d.live": "Live command", "d.announce": "Announcements", "d.myparking": "Book parking", "d.alerts": "Alerts", "d.passport": "Heritage passport", "d.payments": "Payments", "d.reviews": "My reviews", "d.staffact": "Staff activity",
 "d.handover": "Shift handover", "d.lostfound": "Lost and found", "d.roster": "Roster", "d.attendance": "Attendance", "d.pricing": "Peak pricing", "d.support": "Support", "d.loyalty": "Loyalty points", "d.tickets2": "Ticket transfers",
  ...enV,
} as const;
type Key = keyof typeof en;
const hi: Record<Key, string> = {
  ...hiV,
  "nav.destinations": "गंतव्य", "nav.plan": "यात्रा की योजना", "nav.crowd": "भीड़ की स्थिति", "nav.about": "हमारे बारे में", "nav.contact": "संपर्क",
  "nav.signin": "साइन इन", "nav.register": "खाता बनाएँ", "nav.account": "मेरा खाता", "nav.signout": "साइन आउट", "nav.lang": "English",
  "hero.title": "इतिहास में प्रवेश करें, कतार में नहीं।", "hero.sub": "भारत के विरासत स्थलों के लिए समय-निर्धारित टिकट बुक करें और घर से निकलने से पहले देखें कि हर घंटे कितनी भीड़ रहने की संभावना है।",
  "hero.placeholder": "ताज महल, जयपुर, संग्रहालय खोजें", "hero.search": "खोजें", "hero.quiet": "आज कम भीड़",
  "level.low": "कम", "level.moderate": "मध्यम", "level.high": "अधिक", "level.very_high": "बहुत अधिक",
  "land.see": "जाने से पहले पूरा दिन देखें", "land.how": "खोज से प्रवेश द्वार तक, चार चरणों में", "land.featured": "प्रमुख गंतव्य", "land.all": "सभी गंतव्य देखें",
  "land.cta": "अपना समय चुनें। कतार से बचें।", "land.create": "मुफ़्त खाता बनाएँ", "land.browse": "गंतव्य देखें", "land.plan": "मेरा दिन तय करें",
  "book.title": "टिकट बुक करें", "book.date": "यात्रा की तारीख़", "book.slot": "समय स्लॉट", "book.tickets": "टिकट", "book.visitors": "आगंतुकों का विवरण", "book.continue": "भुगतान के लिए आगे बढ़ें",
  "book.total": "कुल", "book.left": "शेष", "book.soldout": "पूरी तरह बुक", "book.closed": "बंद", "book.ended": "समाप्त", "book.notify": "मुझे सूचित करें",
  "pay.title": "अपना भुगतान पूरा करें", "pay.button": "भुगतान करें", "pay.release": "सीटें छोड़ें",
  "card.from": "शुरुआत", "card.quietest": "सबसे शांत", "card.closed": "इस तारीख़ को बंद",
  "d.overview": "अवलोकन", "d.bookings": "बुकिंग", "d.tickets": "टिकट", "d.profile": "प्रोफ़ाइल", "d.trips": "आपकी यात्राएँ",
  "d.today": "आज", "d.scan": "टिकट स्कैन करें", "d.passes": "पास", "d.groups": "समूह अनुरोध", "d.parking": "पार्किंग", "d.devices": "गेट उपकरण", "d.operators": "संचालक", "d.operator": "संचालक", "d.mypasses": "मेरे पास", "d.counter": "काउंटर बिक्री", "d.settlements": "निपटान और GST", "d.occupancy": "अंदर मौजूद लोग", "d.staff": "साइट स्टाफ़",
  "d.destinations": "गंतव्य", "d.slots": "स्लॉट और क्षमता", "d.crowd": "भीड़", "d.users": "उपयोगकर्ता और स्टाफ़", "d.reports": "रिपोर्ट", "d.audit": "ऑडिट लॉग", "d.settings": "सेटिंग्स", "d.admin": "प्रशासन",
  "d.public": "सार्वजनिक साइट", "d.signout": "साइन आउट", "d.security": "सुरक्षा", "d.privacy": "आपका डेटा", "d.reconcile": "UPI मिलान", "d.einvoice": "ई-इनवॉइस",
  "staff.today": "आज आपके स्थलों पर", "staff.report": "समस्या दर्ज करें", "staff.inside": "अभी अंदर", "staff.checkedin": "आज चेक-इन हुए",
  "scan.title": "टिकट स्कैन करें", "scan.placeholder": "QR स्कैन करें या संदर्भ लिखें, जैसे HH-ABCD-2345", "scan.verify": "जाँचें", "scan.checkin": "प्रवेश दर्ज करें", "scan.checkout": "निकास दर्ज करें",
  "scan.valid": "मान्य टिकट", "scan.inside": "आगंतुक अंदर हैं", "scan.invalid": "प्रवेश के लिए मान्य नहीं", "scan.people": "लोग", "scan.camera": "कैमरे से स्कैन करें",
  "occ.title": "लाइव उपस्थिति",
  "adm.overview": "अवलोकन", "adm.dest": "सक्रिय गंतव्य", "adm.visits": "आज की बुकिंग", "adm.checkedin": "अभी अंदर", "adm.capacity": "आज बची क्षमता", "adm.revenue": "शुद्ध आय (14 दिन)", "adm.cancel": "रद्दीकरण दर", "adm.alerts": "अलर्ट",
  "d.lookup": "आगंतुक खोज", "d.shift": "शिफ्ट और नकद", "d.incidents": "घटनाएँ", "d.live": "लाइव कमांड", "d.announce": "घोषणाएँ", "d.myparking": "पार्किंग बुक करें", "d.alerts": "अलर्ट", "d.passport": "विरासत पासपोर्ट", "d.payments": "भुगतान", "d.reviews": "मेरी समीक्षाएँ", "d.staffact": "स्टाफ़ गतिविधि",
 "d.handover": "शिफ्ट हैंडओवर", "d.lostfound": "खोया-पाया", "d.roster": "रोस्टर", "d.attendance": "उपस्थिति", "d.pricing": "पीक मूल्य", "d.support": "सहायता", "d.loyalty": "लॉयल्टी पॉइंट", "d.tickets2": "टिकट ट्रांसफर",
};
const DICT = { en, hi } as const;

type Vars = Record<string, string | number>;
/** Fills {name} placeholders. */
export const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, v?: Vars) => string };
const I18n = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k, v) => fill(en[k], v) });
export const useI18n = () => useContext(I18n);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setL] = useState<Lang>("en");
  useEffect(() => { const m = document.cookie.match(/(?:^|; )hh_lang=(en|hi)/); if (m) setL(m[1] as Lang); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { document.cookie = `hh_lang=${l}; path=/; max-age=31536000; samesite=lax`; setL(l); }, []);
  const t = useCallback((k: Key, v?: Vars) => fill(DICT[lang][k] ?? en[k], v), [lang]);
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
}

/** Translates a staff-screen string written in English. Shows English when the language is English or no Hindi entry exists. */
export function useTx() {
  const { lang } = useI18n();
  return useCallback((s: string, v?: Vars) => fill(lang === "hi" ? hiStaff[s] ?? s : s, v), [lang]);
}

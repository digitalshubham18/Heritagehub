# Data verification checklist

Everything seeded by `scripts/seed.ts` is **sample data**. Before showing the app to the public, have each item below confirmed by the managing authority or an authoritative source and update it in the admin panel (or the seed file).

| Item | Seeded as | Verify against |
|---|---|---|
| Ticket prices (Indian / foreign / special-entry fees) | Indicative rates, rounded | The managing authority's current published rate card (for ASI sites, the Archaeological Survey of India or its authorised ticketing channel) |
| Opening hours and weekly closed days | Typical hours (e.g. Taj Mahal closed Fridays, Red Fort and National Museum closed Mondays) | Official site page or circle office notice; seasonal and festival changes |
| Closures and holidays | None except fixed national holidays in the crowd model | Official closure notices |
| History and significance text | Short summaries; UNESCO inscription years | UNESCO World Heritage List (whc.unesco.org) and the site's official documentation |
| Coordinates and addresses | Approximate | Check pins on OpenStreetMap against the real entrance, not the centroid |
| Photos | Wikimedia Commons file names (may not resolve) | Confirm each file's licence and attribution on its Commons page, or replace with images you have rights to |
| Slot capacity, max-inside limits, average daily visitors | Invented demo numbers | Safety/fire capacity limits and visitor statistics from the site manager |
| Cancellation and refund rules | 24 h free, 50% late, closed at 2 h | The authority's refund policy and applicable consumer rules |
| Convenience fee (2%) and GST on the fee (18%) | Demo values in `src/lib/pricing.ts` | Your actual fee model and an accountant's advice on tax treatment |
| Cultural events | Indicative months | Organisers' announcements |
| Hindi UI strings | Written without native review | A native Hindi speaker |
| Invoice format, seller details, SAC code, GST treatment of the convenience fee, credit notes for refunds | Prototype layout; no credit notes | A chartered accountant / GST practitioner |
| Settlement terms (what is payable to the operator and when, platform commission) | Ticket value payable, fee kept by platform | Your contract with each managing authority |
| Operators, legal names, GSTINs, commission percentages | Fictional demo operators; 2 to 3% commission | Your agreements with each managing authority |
| Parking capacities and rates | Invented demo numbers | Site manager and the local authority's approved tariff |
| Season pass products and prices | Invented demo passes | The managing authority's actual pass schemes |
| Group and school concessions | Set by the manager per request (demo suggests 50% for schools) | The authority's published concession rules |
| Demo gate device key and demo accounts | Public in the README | Delete before any real deployment |

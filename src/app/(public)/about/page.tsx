export const metadata = { title: "About" };
export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl">About HeritageHub</h1>
      <div className="mt-6 space-y-4 leading-relaxed">
        <p>HeritageHub is an independent prototype of a smart ticketing and visitor-flow platform for heritage sites. It lets visitors choose a destination, pick a time slot, and see how busy that slot is expected to be, while giving site teams tools to manage capacity and entry.</p>
        <h2 className="pt-4 text-2xl">How crowd forecasts work</h2>
        <p>Each forecast starts from a site's typical daily visitors, adjusted for the season, the day of the week and public holidays, then shared across opening hours using a typical visiting pattern. As a date approaches, existing bookings are blended in. Levels are Low, Moderate, High and Very High, based on expected visitors as a percentage of slot capacity.</p>
        <h2 className="pt-4 text-2xl">About the data</h2>
        <p>Historical visitor counts, ratings, prices and bookings in this prototype are sample and demonstration data. Predictions are estimates. Ticket entries recorded by staff are labelled as recorded; seeded history is labelled as simulated. Payments run in a simulated test mode and no real money moves.</p>
        <p>This design is original and is not affiliated with any government ticketing service.</p>
      </div>
    </div>
  );
}

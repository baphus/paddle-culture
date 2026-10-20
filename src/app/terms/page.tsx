import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";

export const metadata = {
  title: "Terms of Service — CK Grounds",
  description:
    "The terms that apply when you book a pickleball court at CK Grounds in Tabuelan, Cebu.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Who we are",
    body: [
      "CK Grounds operates outdoor and covered canopy pickleball courts in Poblacion, Tabuelan, Cebu, Philippines, and provides online court reservations through this website.",
      "You can reach us at ckgrounds1@gmail.com or 0961 633 3337 for any question about these terms.",
    ],
  },
  {
    heading: "2. Bookings and hours",
    body: [
      "Courts are booked in one-hour slots. You may book between 1 and 12 consecutive hours. Online booking is open from today up to 12 months in advance; hours that have already started on the current day are not bookable.",
    ],
  },
  {
    heading: "3. Holds",
    body: [
      "Selecting time slots places a temporary hold on them for 10 minutes. If you do not complete your booking within that window, the hold expires automatically and the slots are released for others to book.",
    ],
  },
  {
    heading: "4. Payment and proof of payment",
    body: [
      "Payment is made outside this website by bank transfer or e-wallet (GCash, BDO, or BPI) to the venue's accounts. The site does not collect card details.",
      "A booking is only submitted once you upload a clear photo or screenshot of your payment. Accepted files are JPG, PNG, or WEBP up to 5 MB, and each booking requires one proof of payment.",
      "Every booking is reviewed by CK Grounds staff before it is confirmed. You will receive an email confirmation once your booking is approved.",
    ],
  },
  {
    heading: "5. Rates",
    body: [
      "Court rates follow the operating hours configured for each court, and optional paddle and ball rentals are added to your total. The total is recalculated on our servers when you submit, and the amount shown at that point is the amount you pay.",
    ],
  },
  {
    heading: "6. Cancellations, rescheduling, and refunds",
    body: [
      "All bookings are final. Cancellations, rescheduling, and refunds are not offered. Please review your date, time, court, and add-ons carefully before sending payment.",
    ],
  },
  {
    heading: "7. Court rules and conduct",
    body: [
      "Please arrive on time for your slots and wear appropriate, non-marking footwear. Food and drinks are not allowed on the playing surface.",
      "Respect other players and venue staff. CK Grounds may refuse service or ask anyone to leave for unsafe, disruptive, or abusive behaviour.",
    ],
  },
  {
    heading: "8. Liability",
    body: [
      "You play at your own risk. To the extent allowed by law, CK Grounds is not liable for injuries, accidents, or loss or damage to personal belongings at the venue.",
      "Report any incident to venue staff immediately so we can assist.",
    ],
  },
  {
    heading: "9. Changes to these terms",
    body: [
      "We may update these terms from time to time. The current version is always available on this page, and continued use of the booking service means you accept the updated terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <Header />
      <main id="main" className="bg-cream pt-16">
        <section
          className="mx-auto w-full max-w-3xl px-4 pt-12 pb-8 sm:px-6"
          aria-labelledby="terms-heading"
        >
          <p className="inline-block rounded-full bg-flame-light px-4 py-1.5 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
            Legal
          </p>
          <h1
            id="terms-heading"
            className="mt-4 text-[40px] leading-[46px] font-extrabold tracking-tight text-pine sm:text-5xl sm:leading-[56px]"
          >
            Terms of Service
          </h1>
          <p className="mt-3 text-base leading-7 text-warm-muted">
            These terms apply whenever you book a court through the CK Grounds website. Last
            updated October 17, 2026.
          </p>
        </section>

        <section
          className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6"
          aria-label="Terms of Service"
        >
          <article className="space-y-8">
            {SECTIONS.map((s) => (
              <div key={s.heading} className="space-y-3">
                <h2 className="text-xl font-bold text-pine">{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="text-[15px] leading-7 text-ink/80">
                    {p}
                  </p>
                ))}
              </div>
            ))}
          </article>
        </section>
      </main>
      <Footer />
    </>
  );
}

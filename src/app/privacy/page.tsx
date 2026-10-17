import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";

export const metadata = {
  title: "Privacy Policy — CK Grounds",
  description:
    "How CK Grounds collects, uses, and protects your personal information when you book a court.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "1. Overview",
    body: [
      "This policy explains how CK Grounds handles personal information in connection with court bookings made through this website. It is written with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) in mind.",
    ],
  },
  {
    heading: "2. Information we collect",
    body: [
      "When you book a court we collect your name, email address, and phone number, along with the details of your booking such as the court, date, time slots, paddle and ball rentals, and total amount.",
      "You also upload a photo or screenshot of your payment as proof of payment.",
      "Our staff sign in to an admin area with an email address and password. We do not collect card or bank account details on this website.",
    ],
  },
  {
    heading: "3. How we use your information",
    body: [
      "We use your information to review and manage your booking, verify your payment, send booking confirmation and status emails, and respond to your inquiries. We do not sell your personal information, and we do not use it for advertising.",
    ],
  },
  {
    heading: "4. Proof of payment",
    body: [
      "Proof of payment images are stored in a private bucket that is not public. Only authorized CK Grounds staff can view them, through links that expire after a short time. Payment proofs are automatically deleted after about 90 days.",
    ],
  },
  {
    heading: "5. Sharing with service providers",
    body: [
      "We rely on third-party service providers for website hosting, database and file storage, and email delivery. They process your information only as needed to operate these services for us, and not for their own marketing.",
    ],
  },
  {
    heading: "6. Cookies",
    body: [
      "You do not need an account to book a court, and the public booking pages do not require cookies to work. We use essential cookies only on the staff admin pages to keep a signed-in session active.",
    ],
  },
  {
    heading: "7. Retention",
    body: [
      "We keep booking records for as long as needed for our records, and payment proofs are pruned about 90 days after they are uploaded.",
    ],
  },
  {
    heading: "8. Security",
    body: [
      "We use access controls and private storage to protect your information. No system is completely secure, but we take reasonable steps to keep your data safe and to limit access to authorized staff only.",
    ],
  },
  {
    heading: "9. Your rights",
    body: [
      "Under the Data Privacy Act you may ask to access, correct, or delete the personal information we hold about you, and you may raise a concern about how we handle it. To make a request, contact us using the details below.",
    ],
  },
  {
    heading: "10. Contact",
    body: [
      "For any privacy question or request, email ckgrounds1@gmail.com or call or text 0961 633 3337.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main" className="bg-cream pt-16">
        <section
          className="mx-auto w-full max-w-3xl px-4 pt-12 pb-8 sm:px-6"
          aria-labelledby="privacy-heading"
        >
          <p className="inline-block rounded-full bg-flame-light px-4 py-1.5 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
            Legal
          </p>
          <h1
            id="privacy-heading"
            className="mt-4 text-[40px] leading-[46px] font-extrabold tracking-tight text-pine sm:text-5xl sm:leading-[56px]"
          >
            Privacy Policy
          </h1>
          <p className="mt-3 text-base leading-7 text-warm-muted">
            How we collect, use, and protect your personal information. Last updated October 17,
            2026.
          </p>
        </section>

        <section
          className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6"
          aria-label="Privacy Policy"
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

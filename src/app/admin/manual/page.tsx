import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import PageHeader from "@/components/admin/page-header";
import ManualContents from "./manual-contents";

export const dynamic = "force-dynamic";

const chapters = [
  { id: "start", title: "Start here" },
  { id: "dashboard", title: "Dashboard" },
  { id: "bookings", title: "Bookings" },
  { id: "new-booking", title: "Add a booking" },
  { id: "calendar", title: "Calendar" },
  { id: "court-setup", title: "Courts, hours, and prices" },
  { id: "closures", title: "Closures" },
  { id: "finance", title: "Finance and expenses" },
  { id: "users", title: "Staff accounts" },
  { id: "activity", title: "Alerts and activity" },
  { id: "rules", title: "Rules to remember" },
  { id: "help", title: "When something looks wrong" },
] as const;

function ScreenshotPlaceholder({ title }: { title: string }) {
  return (
    <figure className="my-5">
      <div
        role="img"
        aria-label={`Screenshot placeholder: ${title}`}
        className="grid aspect-[16/8] w-full place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center"
      >
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Screenshot goes here</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Image placeholder · replace with a screenshot of {title.toLowerCase()}.
      </figcaption>
    </figure>
  );
}

function Chapter({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t pt-7 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-foreground">{children}</ol>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm leading-6 text-foreground">
      {children}
    </div>
  );
}

export default function AdminManualPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-7">
      <PageHeader
        title="Admin Manual"
        description="A step-by-step guide to the tools staff use at CK Grounds."
      />

      <div className="grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
        <ManualContents chapters={chapters} />

        <article className="min-w-0 space-y-8 rounded-lg border bg-card p-5 sm:p-8">
          <Chapter id="start" title="Start here">
            <p>
              Use the menu on the left to find a topic. This guide explains each part of the Admin area in everyday language.
            </p>
            <p>
              Sign in with your staff account to use the dashboard. New staff need an invitation from an existing admin.
              All booking dates and times use Manila time.
            </p>
            <p>
              At the bottom of the side menu, you can change the name shown to other staff or sign out. Use the theme
              button at the top to switch the page between light and dark colors.
            </p>
            <Tip>
              Customer bookings wait for staff approval. Bookings added by staff are approved as soon as they are saved.
            </Tip>
          </Chapter>

          <Chapter id="dashboard" title="Dashboard">
            <p>
              The Dashboard gives you a quick view of recent bookings, requests waiting for review, today&apos;s bookings,
              and this month&apos;s income and expenses. Select a number or shortcut to open the related page.
            </p>
            <p>Some booking numbers compare the last 15 days with the 15 days before them.</p>
            <ScreenshotPlaceholder title="the admin dashboard" />
          </Chapter>

          <Chapter id="bookings" title="Bookings">
            <p>
              Open <strong className="text-foreground">Bookings</strong> to find and manage reservations. Search by
              customer or booking details. You can also filter by booking status and date. Use the page controls at the
              bottom to see more results.
            </p>
            <Steps>
              <li>Choose Pending to see customer requests that need a decision.</li>
              <li>Choose View to check the customer&apos;s contact details, court, date, hours, rentals, and total.</li>
              <li>Select the payment image to enlarge it and compare it with the booking total.</li>
              <li>Choose Approve to confirm the booking, or Reject and enter a reason.</li>
              <li>Confirm your choice. The customer receives an email about the decision.</li>
            </Steps>
            <Tip>
              Open the booking details before deciding if you need to check the payment image. The quick Approve button
              on a booking row opens the approval step directly, where you can confirm your choice.
            </Tip>
            <ScreenshotPlaceholder title="the booking list and booking details" />
          </Chapter>

          <Chapter id="new-booking" title="Add a booking">
            <p>
              Use <strong className="text-foreground">New booking</strong> for walk-ins, phone reservations, or other
              bookings entered by staff.
            </p>
            <Steps>
              <li>Choose a date, then select open court and time boxes. You can select up to 12 hourly times.</li>
              <li>
                Leave Notify customer on to enter the customer&apos;s name, email, and phone and send a confirmation.
                Turn it off for an internal booking, then enter a short note such as “Walk-in”.
              </li>
              <li>Enter the number of paddles and choose whether to add a ball.</li>
              <li>Add a payment image if you have one. This step is optional for staff bookings.</li>
              <li>Check the total and select Create booking.</li>
            </Steps>
            <Tip>
              Staff bookings are approved right away. Check the date and times before saving. If a time is no longer
              open, refresh the page and choose another.
            </Tip>
            <ScreenshotPlaceholder title="the new booking form" />
          </Chapter>

          <Chapter id="calendar" title="Calendar">
            <p>
              The Calendar shows bookings and closures. Choose Monthly, Weekly, Daily, or Schedule to change how you
              view the dates. Use the arrows to move through dates, or choose Today to return to the current date.
            </p>
            <p>Select a booking to view its details. You can decide a pending booking from its detail window.</p>
            <ScreenshotPlaceholder title="the booking calendar" />
          </Chapter>

          <Chapter id="court-setup" title="Courts, hours, and prices">
            <p>
              Open <strong className="text-foreground">Court setup</strong> to manage which courts customers can
              book, the days and hours each court is open, and the prices.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Choose Activate or Deactivate to make a court available or unavailable for new bookings.</li>
              <li>Choose Edit to add, change, or remove the court&apos;s hours and prices for each day.</li>
              <li>
                Quick Setup applies one opening time, closing time, and price to the days you select. It replaces the
                current hours on those days, so check your selections before saving.
              </li>
              <li>Change the Paddle or Ball price and save it to update rental prices.</li>
            </ul>
            <Tip>Changes to hours and prices affect what customers can book and what they pay.</Tip>
            <ScreenshotPlaceholder title="court hours and prices" />
          </Chapter>

          <Chapter id="closures" title="Closures">
            <p>
              A closure blocks booking for a time when a court is normally open. In Court setup, choose Add closure,
              then choose All courts or one court. Pick full days or certain hours, choose the date or dates, and add a
              reason if useful.
            </p>
            <p>
              Upcoming closures appear in a list. You can also show past closures. Use the remove button to lift a
              closure. Check whether it applies to one court or all courts first.
            </p>
          </Chapter>

          <Chapter id="finance" title="Finance and expenses">
            <p>
              Finance shows income from approved bookings, expenses entered by staff, estimated profit after expenses,
              and the number of approved bookings in the dates you choose.
            </p>
            <Steps>
              <li>Choose Filters to use the last 7, 30, or 90 days, or enter your own dates.</li>
              <li>You can also narrow expenses by category or search for words in an expense title.</li>
              <li>Choose Apply filters to update the page, or Reset to clear the extra filters.</li>
              <li>Choose Add expense and enter its name, category, amount in pesos, and payment date.</li>
              <li>Use Edit to correct an expense. Use Delete to remove it permanently, then confirm.</li>
              <li>Choose Export CSV to download the report as a file you can open in a spreadsheet.</li>
            </Steps>
            <Tip>This page is a helpful summary. It is not a bank statement or a full accounting record.</Tip>
            <ScreenshotPlaceholder title="the finance page and expense form" />
          </Chapter>

          <Chapter id="users" title="Staff accounts">
            <p>
              Use Users to manage staff who can open the Admin area. Choose Add user to create an account with the
              person&apos;s name, email, and a starting password of at least 8 characters. Share the password privately.
            </p>
            <p>
              Choose Invite to make a one-time sign-up link for a new admin. Copy the link and send it privately. You
              can copy a pending link again from the same browser or cancel it. Once someone uses it, it no longer
              works.
            </p>
            <p>
              You can remove another admin from the user list. You cannot remove your own account from its row. Use
              the profile button by your name to change the name shown to other staff; the email cannot be changed
              there.
            </p>
            <ScreenshotPlaceholder title="admin users and invitations" />
          </Chapter>

          <Chapter id="activity" title="Alerts and activity">
            <p>
              The bell shows new booking requests. Select an alert to open that booking. Opening the bell does not clear
              the alerts; choose Clear all to mark the alerts currently shown as read.
            </p>
            <p>
              Activity is a record of changes made in Admin. Search by staff member, item, or record number. Filter by
              action and use the page controls to find older entries.
            </p>
            <ScreenshotPlaceholder title="booking alerts and the activity page" />
          </Chapter>

          <Chapter id="rules" title="Rules to remember">
            <ul className="list-disc space-y-2 pl-5">
              <li>All booking and closure times use Manila time.</li>
              <li>
                The booking grid covers every hour of the selected Manila calendar day. Each court&apos;s configured
                opening hours and closures determine which slots customers can book. Set the same opening and closing
                time to keep a court open for the full day.
              </li>
              <li>Customers can book up to 12 hours at once, up to 12 months ahead.</li>
              <li>Customer holds last 10 minutes.</li>
              <li>Payment images must be JPG, PNG, or WebP and 5 MB or smaller.</li>
              <li>Customers need both their tracking code and booking email to look up a reservation.</li>
              <li>The same court and time cannot be booked twice.</li>
            </ul>
          </Chapter>

          <Chapter id="help" title="When something looks wrong">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                If a booking seems missing, clear the search and date filters and check the other result pages. If it
                still looks wrong, contact the site operator.
              </li>
              <li>
                If a time is no longer open, refresh the page and choose another. A customer may have taken it, or a
                closure may apply.
              </li>
              <li>If an email or payment image is missing, give the site operator the booking details to check.</li>
            </ul>
            <p className="flex flex-wrap items-center gap-1.5 pt-2">
              Return to the <Link className="font-medium text-foreground underline underline-offset-4" href="/admin">Dashboard</Link>
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </p>
          </Chapter>
        </article>
      </div>
    </div>
  );
}

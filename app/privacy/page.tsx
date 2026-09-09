import Link from "next/link"
import type { Metadata } from "next"

import { APP_NAME } from "@/lib/app-meta"

export const metadata: Metadata = {
  title: `Privacy Policy · ${APP_NAME}`,
  description: `Privacy Policy for ${APP_NAME}.`,
}

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-page__panel">
        <p className="legal-page__eyebrow">Legal</p>
        <h1 className="legal-page__title">Privacy Policy</h1>
        <p className="legal-page__updated">Last updated: September 9, 2026</p>

        <div className="legal-page__content">
          <p>
            {APP_NAME} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
            provides a task planning product. This Privacy Policy explains what
            information we collect and how we use it.
          </p>

          <h2>Information we collect</h2>
          <ul>
            <li>
              Account details such as your name and email address when you sign
              in.
            </li>
            <li>
              Planner data you create in the app, including tasks, routines,
              reminders, and settings.
            </li>
            <li>
              If you connect Google Calendar, we request read-only access to
              calendar events so we can show your meetings inside {APP_NAME}.
            </li>
          </ul>

          <h2>How we use information</h2>
          <ul>
            <li>To provide and improve the {APP_NAME} service.</li>
            <li>To sync and display your planner and connected calendar data.</li>
            <li>To send product notifications you choose to enable.</li>
          </ul>

          <h2>Google Calendar access</h2>
          <p>
            When you connect Google Calendar, we use Google OAuth and the Google
            Calendar API with read-only permission. We use calendar event data
            only to display and help manage meetings inside {APP_NAME}. We do
            not sell this data. You can disconnect Google Calendar at any time
            from Settings.
          </p>

          <h2>Data storage</h2>
          <p>
            Account and app data are stored using our hosting and database
            providers so your information stays available across your devices.
          </p>

          <h2>Sharing</h2>
          <p>
            We do not sell personal information. We may share data with service
            providers that help us operate {APP_NAME} (for example hosting,
            authentication, and database services), only as needed to run the
            product.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>You can update profile and notification settings in the app.</li>
            <li>You can disconnect Google Calendar from Settings.</li>
            <li>
              You can request account or data deletion by contacting us at{" "}
              <a href="mailto:whimsaas@gmail.com">whimsaas@gmail.com</a>.
            </li>
          </ul>

          <h2>Contact</h2>
          <p>
            Questions about this policy:{" "}
            <a href="mailto:whimsaas@gmail.com">whimsaas@gmail.com</a>
          </p>
        </div>

        <div className="legal-page__footer">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/get-started">Back to {APP_NAME}</Link>
        </div>
      </div>
    </main>
  )
}

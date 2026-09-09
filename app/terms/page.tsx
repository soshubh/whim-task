import Link from "next/link"
import type { Metadata } from "next"

import { APP_NAME } from "@/lib/app-meta"

export const metadata: Metadata = {
  title: `Terms of Service · ${APP_NAME}`,
  description: `Terms of Service for ${APP_NAME}.`,
}

export default function TermsPage() {
  return (
    <main className="legal-page">
      <div className="legal-page__panel">
        <p className="legal-page__eyebrow">Legal</p>
        <h1 className="legal-page__title">Terms of Service</h1>
        <p className="legal-page__updated">Last updated: September 9, 2026</p>

        <div className="legal-page__content">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of{" "}
            {APP_NAME}. By using the app, you agree to these Terms.
          </p>

          <h2>The service</h2>
          <p>
            {APP_NAME} helps you plan tasks, routines, reminders, and related
            productivity workflows. Optional Google Calendar connection lets you
            view meetings from your Google account inside the app.
          </p>

          <h2>Your account</h2>
          <ul>
            <li>You must provide accurate account information.</li>
            <li>You are responsible for activity under your account.</li>
            <li>
              You must be allowed to use the email address you sign in with.
            </li>
          </ul>

          <h2>Acceptable use</h2>
          <p>You agree not to misuse {APP_NAME}, including by attempting to:</p>
          <ul>
            <li>Access data that is not yours</li>
            <li>Disrupt or reverse engineer the service</li>
            <li>Use the product for unlawful purposes</li>
          </ul>

          <h2>Google services</h2>
          <p>
            If you connect Google Calendar, your use of Google services remains
            subject to Google&apos;s terms and policies. You can revoke access at
            any time from {APP_NAME} Settings or your Google Account permissions.
          </p>

          <h2>Availability</h2>
          <p>
            We aim to keep {APP_NAME} available and reliable, but we do not
            guarantee uninterrupted service. Features may change as we improve
            the product.
          </p>

          <h2>Disclaimer</h2>
          <p>
            {APP_NAME} is provided &quot;as is&quot; without warranties of any
            kind to the fullest extent permitted by law.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, we are not liable for
            indirect, incidental, or consequential damages arising from your use
            of {APP_NAME}.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these Terms:{" "}
            <a href="mailto:whimsaas@gmail.com">whimsaas@gmail.com</a>
          </p>
        </div>

        <div className="legal-page__footer">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/get-started">Back to {APP_NAME}</Link>
        </div>
      </div>
    </main>
  )
}

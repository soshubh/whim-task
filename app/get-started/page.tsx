"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { APP_NAME } from "@/lib/app-meta"
import { deriveNameFromEmail, isValidEmail } from "@/lib/auth"
import { formatAuthError } from "@/lib/auth-errors"

type AuthStep = "email" | "otp"

const MIN_OTP_LENGTH = 6
const MAX_OTP_LENGTH = 8

export default function GetStartedPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, configError, sendOtp, verifyOtp } = useAuth()
  const [step, setStep] = React.useState<AuthStep>("email")
  const [email, setEmail] = React.useState("")
  const [otp, setOtp] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/")
    }
  }, [isAuthenticated, isLoading, router])

  const derivedName = email ? deriveNameFromEmail(email) : ""
  const isOtpComplete =
    otp.length >= MIN_OTP_LENGTH && otp.length <= MAX_OTP_LENGTH
  const canSendCode = isValidEmail(email) && !isSubmitting

  const handleSendOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await sendOtp(email)
      setStep("otp")
      setOtp("")
    } catch (sendError) {
      setError(formatAuthError(sendError, "Unable to send one-time code."))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await verifyOtp(email, otp)
      router.replace("/")
    } catch (verifyError) {
      setError(formatAuthError(verifyError, "Unable to verify one-time code."))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendOtp = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      await sendOtp(email)
      setOtp("")
    } catch (resendError) {
      setError(formatAuthError(resendError, "Unable to resend one-time code."))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading || isAuthenticated) {
    return (
      <div className="auth-page">
        <div className="auth-page__loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <header className="auth-page__header">
        <div className="auth-page__brand">
          <Image
            alt=""
            className="auth-page__brand-logo"
            height={40}
            src="/Log.png"
            width={40}
          />
          <span className="auth-page__brand-name">{APP_NAME}</span>
        </div>
        <p className="auth-page__tagline">
          Everyday planning
          <br />
          made easy
        </p>
      </header>

      <main className="auth-page__main">
        <section className="auth-page__panel">
          {step === "email" ? (
            <>
              <div className="auth-page__intro">
                <h1 className="auth-page__title">Start with your Gmail</h1>
                <p className="auth-page__description">
                  Use your Gmail address to sign in or create an account.
                </p>
              </div>

              <form className="auth-page__form" onSubmit={handleSendOtp}>
                <label className="auth-page__field">
                  <span className="auth-page__field-label">Gmail address</span>
                  <Input
                    autoComplete="email"
                    className="auth-page__input"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@gmail.com"
                    required
                    type="email"
                    value={email}
                  />
                </label>

                {derivedName && isValidEmail(email) ? (
                  <p className="auth-page__hint">
                    We will use <strong>{derivedName}</strong> as your name.
                  </p>
                ) : null}

                {configError ? (
                  <p className="auth-page__error">{configError}</p>
                ) : null}

                {error ? <p className="auth-page__error">{error}</p> : null}

                <Button
                  className="auth-page__submit"
                  disabled={!canSendCode || Boolean(configError)}
                  type="submit"
                >
                  {isSubmitting ? "Sending code..." : "Send one-time code"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="auth-page__intro">
                <h1 className="auth-page__title">Enter one-time code</h1>
                <p className="auth-page__description">
                  We sent a code to <strong>{email}</strong>.
                </p>
              </div>

              <form className="auth-page__form" onSubmit={handleVerifyOtp}>
                <label className="auth-page__field">
                  <span className="auth-page__sr-only">One-time code</span>
                  <Input
                    autoComplete="one-time-code"
                    className="auth-page__input auth-page__input--otp"
                    inputMode="numeric"
                    maxLength={MAX_OTP_LENGTH}
                    onChange={(event) =>
                      setOtp(
                        event.target.value
                          .replace(/\D/g, "")
                          .slice(0, MAX_OTP_LENGTH),
                      )
                    }
                    placeholder="000000"
                    required
                    type="text"
                    value={otp}
                  />
                </label>

                {configError ? (
                  <p className="auth-page__error">{configError}</p>
                ) : null}

                {error ? <p className="auth-page__error">{error}</p> : null}

                <Button
                  className="auth-page__submit"
                  disabled={isSubmitting || !isOtpComplete || Boolean(configError)}
                  type="submit"
                >
                  {isSubmitting ? "Verifying..." : "Verify and continue"}
                </Button>
              </form>

              <button
                className="auth-page__link-button"
                disabled={isSubmitting}
                onClick={() => void handleResendOtp()}
                type="button"
              >
                Resend code
              </button>
            </>
          )}
        </section>
      </main>

      <footer className="auth-page__footer">
        By continuing you agree to receive a one-time code for access to{" "}
        {APP_NAME}.{" "}
        <Link href="#">Terms of Use</Link> · <Link href="#">Privacy Policy</Link>
      </footer>
    </div>
  )
}

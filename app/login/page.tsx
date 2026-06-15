"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Mail } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { APP_NAME } from "@/lib/app-meta"
import { deriveNameFromEmail, isValidEmail } from "@/lib/auth"
import { formatAuthError } from "@/lib/auth-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type LoginStep = "email" | "otp"

const MIN_OTP_LENGTH = 6
const MAX_OTP_LENGTH = 8

export default function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, sendOtp, verifyOtp } = useAuth()
  const [step, setStep] = React.useState<LoginStep>("email")
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

  const handleSendOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await sendOtp(email)
      setStep("otp")
      setOtp("")
    } catch (sendError) {
      setError(
        formatAuthError(sendError, "Unable to send one-time code."),
      )
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
      setError(
        formatAuthError(verifyError, "Unable to verify one-time code."),
      )
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
      setError(
        formatAuthError(resendError, "Unable to resend one-time code."),
      )
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
      <div className="auth-page__panel">
        <div className="auth-page__brand">
          <span className="auth-page__brand-mark" aria-hidden="true">
            <Mail className="size-5" />
          </span>
          <span className="auth-page__brand-name">{APP_NAME}</span>
        </div>

        {step === "email" ? (
          <>
            <div className="auth-page__intro">
              <p className="auth-page__eyebrow">One-time code access</p>
              <h1 className="auth-page__title">Sign in or sign up</h1>
              <p className="auth-page__description">
                Enter your email address. Login and sign up use the same flow.
              </p>
            </div>

            <ol className="auth-page__steps">
              <li>Enter your email address.</li>
              <li>We send a one-time code to that inbox.</li>
              <li>Verify the code and you are in.</li>
            </ol>

            <form className="auth-page__form" onSubmit={handleSendOtp}>
              <label className="auth-page__field">
                <span className="auth-page__field-label">Email address</span>
                <Input
                  autoComplete="email"
                  className="auth-page__input"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </label>

              {derivedName && isValidEmail(email) ? (
                <p className="auth-page__derived-name">
                  We will use <strong>{derivedName}</strong> as your name.
                </p>
              ) : null}

              {error ? <p className="auth-page__error">{error}</p> : null}

              <Button
                className="auth-page__submit"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Sending code..." : "Send one-time code"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <button
              className="auth-page__back"
              onClick={() => {
                setStep("email")
                setOtp("")
                setError(null)
              }}
              type="button"
            >
              <ArrowLeft className="size-4" />
              Change email
            </button>

            <div className="auth-page__intro">
              <p className="auth-page__eyebrow">Verify your email</p>
              <h1 className="auth-page__title">Enter one-time code</h1>
              <p className="auth-page__description">
                We sent a code to <strong>{email}</strong>. Check your inbox and
                spam folder.
              </p>
            </div>

            <form className="auth-page__form" onSubmit={handleVerifyOtp}>
              <label className="auth-page__field">
                <span className="auth-page__field-label">One-time code</span>
                <Input
                  autoComplete="one-time-code"
                  className="auth-page__input auth-page__input--otp"
                  inputMode="numeric"
                  maxLength={MAX_OTP_LENGTH}
                  onChange={(event) =>
                    setOtp(
                      event.target.value.replace(/\D/g, "").slice(0, MAX_OTP_LENGTH),
                    )
                  }
                  placeholder="000000"
                  required
                  type="text"
                  value={otp}
                />
              </label>

              {error ? <p className="auth-page__error">{error}</p> : null}

              <Button
                className="auth-page__submit"
                disabled={isSubmitting || !isOtpComplete}
                type="submit"
              >
                {isSubmitting ? "Verifying..." : "Verify and continue"}
              </Button>
            </form>

            <button
              className="auth-page__resend"
              disabled={isSubmitting}
              onClick={() => void handleResendOtp()}
              type="button"
            >
              Resend code
            </button>
          </>
        )}

        <p className="auth-page__legal">
          By continuing you agree to receive a one-time code for access to{" "}
          {APP_NAME}.
        </p>
      </div>
    </div>
  )
}

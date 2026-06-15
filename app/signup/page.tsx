import { redirect } from "next/navigation"

import { GET_STARTED_PATH } from "@/lib/app-meta"

export default function SignupPage() {
  redirect(GET_STARTED_PATH)
}

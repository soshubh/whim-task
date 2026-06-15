import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

const AVATAR_BUCKET = "avatars"
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export type RemoteProfile = {
  avatarUrl: string
  email: string
  name: string
}

function mimeToExtension(contentType: string) {
  switch (contentType) {
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    default:
      return "jpg"
  }
}

function extensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase()
  if (
    extension === "png" ||
    extension === "webp" ||
    extension === "gif" ||
    extension === "jpg" ||
    extension === "jpeg"
  ) {
    return extension === "jpeg" ? "jpg" : extension
  }

  return null
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
  if (!match) {
    return null
  }

  const contentType = match[1] || "image/jpeg"
  const base64 = match[2]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return {
    blob: new Blob([bytes], { type: contentType }),
    contentType,
    extension: mimeToExtension(contentType),
  }
}

async function resolveAvatarUpload(
  avatar: string,
  avatarFile?: File | null,
) {
  if (avatarFile) {
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      throw new Error("Profile picture must be 5 MB or smaller.")
    }

    const extension =
      extensionFromFileName(avatarFile.name) ??
      mimeToExtension(avatarFile.type || "image/jpeg")

    return {
      blob: avatarFile,
      contentType: avatarFile.type || `image/${extension}`,
      extension,
    }
  }

  if (avatar.startsWith("data:")) {
    const parsed = dataUrlToBlob(avatar)
    if (!parsed) {
      throw new Error("Could not read the selected image.")
    }

    if (parsed.blob.size > MAX_AVATAR_BYTES) {
      throw new Error("Profile picture must be 5 MB or smaller.")
    }

    return parsed
  }

  return null
}

export async function fetchRemoteProfile(
  userId: string,
): Promise<RemoteProfile | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    name: data.name,
    email: data.email,
    avatarUrl: data.avatar_url ?? "",
  }
}

export async function saveRemoteProfile(
  userId: string,
  profile: {
    avatar: string
    avatarFile?: File | null
    name: string
  },
): Promise<{ avatarUrl: string; name: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Profile sync is unavailable. Supabase environment variables are missing.",
    )
  }

  const supabase = getSupabaseClient()
  const trimmedName = profile.name.trim()

  if (!trimmedName) {
    throw new Error("Name cannot be empty.")
  }

  let avatarPath: string | null = null
  let avatarUrl = profile.avatar.startsWith("http") ? profile.avatar : ""

  const upload = await resolveAvatarUpload(profile.avatar, profile.avatarFile)

  if (upload) {
    avatarPath = `${userId}/avatar.${upload.extension}`

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(avatarPath, upload.blob, {
        cacheControl: "3600",
        contentType: upload.contentType,
        upsert: true,
      })

    if (uploadError) {
      throw new Error(
        uploadError.message || "Could not upload profile picture.",
      )
    }

    const { data: publicUrlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(avatarPath)

    avatarUrl = publicUrlData.publicUrl
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      avatar_path: avatarPath,
      avatar_url: avatarUrl || null,
      name: trimmedName,
    })
    .eq("id", userId)

  if (profileError) {
    throw new Error(profileError.message || "Could not save profile.")
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { name: trimmedName },
  })

  if (metadataError) {
    throw new Error(metadataError.message || "Could not update account profile.")
  }

  return {
    avatarUrl,
    name: trimmedName,
  }
}

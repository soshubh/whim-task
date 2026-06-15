export type DocumentPictureInPictureWindow = Window & typeof globalThis

export interface DocumentPictureInPicture {
  requestWindow: (options?: {
    height?: number
    width?: number
  }) => Promise<DocumentPictureInPictureWindow>
  window: DocumentPictureInPictureWindow | null
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

export const PIP_WINDOW_WIDTH = 320
export const PIP_WINDOW_HEIGHT = 420

export function isDocumentPictureInPictureSupported() {
  return typeof window !== "undefined" && "documentPictureInPicture" in window
}

export async function openDocumentPictureInPictureWindow() {
  if (!isDocumentPictureInPictureSupported()) {
    return null
  }

  const pipWindow = await window.documentPictureInPicture!.requestWindow({
    width: PIP_WINDOW_WIDTH,
    height: PIP_WINDOW_HEIGHT,
  })

  preparePictureInPictureDocument(pipWindow)
  return pipWindow
}

export function preparePictureInPictureDocument(pipWindow: DocumentPictureInPictureWindow) {
  const { document: pipDocument } = pipWindow

  pipDocument.querySelectorAll("link[rel='stylesheet'], style").forEach((node) => {
    node.remove()
  })

  document.querySelectorAll("link[rel='stylesheet'], style").forEach((node) => {
    pipDocument.head.appendChild(node.cloneNode(true))
  })

  pipDocument.title = "Whim Task — Pomodoro"
  pipDocument.documentElement.style.height = "100%"
  pipDocument.documentElement.style.background = "#ffffff"
  pipDocument.body.innerHTML = ""
  pipDocument.body.className = "pomodoro-pip-body"
  pipDocument.body.style.margin = "0"
  pipDocument.body.style.background = "#ffffff"
  pipDocument.body.style.overflow = "hidden"
}

export function closeDocumentPictureInPictureWindow(
  pipWindow: DocumentPictureInPictureWindow | null,
) {
  if (pipWindow && !pipWindow.closed) {
    pipWindow.close()
  }
}

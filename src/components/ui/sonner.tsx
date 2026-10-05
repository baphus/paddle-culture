"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "#fff8ef",
          "--normal-text": "#3c3835",
          "--normal-border": "#e8ddc8",
          "--success-bg": "#eaf5ec",
          "--success-text": "#26422a",
          "--success-border": "#c5dfc8",
          "--error-bg": "#fff0eb",
          "--error-text": "#ba1a1a",
          "--error-border": "#f5c6b8",
          "--warning-bg": "#fff3d4",
          "--warning-text": "#5a3e00",
          "--warning-border": "#e8ddc8",
          "--info-bg": "#d2e8ff",
          "--info-text": "#1a3a5c",
          "--info-border": "#a8ccf0",
          "--border-radius": "var(--radius)",
          "--font": "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast shadow-sm border font-sans text-sm",
          title: "font-semibold",
          description: "text-xs opacity-80",
          actionButton: "bg-flame text-white hover:bg-flame-hover text-xs font-medium px-3 py-1 rounded",
          cancelButton: "bg-line text-ink text-xs font-medium px-3 py-1 rounded",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

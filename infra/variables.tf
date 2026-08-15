variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns Pages, R2, and Zero Trust."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID that owns the custom production hostname."
  type        = string
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name."
  type        = string
  default     = "excalidraw-selfhost"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$", var.pages_project_name))
    error_message = "pages_project_name must contain only lowercase letters, digits, and hyphens, and must start/end with a letter or digit."
  }
}

variable "r2_bucket_name" {
  description = "R2 bucket used as the application's persistence source of truth."
  type        = string
  default     = "excalidraw-diagrams"
}

variable "production_hostname" {
  description = "Fully qualified custom hostname for the production application, for example draw.example.com."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", var.production_hostname))
    error_message = "production_hostname must be a fully qualified DNS hostname such as draw.example.com."
  }
}

variable "access_email" {
  description = "Exact user email allowed by Cloudflare Access. MFA remains enforced by the existing IdP/Access configuration."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.access_email))
    error_message = "access_email must be a valid email address."
  }
}

variable "access_session_duration" {
  description = "Lifetime of Cloudflare Access application sessions."
  type        = string
  default     = "12h"
}

variable "pages_functions_compatibility_date" {
  description = "Pinned Workers compatibility date for Pages Functions."
  type        = string
  default     = "2026-08-15"
}

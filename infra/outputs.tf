output "pages_project_name" {
  description = "Cloudflare Pages project name used by the deployment workflow."
  value       = cloudflare_pages_project.app.name
}

output "pages_hostname" {
  description = "Cloudflare-provided production Pages hostname protected by Access."
  value       = local.pages_hostname
}

output "production_hostname" {
  description = "Custom production hostname protected by Access."
  value       = var.production_hostname
}

output "production_url" {
  description = "Custom production URL."
  value       = "https://${var.production_hostname}"
}

output "r2_bucket_name" {
  description = "R2 bucket bound to Pages Functions as DIAGRAMS."
  value       = cloudflare_r2_bucket.diagrams.name
}

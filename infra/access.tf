resource "cloudflare_zero_trust_access_application" "production" {
  account_id           = var.cloudflare_account_id
  name                 = "${var.pages_project_name} production"
  domain               = var.production_hostname
  type                 = "self_hosted"
  app_launcher_visible = false
  session_duration     = var.access_session_duration
  policies             = local.personal_access_policy

  depends_on = [cloudflare_pages_domain.production]
}

resource "cloudflare_zero_trust_access_application" "pages_hostname" {
  account_id           = var.cloudflare_account_id
  name                 = "${var.pages_project_name} pages.dev"
  domain               = local.pages_hostname
  type                 = "self_hosted"
  app_launcher_visible = false
  session_duration     = var.access_session_duration
  policies             = local.personal_access_policy

  depends_on = [cloudflare_pages_project.app]
}

resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"

  deployment_configs = {
    preview = {
      fail_open = false
    }

    production = {
      compatibility_date = var.pages_functions_compatibility_date
      fail_open          = false

      r2_buckets = {
        DIAGRAMS = {
          name = cloudflare_r2_bucket.diagrams.name
        }
      }
    }
  }
}

resource "cloudflare_pages_domain" "production" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.app.name
  name         = var.production_hostname

  depends_on = [cloudflare_dns_record.production]
}

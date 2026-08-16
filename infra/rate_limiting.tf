resource "cloudflare_ruleset" "api_rate_limit" {
  zone_id     = var.cloudflare_zone_id
  name        = "${var.pages_project_name} API rate limit"
  description = "Protect the canonical Pages API entry point before Pages Functions."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "api_requests_per_ip"
    description = "Limit API requests from each client IP."
    expression  = "(http.host eq \"${var.production_hostname}\" and starts_with(http.request.uri.path, \"/api/\"))"
    action      = "block"
    enabled     = true

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 60
      requests_per_period = 120
      mitigation_timeout  = 60
    }
  }]
}

resource "cloudflare_dns_record" "production" {
  zone_id = var.cloudflare_zone_id
  name    = var.production_hostname
  type    = "CNAME"
  content = local.pages_hostname
  ttl     = 1
  proxied = true
}

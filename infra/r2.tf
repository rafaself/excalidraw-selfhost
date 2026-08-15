resource "cloudflare_r2_bucket" "diagrams" {
  account_id    = var.cloudflare_account_id
  name          = var.r2_bucket_name
  storage_class = "Standard"
}

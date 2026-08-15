locals {
  pages_hostname = "${var.pages_project_name}.pages.dev"

  personal_access_policy = [
    {
      name       = "Allow personal user"
      decision   = "allow"
      precedence = 1
      include = [
        {
          email = {
            email = var.access_email
          }
        }
      ]
    }
  ]
}

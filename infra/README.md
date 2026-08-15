# Cloudflare infrastructure

This directory provisions the minimum production infrastructure for the Excalidraw Selfhost MVP:

- one Cloudflare Pages Direct Upload project;
- one R2 bucket bound to Pages Functions as `DIAGRAMS`;
- one custom production hostname and its proxied DNS CNAME;
- Cloudflare Access protection for both the custom hostname and `<project>.pages.dev`.

Application deployments are intentionally not managed by Terraform. Issue #6 deploys the built application to the Pages project from GitHub Actions.

## Prerequisites

- Terraform 1.8+;
- a Cloudflare account with Zero Trust configured;
- a Cloudflare-managed DNS zone for the production hostname;
- an existing identity provider / MFA configuration in Cloudflare Access;
- a Cloudflare API token exposed as `CLOUDFLARE_API_TOKEN`.

The Terraform token should be scoped only to the resources managed here. The Cloudflare provider documents the required write permissions as:

- `Pages Write`;
- `Workers R2 Storage Write`;
- `Access: Apps and Policies Write`;
- `DNS Write` for the target zone.

Do not put the API token in Terraform variables or `.tfvars` files. The provider reads `CLOUDFLARE_API_TOKEN` from the environment.

## Configure

Copy the example and replace the placeholders locally:

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` is ignored by Git. The account and zone IDs are identifiers rather than credentials, but keeping all operator-specific values in the ignored file keeps the repository reusable. `access_email` is marked sensitive in Terraform and should not be committed with a real value.

## Apply

```bash
export CLOUDFLARE_API_TOKEN="..."

terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

Review every plan before applying. Infrastructure apply is deliberately manual and must not be added to the normal `main` application deployment workflow.

The first `terraform init` creates `.terraform.lock.hcl`. Commit that lock file after initialization so future runs use the same provider selection.

## Security boundary

Both production entry points are protected by Access:

```text
https://draw.example.com
https://<project>.pages.dev
```

The inline Access policy allows only `access_email`. It does not create or replace an identity provider and it does not implement application authentication. MFA is expected to remain enforced by the existing Cloudflare Access / identity-provider configuration.

Preview deployments are outside the MVP. Do not deploy non-`main` branches to Pages unless equivalent Access protection is added for preview hostnames first.

## R2 binding

The Pages production deployment configuration binds the bucket as:

```text
DIAGRAMS -> <r2_bucket_name>
```

This matches the Pages Functions code under `functions/`, which reads `context.env.DIAGRAMS`. No R2 credentials are exposed to browser code.

## Deployment handoff

The application deployment workflow only needs the `pages_project_name` output plus a scoped Pages deployment token. It does not need the Terraform token and must not receive DNS, Access, or R2-management privileges.

# Cloudflare infrastructure

This directory provisions the minimum production infrastructure for the Excalidraw Selfhost MVP:

- one Cloudflare Pages Direct Upload project;
- one R2 bucket bound to Pages Functions as `DIAGRAMS`;
- one custom production hostname and its proxied DNS CNAME;
- Cloudflare Access protection for both the custom hostname and `<project>.pages.dev`.

Application deployments are intentionally not managed by Terraform. GitHub Actions deploys the built application to the existing Pages project after changes reach `main`.

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

Terraform and application deployment intentionally use separate credentials.

After `terraform apply`, read the Pages project name:

```bash
terraform output -raw pages_project_name
```

Then configure the GitHub repository under **Settings → Secrets and variables → Actions**.

Repository secrets:

- `CLOUDFLARE_API_TOKEN` — create a separate token with Cloudflare Pages Edit for routine application deployment. Do not reuse the broader Terraform token.
- `CLOUDFLARE_ACCOUNT_ID` — the account ID that owns the Pages project.

Repository variable:

- `CLOUDFLARE_PAGES_PROJECT_NAME` — the exact `pages_project_name` Terraform output.

The production workflow first validates these values and verifies through the Cloudflare Pages API that the project already exists and has `main` as its production branch. Only then does Wrangler upload `dist/` and the root `functions/` directory as the production deployment.

The deployment token must not receive DNS, Access, R2-management, or other Terraform infrastructure permissions. No GitHub Actions workflow runs `terraform apply`.

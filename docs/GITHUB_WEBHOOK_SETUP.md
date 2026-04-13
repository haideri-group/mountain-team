# GitHub Webhook Setup for TeamFlow Deployment Tracking

This guide walks through setting up GitHub webhooks so TeamFlow receives real-time deployment notifications.

---

## Prerequisites

- **GitHub Admin access** to the repository
- **TeamFlow app URL** (e.g., `https://haider-team.appz.cc`)
- **GITHUB_WEBHOOK_SECRET** value (same as configured in TeamFlow's environment)

---

## Step 1: Open Webhook Settings

1. Go to the GitHub repository (e.g., `https://github.com/tilemountainuk/tile-mountain-sdk`)
2. Click **Settings** tab
3. Click **Webhooks** in the left sidebar
4. Click **Add webhook**

---

## Step 2: Configure the Webhook

### Payload URL
```
https://YOUR-TEAMFLOW-DOMAIN/api/webhooks/github
```
Replace `YOUR-TEAMFLOW-DOMAIN` with your actual domain (e.g., `haider-team.appz.cc`).

### Content type
Select **application/json**

### Secret
Enter the `GITHUB_WEBHOOK_SECRET` value from your TeamFlow environment variables.

### Which events?
Select **"Let me select individual events"** and check:

- [x] **Deployment statuses** — fires when CI deploys to an environment
- [x] **Pull requests** — fires when PRs are merged to deployment branches

Uncheck **"Pushes"** (not needed).

### Active
Make sure the webhook is **Active**.

---

## Step 3: Save

Click **Add webhook**. GitHub will send a ping event to verify the URL is reachable.

---

## Step 4: Verify

1. Merge a PR with a JIRA key (e.g., `PROD-5123`) to a deployment branch (e.g., `stage-tilemtn`)
2. Go to TeamFlow → Issues → open PROD-5123
3. The "Deployments" section in the sidebar should show the staging deployment

---

## Repeat for Backend Repo

Follow the same steps for `tilemountainuk/tilemountain2` using the same webhook URL and secret.

---

## Troubleshooting

### Webhook deliveries failing
1. Go to **Settings → Webhooks → click the webhook**
2. Scroll to **Recent Deliveries**
3. Check HTTP response codes:
   - **200** = Success
   - **401** = Invalid secret (check GITHUB_WEBHOOK_SECRET matches)
   - **500** = Server error (check TeamFlow logs)

### Deployments not appearing
- The JIRA key must be in the PR title, source branch name, or commit messages
- The target branch must be configured in TeamFlow Settings → GitHub Repositories
- The repo must be tracked in TeamFlow Settings

---

## Reference

- [GitHub Docs: Webhooks](https://docs.github.com/en/webhooks)
- [GitHub Docs: Webhook Events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

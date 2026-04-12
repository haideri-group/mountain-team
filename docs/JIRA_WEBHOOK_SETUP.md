# JIRA Webhook Setup for TeamFlow

This guide walks through setting up a JIRA Cloud webhook so that TeamFlow receives real-time updates whenever issues are created, updated, or deleted in JIRA.

---

## Prerequisites

- **JIRA Admin access** (you need the "Administer Jira" global permission)
- **TeamFlow app URL** (the deployed URL, e.g., `https://teamflow.example.railway.app`)
- **Secret token** (provided by the TeamFlow admin -- used to verify webhook authenticity)

---

## Step 1: Open Webhook Settings

1. Log in to JIRA Cloud as an admin
2. Click the **gear icon** (Settings) in the **top-right corner**
3. Select **System** from the dropdown menu
4. In the left sidebar, scroll down to the **Advanced** section
5. Click **WebHooks**

> The URL in your browser should look like:
> `https://tilemountain.atlassian.net/plugins/servlet/webhooks`

---

## Step 2: Create a New Webhook

1. Click the **+ Create a WebHook** button (top-right of the page)

2. Fill in the form:

### Name
```
TeamFlow Issue Sync
```

### Status
Make sure the webhook is **Enabled**

### URL
```
https://YOUR-TEAMFLOW-DOMAIN/api/webhooks/jira
```
Replace `YOUR-TEAMFLOW-DOMAIN` with the actual TeamFlow app domain (e.g., `teamflow.up.railway.app`).

> **Important:** Only **HTTPS** URLs are accepted. The server must have a valid SSL/TLS certificate from a trusted certificate authority. HTTP and self-signed certificates will be rejected.

### Secret
Enter the secret token provided by the TeamFlow admin. This is used to verify that webhook requests genuinely come from JIRA.

> When a secret is configured, JIRA computes an HMAC-SHA256 hash of the request body using this secret and sends it in the `X-Hub-Signature` header. TeamFlow uses this to verify authenticity.

---

## Step 3: Configure the JQL Filter (Scope)

Under **Scope**, select **Issues matching the following JQL filter** and enter:

```
labels = "Frontend"
```

This ensures the webhook only fires for issues that have the "Frontend" label, which are the issues TeamFlow tracks. Without this filter, the webhook would fire for every issue across all projects (unnecessary load).

> **Optional:** If you want to restrict to specific projects as well:
> ```
> project IN (PROD, BUTTERFLY, EAGLE, DOLPHIN, FALCON) AND labels = "Frontend"
> ```

---

## Step 4: Select Events

Under **Events**, select the following checkboxes:

### Issue Events (Required)
- [x] **Issue created** (`jira:issue_created`)
- [x] **Issue updated** (`jira:issue_updated`)
- [x] **Issue deleted** (`jira:issue_deleted`)

### Optional Events (Not Required)
You do **not** need to select:
- Comment events
- Worklog events
- Sprint events
- Board events
- Version events

> **Do NOT check "All events"** -- this would send unnecessary traffic to TeamFlow for events it doesn't process (comments, worklogs, etc.).

---

## Step 5: Save

Click the **Create** button at the bottom of the form.

The webhook should now appear in the list with status **Enabled**.

---

## Step 6: Verify It Works

To verify the webhook is working:

1. Go to any JIRA project (e.g., PROD)
2. Create a new test issue with the **"Frontend"** label
3. Check TeamFlow's Overview page -- the new issue should appear within a few seconds
4. Update the issue in JIRA (e.g., change status or assignee)
5. Verify the change is reflected in TeamFlow

---

## How It Works

When a JIRA issue with the "Frontend" label is created or updated:

1. JIRA sends an HTTP POST request to TeamFlow's webhook endpoint
2. TeamFlow verifies the request authenticity using the secret token
3. TeamFlow processes the issue data and updates its database
4. The change is immediately visible on the TeamFlow dashboard

This happens in real-time -- no manual sync button needed.

---

## Troubleshooting

### Webhook not firing
- Check that the webhook status is **Enabled**
- Verify the issue has the **"Frontend"** label (the JQL filter requires it)
- Check the webhook URL is correct and accessible from the internet

### Issues not appearing in TeamFlow
- The issue's project board must be **tracked** in TeamFlow Settings
- The assignee must be a **synced team member** in TeamFlow
- Unassigned issues are still synced but won't appear on developer cards

### Webhook delivery failures
- JIRA retries failed webhook deliveries up to **5 times**
- Retries are spaced 5-15 minutes apart with randomized backoff
- Check TeamFlow server logs for error details

### Viewing webhook delivery history
1. Go to **Settings > System > WebHooks**
2. Click on the **TeamFlow Issue Sync** webhook name
3. Scroll down to see recent delivery attempts and their HTTP response codes
   - **200** = Success
   - **401** = Invalid secret token
   - **500** = Server error (check TeamFlow logs)

---

## Security Notes

- The webhook URL should always use **HTTPS**
- The **secret token** ensures only JIRA can trigger the webhook
- TeamFlow does not store or expose any JIRA credentials through the webhook -- it only receives data
- The webhook only processes issues with the "Frontend" label; all other events are ignored

---

## Modifying the Webhook

To update the webhook later (e.g., change the URL or add more events):

1. Go to **Settings > System > WebHooks**
2. Click on the webhook name
3. Make your changes
4. Click **Save**

To temporarily stop the webhook without deleting it, toggle the **Status** to **Disabled**.

---

## Reference

- [Atlassian: Manage Webhooks](https://support.atlassian.com/jira-cloud-administration/docs/manage-webhooks/)
- [Atlassian: Webhooks - Jira Cloud Platform](https://developer.atlassian.com/cloud/jira/platform/webhooks/)
- [Atlassian: Jira Software Webhooks](https://developer.atlassian.com/cloud/jira/software/webhooks/)

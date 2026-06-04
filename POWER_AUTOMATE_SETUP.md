# Power Automate Setup — Teams Notification for Activity Planning

## How It Works

When a plan is submitted for approval, an approver signs, all approvals are complete, or an approver sends the plan back for revision, the server sends an email to your inbox. Power Automate watches for these emails and posts to a Teams channel thread, pinging each person in sequence.

```
PIC submits plan for approval
  → [ActivityPlan][SUBMITTED] email
  → Flow 1: Post Teams channel thread + @mention PROJECT LEADER

PROJECT LEADER signs
  → [ActivityPlan][SLOT_APPROVED] email  (nextRole: SUPERVISOR)
  → Flow 2: Reply to thread + @mention SUPERVISOR

SUPERVISOR signs
  → [ActivityPlan][SLOT_APPROVED] email  (nextRole: SECTION MANAGER)
  → Flow 2: Reply to thread + @mention SECTION MANAGER

SECTION MANAGER signs
  → [ActivityPlan][SLOT_APPROVED] email  (nextRole: DEPARTMENT MANAGER — if enabled)
  → Flow 2: Reply to thread + @mention DEPARTMENT MANAGER
  OR (if no DEPARTMENT MANAGER required)
  → [ActivityPlan][FULLY_APPROVED] email → plan auto-published
  → Flow 3: Reply to thread "All approved ✅" + @mention PIC

DEPARTMENT MANAGER signs (when required)
  → [ActivityPlan][FULLY_APPROVED] email → plan auto-published
  → Flow 3: Reply to thread "All approved ✅" + @mention PIC

Approver sends for revision
  → [ActivityPlan][FOR_REVISION] email
  → Flow 4: Reply to thread + @mention PIC with revision reason

PIC re-submits after revision
  → [ActivityPlan][RESUBMITTED] email (new version)
  → Flow 5: Reply to same thread + @mention PROJECT LEADER again
```

> **Note:** There is no Reject flow. The only approver action besides signing is "Send for Revision" (Flow 4).
> **Re-submit** uses a separate email trigger (`[RESUBMITTED]`) so Flow 5 can reply to the **existing thread** instead of starting a new one.

---

## Step 0 — Prerequisites

- SMTP configured in PM2 `ecosystem.config.js` (see deployment notes)
- For local testing: `.env.server` has `SMTP_HOST=mail-dcd.local.denso-ten.com`
- Power Automate account signed in with your M365 email (`jether.haniel.de.leon.a5s@ap.denso.com`)

---

## Step 1 — Create SharePoint List

Go to your SharePoint site → **New** → **List** → **Blank list**

- **Name:** `ActivityPlanThreads`

Add these columns (all **Single line of text**):

| Column name | Notes |
|---|---|
| `Title` | Already exists — will store the Plan ID |
| `TeamsMessageId` | ID of the root Teams channel message |
| `TeamsTeamId` | Your Team ID (hardcoded, same for all plans) |
| `TeamsChannelId` | Your Channel ID (hardcoded, same for all plans) |

### Your Team ID and Channel ID

From your Teams channel link:

| Field | Value |
|---|---|
| **TeamsTeamId** | `46e5e0d7-d5f0-4f1c-aeff-6b6a1799e6e3` |
| **TeamsChannelId** | `19:85f37c0f413f4a739cc3bdcc9825da1c@thread.tacv2` |

Use these exact values when hardcoding in the SharePoint list and Power Automate flows.

---

## Step 2 — Shared Expression (used in all 5 flows)

All flows extract the JSON payload from the email body. Use this expression every time:

**Action: Initialize variable**
- Name: `BodyText`
- Type: String
- Value *(expression)*: `triggerBody()?['body']`

**Action: Compose** (name it `ExtractJSON`)
- Inputs *(expression)*:
```
trim(first(split(last(split(variables('BodyText'), 'JSON_PAYLOAD_START')), 'JSON_PAYLOAD_END')))
```
> Splits by `JSON_PAYLOAD_START` → takes everything after → splits by `JSON_PAYLOAD_END` → takes everything before → trims whitespace. Works regardless of `\n` or `\r\n` line endings.

**Action: Parse JSON**
- Content: `outputs('ExtractJSON')`
- Schema: see each flow below

---

## Flow 1 — Plan Submitted → Start thread + @mention Project Leader

**Trigger:** When a new email arrives (V3)
- Folder: `Inbox`
- Subject Filter: `[ActivityPlan][SUBMITTED]`

> This flow fires on every submission — both the first submit and every re-submit after revision.

### Steps

**1. Extract + Parse JSON** (use shared steps above)

Parse JSON schema:
```json
{
  "type": "object",
  "properties": {
    "planId":          { "type": "string" },
    "planTitle":       { "type": "string" },
    "itNumber":        { "type": "string" },
    "planType":        { "type": "string" },
    "documentVersion": { "type": "string" },
    "viewLink":        { "type": "string" },
    "publishedAt":     { "type": "string" },
    "approvers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name":  { "type": "string" },
          "role":  { "type": "string" },
          "email": { "type": "string" }
        }
      }
    }
  }
}
```

**2. Filter array** [Data Operations] — find PROJECT LEADER
- From: `body('Parse_JSON')?['approvers']` *(expression)*
- Filter: `item()?['role']` **is equal to** `PROJECT LEADER`

**3. Condition:** `length(body('Filter_array'))` **is greater than** `0` AND email not empty
- `first(body('Filter_array'))?['email']` is not equal to *(empty)*

- **If yes:**
  - **Get user profile (V2)** [Office 365 Users]
    - User (UPN): `first(body('Filter_array'))?['email']` *(expression)*

**4. Build message — Initialize variable**
- Name: `MessageText`
- Type: `String`
- Value: *(leave empty)*

**4b. Append to string variable** × 5 — add each piece in order:

| # | Value (switch to expression mode for `concat` lines) |
|---|---|
| 1 | `📋 <strong>Activity Plan Submitted for Approval</strong><br><br>` |
| 2 | `concat('Title : ', body('Parse_JSON')?['planTitle'], '<br>IT Number : ', body('Parse_JSON')?['itNumber'], '<br>Type : ', body('Parse_JSON')?['planType'], ' | Version: v', body('Parse_JSON')?['documentVersion'], '<br><br>')` |
| 3 | `concat('<at>', body('Get_user_profile_(V2)')?['displayName'], '</at>')` |
| 4 | ` — please review and sign as PROJECT LEADER.<br>` |
| 5 | `concat('👉 Open & Sign: <a href="', body('Parse_JSON')?['viewLink'], '">', body('Parse_JSON')?['viewLink'], '</a>')` |

**4c. Post a message in a chat or channel** [Microsoft Teams]
- Post as: `Flow bot`
- Post in: `Channel`
- Team + Channel: *(select your team/channel)*
- Message *(switch to expression mode)*: `variables('MessageText')`

**5. Create item** [SharePoint]
- Site: *(your SharePoint site)*
- List name: `ActivityPlanThreads`
- Title: `body('Parse_JSON')?['planId']` *(expression)*
- TeamsMessageId: `outputs('Post_a_message_in_a_chat_or_channel')?['body']?['id']` *(expression)*
- TeamsTeamId: `46e5e0d7-d5f0-4f1c-aeff-6b6a1799e6e3`
- TeamsChannelId: `19:85f37c0f413f4a739cc3bdcc9825da1c@thread.tacv2`

---

## Flow 2 — Slot Approved → Reply to thread + @mention next approver

**Trigger:** When a new email arrives (V3)
- Subject Filter: `[ActivityPlan][SLOT_APPROVED]`

> Fires for each signing step: PROJECT LEADER, SUPERVISOR, SECTION MANAGER, and optionally DEPARTMENT MANAGER. The `nextSlot.role` field tells you who to ping next.

### Steps

**1. Extract + Parse JSON** (use shared steps above)

Parse JSON schema:
```json
{
  "type": "object",
  "properties": {
    "planId":    { "type": "string" },
    "planTitle": { "type": "string" },
    "itNumber":  { "type": "string" },
    "viewLink":  { "type": "string" },
    "approvedSlot": {
      "type": "object",
      "properties": { "name": { "type": "string" }, "role": { "type": "string" } }
    },
    "nextSlot": {
      "type": "object",
      "properties": {
        "name":  { "type": "string" },
        "role":  { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
}
```

**2. Get items** [SharePoint]
- Site: *(your SharePoint site)*
- List name: `ActivityPlanThreads`
- Filter Query expression: `concat('Title eq ''', body('Parse_JSON')?['planId'], '''')`

**3. Condition:** `body('Parse_JSON')?['nextSlot']?['email']` is not equal to *(empty)*

- **If yes:**
  - **Get user profile (V2)** [Office 365 Users]
    - User (UPN): `body('Parse_JSON')?['nextSlot']?['email']` *(expression)*

**4. Build message — Initialize variable**
- Name: `MessageText`
- Type: `String`
- Value: *(leave empty)*

**4b. Append to string variable** × 4:

| # | Value |
|---|---|
| 1 | `concat('✅ <strong>', body('Parse_JSON')?['approvedSlot']?['role'], '</strong> — ', body('Parse_JSON')?['approvedSlot']?['name'], ' has approved.<br><br>')` |
| 2 | `concat('<at>', body('Get_user_profile_(V2)')?['displayName'], '</at>')` |
| 3 | `concat(' — you are next as ', body('Parse_JSON')?['nextSlot']?['role'], '. Please review and sign.<br>')` |
| 4 | `concat('👉 <a href="', body('Parse_JSON')?['viewLink'], '">', body('Parse_JSON')?['viewLink'], '</a>')` |

**4c. Reply to a message in a channel** [Microsoft Teams]
- Team: *(select your team)*
- Channel: *(select your channel)*
- Message ID *(expression)*: `first(body('Get_items')?['value'])?['TeamsMessageId']`
- Message *(expression)*: `variables('MessageText')`

---

## Flow 3 — Fully Approved → Close thread + @mention PIC

**Trigger:** When a new email arrives (V3)
- Subject Filter: `[ActivityPlan][FULLY_APPROVED]`

> Fires when all required approvers have signed. The plan status is automatically set to **Published** by the server at this point.

### Steps

**1. Extract + Parse JSON** (use shared steps above)

Parse JSON schema:
```json
{
  "type": "object",
  "properties": {
    "planId":    { "type": "string" },
    "planTitle": { "type": "string" },
    "itNumber":  { "type": "string" },
    "viewLink":  { "type": "string" },
    "pic": {
      "type": "object",
      "properties": { "name": { "type": "string" }, "email": { "type": "string" } }
    }
  }
}
```

**2. Get items** [SharePoint] — same as Flow 2, filter by planId

**3. Condition:** `body('Parse_JSON')?['pic']?['email']` is not equal to *(empty)*

- **If yes:**
  - **Get user profile (V2)** [Office 365 Users]
    - User (UPN): `body('Parse_JSON')?['pic']?['email']` *(expression)*

**4. Build message — Initialize variable**
- Name: `MessageText`
- Type: `String`
- Value: *(leave empty)*

**4b. Append to string variable** × 4:

| # | Value |
|---|---|
| 1 | `🎉 <strong>All Approvals Complete — Plan Published!</strong><br><br>` |
| 2 | `concat('<at>', body('Get_user_profile_(V2)')?['displayName'], '</at>')` |
| 3 | `concat(' — your activity plan "', body('Parse_JSON')?['planTitle'], '" has been fully approved and is now published!<br>')` |
| 4 | `concat('👉 View: <a href="', body('Parse_JSON')?['viewLink'], '">', body('Parse_JSON')?['viewLink'], '</a>')` |

**4c. Reply to a message in a channel** [Microsoft Teams]
- Team: *(select your team)*
- Channel: *(select your channel)*
- Message ID *(expression)*: `first(body('Get_items')?['value'])?['TeamsMessageId']`
- Message *(expression)*: `variables('MessageText')`

---

## Flow 4 — For Revision → Reply to thread + @mention PIC

**Trigger:** When a new email arrives (V3)
- Subject Filter: `[ActivityPlan][FOR_REVISION]`

> Fires when an approver sends the plan back for revision. The PIC is notified to make changes and re-submit.

### Steps

**1. Extract + Parse JSON** (use shared steps above)

Parse JSON schema:
```json
{
  "type": "object",
  "properties": {
    "planId":    { "type": "string" },
    "planTitle": { "type": "string" },
    "itNumber":  { "type": "string" },
    "viewLink":  { "type": "string" },
    "reason":    { "type": "string" },
    "by":        { "type": "string" },
    "pic": {
      "type": "object",
      "properties": { "name": { "type": "string" }, "email": { "type": "string" } }
    }
  }
}
```

**2. Get items** [SharePoint] — filter by planId (same as Flow 2)

**3. Condition:** `body('Parse_JSON')?['pic']?['email']` is not equal to *(empty)*

- **If yes:**
  - **Get user profile (V2)** [Office 365 Users]
    - User (UPN): `body('Parse_JSON')?['pic']?['email']` *(expression)*

**4. Build message — Initialize variable**
- Name: `MessageText`, Type: `String`, Value: *(empty)*

**4b. Append to string variable** × 4:

| # | Value |
|---|---|
| 1 | `concat('⟳ <strong>Sent for Revision</strong> by ', body('Parse_JSON')?['by'], '<br><br>')` |
| 2 | `concat('<at>', body('Get_user_profile_(V2)')?['displayName'], '</at>')` |
| 3 | `concat(' — your activity plan "', body('Parse_JSON')?['planTitle'], '" needs revision.<br>Reason: ', body('Parse_JSON')?['reason'], '<br>')` |
| 4 | `concat('👉 Edit & Re-submit: <a href="', body('Parse_JSON')?['viewLink'], '">', body('Parse_JSON')?['viewLink'], '</a>')` |

**4c. Reply to a message in a channel** [Microsoft Teams]
- Team + Channel: *(select your team/channel)*
- Message ID *(expression)*: `first(body('Get_items')?['value'])?['TeamsMessageId']`
- Message *(expression)*: `variables('MessageText')`

---

## Flow 5 — Re-submitted → Reply to same thread + @mention Project Leader

**Trigger:** When a new email arrives (V3)
- Subject Filter: `[ActivityPlan][RESUBMITTED]`

> Fires when the PIC re-submits after revision. Replies to the **existing** Teams thread so the conversation stays in one place, and @mentions PROJECT LEADER to begin the approval cycle again.

### Steps

**1. Extract + Parse JSON** (use shared steps above)

Parse JSON schema: *(same as Flow 1 — `planId`, `planTitle`, `itNumber`, `planType`, `documentVersion`, `viewLink`, `publishedAt`, `approvers[]`)*

```json
{
  "type": "object",
  "properties": {
    "planId":          { "type": "string" },
    "planTitle":       { "type": "string" },
    "itNumber":        { "type": "string" },
    "planType":        { "type": "string" },
    "documentVersion": { "type": "string" },
    "viewLink":        { "type": "string" },
    "publishedAt":     { "type": "string" },
    "approvers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name":  { "type": "string" },
          "role":  { "type": "string" },
          "email": { "type": "string" }
        }
      }
    }
  }
}
```

**2. Get items** [SharePoint] — find the existing thread for this plan
- Filter Query expression: `concat('Title eq ''', body('Parse_JSON')?['planId'], '''')`

**3. Filter array** [Data Operations] — find PROJECT LEADER
- From: `body('Parse_JSON')?['approvers']` *(expression)*
- Filter: `item()?['role']` **is equal to** `PROJECT LEADER`

**4. Condition:** `length(body('Filter_array'))` **is greater than** `0` AND email not empty
- `first(body('Filter_array'))?['email']` is not equal to *(empty)*

- **If yes:**
  - **Get user profile (V2)** [Office 365 Users]
    - User (UPN): `first(body('Filter_array'))?['email']` *(expression)*

**5. Build message — Initialize variable**
- Name: `MessageText`, Type: `String`, Value: *(empty)*

**5b. Append to string variable** × 5:

| # | Value |
|---|---|
| 1 | `concat('⟳ <strong>Plan Re-submitted for Approval</strong> — v', body('Parse_JSON')?['documentVersion'], '<br><br>')` |
| 2 | `concat('Title : ', body('Parse_JSON')?['planTitle'], '<br>IT Number : ', body('Parse_JSON')?['itNumber'], '<br><br>')` |
| 3 | `concat('<at>', body('Get_user_profile_(V2)')?['displayName'], '</at>')` |
| 4 | ` — the plan has been revised and re-submitted. Please review and sign as PROJECT LEADER.<br>` |
| 5 | `concat('👉 Open & Sign: <a href="', body('Parse_JSON')?['viewLink'], '">', body('Parse_JSON')?['viewLink'], '</a>')` |

**5c. Reply to a message in a channel** [Microsoft Teams]
- Team + Channel: *(select your team/channel)*
- Message ID *(expression)*: `first(body('Get_items')?['value'])?['TeamsMessageId']`
- Message *(expression)*: `variables('MessageText')`

---

## Approval Role Reference

| Approval slot | Role name | Position in Approver Maintenance |
|---|---|---|
| PREPARED BY | PIC | — (free text, set by creator) |
| REVIEWED BY | PROJECT LEADER | PROJECT LEADER |
| APPROVED BY | SUPERVISOR | SUPERVISOR |
| APPROVED BY | SECTION MANAGER | SECTION MANAGER |
| APPROVED BY *(optional)* | DEPARTMENT MANAGER | DEPARTMENT MANAGER |

> The **Department Manager** slot is optional — it is enabled per-plan via the "Requires Department Manager approval" checkbox in the Approval section.

---

## Testing Checklist

- [ ] `.env.server` has correct `SMTP_HOST`, `SMTP_TO`, and `FRONTEND_ORIGIN=http://localhost:5173`
- [ ] Restart dev server: `npm run dev:all`
- [ ] In a plan, fill in PIC email in the Approval tab (PREPARED BY slot)
- [ ] Fill in approvers: PROJECT LEADER, SUPERVISOR, SECTION MANAGER (select from dropdown)
- [ ] Submit the plan → check terminal: `[mailer] Plan published email sent`
- [ ] Check Outlook inbox → email arrives with subject `[ActivityPlan][SUBMITTED] ...`
- [ ] In Power Automate → Flow 1 → **Test → Manually** → run → verify Teams channel post with @mention of PROJECT LEADER
- [ ] In PlanViewer, sign as PROJECT LEADER → terminal shows `[SLOT_APPROVED]` email
- [ ] Run Flow 2 manually → Teams thread gets a reply with @mention of SUPERVISOR
- [ ] Sign as SUPERVISOR → Flow 2 again → SECTION MANAGER is @mentioned in thread reply
- [ ] Sign as SECTION MANAGER → `[FULLY_APPROVED]` email → Flow 3 → PIC is @mentioned, plan is Published
- [ ] *(Optional)* Enable Dept Manager on the plan → sign as SECTION MANAGER → Flow 2 → DEPARTMENT MANAGER @mentioned → sign as DEPARTMENT MANAGER → Flow 3 fires
- [ ] In PlanViewer, click "Send for Revision" → `[FOR_REVISION]` email → Flow 4 → thread reply @mentions PIC with reason
- [ ] PIC edits and re-submits → `[RESUBMITTED]` email → Flow 5 → **replies to the same thread** with @mention of PROJECT LEADER and new version number

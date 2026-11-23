# Staging and production releases

| Environment | Git branch | Database |
| --- | --- | --- |
| Staging | `staging` | FLO Golf Staging, `evyvhuganzojdoazeedt` |
| Production | `main` | FLO Golf Draft, `wiprkjrczqkiadpdmvik` |

## Preview a change

1. Base the change on `staging`. Push it there, or merge a feature pull request into `staging`.
2. Open the successful Vercel deployment for that staging commit. Confirm the staging indicator and exercise the changed feature with test data. Use the commit's deployment link when requesting approval. The branch URL moves with each new deployment.

### Staging sign-in and integrations

Use the stable Vercel staging branch URL for email sign-in. In the staging Supabase project's **Authentication → URL Configuration**, set **Site URL** to that HTTPS origin and allow its exact `/auth/callback` URL. Open the sign-in email in the same browser that requested it. The staging sign-in uses the verified owner's email and Supabase's standard email link. Test data and login sessions belong to the staging project.

In Vercel, scope production credentials to **Production**. The staging app pins its separate public Supabase URL and publishable key at build time. Photo reading uses an optional server-side `STAGING_ANTHROPIC_API_KEY` scoped to trusted staging deployments. Keep preview access and fork deployment approvals restricted before making a paid test key available.

## Release the tested revision

1. Open a [pull request from staging to main](https://github.com/hubbs238/Flogolf/compare/main...staging?expand=1). Include the staging commit SHA, its preview URL, what was tested, and any database steps.
2. Wait for **FLO release checks** and **Vercel** to pass. The checks verify that the merged files match the staging revision. If this check fails after a change on `main`, merge `main` into `staging` and test that deployment.
3. Andrew reviews the preview and confirms the SHA. For a sole maintainer, manually pressing **Merge pull request** and confirming the merge is the release approval. Keep auto-merge off. If staging advances, review the new deployment before merging.
4. Vercel rebuilds the merged code on `main` with production settings. Check the deployment and the changed feature on [the production site](https://www.flogolfdraft.com). Keep the long-lived `staging` branch after the merge.

### GitHub settings for enforcement

In [repository rules](https://github.com/hubbs238/Flogolf/settings/rules), use **New ruleset → Import a ruleset** with [main-ruleset.json](main-ruleset.json), then save and confirm it is active. This rule requires a pull request and **FLO release checks**. On a production PR the check verifies the FLO Golf Vercel deployment status for the staging commit itself. The rule blocks force pushes and deletions and has an empty bypass list. It uses zero required *other* reviewers while Andrew is the only maintainer. The manual merge is his decision. Without an active rule, a direct push to `main` can bypass the PR checks. Turn off automatic branch deletion in repository settings if enabled.

## Database and recovery

Staging has its own Auth accounts, Storage and database. Use synthetic test rounds. Keep stage-only admin bootstrap, test rows, users and photo uploads in staging.

For a schema change, commit a new versioned SQL migration, apply it on the staging project, and test a clean run and its interaction with the app. Include the migration, target production project, rollout order, and recovery steps in the release approval. Historical migration records differ between projects. Review the target's existing schema and migration history before applying the approved migration. Replaying the entire migrations directory against a live project can repeat historical data updates. A Git merge deploys application code; it does not apply SQL or copy staging data.

If a release fails, redeploy the last working **production** deployment in Vercel and reconcile the Git change with a staged revert. Review database recovery separately since an app rollback does not roll back a database migration.

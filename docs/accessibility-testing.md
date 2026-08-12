# Accessibility Testing

The frontend uses `@axe-core/playwright` to scan critical user surfaces against
WCAG 2 A/AA and WCAG 2.1 A/AA rules. Serious and critical violations fail CI.
The smoke suite covers public login, manager dashboard, invoices, imports,
feature settings, and the tenant room on desktop, plus login and dashboard at a
390 by 844 mobile viewport.

Run the dedicated suite after migrating and seeding the E2E database:

```powershell
cd front-end
npm run test:a11y
```

The normal `npm run test:e2e` command and the CI end-to-end job also include the
accessibility suite. Failure output includes the axe rule, impact, help text,
and CSS targets. Fix the underlying semantic, naming, contrast, or focus issue;
do not disable a rule without documenting a verified false positive and its
scope.

Automation supplements keyboard and screen-reader review. Before a release
that changes navigation, dialogs, forms, or tables, manually verify keyboard
order, visible focus, dialog focus trapping, zoom at 200%, and announcements
for loading and error states.

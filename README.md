# Simple CRM (desktop)

A simple Windows desktop CRM for keeping track of leads and customers on one computer.

## Features
- Leads and customers: name, phone, email (optional), address with Google Maps autocomplete, city
- Lead sources: Facebook ads, Instagram ads, door to door, yard sign, car magnet, Nextdoor, website SEO, word of mouth (with "Referred by")
- Multiple services per contact with a quote amount (leads) or service price (customers), in CAD
- Next meeting date/time and reason; dashboard shows upcoming and overdue meetings
- Activity log per contact (calls, meetings, emails, notes)
- Search, filter and sort; convert a lead into a customer
- Appearance modes: Classic, Dark, GreenGlow, Ocean, Sand
- Trash: recover or permanently delete; auto-deleted after 60 days
- Export to a formatted spreadsheet for Google Sheets, backups, automatic daily backups (last 10)

## Run from source
```bash
npm install
npm start
```

## Build the Windows installer
```bash
npm run dist:win
```
Creates `dist/Simple-CRM-Setup-<version>.exe`.

Data is stored in `%APPDATA%\Simple CRM\crm.json` (backups in the `backups` subfolder).

## Releasing a new version (automatic updates)
1. Raise `"version"` in `package.json`.
2. Commit and push to `main`.

GitHub Actions (`.github/workflows/release.yml`) then builds the Windows installer and publishes it
as a GitHub Release. Installed apps check the latest release and update themselves.

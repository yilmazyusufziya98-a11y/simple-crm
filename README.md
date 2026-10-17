# Simple CRM (desktop)

A simple Windows desktop CRM for keeping track of leads and customers on one computer.

## Features
- Leads and customers: name, phone, email (optional), address with Google Maps autocomplete, city
- Lead sources: Facebook ads, Instagram ads, door to door, yard sign, car magnet, Nextdoor, website SEO
- Multiple services per contact with a quote amount (leads) or service price (customers), in CAD
- Next meeting date/time and reason; dashboard shows upcoming and overdue meetings
- Activity log per contact (calls, meetings, emails, notes)
- Search, filter and sort; convert a lead into a customer
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
2. `npm run dist:win`
3. Create a GitHub Release tagged `v<version>` and upload these files from `dist/`:
   `Simple-CRM-Setup-<version>.exe`, `Simple-CRM-Setup-<version>.exe.blockmap` and `latest.yml`.

Installed apps check this repository's latest release and update themselves.

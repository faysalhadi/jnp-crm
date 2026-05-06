# JNP Client CRM — Laptop for Less

A full-featured WhatsApp CRM for laptop reselling business in UAE.

## Deploy to Vercel (Step by Step)

### Step 1 — Push to GitHub
1. Create a new repo on github.com called `jnp-crm`
2. Upload all these files to that repo

### Step 2 — Connect to Vercel
1. Go to vercel.com
2. Sign up with your GitHub account
3. Click "Add New Project"
4. Select your `jnp-crm` repo
5. Click "Deploy"

### Step 3 — Add Environment Variables in Vercel
Go to Project Settings → Environment Variables and add:

| Name | Value |
|------|-------|
| REACT_APP_SUPABASE_URL | https://etllzmvkhgnpyudkagck.supabase.co |
| REACT_APP_SUPABASE_ANON_KEY | your anon key here |
| REACT_APP_ANTHROPIC_KEY | (leave empty — user enters in app) |

### Step 4 — Redeploy
After adding env variables, click "Redeploy" in Vercel.

Your app will be live at: https://jnp-crm.vercel.app

## Features
- Login screen (Supabase Auth)
- Customer profiles with delete
- Multiple deals per customer
- AI reply assistant (Claude API)
- Pipeline with 7 stages
- AI stage suggestions
- Edit & Confirm Sent
- Voice note support
- Outreach & Follow-up mode
- Payment tracking
- Serial number logging
- Revenue dashboard
- Search & filters
- Cloud storage (Supabase)
- Works on any device

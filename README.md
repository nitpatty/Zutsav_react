# Testing
# Zutsav — Spiritual Platform

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local) running on port 27017

---

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Razorpay, WhatsApp keys
npm run dev
```
Server runs at: http://localhost:5000

---

### Frontend Setup

```bash
cd frontend
npm install
npm start
```
App runs at: http://localhost:3000

---

## Create Admin Account

After starting the backend, register a user normally, then open MongoDB shell:

```bash
mongosh zutsav
db.users.updateOne({ phone: "9876543210" }, { $set: { role: "admin" } })
```

---

## WhatsApp Setup (Graph API)

1. Go to https://developers.facebook.com
2. Create a Meta App → WhatsApp product
3. Get Phone Number ID and Access Token
4. Add to .env:
   ```
   WHATSAPP_PHONE_NUMBER_ID=your_id
   WHATSAPP_ACCESS_TOKEN=your_token
   ```

WhatsApp sends **plain text messages** (not templates) for:
- Booking confirmation after payment
- Pandit assignment notification

---

## Pincode Autofill

Uses free public API: `https://api.postalpincode.in/pincode/{pincode}`
Auto-fills State, City, District. No API key required.

---

## CSV Festival Upload

Format: `name, date (YYYY-MM-DD), tithiDate, panchang, description`
See `backend/sample_festivals.csv` for example.

---

## Key Features

| Feature | Implementation |
|---|---|
| Pincode autofill | postalpincode.in API (frontend, no backend needed) |
| WhatsApp notifications | WhatsApp Cloud API (Graph API) |
| Payments | Razorpay (UPI/Card/Net Banking) |
| File uploads | Multer → local `uploads/` folder |
| Admin pandit assign | Admin picks from available pandits, user gets WhatsApp |
| Pandit availability | Date ranges + day-of-week + time slots |
| Pandit blocking | Override availability to stop bookings for specific dates |
| Festival CSV import | Admin uploads CSV → auto-parsed and added |
| Profile photo | All roles: upload, change, remove |

---

## API Base URL
`http://localhost:5000/api`

## Roles
- `user` — default on register
- `pandit` — auto-assigned after pandit registration
- `admin` — manually set in MongoDB


# changes
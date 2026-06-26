const nodemailer     = require('nodemailer');
const settings       = require('./settingsService');
const NotificationLog = require('../models/NotificationLog');

async function _buildTransporter() {
  const emailUser    = await settings.get('emailSmtpUser',     process.env.EMAIL_USER);
  const emailPass    = await settings.get('emailSmtpPassword', process.env.EMAIL_PASS);
  const smtpHost     = await settings.get('emailSmtpHost');
  const smtpPort     = await settings.get('emailSmtpPort',     587);
  const senderName   = await settings.get('emailSenderName',   'Zutsav');

  if (!emailUser || !emailPass) return null;

  const port   = Number(smtpPort);
  const secure = port === 465;
  const config = smtpHost
    ? { host: smtpHost, port, secure, auth: { user: emailUser, pass: emailPass } }
    : { service: 'gmail', auth: { user: emailUser, pass: emailPass } };

  return { transport: nodemailer.createTransport(config), emailUser, senderName };
}

/**
 * meta: { event, templateName, recipientId, recipientName, _noInternalLog }
 */
const sendEmail = async (to, subject, html, meta = {}) => {
  const built = await _buildTransporter();
  if (!built) { console.warn('Email not configured — skipping'); return; }
  const { transport, emailUser, senderName } = built;

  let logEntry = null;
  if (!meta._noInternalLog) {
    logEntry = await NotificationLog.create({
      type:           'email',
      event:          meta.event || 'system',
      templateName:   meta.templateName || '',
      recipientEmail: to,
      recipientId:    meta.recipientId || null,
      recipientName:  meta.recipientName || '',
      subject,
      status:         'processing',
    }).catch(() => null);
  }

  try {
    await transport.sendMail({ from: `"${senderName}" <${emailUser}>`, to, subject, html });
    console.log(`Email sent to ${to}: ${subject}`);
    if (logEntry) { logEntry.status = 'delivered'; logEntry.response = { message: 'Sent' }; await logEntry.save().catch(() => {}); }
  } catch (err) {
    console.error(`Email error to ${to}:`, err.message);
    if (logEntry) { logEntry.status = 'failed'; logEntry.error = err.message; await logEntry.save().catch(() => {}); }
  }
};

// ── Templates ─────────────────────────────────────────────────

const sendBookingConfirmedEmail = (booking, poojaName) => {
  if (!booking.userDetails?.email) return;
  const breakdown = booking.commissionPercent > 0
    ? `
        <tr><td style="padding:6px 0;color:#6b7280">Base Price</td><td>&#8377;${booking.baseAmount || booking.amount}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Platform Fee (${booking.commissionPercent}%)</td><td>&#8377;${booking.commissionAmount || 0}</td></tr>
        ${booking.gstPercent > 0 ? `<tr><td style="padding:6px 0;color:#6b7280">GST (${booking.gstPercent}%)</td><td>&#8377;${booking.gstAmount || 0}</td></tr>` : ''}
        <tr style="border-top:1px solid #e5e7eb"><td style="padding:6px 0;font-weight:700">Total Paid</td><td style="font-weight:700">&#8377;${booking.amount}</td></tr>
      `
    : `<tr><td style="padding:6px 0;color:#6b7280">Amount Paid</td><td><strong>&#8377;${booking.amount}</strong></td></tr>`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c;margin-bottom:4px">&#127774; Booking Confirmed</h2>
      <p style="color:#374151">Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p style="color:#374151">Your booking for <strong>${poojaName}</strong> has been confirmed. Our team will assign a suitable pandit shortly.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Booking No</td><td><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Pooja</td><td>${poojaName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td>${new Date(booking.scheduledDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Time</td><td>${booking.scheduledTime}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Language</td><td>${booking.language || 'Hindi'}</td></tr>
        ${breakdown}
      </table>
      <p style="color:#6b7280;font-size:13px">You will be notified once a pandit is assigned to your booking.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Booking Confirmed — ${poojaName} (#${booking.bookingNumber})`, html);
};

const sendPanditAssignedEmail = (booking, pandit) => {
  if (!booking.userDetails?.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c">&#127774; Pandit Assigned</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>A pandit has been assigned for your booking <strong>#${booking.bookingNumber}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;color:#6b7280">Pandit</td><td><strong>${pandit.name}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Contact</td><td>+91-${pandit.phone}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Date</td><td>${new Date(booking.scheduledDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Time</td><td>${booking.scheduledTime}</td></tr>
      </table>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Pandit Assigned — Booking #${booking.bookingNumber}`, html);
};

const sendCompletionOtpEmail = (booking, poojaName, otp) => {
  if (!booking.userDetails?.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c">&#127774; Pooja Completion OTP</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>Your pandit has marked the pooja <strong>${poojaName}</strong> as ready to complete.</p>
      <p>Please share this OTP with your pandit to confirm completion:</p>
      <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#92400e">${otp}</div>
        <p style="color:#78350f;font-size:13px;margin:8px 0 0">Valid for 10 minutes</p>
      </div>
      <p style="color:#ef4444;font-size:13px"><strong>Do NOT share this OTP with anyone other than your pandit.</strong></p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Completion OTP — Booking #${booking.bookingNumber}`, html);
};

const sendTestConnectionEmail = async (to) => {
  return sendEmail(to, 'Zutsav SMTP Test', `
    <div style="font-family:sans-serif;padding:24px">
      <h2 style="color:#b91c1c">&#9989; SMTP Connection Successful</h2>
      <p>Your email configuration is working correctly.</p>
      <p style="color:#6b7280;font-size:13px">Sent from Zutsav admin panel.</p>
    </div>`);
};

const sendBookingCancelledEmail = (booking, poojaName, reason) => {
  if (!booking.userDetails?.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#dc2626">&#127774; Booking Cancelled</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>Your booking <strong>#${booking.bookingNumber}</strong> for <strong>${poojaName}</strong> has been cancelled.</p>
      ${reason ? `<p style="color:#6b7280">Reason: ${reason}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Booking No</td><td><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Pooja</td><td>${poojaName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Amount</td><td>&#8377;${booking.amount}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">If you paid for this booking and a refund is applicable, it will be processed within 5–7 business days. For queries, please contact support.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Booking Cancelled — #${booking.bookingNumber}`, html);
};

const sendBookingRefundedEmail = (booking, poojaName) => {
  if (!booking.userDetails?.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#16a34a">&#127774; Refund Initiated</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>Your refund for booking <strong>#${booking.bookingNumber}</strong> (${poojaName}) has been initiated.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Booking No</td><td><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Refund Amount</td><td><strong>&#8377;${booking.amount}</strong></td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">The refund will reflect in your account within 5–7 business days depending on your payment method.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Refund Initiated — Booking #${booking.bookingNumber}`, html);
};

const sendInvoiceEmail = (booking, poojaName) => {
  if (!booking.userDetails?.email) return;
  const completedDate = (booking.completedAt ? new Date(booking.completedAt) : new Date())
    .toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const serviceDate = booking.scheduledDate
    ? new Date(booking.scheduledDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
    : '—';

  const grandTotal   = booking.grandTotal || booking.amount || 0;
  const poojaAmt     = booking.poojaAmount || booking.baseAmount || 0;
  const kitAmt       = booking.kitAmount   || 0;
  const platFee      = booking.platformFee || booking.commissionAmount || 0;
  const platGST      = booking.platformGST || booking.gstAmount || 0;
  const kitGST       = booking.kitGST      || 0;
  const totalTax     = platGST + kitGST;
  const amtPaid      = booking.amountPaid  || grandTotal;
  const remaining    = booking.remainingAmount || 0;
  const isPartial    = booking.paymentStatus === 'PARTIALLY_PAID';

  const fmtINR = (n) => `&#8377;${(+(n||0)).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

  const lineRows = [
    poojaAmt > 0 && `<tr><td style="padding:10px 14px;color:#374151">${poojaName}</td><td style="padding:10px 14px;text-align:right">1</td><td style="padding:10px 14px;text-align:right">${fmtINR(poojaAmt)}</td><td style="padding:10px 14px;text-align:right;font-weight:600">${fmtINR(poojaAmt)}</td></tr>`,
    (booking.withKit && kitAmt > 0) && `<tr><td style="padding:10px 14px;color:#374151">Samagri Kit</td><td style="padding:10px 14px;text-align:right">1</td><td style="padding:10px 14px;text-align:right">${fmtINR(kitAmt)}</td><td style="padding:10px 14px;text-align:right;font-weight:600">${fmtINR(kitAmt)}</td></tr>`,
    platFee > 0 && `<tr><td style="padding:10px 14px;color:#374151">Platform Convenience Fee</td><td style="padding:10px 14px;text-align:right">1</td><td style="padding:10px 14px;text-align:right">${fmtINR(platFee)}</td><td style="padding:10px 14px;text-align:right;font-weight:600">${fmtINR(platFee)}</td></tr>`,
    (!poojaAmt && !platFee) && `<tr><td style="padding:10px 14px;color:#374151">${poojaName}</td><td style="padding:10px 14px;text-align:right">1</td><td style="padding:10px 14px;text-align:right">${fmtINR(grandTotal)}</td><td style="padding:10px 14px;text-align:right;font-weight:600">${fmtINR(grandTotal)}</td></tr>`,
  ].filter(Boolean).join('');

  const html = `
  <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:0 0 32px">

    <!-- Header -->
    <div style="background:#1B1F3B;padding:28px 32px;border-radius:12px 12px 0 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:24px;font-weight:900;font-family:Georgia,serif;color:#D4AF37;letter-spacing:-0.5px">
            Zutsav <span style="color:rgba(255,255,255,0.9);font-size:12px;font-weight:400;letter-spacing:2px;vertical-align:middle">ENTERPRISES</span>
          </div>
          <div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:4px">
            GSTIN: 09AAAFZ1234Z1Z5 &nbsp;|&nbsp; PAN: AAAFZ1234Z
          </div>
        </div>
        <div style="text-align:right">
          <div style="color:#D4AF37;font-size:18px;font-weight:900;font-family:Georgia,serif;letter-spacing:2px;text-transform:uppercase">Tax Invoice</div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px">Invoice #${booking.bookingNumber}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px">${completedDate}</div>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div style="background:white;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="margin:0 0 20px;color:#374151;font-size:15px">
        Namaste <strong>${booking.userDetails.name}</strong>, 🙏<br>
        <span style="color:#6b7280;font-size:13px">Your <strong>${poojaName}</strong> has been completed. Please find your tax invoice below.</span>
      </p>

      <!-- Service details -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#f8f9ff;border-radius:10px;overflow:hidden;border:1px solid #e0e7ff">
        <tr><td style="padding:10px 14px;color:#6b7280;font-size:13px;width:40%">Booking No</td><td style="padding:10px 14px;font-weight:700;color:#1B1F3B">#${booking.bookingNumber}</td></tr>
        <tr style="background:white"><td style="padding:10px 14px;color:#6b7280;font-size:13px">Service</td><td style="padding:10px 14px;font-weight:600;color:#374151">${poojaName}</td></tr>
        <tr><td style="padding:10px 14px;color:#6b7280;font-size:13px">Service Date</td><td style="padding:10px 14px;color:#374151">${serviceDate}</td></tr>
        <tr style="background:white"><td style="padding:10px 14px;color:#6b7280;font-size:13px">Time</td><td style="padding:10px 14px;color:#374151">${booking.scheduledTime || '—'}</td></tr>
        <tr><td style="padding:10px 14px;color:#6b7280;font-size:13px">Address</td><td style="padding:10px 14px;color:#374151;font-size:13px">${booking.userDetails.address || '—'}</td></tr>
      </table>

      <!-- Line items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
        <thead>
          <tr style="background:#1B1F3B">
            <th style="padding:10px 14px;text-align:left;color:white;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Description</th>
            <th style="padding:10px 14px;text-align:right;color:white;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
            <th style="padding:10px 14px;text-align:right;color:white;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Rate</th>
            <th style="padding:10px 14px;text-align:right;color:white;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Amount</th>
          </tr>
        </thead>
        <tbody style="border:1px solid #e5e7eb">${lineRows}</tbody>
        <tfoot>
          ${totalTax > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td colspan="3" style="padding:8px 14px;text-align:right;color:#6b7280">GST (18%)</td><td style="padding:8px 14px;text-align:right">${fmtINR(totalTax)}</td></tr>` : ''}
          <tr style="background:#1B1F3B">
            <td colspan="3" style="padding:13px 14px;text-align:right;color:#D4AF37;font-weight:800;font-size:14px">GRAND TOTAL</td>
            <td style="padding:13px 14px;text-align:right;color:#D4AF37;font-weight:900;font-size:16px">${fmtINR(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Payment status -->
      <div style="background:${isPartial ? '#fff7ed' : '#f0fdf4'};border:1.5px solid ${isPartial ? '#fed7aa' : '#bbf7d0'};border-radius:10px;padding:16px 20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">Amount Paid</div>
            <div style="font-size:20px;font-weight:900;color:${isPartial ? '#c2410c' : '#15803d'}">${fmtINR(amtPaid)}</div>
          </div>
          ${isPartial ? `<div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">Balance Due</div><div style="font-size:20px;font-weight:900;color:#c2410c">${fmtINR(remaining)}</div></div>` : ''}
          <div style="padding:6px 18px;border-radius:999px;font-weight:700;font-size:13px;background:${isPartial ? '#ffedd5' : '#dcfce7'};color:${isPartial ? '#c2410c' : '#15803d'};border:1.5px solid ${isPartial ? '#fed7aa' : '#86efac'};align-self:center">${isPartial ? 'Partially Paid' : 'Paid in Full'}</div>
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:20px">
        <a href="https://www.zutsav.com/my-bookings" style="display:inline-block;padding:12px 28px;background:#1B1F3B;color:white;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none">
          View Full Invoice &rarr;
        </a>
      </div>

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;line-height:1.6">
        Please retain this email as your payment record.<br>
        Support: info@zutsav.com · WhatsApp: +91-8851576605
      </p>
    </div>
  </div>`;

  return sendEmail(booking.userDetails.email, `Tax Invoice — ${poojaName} (#${booking.bookingNumber})`, html);
};

const sendServiceReminderEmail = (booking, poojaName, label) => {
  if (!booking.userDetails?.email) return;
  const date = new Date(booking.scheduledDate).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c">&#127774; Reminder — Your Pooja is ${label} Away</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>This is a friendly reminder that your <strong>${poojaName}</strong> is scheduled <strong>${label}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Booking No</td><td><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Pooja</td><td>${poojaName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td>${date}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Time</td><td>${booking.scheduledTime}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Address</td><td>${booking.userDetails.address}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">Please ensure the puja area is ready. For any changes contact us immediately.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Reminder: ${poojaName} is ${label} Away — #${booking.bookingNumber}`, html);
};

const sendFeedbackRequestEmail = (booking, poojaName) => {
  if (!booking.userDetails?.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c">&#127774; How Was Your Experience?</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>Your <strong>${poojaName}</strong> (Booking #${booking.bookingNumber}) has been completed. We hope it was a divine experience!</p>
      <p>We would love to hear your feedback. Please log in to Zutsav and rate your experience from your bookings section.</p>
      <p style="color:#6b7280;font-size:13px">Your feedback helps us serve you and others better.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav — Namaste &#127774;</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Share Your Feedback — ${poojaName} (#${booking.bookingNumber})`, html);
};

const sendKYCApprovedEmail = (pandit) => {
  if (!pandit.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#16a34a">&#9989; KYC Approved — Welcome to Zutsav!</h2>
      <p>Namaste <strong>${pandit.name}</strong>,</p>
      <p>Congratulations! Your KYC documents have been <strong>verified and approved</strong> by our admin team.</p>
      <p>You are now eligible to receive bookings on Zutsav. Please make sure your availability and pooja services are updated in your dashboard.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Status</td><td><strong style="color:#16a34a">KYC Approved &#9989;</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Name</td><td>${pandit.name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Phone</td><td>${pandit.phone || '—'}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">Login to your pandit dashboard to start accepting bookings.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(pandit.email, 'KYC Approved — You can now receive bookings on Zutsav', html);
};

const sendKYCRejectedEmail = (pandit, reason) => {
  if (!pandit.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#dc2626">&#10060; KYC Rejected</h2>
      <p>Namaste <strong>${pandit.name}</strong>,</p>
      <p>Unfortunately your KYC documents could not be approved at this time.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Reason</td><td><strong>${reason}</strong></td></tr>
      </table>
      <p>Please re-submit the correct documents from your pandit dashboard.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(pandit.email, 'KYC Rejected — Please re-submit documents', html);
};

const sendKYCReuploadEmail = (pandit, reason) => {
  if (!pandit.email) return;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#d97706">&#9888;&#65039; KYC Re-upload Required</h2>
      <p>Namaste <strong>${pandit.name}</strong>,</p>
      <p>Our team requires you to re-upload your KYC documents.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6b7280">Reason</td><td><strong>${reason}</strong></td></tr>
      </table>
      <p>Please login to your pandit dashboard and re-upload the required documents.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(pandit.email, 'KYC Re-upload Required — Action needed', html);
};

const sendPanditBookingAssignedEmail = (pandit, booking, poojaName) => {
  if (!pandit.email) return;
  const scheduledDate = new Date(booking.scheduledDate).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c">&#127774; New Pooja Assigned to You</h2>
      <p>Namaste <strong>${pandit.name}</strong>,</p>
      <p>A new pooja has been assigned to you. Please review the details and accept or reject from your dashboard.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;color:#6b7280">Booking No</td><td><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Pooja</td><td>${poojaName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Date</td><td>${scheduledDate}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Time</td><td>${booking.scheduledTime || 'As scheduled'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Location</td><td>${booking.userDetails?.address || ''}, ${booking.userDetails?.city || ''}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280">Customer</td><td>${booking.userDetails?.name || '—'} · ${booking.userDetails?.phone || '—'}</td></tr>
      </table>
      <p style="color:#dc2626;font-size:13px"><strong>Action Required:</strong> Please accept or reject this booking from your pandit dashboard within 2 hours.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(pandit.email, `New Booking Assigned — ${poojaName} (#${booking.bookingNumber})`, html);
};

const sendPartialPaymentEmail = (booking, poojaName) => {
  if (!booking.userDetails?.email) return;
  const amountPaid    = booking.amountPaid   || 0;
  const remaining     = booking.remainingAmount || 0;
  const grandTotal    = booking.grandTotal || booking.amount || 0;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#d97706">&#127774; Partial Payment Received</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>We have received your partial payment for <strong>${poojaName}</strong>. Your booking is confirmed!</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb">
        <tr style="background:#fef3c7"><td colspan="2" style="padding:8px;font-weight:700;color:#92400e">Payment Summary</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Booking No</td><td style="padding:8px"><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:8px;color:#6b7280">Pooja</td><td style="padding:8px">${poojaName}</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Date</td><td style="padding:8px">${new Date(booking.scheduledDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Booking Total</td><td style="padding:8px">&#8377;${grandTotal.toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px;color:#16a34a;font-weight:600">Amount Paid Now</td><td style="padding:8px;color:#16a34a;font-weight:600">&#8377;${amountPaid.toLocaleString('en-IN')}</td></tr>
        <tr style="background:#fef2f2"><td style="padding:8px;color:#dc2626;font-weight:600">Remaining Balance</td><td style="padding:8px;color:#dc2626;font-weight:700">&#8377;${remaining.toLocaleString('en-IN')}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">Please pay the remaining balance of <strong>&#8377;${remaining.toLocaleString('en-IN')}</strong> before or on the day of your ceremony. You can pay from your <strong>My Bookings</strong> section.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Partial Payment Received — ${poojaName} (#${booking.bookingNumber})`, html);
};

const sendFinalPaymentEmail = (booking, poojaName) => {
  if (!booking.userDetails?.email) return;
  const grandTotal = booking.grandTotal || booking.amount || 0;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#16a34a">&#127774; Full Payment Received</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>Your remaining balance for <strong>${poojaName}</strong> has been received. Your booking is now fully paid!</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb">
        <tr style="background:#dcfce7"><td colspan="2" style="padding:8px;font-weight:700;color:#166534">Payment Complete</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Booking No</td><td style="padding:8px"><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:8px;color:#6b7280">Pooja</td><td style="padding:8px">${poojaName}</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Total Amount</td><td style="padding:8px">&#8377;${grandTotal.toLocaleString('en-IN')}</td></tr>
        <tr style="border-top:2px solid #e5e7eb"><td style="padding:8px;color:#16a34a;font-weight:700">Status</td><td style="padding:8px;color:#16a34a;font-weight:700">Fully Paid &#9989;</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">No further payment is required for this booking.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Full Payment Received — ${poojaName} (#${booking.bookingNumber})`, html);
};

// ── Marketplace Order Invoice Email ──────────────────────────

const sendOrderInvoiceEmail = async (order, user) => {
  const email = user?.email || order.userId?.email;
  if (!email) return;

  const addr      = order.shippingAddress || {};
  const fmtINR    = (n) => `&#8377;${(+(n || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const invoiceNo = `INV-${order.orderNumber}`;

  const subtotal    = order.items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const total       = order.totalAmount || subtotal;
  const taxBase     = subtotal;
  const gstRate     = 0.18;
  const taxAmount   = Math.round(taxBase * gstRate * 100) / 100;
  const pretaxTotal = Math.round((total - taxAmount) * 100) / 100;

  const itemRows = order.items.map((it) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:10px 14px;color:#374151">${it.name}${it.variantLabel ? `<br><span style="font-size:11px;color:#9ca3af">${it.variantLabel}</span>` : ''}</td>
      <td style="padding:10px 14px;text-align:center">${it.quantity}</td>
      <td style="padding:10px 14px;text-align:right">${fmtINR(it.price)}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600">${fmtINR(it.price * it.quantity)}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8f9fa;padding:0 0 32px">

    <!-- Header -->
    <div style="background:#1B1F3B;padding:28px 32px;border-radius:12px 12px 0 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:24px;font-weight:900;font-family:Georgia,serif;color:#D4AF37;letter-spacing:-0.5px">
            &#128294; Zutsav <span style="color:rgba(255,255,255,0.8);font-size:11px;font-weight:400;letter-spacing:2px;vertical-align:middle">ENTERPRISES</span>
          </div>
          <div style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:6px">
            GSTIN: 09AAAFZ1234Z1Z5 &nbsp;|&nbsp; PAN: AAAFZ1234Z<br>
            info@zutsav.com &nbsp;|&nbsp; +91-8851576605
          </div>
        </div>
        <div style="text-align:right">
          <div style="color:#D4AF37;font-size:18px;font-weight:900;font-family:Georgia,serif;letter-spacing:2px;text-transform:uppercase">Tax Invoice</div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px">Invoice No: ${invoiceNo}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px">Order: #${order.orderNumber}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px">Date: ${orderDate}</div>
        </div>
      </div>
    </div>

    <!-- Bill To / Ship To -->
    <div style="background:white;padding:20px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;display:flex;gap:32px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Bill To</div>
        <div style="font-weight:700;color:#1B1F3B">${addr.name || user?.name || ''}</div>
        <div style="color:#6b7280;font-size:13px">${user?.phone || addr.phone || ''}</div>
        <div style="color:#6b7280;font-size:13px">${user?.email || email}</div>
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Ship To</div>
        <div style="font-weight:700;color:#1B1F3B">${addr.name || ''}</div>
        <div style="color:#6b7280;font-size:13px;line-height:1.5">${[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}</div>
        <div style="color:#6b7280;font-size:13px">${addr.phone || ''}</div>
      </div>
    </div>

    <!-- Items Table -->
    <div style="background:white;padding:0 32px 20px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1B1F3B">
            <th style="padding:10px 14px;text-align:left;color:white;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Product</th>
            <th style="padding:10px 14px;text-align:center;color:white;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
            <th style="padding:10px 14px;text-align:right;color:white;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Unit Price</th>
            <th style="padding:10px 14px;text-align:right;color:white;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr><td colspan="3" style="padding:8px 14px;text-align:right;color:#6b7280">Subtotal (excl. GST)</td><td style="padding:8px 14px;text-align:right">${fmtINR(pretaxTotal)}</td></tr>
          <tr><td colspan="3" style="padding:8px 14px;text-align:right;color:#6b7280">GST @ 18%</td><td style="padding:8px 14px;text-align:right">${fmtINR(taxAmount)}</td></tr>
          <tr style="background:#1B1F3B">
            <td colspan="3" style="padding:13px 14px;text-align:right;color:#D4AF37;font-weight:800;font-size:14px">GRAND TOTAL</td>
            <td style="padding:13px 14px;text-align:right;color:#D4AF37;font-weight:900;font-size:16px">${fmtINR(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Payment Status -->
    <div style="background:white;padding:16px 32px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:14px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:3px">Amount Paid</div>
          <div style="font-size:22px;font-weight:900;color:#15803d">${fmtINR(total)}</div>
        </div>
        <div style="padding:6px 20px;border-radius:999px;font-weight:700;font-size:13px;background:#dcfce7;color:#15803d;border:1.5px solid #86efac">
          &#9989; Paid in Full
        </div>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;line-height:1.7">
        This is a computer-generated invoice and does not require a physical signature.<br>
        For support: info@zutsav.com &nbsp;|&nbsp; +91-8851576605
      </p>
    </div>
  </div>`;

  return sendEmail(email, `Tax Invoice — Order #${order.orderNumber} | Zutsav`, html, {
    event: 'order_invoice', recipientId: user?._id || order.userId?._id, recipientName: addr.name || user?.name || '',
  });
};

// ── Delivery OTP Email ────────────────────────────────────────

const sendDeliveryOTPEmail = async (order, user, otp) => {
  const email = user?.email || order.userId?.email;
  if (!email) return;
  const name = order.shippingAddress?.name || user?.name || 'Customer';
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9ff;padding:0 0 24px">
    <div style="background:#1B1F3B;padding:20px 28px;border-radius:12px 12px 0 0;text-align:center">
      <div style="font-size:20px;font-weight:900;font-family:Georgia,serif;color:#D4AF37">&#128294; Zutsav</div>
    </div>
    <div style="background:white;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="margin:0 0 8px;color:#1B1F3B;font-size:16px;font-weight:700">Delivery OTP for Order #${order.orderNumber}</p>
      <p style="color:#374151;margin:0 0 20px">Namaste <strong>${name}</strong>, your order is out for delivery today!</p>
      <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px">
        <div style="font-size:40px;font-weight:900;letter-spacing:10px;color:#92400e;font-family:monospace">${otp}</div>
        <p style="color:#78350f;font-size:13px;margin:10px 0 0">Valid for 30 minutes &nbsp;|&nbsp; Single use only</p>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px">
        <p style="color:#dc2626;font-size:13px;margin:0;font-weight:600">&#9888; Please share this OTP only after receiving your complete order. Do NOT share it before delivery.</p>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:0">If you did not expect this delivery, contact us immediately at info@zutsav.com</p>
    </div>
  </div>`;
  return sendEmail(email, `Delivery OTP — Order #${order.orderNumber} | Zutsav`, html, {
    event: 'delivery_otp', recipientId: user?._id || order.userId?._id, recipientName: name,
  });
};

// ── Order Shipment Emails ─────────────────────────────────────

function _orderEmailWrapper(title, bodyHtml) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9ff">
    <div style="background:#1B1F3B;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#D4AF37;font-family:Georgia,serif;font-size:22px;margin:0">🪔 Zutsav</h1>
      <p style="color:rgba(255,255,255,0.7);font-size:12px;margin:6px 0 0">Spiritual Services &amp; Marketplace</p>
    </div>
    <div style="background:white;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="color:#1B1F3B;font-family:Georgia,serif;margin:0 0 16px">${title}</h2>
      ${bodyHtml}
      <p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
        You can track your order anytime from <a href="https://www.zutsav.com/my-orders" style="color:#1B1F3B;font-weight:600">My Orders</a>.
      </p>
    </div>
  </div>`;
}

const sendOrderShippedEmail = async (order, shipment) => {
  const userEmail = order.userId?.email;
  if (!userEmail) return;
  const addr      = order.shippingAddress || {};
  const courier   = shipment?.courierName || shipment?.deliveryPartner || order.courier || 'courier';
  const tracking  = shipment?.trackingNumber || shipment?.awbNumber || order.trackingId || '';
  const eta       = shipment?.estimatedDelivery
    ? new Date(shipment.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const body = `
    <p style="color:#374151">Hi <strong>${addr.name || 'there'}</strong>,</p>
    <p style="color:#374151">Your order <strong>#${order.orderNumber}</strong> has been shipped and is on its way to you! 🎉</p>
    <table style="width:100%;border-collapse:collapse;background:#f8f9ff;border-radius:10px;overflow:hidden;border:1px solid #e0e7ff;margin:16px 0">
      <tr style="border-bottom:1px solid #e0e7ff"><td style="padding:10px 14px;color:#6b7280;font-size:13px">Order Number</td><td style="padding:10px 14px;font-weight:700">#${order.orderNumber}</td></tr>
      ${courier ? `<tr style="border-bottom:1px solid #e0e7ff"><td style="padding:10px 14px;color:#6b7280;font-size:13px">Courier Partner</td><td style="padding:10px 14px;font-weight:700">${courier}</td></tr>` : ''}
      ${tracking ? `<tr style="border-bottom:1px solid #e0e7ff"><td style="padding:10px 14px;color:#6b7280;font-size:13px">Tracking Number</td><td style="padding:10px 14px;font-family:monospace;font-weight:700">${tracking}</td></tr>` : ''}
      ${eta      ? `<tr style="border-bottom:1px solid #e0e7ff"><td style="padding:10px 14px;color:#6b7280;font-size:13px">Expected Delivery</td><td style="padding:10px 14px;font-weight:700">${eta}</td></tr>` : ''}
      <tr><td style="padding:10px 14px;color:#6b7280;font-size:13px">Delivery Address</td><td style="padding:10px 14px;font-size:13px">${[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}</td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px">Please keep someone available at the delivery address to receive the package.</p>
    <p style="color:#b91c1c">🙏 Team Zutsav</p>`;
  return sendEmail(userEmail, `Your Order #${order.orderNumber} Has Been Shipped!`, _orderEmailWrapper('Your Order is on the Way! 🚚', body), {
    event: 'order_shipped', recipientId: order.userId?._id, recipientName: addr.name || '',
  });
};

const ORDER_STATUS_EMAIL_META = {
  out_for_delivery: {
    subject: (num) => `Your Order #${num} is Out for Delivery Today!`,
    heading: 'Out for Delivery 🛵',
    body: (order) => `<p style="color:#374151">Hi <strong>${order.shippingAddress?.name || 'there'}</strong>,</p>
      <p style="color:#374151">Great news! Your order <strong>#${order.orderNumber}</strong> is out for delivery and will reach you today. Please keep someone available at your delivery address.</p>
      <p style="color:#6b7280;font-size:13px">Total: <strong>₹${(order.totalAmount || 0).toLocaleString('en-IN')}</strong></p>
      <p style="color:#b91c1c">🙏 Team Zutsav</p>`,
  },
  delivered: {
    subject: (num) => `Your Order #${num} Has Been Delivered!`,
    heading: 'Order Delivered ✅',
    body: (order) => `<p style="color:#374151">Hi <strong>${order.shippingAddress?.name || 'there'}</strong>,</p>
      <p style="color:#374151">Your order <strong>#${order.orderNumber}</strong> has been successfully delivered. Thank you for shopping with Zutsav! 🎉</p>
      <p style="color:#374151">We hope you love your purchase. If you have any issues, please reach out to us.</p>
      <p style="color:#b91c1c">🙏 Team Zutsav</p>`,
  },
  cancelled: {
    subject: (num) => `Your Order #${num} Has Been Cancelled`,
    heading: 'Order Cancelled',
    body: (order) => `<p style="color:#374151">Hi <strong>${order.shippingAddress?.name || 'there'}</strong>,</p>
      <p style="color:#374151">We regret to inform you that your order <strong>#${order.orderNumber}</strong> has been cancelled.</p>
      ${order.cancelReason ? `<p style="color:#6b7280;font-size:13px">Reason: ${order.cancelReason}</p>` : ''}
      <p style="color:#374151">If a payment was made, the refund will be processed within 5–7 business days.</p>
      <p style="color:#b91c1c">🙏 Team Zutsav</p>`,
  },
  returned: {
    subject: (num) => `Your Order #${num} Has Been Returned`,
    heading: 'Order Returned',
    body: (order) => `<p style="color:#374151">Hi <strong>${order.shippingAddress?.name || 'there'}</strong>,</p>
      <p style="color:#374151">Your order <strong>#${order.orderNumber}</strong> has been returned to us. We will process any applicable refund within 5–7 business days.</p>
      <p style="color:#374151">If you have any questions, please contact our support team.</p>
      <p style="color:#b91c1c">🙏 Team Zutsav</p>`,
  },
};

const sendOrderStatusEmail = async (order, status) => {
  const userEmail = order.userId?.email;
  if (!userEmail) return;
  const meta = ORDER_STATUS_EMAIL_META[status];
  if (!meta) return;
  const bodyHtml = meta.body(order);
  return sendEmail(
    userEmail,
    meta.subject(order.orderNumber),
    _orderEmailWrapper(meta.heading, bodyHtml),
    { event: `order_${status}`, recipientId: order.userId?._id, recipientName: order.shippingAddress?.name || '' }
  );
};

module.exports = {
  sendEmail,
  sendBookingConfirmedEmail,
  sendPanditAssignedEmail,
  sendCompletionOtpEmail,
  sendTestConnectionEmail,
  sendBookingCancelledEmail,
  sendBookingRefundedEmail,
  sendInvoiceEmail,
  sendServiceReminderEmail,
  sendFeedbackRequestEmail,
  sendKYCApprovedEmail,
  sendKYCRejectedEmail,
  sendKYCReuploadEmail,
  sendPanditBookingAssignedEmail,
  sendPartialPaymentEmail,
  sendFinalPaymentEmail,
  sendOrderShippedEmail,
  sendOrderStatusEmail,
  sendOrderInvoiceEmail,
  sendDeliveryOTPEmail,
};

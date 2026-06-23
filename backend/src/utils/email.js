const nodemailer = require('nodemailer');
const settings   = require('./settingsService');

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

const sendEmail = async (to, subject, html) => {
  const built = await _buildTransporter();
  if (!built) { console.warn('Email not configured — skipping'); return; }
  const { transport, emailUser, senderName } = built;
  try {
    await transport.sendMail({ from: `"${senderName}" <${emailUser}>`, to, subject, html });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`Email error to ${to}:`, err.message);
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
  const completedDate = booking.completedAt
    ? new Date(booking.completedAt).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
      <h2 style="color:#b91c1c">&#127774; Invoice — ${poojaName}</h2>
      <p>Namaste <strong>${booking.userDetails.name}</strong>,</p>
      <p>Thank you for choosing Zutsav. Your pooja service has been completed successfully. Here is your invoice.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb">
        <tr style="background:#fef3c7"><td colspan="2" style="padding:8px;font-weight:700;color:#92400e">Invoice</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Booking No</td><td style="padding:8px"><strong>#${booking.bookingNumber}</strong></td></tr>
        <tr><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px">${poojaName}</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Date of Service</td><td style="padding:8px">${completedDate}</td></tr>
        <tr><td style="padding:8px;color:#6b7280">Base Amount</td><td style="padding:8px">&#8377;${booking.baseAmount || booking.amount}</td></tr>
        ${booking.commissionPercent > 0 ? `<tr><td style="padding:8px;color:#6b7280">Platform Fee (${booking.commissionPercent}%)</td><td style="padding:8px">&#8377;${booking.commissionAmount || 0}</td></tr>` : ''}
        ${booking.gstPercent > 0 ? `<tr><td style="padding:8px;color:#6b7280">GST (${booking.gstPercent}%)</td><td style="padding:8px">&#8377;${booking.gstAmount || 0}</td></tr>` : ''}
        <tr style="border-top:2px solid #e5e7eb"><td style="padding:8px;font-weight:700">Total Paid</td><td style="padding:8px;font-weight:700">&#8377;${booking.amount}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">Please keep this email as your payment record. We look forward to serving you again.</p>
      <p style="color:#b91c1c">&#128591; Team Zutsav</p>
    </div>`;
  return sendEmail(booking.userDetails.email, `Invoice — ${poojaName} (#${booking.bookingNumber})`, html);
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
};

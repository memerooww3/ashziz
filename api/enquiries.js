import { Resend } from 'resend';
import dotenv from 'dotenv';

// Load .env locally; in Vercel production, environment variables are injected automatically
dotenv.config();

// Allowed services
const VALID_SERVICES = {
  website: 'Website',
  app: 'Mobile App',
  game: 'Game',
  ai: 'AI Agents',
  desktop: 'Desktop Software',
};

// Rate limiter: Map<IP, Array<timestamp>>
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 15;
const MAX_BODY_BYTES = 100 * 1024; // 100 KB

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

// Strip all CRLF and control characters to prevent email header injection
function sanitizeHeaderField(str, maxLen = 80) {
  return String(str || '')
    .replace(/[\r\n\t\f\v]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// Safe HTML entity escaping to prevent HTML injection in emails
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInr(num) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

// Origin verification for CORS protection
function isAllowedOrigin(origin) {
  if (!origin) return true; // Direct/same-origin
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'ashziz.com' || hostname.endsWith('.ashziz.com')) return true;
    if (hostname.endsWith('.vercel.app')) return true;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    return false;
  } catch {
    return false;
  }
}

export function validateEnquiry(data) {
  const errors = {};

  // 1. Service validation
  let service = (data.service || '').toString().trim();
  const lowerService = service.toLowerCase();
  if (VALID_SERVICES[lowerService]) {
    service = VALID_SERVICES[lowerService];
  } else if (!Object.values(VALID_SERVICES).includes(service)) {
    errors.service = 'Invalid service selected. Choose Website, Mobile App, Game, AI Agents, or Desktop Software.';
  }

  // 2. Name validation (sanitized of CRLF to prevent header injection)
  const name = sanitizeHeaderField(data.name || '', 100);
  if (!name || name.length < 2) {
    errors.name = 'Customer name is required (minimum 2 characters).';
  } else if (name.length > 80) {
    errors.name = 'Name must be 80 characters or fewer.';
  }

  // 3. Phone validation
  const rawPhone = sanitizeHeaderField(data.phone || '', 25);
  const phoneDigits = rawPhone.replace(/\D/g, '');
  if (!phoneDigits || phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.phone = 'Valid contact phone number is required (7 to 15 digits).';
  }

  // 4. Budget validation
  const budget = typeof data.budget === 'number' ? data.budget : parseInt(String(data.budget || '').replace(/\D/g, ''), 10);
  if (isNaN(budget) || budget < 11000 || budget > 10000000) {
    errors.budget = 'Budget must be between ₹11,000 and ₹1 Crore.';
  }

  // 5. Description validation & link spam defense
  const rawIdea = (data.idea || data.description || '').toString().trim();
  if (!rawIdea || rawIdea.length < 10) {
    errors.idea = 'Project description is required (minimum 10 characters).';
  } else if (rawIdea.length > 4000) {
    errors.idea = 'Project description must be 4000 characters or fewer.';
  } else {
    // Flag descriptions with excessive URLs as spam
    const urlMatches = rawIdea.match(/https?:\/\//gi) || [];
    if (urlMatches.length > 2) {
      errors.idea = 'Please remove excessive web links from the project description.';
    }
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    sanitized: isValid ? {
      name,
      phone: rawPhone.startsWith('+') ? rawPhone : `+91 ${phoneDigits}`,
      service,
      budget,
      idea: rawIdea,
      source: 'ashziz.com',
      submittedAt: new Date().toISOString(),
    } : null,
  };
}

// Unified helper to read body across Vercel (pre-parsed) and standard Node/Vite (stream)
async function parseRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
  }

  return new Promise((resolve, reject) => {
    let rawBody = '';
    let receivedBytes = 0;
    req.on('data', chunk => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      rawBody += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!rawBody) return resolve({});
      try {
        resolve(JSON.parse(rawBody));
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

// Unified response sender compatible with both Vercel res.status().json() and Node res.end()
function sendResponse(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.end(JSON.stringify(data));
}

// Vercel Serverless Function & Vite Middleware Handler
export default async function handler(req, res) {
  const origin = req.headers.origin;

  // Enforce CORS origin verification
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(204).end();
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendResponse(res, 405, { ok: false, error: 'Method Not Allowed. Use POST.' });
  }

  // Rate Limiting by client IP
  const rawIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
  if (isRateLimited(rawIp)) {
    return sendResponse(res, 429, {
      ok: false,
      error: 'You have submitted multiple enquiries recently. Please wait a few minutes or reach out via WhatsApp.',
    });
  }

  // Parse request body safely
  let body;
  try {
    body = await parseRequestBody(req);
    if (body === null) {
      return sendResponse(res, 400, { ok: false, error: 'Invalid JSON payload.' });
    }
  } catch (err) {
    const isTooLarge = err.message === 'Payload too large';
    return sendResponse(res, isTooLarge ? 413 : 400, {
      ok: false,
      error: err.message || 'Error processing request body.',
    });
  }

  // Anti-bot Honeypot check: If invisible trap field has any input, silently neutralize bot
  const honeypot = (body.company_website || body._hp_company || body.hp || '').toString().trim();
  if (honeypot) {
    // Return fake success to deceive scrapers and preserve Resend quota
    return sendResponse(res, 200, {
      ok: true,
      message: 'Enquiry sent successfully!',
    });
  }

  // Anti-bot timing check: Submissions under 1.2s indicate automated headless bots
  if (body.ts && typeof body.ts === 'number') {
    const elapsedMs = Date.now() - body.ts;
    if (elapsedMs > 0 && elapsedMs < 1200) {
      return sendResponse(res, 200, {
        ok: true,
        message: 'Enquiry sent successfully!',
      });
    }
  }

  // Server-side field validation
  const { isValid, errors, sanitized } = validateEnquiry(body);
  if (!isValid) {
    return sendResponse(res, 400, {
      ok: false,
      error: 'Validation failed. Please verify all required fields.',
      fieldErrors: errors,
    });
  }

  // Check Resend Configuration (Server-Side Secret)
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey || apiKey === 're_123456789_placeholder' || !apiKey.startsWith('re_')) {
    return sendResponse(res, 503, {
      ok: false,
      error: 'Service temporarily unavailable. Please contact us via WhatsApp.',
    });
  }

  const toEmail = (process.env.RESEND_TO || 'ash.zizi67@gmail.com').trim();
  const fromEmail = (process.env.RESEND_FROM || 'ASHZIZ Studio <onboarding@resend.dev>').trim();

  try {
    const resend = new Resend(apiKey);

    const formattedDate = new Date(sanitized.submittedAt).toLocaleString('en-US', {
      timeZone: 'Asia/Dubai',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Customer Enquiry — ASHZIZ</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0c10; color: #f5f5f7; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background: #15171e; border: 1px solid #2b2e3a; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="border-bottom: 1px solid #2b2e3a; padding-bottom: 20px; margin-bottom: 24px;">
      <span style="font-size: 11px; letter-spacing: 0.15em; color: #d6a656; font-weight: 700; text-transform: uppercase;">ASHZIZ Digital Studio</span>
      <h1 style="margin: 8px 0 0; font-size: 24px; color: #ffffff; font-weight: 600;">New Customer Enquiry</h1>
    </div>

    <!-- SANDBOX_NOTICE -->

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="padding: 10px 0; color: #8e92a4; font-size: 14px; width: 140px;">Customer Name:</td>
        <td style="padding: 10px 0; color: #ffffff; font-size: 15px; font-weight: 600;">${escapeHtml(sanitized.name)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #8e92a4; font-size: 14px;">Contact Phone:</td>
        <td style="padding: 10px 0; color: #ffffff; font-size: 15px; font-weight: 600;"><a href="tel:${escapeHtml(sanitized.phone)}" style="color: #6fe395; text-decoration: none;">${escapeHtml(sanitized.phone)}</a></td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #8e92a4; font-size: 14px;">Selected Service:</td>
        <td style="padding: 10px 0; color: #d6a656; font-size: 15px; font-weight: 600;">${escapeHtml(sanitized.service)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #8e92a4; font-size: 14px;">Project Budget:</td>
        <td style="padding: 10px 0; color: #f0c985; font-size: 15px; font-weight: 600;">${escapeHtml(formatInr(sanitized.budget))}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #8e92a4; font-size: 14px;">Submission Time:</td>
        <td style="padding: 10px 0; color: #8e92a4; font-size: 13px;">${escapeHtml(formattedDate)} (Gulf Standard Time)</td>
      </tr>
    </table>

    <div style="background: #1c1e27; border: 1px solid #2e3240; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #d6a656;">Project Description</h3>
      <p style="margin: 0; color: #e1e3ec; font-size: 14.5px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(sanitized.idea)}</p>
    </div>

    <div style="border-top: 1px solid #2b2e3a; padding-top: 18px; font-size: 12px; color: #686c7d; text-align: center;">
      This enquiry was submitted securely through the ASHZIZ website.
    </div>
  </div>
</body>
</html>
`.trim();

    const emailText = `
ASHZIZ - New Customer Enquiry
========================================

Customer Name:       ${sanitized.name}
Phone:               ${sanitized.phone}
Service:             ${sanitized.service}
Budget:              ${formatInr(sanitized.budget)}
Submitted:           ${formattedDate} (GST)

Project Description:
----------------------------------------
${sanitized.idea}
========================================
`.trim();

    // Prevent Header Injection: sanitize subject line parameters
    const safeSubjectName = sanitizeHeaderField(sanitized.name, 60);
    const safeSubjectService = sanitizeHeaderField(sanitized.service, 30);

    let result = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `New Project Enquiry: ${safeSubjectService} - ${safeSubjectName}`,
      html: emailHtml.replace('<!-- SANDBOX_NOTICE -->', ''),
      text: emailText,
    });

    // Handle Resend testing domain (onboarding@resend.dev) sandbox restriction
    if (result.error && (result.error.statusCode === 403 || result.error.status === 403) && result.error.message?.includes('own email address')) {
      const match = result.error.message.match(/\(([^)]+)\)/);
      const fallbackEmail = match ? match[1].trim() : null;
      if (fallbackEmail && fallbackEmail !== toEmail) {
        const sandboxNotice = `
    <div style="background: rgba(214,166,86,0.12); border: 1px solid #d6a656; border-radius: 8px; padding: 12px 16px; margin-bottom: 22px; font-size: 13px; line-height: 1.5; color: #f0c985;">
      <strong>Resend Sandbox Notice:</strong> This enquiry was delivered to your registered Resend account email (<code>${escapeHtml(fallbackEmail)}</code>) because sending to custom recipients (<code>${escapeHtml(toEmail)}</code>) via <code>onboarding@resend.dev</code> requires verifying a domain at <a href="https://resend.com/domains" style="color: #6fe395; text-decoration: underline;">resend.com/domains</a>.
    </div>`;

        result = await resend.emails.send({
          from: fromEmail,
          to: [fallbackEmail],
          subject: `New Project Enquiry: ${safeSubjectService} - ${safeSubjectName}`,
          html: emailHtml.replace('<!-- SANDBOX_NOTICE -->', sandboxNotice),
          text: `[Resend Sandbox Notice: Delivered to ${fallbackEmail}. Verify a domain on resend.com/domains to deliver directly to ${toEmail}]\n\n` + emailText,
        });
      }
    }

    if (result.error) {
      console.error('[Resend Error Code]:', result.error.statusCode || result.error.status || 'Unknown');
      return sendResponse(res, 502, {
        ok: false,
        error: 'We could not dispatch your enquiry just now. Please try again or reach out on WhatsApp.',
      });
    }

    return sendResponse(res, 200, {
      ok: true,
      id: result.data?.id,
      message: 'Enquiry sent successfully!',
    });
  } catch (err) {
    console.error('[Resend Server Exception]:', err.name || 'InternalError');
    return sendResponse(res, 500, {
      ok: false,
      error: 'An internal server error occurred. Please reach out via WhatsApp.',
    });
  }
}

/* SkuClinic configuration.
   Paste Stripe Payment Links here when you create them.
   Leave a Stripe string empty and that pricing button joins the founding list. */
var STRIPE_AUDIT_LINK = '';          // Audit Pass, $29 one-time (30 days of Pro)
var STRIPE_PRO_MONTHLY_LINK = '';    // Pro, $15/mo
var STRIPE_PRO_YEARLY_LINK = '';     // Pro, $120/yr
var STRIPE_MULTI_MONTHLY_LINK = '';  // Multichannel, $29/mo
var STRIPE_MULTI_YEARLY_LINK = '';   // Multichannel, $240/yr

/* FormSubmit AJAX endpoint. No account required.
   Leave it empty and the signup form does not send anything, and feedback stays hidden. */
var SIGNUP_FORM_ENDPOINT = 'https://formsubmit.co/ajax/skuclinicapp@gmail.com';

/* Google Apps Script web app (/exec URL) for skuclinicapp@gmail.com. See signup-backend/README.md.
   When set, signup and feedback POST here instead of FormSubmit: a row goes to the
   "SkuClinic signups" Sheet and a notification email lands in the inbox. Empty = FormSubmit. */
var SIGNUP_SCRIPT_URL = '';

/* Cloudflare Web Analytics token. Leave empty and no beacon is added. */
var CF_ANALYTICS_TOKEN = '';

/* TODO: Replace these client-side unlock codes with real accounts and Stripe.
   There is no server. The code is compared in the browser and the result is
   stored only in localStorage. Anyone who can read this file can unlock paid
   features. This is a temporary stand-in, not security. */
var PRO_UNLOCK_CODE = 'SKUCLINIC-PRO';
var MULTICHANNEL_UNLOCK_CODE = 'SKUCLINIC-MULTICHANNEL';

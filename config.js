/* SkuClinic configuration.
   Paste Stripe Payment Links here when you create them.
   Leave a Stripe string empty and that pricing button joins the founding list. */
var STRIPE_PRO_MONTHLY_LINK = '';
var STRIPE_PRO_YEARLY_LINK = '';
var STRIPE_AGENCY_LINK = '';

/* FormSubmit AJAX endpoint. No account required.
   Leave it empty and the signup form does not send anything, and feedback stays hidden. */
var SIGNUP_FORM_ENDPOINT = 'https://formsubmit.co/ajax/skuclinicapp@gmail.com';

/* Cloudflare Web Analytics token. Leave empty and no beacon is added. */
var CF_ANALYTICS_TOKEN = '';

/* TODO: Replace these client-side unlock codes with real accounts and Stripe.
   There is no server. The code is compared in the browser and the result is
   stored only in localStorage. Anyone who can read this file can unlock paid
   features. This is a temporary stand-in, not security. */
var PRO_UNLOCK_CODE = 'SKUCLINIC-PRO';
var AGENCY_UNLOCK_CODE = 'SKUCLINIC-AGENCY';

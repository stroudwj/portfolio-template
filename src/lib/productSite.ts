// Build-time marker: true only on the product/marketing site (the template's home
// repo). It decides which pages exist at all — the sales landing at the root plus the
// /demo portfolio here, versus the buyer's portfolio at the root in published repos.
//
// The publish pipeline overwrites this ENTIRE file with a `false` version in every
// published repo (see PRODUCT_SITE_FLAG_OFF in src/editor/lib/github/config.ts), so
// keep it single-purpose: nothing else may live in this file.
export const IS_PRODUCT_SITE = true;

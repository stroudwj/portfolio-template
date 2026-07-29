import { sessionUser } from './auth.js';
import { getSiteForUser } from './lib/db.js';
import { json } from './lib/http.js';

function recentPeriods(count = 6) {
	const periods = [];
	const date = new Date();
	date.setUTCDate(1);
	for (let index = 0; index < count; index += 1) {
		periods.push(date.toISOString().slice(0, 7));
		date.setUTCMonth(date.getUTCMonth() - 1);
	}
	return periods;
}

/** Owner-only aggregate analytics. The serving Worker stores no visitor identity,
 * cookies, IP addresses or referrers—only page and inquiry totals. */
export async function siteAnalytics(request, env, corsOrigin) {
	if (!env.SESSION_SECRET || !env.DB || !env.KV)
		return json({ error: 'accounts_unconfigured' }, 503, corsOrigin);
	const user = await sessionUser(request, env);
	if (!user) return json({ error: 'invalid_session' }, 401, corsOrigin);
	const site = await getSiteForUser(env.DB, user.id);
	if (!site) return json({ error: 'no_site' }, 404, corsOrigin);

	const periods = recentPeriods();
	const snapshots = await Promise.all(
		periods.map(async (period) => ({
			period,
			data: (await env.KV.get(`analytics:${site.id}:${period}`, 'json')) || { pages: {} },
		})),
	);
	const pages = {};
	for (const snapshot of snapshots) {
		for (const [page, values] of Object.entries(snapshot.data.pages || {})) {
			const row = pages[page] || { opens: 0, seconds: 0, longest: 0, inquiries: 0 };
			row.opens += Number(values.opens) || 0;
			row.seconds += Number(values.seconds) || 0;
			row.longest = Math.max(row.longest, Number(values.longest) || 0);
			row.inquiries += Number(values.inquiries) || 0;
			pages[page] = row;
		}
	}
	return json({ periods, pages }, 200, corsOrigin);
}

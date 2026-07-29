import { useCallback, useEffect, useState } from 'react';
import { AccountClient, AccountError } from '../lib/account/client';
import { getSession } from '../lib/account/session';
import { Section } from './ui/controls';

interface PageAnalytics {
	opens: number;
	seconds: number;
	longest: number;
	inquiries: number;
}

interface AnalyticsSummary {
	periods: string[];
	pages: Record<string, PageAnalytics>;
}

function duration(seconds: number): string {
	if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
	const minutes = Math.round(seconds / 60);
	return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function AnalyticsPanel({ available }: { available: boolean }) {
	const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
	const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [error, setError] = useState('');
	const load = useCallback(async () => {
		if (!available) return;
		const session = getSession();
		if (!session) return;
		setState('loading');
		setError('');
		try {
			const { data } = await new AccountClient(session.token).request<AnalyticsSummary>(
				'/site/analytics',
				{ method: 'GET' },
			);
			setSummary(data);
			setState('ready');
		} catch (caught) {
			setError(caught instanceof AccountError ? caught.friendly : 'Analytics could not be loaded.');
			setState('error');
		}
	}, [available]);

	useEffect(() => {
		void load();
	}, [load]);

	const rows = Object.entries(summary?.pages ?? {})
		.map(([page, values]) => ({
			page,
			...values,
			average: values.opens ? values.seconds / values.opens : 0,
		}))
		.sort((a, b) => b.opens - a.opens);
	const inquiries = rows.reduce((total, row) => total + row.inquiries, 0);

	return (
		<Section
			title="Portfolio analytics"
			sectionKey="_publish-analytics"
			action={available && state !== 'loading' ? (
				<button type="button" className="btn-link" onClick={() => void load()}>Refresh</button>
			) : undefined}
		>
			<p className="muted" style={{ marginTop: 0 }}>
				First-party totals only: no cookies, visitor profiles, IP storage, or cross-site tracking.
			</p>
			{!available ? (
				<div className="analytics-empty">
					<strong>Publish once to start collecting.</strong>
					<span>Project opens, viewing time, and successful inquiry starts will appear here.</span>
				</div>
			) : state === 'loading' && !summary ? (
				<p className="muted" role="status">Loading the last six months…</p>
			) : state === 'error' ? (
				<p className="publish-error">{error}</p>
			) : rows.length === 0 ? (
				<div className="analytics-empty">
					<strong>No visits recorded yet.</strong>
					<span>Analytics begin with the next visit to your published site.</span>
				</div>
			) : (
				<>
					<div className="analytics-summary">
						<span><strong>{rows.reduce((total, row) => total + row.opens, 0)}</strong> project opens</span>
						<span><strong>{inquiries}</strong> inquiries</span>
						<span><strong>{duration(rows.reduce((total, row) => total + row.seconds, 0))}</strong> viewed</span>
					</div>
					<div className="analytics-table" role="table" aria-label="Project analytics">
						<div className="analytics-row analytics-head" role="row">
							<span role="columnheader">Project</span>
							<span role="columnheader">Opened</span>
							<span role="columnheader">Avg. view</span>
							<span role="columnheader">Inquiry</span>
						</div>
						{rows.slice(0, 8).map((row) => (
							<div className="analytics-row" role="row" key={row.page}>
								<strong role="cell">/{row.page === 'home' ? '' : row.page}</strong>
								<span role="cell">{row.opens}</span>
								<span role="cell">{duration(row.average)}</span>
								<span role="cell">{row.inquiries}</span>
							</div>
						))}
					</div>
				</>
			)}
		</Section>
	);
}

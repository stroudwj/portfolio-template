import type { SocialLink } from './types';
import { safeHref } from './safeHref';
import './SocialLinks.css';

export interface SocialLinksProps {
	social: SocialLink[];
	/** Optional resume link rendered alongside the social links. */
	resume?: { label: string; href: string } | null;
}

/** The row of social + resume text links shown on the About page. */
export default function SocialLinks({ social, resume }: SocialLinksProps) {
	if (social.length === 0 && !resume) return null;
	return (
		<div className="bio-links">
			{social.map((s, i) => (
				<a key={`${s.url}-${i}`} href={safeHref(s.url)} target="_blank" rel="noopener">
					{s.label}
				</a>
			))}
			{resume && <a href={safeHref(resume.href)}>{resume.label}</a>}
		</div>
	);
}

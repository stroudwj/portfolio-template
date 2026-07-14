import Hero from './Hero';
import Gallery from './Gallery';
import About from './About';
import { withBase, type PortfolioData } from './types';

export interface PortfolioPageProps extends PortfolioData {
	/** 'home' | 'art' | 'photography' | 'bio' (or any page key). */
	page: string;
	base: string;
}

/**
 * Renders one page's body from resolved data. Shared by the Astro site (per-page)
 * and the editor preview, so the page composition lives in exactly one place.
 */
export default function PortfolioPage({ page, content, galleries, profileImageSrc, base }: PortfolioPageProps) {
	if (page === 'bio') {
		const resume =
			content.resume && content.resume.url
				? { label: content.resume.label, href: withBase(base, content.resume.url) }
				: null;
		return (
			<About
				name={content.site.name}
				bio={content.profile.bio}
				email={content.contact.email}
				social={content.social}
				profileImageSrc={profileImageSrc}
				resume={resume}
			/>
		);
	}

	const gallery = content.pages[page]?.gallery;
	const images = gallery ? (galleries[gallery.folder] ?? []) : [];
	const alt = gallery?.alt;

	if (page === 'home') {
		return (
			<>
				<Hero heading={content.pages[page]?.heading} />
				<div className="collage-container">
					<Gallery images={images} alt={alt} />
				</div>
			</>
		);
	}

	return (
		<div className={`page-content-wrapper ${page === 'photography' ? 'page-photo' : ''}`}>
			<Gallery images={images} alt={alt} />
		</div>
	);
}

import Hero from './Hero';
import Gallery from './Gallery';
import About from './About';
import TextBlock from './TextBlock';
import Embed from './Embed';
import ChildPages from './ChildPages';
import { withBase, type PortfolioData } from './types';
import type { PageBlock } from '../lib/content';

export interface PortfolioPageProps extends PortfolioData {
	/** Page key: 'home', a nav path like 'art', or a nested path like 'work/project-a'. */
	page: string;
	base: string;
	/** Editor preview: switch pages in place instead of following real links. */
	onNavigate?: (path: string) => void;
}

/**
 * Renders one page's body from resolved data as its ordered blocks (text, gallery,
 * sub-page cards, about). Shared by the Astro site (per-page) and the editor preview,
 * so the page composition lives in exactly one place. Content is always migrated
 * (migrateContent) before it gets here, so `blocks` is present.
 */
export default function PortfolioPage({ page, content, galleries, profileImageSrc, pageThumbs, base, onNavigate }: PortfolioPageProps) {
	const config = content.pages[page];
	if (!config) return null;
	const gallery = config.gallery;
	const images = gallery ? (galleries[gallery.folder] ?? []) : [];

	const renderBlock = (block: PageBlock) => {
		switch (block.type) {
			case 'text':
				return <TextBlock key={block.id} text={block.text} align={block.align} />;
			case 'embed':
				return <Embed key={block.id} url={block.url} />;
			case 'about': {
				const resume =
					content.resume && content.resume.url
						? { label: content.resume.label, href: withBase(base, content.resume.url) }
						: null;
				return (
					<About
						key={block.id}
						name={content.site.name}
						bio={content.profile.bio}
						email={content.contact.email}
						social={content.social}
						profileImageSrc={profileImageSrc}
						resume={resume}
					/>
				);
			}
			case 'children': {
				const items = (config.children ?? []).map((key) => ({
					key,
					label: content.pages[key]?.label ?? key,
					href: withBase(base, `${key}/`),
					thumbSrc: pageThumbs?.[key],
				}));
				return <ChildPages key={block.id} items={items} onNavigate={onNavigate} />;
			}
			case 'gallery':
				// Home keeps its collage layout; other pages the standard wrapper (the
				// page-photo modifier preserves the original photography page's spacing).
				return page === 'home' ? (
					<div key={block.id} className="collage-container">
						<Gallery images={images} alt={gallery?.alt} />
					</div>
				) : (
					<div key={block.id} className={`page-content-wrapper ${page === 'photography' ? 'page-photo' : ''}`}>
						<Gallery images={images} alt={gallery?.alt} />
					</div>
				);
		}
	};

	return (
		<>
			<Hero heading={config.heading} />
			{(config.blocks ?? []).map(renderBlock)}
		</>
	);
}

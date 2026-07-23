import type { StoreConfig, StoreProduct } from '../lib/content';
import { normalizeStripePaymentLink } from '../lib/stripe-payment-link';
import './Products.css';

export interface ProductsProps {
	store: StoreConfig;
	productImageSrcs?: Record<string, string>;
	/** Omitted means every non-draft product in catalog order. */
	productIds?: string[];
	layout?: 'grid' | 'featured';
	/** Stable site language used for identical server/client price formatting. */
	locale?: string;
}

function currencyFormatter(currency: string, locale?: string): Intl.NumberFormat {
	const language = locale?.trim() || 'en';
	try {
		return new Intl.NumberFormat(language, { style: 'currency', currency });
	} catch {
		try {
			return new Intl.NumberFormat('en', { style: 'currency', currency });
		} catch {
			return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' });
		}
	}
}

/**
 * Format an integer minor-unit amount using the currency's own exponent.
 * JPY therefore divides by 1, USD by 100, and BHD by 1,000.
 */
export function formatProductPrice(
	amountMinor: number,
	currency: string,
	locale?: string,
): string {
	const formatter = currencyFormatter(currency, locale);
	const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
	return formatter.format(amountMinor / 10 ** digits);
}

function selectedProducts(store: StoreConfig, productIds?: string[]): StoreProduct[] {
	if (!productIds) return store.products.filter((product) => product.status !== 'draft');
	const byId = new Map(store.products.map((product) => [product.id, product]));
	return productIds.flatMap((id) => {
		const product = byId.get(id);
		return product && product.status !== 'draft' ? [product] : [];
	});
}

function ProductCard({
	product,
	currency,
	imageSrc,
	locale,
}: {
	product: StoreProduct;
	currency: string;
	imageSrc?: string;
	locale?: string;
}) {
	const prices = product.offers.map((offer) =>
		formatProductPrice(offer.amountMinor, currency, locale),
	);
	const priceSummary =
		prices.length === 1
			? prices[0]
			: prices.length > 1
				? `From ${formatProductPrice(
						Math.min(...product.offers.map((offer) => offer.amountMinor)),
						currency,
						locale,
					)}`
				: undefined;
	const soldOut = product.status === 'sold_out';

	return (
		<article className={`product-card ${soldOut ? 'is-sold-out' : ''}`}>
			<div className="product-media">
				{imageSrc ? (
					<img
						src={imageSrc}
						alt={product.imageAlt || product.name}
						loading="lazy"
						decoding="async"
					/>
				) : (
					<div
						className="product-image-missing"
						role="img"
						aria-label={product.imageAlt || `Image unavailable for ${product.name}`}
					>
						Image unavailable
					</div>
				)}
			</div>
			<div className="product-details">
				<div className="product-heading">
					<h2>{product.name}</h2>
					{priceSummary && <p className="product-price-summary">{priceSummary}</p>}
				</div>
				{product.description?.trim() && <p className="product-description">{product.description}</p>}
				{product.offers.length ? (
					<ul className="product-offers" aria-label={`Purchase options for ${product.name}`}>
						{product.offers.map((offer, index) => {
							const label = offer.label.trim() || `Option ${index + 1}`;
							const price = prices[index];
							const checkoutHref = normalizeStripePaymentLink(offer.checkout.url);
							return (
								<li className="product-offer" key={offer.id}>
									<span className="product-offer-label">{label}</span>
									<span className="product-offer-price">{price}</span>
									{soldOut ? (
										<span className="product-sold-out">Sold out</span>
									) : checkoutHref ? (
										<a
											className="product-buy"
											href={checkoutHref}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`Buy ${product.name}, ${label}, ${price} on Stripe`}
										>
											Buy <span aria-hidden="true">↗</span>
										</a>
									) : (
										<span className="product-unavailable" aria-disabled="true">
											Unavailable
										</span>
									)}
								</li>
							);
						})}
					</ul>
				) : (
					<p className={soldOut ? 'product-sold-out product-status-only' : 'product-unavailable product-status-only'}>
						{soldOut ? 'Sold out' : 'Unavailable'}
					</p>
				)}
			</div>
		</article>
	);
}

/** Reusable, server-renderable product catalog block. */
export default function Products({
	store,
	productImageSrcs = {},
	productIds,
	layout = 'grid',
	locale,
}: ProductsProps) {
	const products = selectedProducts(store, productIds);
	if (!products.length)
		return (
			<section className="products-block products-empty" aria-label="Products">
				<p>Products coming soon.</p>
			</section>
		);

	return (
		<section className={`products-block products-${layout}`} aria-label="Products">
			<div className="products-list">
				{products.map((product) => (
					<ProductCard
						key={product.id}
						product={product}
						currency={store.currency}
						imageSrc={productImageSrcs[product.id]}
						locale={locale}
					/>
				))}
			</div>
		</section>
	);
}

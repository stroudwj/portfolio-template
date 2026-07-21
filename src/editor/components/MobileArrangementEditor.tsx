import { useState } from 'react';
import type { MobileComposition, MobileItemStyle } from '../../lib/content';

export interface MobileArrangementItem {
	key: string;
	label: string;
	kind: 'image' | 'text' | 'video' | 'section';
	thumbnail?: string;
}

function orderedItems(items: MobileArrangementItem[], mobile: MobileComposition): MobileArrangementItem[] {
	const byKey = new Map(items.map((item) => [item.key, item]));
	const ordered = mobile.order.flatMap((key) => {
		const item = byKey.get(key);
		if (!item) return [];
		byKey.delete(key);
		return [item];
	});
	return [...ordered, ...byKey.values()];
}

const withOrder = (mobile: MobileComposition, items: MobileArrangementItem[]): MobileComposition => ({
	...mobile,
	order: orderedItems(items, mobile).map((item) => item.key),
});

export default function MobileArrangementEditor({
	items,
	mobile,
	gridMode = false,
	simple = false,
	scope = 'gallery',
	label,
	onChange,
}: {
	items: MobileArrangementItem[];
	mobile?: MobileComposition;
	gridMode?: boolean;
	/** Page-section mode offers reorder/hide only; section widths stay responsive. */
	simple?: boolean;
	scope?: 'gallery' | 'page';
	/** Plain-language name used to distinguish this arrangement from others on the page. */
	label?: string;
	onChange: (mobile: MobileComposition | undefined) => void;
}) {
	const pageScope = scope === 'page';
	const mixedCanvas = !pageScope && items.some((item) => item.kind !== 'image');
	const subject = label || (pageScope ? 'this page' : mixedCanvas ? 'this canvas' : 'these images');
	const [expanded, setExpanded] = useState(Boolean(mobile));
	if (!mobile) {
		return (
			<details className="phone-layout-disclosure" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
				<summary>
					<span className="phone-layout-summary-copy">
						<strong>Phone layout</strong>
						<span>Automatic</span>
					</span>
					<span className="phone-layout-chevron" aria-hidden="true">⌄</span>
				</summary>
				<div className="phone-layout-callout" role="group" aria-label={`Automatic phone arrangement for ${subject}`}>
					<p>
						{pageScope
							? 'Already optimized for phones using the same order as desktop.'
							: mixedCanvas
								? 'Images, text, and videos already stack neatly on phones.'
								: 'Images already resize and stack neatly on phones.'}
					</p>
					<button
						type="button"
						className="btn-secondary"
						aria-label={`Arrange ${subject} differently on phones`}
						onClick={() => onChange({ mode: 'custom', order: items.map((item) => item.key) })}
					>
						{pageScope ? 'Customize page order' : mixedCanvas ? 'Customize canvas' : 'Customize images'}
					</button>
				</div>
			</details>
		);
	}

	const normalized = withOrder(mobile, items);
	const rows = orderedItems(items, normalized);

	const move = (from: number, to: number) => {
		if (to < 0 || to >= rows.length) return;
		const order = rows.map((item) => item.key);
		const [key] = order.splice(from, 1);
		order.splice(to, 0, key);
		onChange({ ...normalized, order });
	};

	const styleFor = (key: string): MobileItemStyle => normalized.items?.[key] ?? {};
	const patchStyle = (key: string, patch: Partial<MobileItemStyle>) => {
		const next = { ...styleFor(key), ...patch };
		if (next.width === 100) delete next.width;
		if (next.align === 'center') delete next.align;
		if (!next.hidden) delete next.hidden;
		const styles = { ...normalized.items };
		if (Object.keys(next).length) styles[key] = next;
		else delete styles[key];
		onChange({ ...normalized, items: Object.keys(styles).length ? styles : undefined });
	};

	return (
		<details className="phone-layout-disclosure is-custom" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
			<summary>
				<span className="phone-layout-summary-copy">
					<strong>Phone layout</strong>
					<span>Customized</span>
				</span>
				<span className="phone-layout-chevron" aria-hidden="true">⌄</span>
			</summary>
			<div className="phone-layout-editor" role="group" aria-label={`Phone-only arrangement for ${subject}`}>
				<div className="phone-layout-heading">
					<p>
						{pageScope
							? 'Reorder or hide page sections on phones. Desktop stays unchanged.'
							: mixedCanvas
								? 'Reorder, resize, or hide canvas items on phones. Desktop stays unchanged.'
								: 'Reorder, resize, or hide images on phones. Desktop stays unchanged.'}
					</p>
					<button
						type="button"
						className="btn-ghost"
						aria-label={pageScope ? `Make ${subject} match the desktop order automatically` : `Use the automatic phone layout for ${subject}`}
						onClick={() => {
							if (confirm(pageScope ? 'Use the automatic phone page order again? Your custom phone section order will be removed.' : 'Use the automatic phone layout again? Your custom phone arrangement will be removed.'))
								onChange(undefined);
						}}
					>
						Reset to automatic
					</button>
				</div>

				{gridMode && !simple && (
					<label className="phone-columns">
						<span>Images per row on phones</span>
						<select
							className="select-input"
							value={normalized.columns ?? 1}
							onChange={(event) => onChange({ ...normalized, columns: Number(event.target.value) as 1 | 2 })}
						>
							<option value={1}>One — larger images</option>
							<option value={2}>Two — compact grid</option>
						</select>
					</label>
				)}

				<div className="phone-layout-list" role="list" aria-label={pageScope ? `Parts of ${subject} shown on phones` : `${subject} shown on phones`}>
					{rows.map((item, index) => {
						const style = styleFor(item.key);
						const positionLabel = `${item.label}, item ${index + 1} of ${rows.length}`;
						const hasItemOptions = !gridMode && !simple;
						return (
							<div className={`phone-layout-row ${style.hidden ? 'is-hidden' : ''}`} key={item.key} role="listitem">
								<div className="phone-layout-item">
									{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="phone-layout-kind" aria-hidden="true">{index + 1}</span>}
									<span>{item.label}</span>
								</div>
								<div className={`phone-layout-actions ${hasItemOptions ? 'has-item-options' : ''}`} role="group" aria-label={`Phone settings for ${positionLabel}`}>
									<button type="button" className="btn-icon phone-move" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${positionLabel} earlier on phones`}>↑</button>
									<button type="button" className="btn-icon phone-move" disabled={index === rows.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${positionLabel} later on phones`}>↓</button>
									{hasItemOptions && (
										<>
											<label className="phone-select-label">
												<span aria-hidden="true">Size</span>
												<span className="sr-only">Size of {positionLabel} on phones</span>
												<select className="select-input" value={style.width ?? 100} onChange={(event) => patchStyle(item.key, { width: Number(event.target.value) })}>
													<option value={100}>Full width</option>
													<option value={75}>Large</option>
													<option value={50}>Half width</option>
												</select>
											</label>
											<label className="phone-select-label">
												<span aria-hidden="true">Position</span>
												<span className="sr-only">Position of {positionLabel} on phones</span>
												<select className="select-input" value={style.align ?? 'center'} onChange={(event) => patchStyle(item.key, { align: event.target.value as MobileItemStyle['align'] })}>
													<option value="left">Left</option>
													<option value="center">Center</option>
													<option value="right">Right</option>
												</select>
											</label>
										</>
									)}
									<button
										type="button"
										className={`phone-visibility ${style.hidden ? 'is-hidden' : ''}`}
										aria-pressed={!!style.hidden}
										aria-label={`${style.hidden ? 'Show' : 'Hide'} ${positionLabel} on phones`}
										onClick={() => patchStyle(item.key, { hidden: !style.hidden })}
									>
										{style.hidden ? 'Show' : 'Hide'}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</details>
	);
}

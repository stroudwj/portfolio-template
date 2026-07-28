export interface ImageAccessibilityChoice {
	file: File;
	alt: string;
	decorative: boolean;
}

export interface AccessibleImageUpload {
	file: File;
	alt: string;
	decorative?: true;
}

export function imageAccessibilityComplete(
	rows: readonly ImageAccessibilityChoice[],
): boolean {
	return rows.every((row) => row.decorative || row.alt.trim().length > 0);
}

export function normalizeAccessibleImages(
	rows: readonly ImageAccessibilityChoice[],
): AccessibleImageUpload[] {
	if (!imageAccessibilityComplete(rows))
		throw new Error('Every image needs alt text or an explicit decorative choice.');
	return rows.map((row) => ({
		file: row.file,
		alt: row.decorative ? '' : row.alt.trim(),
		decorative: row.decorative ? true : undefined,
	}));
}

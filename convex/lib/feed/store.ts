import { htmlToBlocks, NO_BASE, type Block, type Content } from './blocks';
import { MAX_IMAGE_URL, type ParsedArticle } from './parse';

/**
 * The stored JSON of one fetch's Article bodies, in characters. At most three bytes a
 * character, it keeps `store` well under Convex's 16 MiB argument and write limits; older
 * Articles past it keep only their Subtitle.
 */
export const MAX_FETCH_SIZE = 4_000_000;

/** An Article's Subtitle as its only content. */
function subtitleOnly(article: ParsedArticle): Content {
  const blocks: Block[] = article.subtitle ? [{ type: 'paragraph', spans: [{ text: article.subtitle }] }] : [];
  return { blocks, omitted: [] };
}

/** An Article's content: the Feed's full text when it has it (T8), else its Subtitle. */
function content(article: ParsedArticle): Content {
  if (!article.html) return subtitleOnly(article);
  try {
    return htmlToBlocks(article.html, article.link ?? NO_BASE);
  } catch {
    // One Article's broken markup costs only its own text.
    return subtitleOnly(article);
  }
}

/** Newest first, each guid once, with bodies until the fetch's size budget runs out. */
export function articlesToStore(articles: ParsedArticle[], budget = MAX_FETCH_SIZE) {
  const seen = new Set<string>();
  let size = 0;
  return articles.flatMap(({ html: _html, ...fields }, i) => {
    if (seen.has(fields.guid)) return [];
    seen.add(fields.guid);
    let body = content(articles[i]);
    // The Article's own lead image, else the first image in its text.
    const firstImage = body.blocks.find((block) => block.type === 'image');
    const fallback = firstImage?.type === 'image' && firstImage.src.length <= MAX_IMAGE_URL ? firstImage.src : undefined;
    const imageUrl = fields.imageUrl ?? fallback;
    const bodySize = JSON.stringify(body).length;
    if (size + bodySize > budget) body = subtitleOnly(articles[i]);
    else size += bodySize;
    return [{ ...fields, ...(imageUrl ? { imageUrl } : {}), ...body }];
  });
}

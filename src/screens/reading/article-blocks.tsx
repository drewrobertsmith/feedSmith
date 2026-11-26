import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { Block, OmittedKind, Span } from '@/feeds/feeds-data';
import { openLink } from '@/feeds/open-link';
import { LeadSlot } from '@/screens/reading/lead-slot';

const OMITTED: Record<OmittedKind, string> = {
  video: 'A video isn’t shown here.',
  table: 'A table isn’t shown here.',
  embed: 'An embedded item isn’t shown here.',
  code: 'A code sample isn’t shown here.',
  other: 'The rest of this Article isn’t shown here.',
};

/** Inline spans inside one AppText. Links are underlined, not Gold (D5). */
function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) => {
    const style = { fontWeight: span.bold ? ('700' as const) : undefined, fontStyle: span.italic ? ('italic' as const) : undefined };
    const href = span.href;
    return href ? (
      <Text key={i} role="link" onPress={() => openLink(href)} className="text-text underline" style={style}>
        {span.text}
      </Text>
    ) : (
      <Text key={i} style={style}>
        {span.text}
      </Text>
    );
  });
}

function OpenOriginal({ link }: { link: string }) {
  return (
    <AppText variant="label" role="link" onPress={() => openLink(link)} className="text-text underline">
      Open original
    </AppText>
  );
}

function BlockView({ block, link, lead }: { block: Block; link?: string; lead?: boolean }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <AppText variant="reading">
          <Spans spans={block.spans} />
        </AppText>
      );
    case 'heading':
      // A section starts with more room above it than between paragraphs (D9).
      return (
        <View className="pt-group">
          <AppText variant="subhead">
            <Spans spans={block.spans} />
          </AppText>
        </View>
      );
    case 'list':
      return (
        <View className="gap-related">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row gap-related">
              <AppText variant="reading" accessible={false}>
                {block.ordered ? `${i + 1}.` : '•'}
              </AppText>
              <AppText variant="reading" className="flex-1 text-text">
                <Spans spans={item} />
              </AppText>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View className="gap-related border-l-2 border-decor pl-group">
          {block.paragraphs.map((spans, i) => (
            <AppText key={i} variant="reading" className="text-text-muted">
              <Spans spans={spans} />
            </AppText>
          ))}
        </View>
      );
    case 'image':
      return (
        <View className="gap-related">
          {/* The page's first image is where a row's thumbnail lands as the Article opens (FEE-114). */}
          <LeadSlot active={!!lead}>
            <Image
              testID="block-image"
              source={{ uri: block.src }}
              accessible={!!block.alt}
              role={block.alt ? 'img' : undefined}
              aria-label={block.alt}
              contentFit="cover"
              className="w-full rounded-lg bg-surface"
              style={{ aspectRatio: block.width && block.height ? block.width / block.height : 16 / 9 }}
            />
          </LeadSlot>
          {block.caption ? (
            <AppText variant="label" className="text-text-muted">
              {block.caption}
            </AppText>
          ) : null}
        </View>
      );
    case 'omitted':
      return (
        <View className="gap-inside">
          <AppText variant="label" className="text-text-muted">
            {OMITTED[block.kind]}
          </AppText>
          {link ? <OpenOriginal link={link} /> : null}
        </View>
      );
  }
}

/**
 * An Article's blocks, drawn with the app's own components; never a WebView (T17, Q8). `link`
 * is offered beside anything left out; the way to the original at the end is the screen's.
 */
/** `lead`: the first block, an image, is the page's lead (FEE-114). */
export function ArticleBlocks({ blocks, link, lead }: { blocks: Block[]; link?: string; lead?: boolean }) {
  return (
    <View className="gap-group">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} link={link} lead={lead && i === 0} />
      ))}
    </View>
  );
}

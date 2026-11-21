import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { Block, OmittedKind, Span } from '@/feeds/feeds-data';

/** Opens a link in the browser, never inside the app (Q8). Only https links exist (T17). */
export function openLink(url: string) {
  if (url.startsWith('https://')) void WebBrowser.openBrowserAsync(url);
}

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

function BlockView({ block, link }: { block: Block; link?: string }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <AppText variant="reading">
          <Spans spans={block.spans} />
        </AppText>
      );
    case 'heading':
      return (
        <AppText variant="title">
          <Spans spans={block.spans} />
        </AppText>
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
          <Image
            source={{ uri: block.src }}
            accessible={!!block.alt}
            role={block.alt ? 'img' : undefined}
            aria-label={block.alt}
            contentFit="cover"
            className="w-full rounded-lg bg-surface"
            style={{ aspectRatio: block.width && block.height ? block.width / block.height : 16 / 9 }}
          />
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

/** An Article's blocks, drawn with the app's own components; never a WebView (T17, Q8). */
export function ArticleBlocks({ blocks, link }: { blocks: Block[]; link?: string }) {
  return (
    <View className="gap-group">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} link={link} />
      ))}
      {link ? <OpenOriginal link={link} /> : null}
    </View>
  );
}

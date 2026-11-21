import { Text, type TextProps } from 'react-native';

import { useEnvironment } from '@/environment';
import { typeScale, type TypeVariant } from '@/theme/type';

type AppTextProps = Omit<TextProps, 'style'> & {
  variant: TypeVariant;
  /** Uniwind classes for colour; size and family come from the variant. */
  className?: string;
};

/** All text in feedSmith. Android's font size setting applies on top (allowFontScaling stays on). */
export function AppText({ variant, className = 'text-text', ...props }: AppTextProps) {
  const { fontScale } = useEnvironment();
  const { fontSize, lineHeight, ...face } = typeScale[variant];

  return (
    <Text
      role={variant === 'title' ? 'heading' : undefined}
      className={className}
      style={{ ...face, fontSize: fontSize * fontScale, lineHeight: lineHeight * fontScale }}
      {...props}
    />
  );
}

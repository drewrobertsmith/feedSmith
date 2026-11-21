/**
 * Google's "Sign in with Google" button, exactly as Google's branding guidelines set it
 * (decision D10): Google's colours per theme, Roboto Medium (Android's `sans-serif-medium`)
 * at 14/20, a 40dp pill, 12dp side padding, a 20dp logo and 10dp between logo and label.
 * It's the one element exempt from feedSmith's palette, type and spacing scale.
 */
export const googleButton = {
  dark: { background: '#131314', border: '#8E918F', label: '#E3E3E3' },
  light: { background: '#FFFFFF', border: '#747775', label: '#1F1F1F' },
  label: { fontFamily: 'sans-serif-medium', fontSize: 14, lineHeight: 20 },
  layout: { height: 40, radius: 20, paddingHorizontal: 12, gap: 10, logo: 20 },
} as const;

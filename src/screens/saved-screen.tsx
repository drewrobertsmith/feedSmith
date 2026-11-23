import { SectionPlaceholder } from '@/screens/section-placeholder';

/** `accountOpen` opens the Account sheet at once, for the state gallery. */
export function SavedScreen({ accountOpen }: { accountOpen?: boolean }) {
  return (
    <SectionPlaceholder
      title="Saved"
      message="Articles you Save wait here until you mark them Done."
      accountOpen={accountOpen}
    />
  );
}

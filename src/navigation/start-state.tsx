import { createContext, use, useState } from 'react';

/** The sheets that can start open. */
export type SheetName = 'account' | 'add-feed' | 'new-address';

/**
 * Where a screen starts (FEE-105): a sheet open, a chip's menu open, or the list a few rows down. The state gallery's
 * worlds set it, as they provide their Feeds; the app always starts with nothing open, at the top. Screens read it
 * here, so none of them takes a prop only the gallery uses.
 */
export type StartState = {
  sheet?: SheetName;
  /** The chip whose menu starts open, by its Feed's id. */
  chipMenu?: string;
  /** The row the list starts at. */
  startAtRow?: number;
};

export const StartContext = createContext<StartState>({});

/** Where this screen starts. */
export function useStartState(): StartState {
  return use(StartContext);
}

/** A sheet's open state, held by whatever opens it: shut, unless the world starts it open. */
export function useSheet(name: SheetName) {
  const { sheet } = useStartState();
  return useState(sheet === name);
}

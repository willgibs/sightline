/** The build this is (a commit), stamped into recordings and shown in the debug view. Set by vite.config.ts. */
export const BUILD: string = (import.meta.env.VITE_BUILD as string | undefined) ?? 'dev';

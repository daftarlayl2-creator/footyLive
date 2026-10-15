import next from 'eslint-config-next/core-web-vitals';

/**
 * Flat ESLint config for the App Router project.
 *
 * `next lint` was removed in Next.js 16, so the `lint` script runs the ESLint
 * CLI directly against this file.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'scripts/**'],
  },
  ...next,
  {
    rules: {
      // Pages in this repo are plain `.js`/`.jsx` and rely on the automatic JSX runtime.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      /*
       * The three rules below come from the React Compiler checks that
       * eslint-plugin-react-hooks v7 (bundled with eslint-config-next 16) turns
       * on as errors. They flag patterns this codebase uses deliberately, and
       * none of them is a runtime defect, so they are reported as warnings to
       * keep the signal without failing `npm run lint`:
       *
       *  - set-state-in-effect: the mount-time "read a browser-only API, then
       *    store it" pattern (`setMounted(true)`, localStorage, Notification
       *    permission, data fetching) is exactly how these components stay
       *    hydration-safe — the server render must not see browser state.
       *  - purity: `Date.now()` in the async *server* components under `app/`
       *    runs only on the server, so it cannot cause a hydration mismatch.
       *  - immutability: remaining reports are declaration-order preferences in
       *    code paths that only run after render.
       *
       * `react-hooks/rules-of-hooks` stays an error: that one catches real bugs.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];

export default config;

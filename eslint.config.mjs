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
      // Team badges, channel logos and YouTube thumbnails come from arbitrary
      // third-party IPTV/CDN domains and have custom onError fallback handlers.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;

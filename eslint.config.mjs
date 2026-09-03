import js from '@eslint/js';

const strictUnused = {
  argsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.wrangler/**',
      '.vite/**',
      'assets/**',
      'PROJECT_TEMPLATE.js',
      'QUICK_REFERENCE.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Blob: 'readonly',
        caches: 'readonly',
        cancelAnimationFrame: 'readonly',
        Chart: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        dataLayer: 'writable',
        document: 'readonly',
        fetch: 'readonly',
        Globe: 'readonly',
        gtag: 'readonly',
        history: 'readonly',
        Image: 'readonly',
        Intl: 'readonly',
        IntersectionObserver: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        module: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        process: 'readonly',
        projects: 'readonly',
        requestAnimationFrame: 'readonly',
        Response: 'readonly',
        require: 'readonly',
        sessionStorage: 'readonly',
        self: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        WebcamManager: 'readonly',
        WEBCAM_DATA: 'readonly',
        window: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', strictUnused],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Build tuple metadata is intentionally retained for readability even when a crop loop
  // consumes only the slug/position fields.
  {
    files: ['build-assets.js'],
    rules: {
      'no-unused-vars': [
        'error',
        { ...strictUnused, destructuredArrayIgnorePattern: '^(?:id|label)$' },
      ],
    },
  },
  // These legacy browser surfaces still expose or retain named hooks/state for their page
  // contracts. Keep the exceptions file-scoped and exact so any new unused symbol fails CI.
  {
    files: ['news.js'],
    rules: {
      'no-unused-vars': ['error', { ...strictUnused, varsIgnorePattern: '^status$' }],
    },
  },
  {
    files: ['projects-render.js'],
    rules: {
      'no-unused-vars': [
        'error',
        { ...strictUnused, argsIgnorePattern: '^(?:_|projectsToCount)$' },
      ],
    },
  },
  {
    files: ['pwa-install.js'],
    rules: {
      'no-unused-vars': ['error', { ...strictUnused, argsIgnorePattern: '^(?:_|evt)$' }],
    },
  },
  {
    files: ['generate-icons.js', 'shared/ecosystem-nav.js'],
    rules: {
      'no-unused-vars': [
        'error',
        { ...strictUnused, caughtErrorsIgnorePattern: '^(?:_|e)$' },
      ],
    },
  },
  {
    files: ['ui-effects.js'],
    rules: {
      'no-unused-vars': [
        'error',
        { ...strictUnused, varsIgnorePattern: '^(?:ParticleBackground|particleInstance)$' },
      ],
    },
  },
  {
    files: ['ux-animations.js'],
    rules: {
      'no-unused-vars': ['error', { ...strictUnused, varsIgnorePattern: '^startValue$' }],
    },
  },
  {
    files: ['worldmap.js'],
    rules: {
      'no-unused-vars': [
        'error',
        {
          ...strictUnused,
          varsIgnorePattern:
            '^(?:selectedCam|createCameraIcon|createWebcamDescription|query|flyToLocation)$',
        },
      ],
    },
  },
];

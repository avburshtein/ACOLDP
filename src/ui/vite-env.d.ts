/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL: string;
  readonly VITE_APP_TITLE: string;
  // more env variables to come...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

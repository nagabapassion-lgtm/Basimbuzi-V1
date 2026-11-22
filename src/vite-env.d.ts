/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAS_URL?: string;
  readonly APP_URL?: string;
  readonly GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "public/excalidraw-assets/**"],
  },
  ...tseslint.configs.recommended,
);

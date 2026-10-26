import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE || "/";

function prefixPublicFontUrls(): Plugin {
  const from = 'url("/fonts/';
  const to = `url("${base}fonts/`;
  return {
    name: "prefix-public-font-urls",
    transform(code, id) {
      if (!id.endsWith(".css") || !code.includes(from)) return null;
      return code.replaceAll(from, to);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), prefixPublicFontUrls()],
  server: { host: "0.0.0.0", port: 5173 },
});

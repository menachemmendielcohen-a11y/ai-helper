import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = Number(env.PORT) || 3001;
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  console.log(`[VITE] API proxy target: ${apiTarget}`);

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: false,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          configure(proxy) {
            proxy.on("error", (error, req) => {
              console.error(`[VITE PROXY] ${req?.method || ""} ${req?.url || ""} failed: ${error.message}`);
            });
          }
        }
      }
    }
  };
});

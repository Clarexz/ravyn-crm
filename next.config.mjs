/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expone el modo de datos al navegador (modo demo por defecto; ver lib/demo/config.ts).
  env: {
    NEXT_PUBLIC_RAVYN_DATA_MODE: process.env.RAVYN_DATA_MODE ?? "demo",
  },
};

export default nextConfig;

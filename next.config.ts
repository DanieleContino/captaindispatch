import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // web-push e nodemailer usano moduli Node.js nativi (crypto, https, net)
  // che non devono essere bundlati da Next.js/Turbopack ma usati tramite require()
  serverExternalPackages: ['web-push', 'nodemailer', 'pdf-parse', 'mammoth', 'xlsx'],
};

export default nextConfig;

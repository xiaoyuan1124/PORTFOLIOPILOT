const isGithubPages = process.env.GITHUB_ACTIONS === "true";
const basePath = isGithubPages ? "/PORTFOLIOPILOT" : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  }
};

export default nextConfig;

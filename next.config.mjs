/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gen.krea.ai',
      },
      {
        protocol: 'https',
        hostname: 'images.weserv.nl',
      }
    ],
  },
};

export default nextConfig;

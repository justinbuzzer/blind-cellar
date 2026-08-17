/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Bottle photos (see README "Bottle photos") live in the public
    // bottle-photos Storage bucket, at a stable public URL shape — scoped to
    // that one bucket path, not the whole Supabase project.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/bottle-photos/**",
      },
    ],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 生成自包含产物（.next/standalone），部署时无需在目标机器执行 npm install，
  // 规避内网镜像源缺包导致的安装失败
  output: "standalone",
};

export default nextConfig;

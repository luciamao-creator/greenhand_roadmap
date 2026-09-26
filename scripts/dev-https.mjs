// 本地 HTTPS 开发服务器：浏览器仅在 secure context 下暴露 navigator.geolocation，
// 「跟随导航」的定位能力必须跑在 https 上，本地又没有可信证书，故用自签证书承载。
import fs from "fs";
import path from "path";
import https from "https";
import next from "next";

const dir = process.cwd();
const port = Number(process.env.PORT || 3443);
const certDir = path.join(dir, "certificates");

const key = fs.readFileSync(path.join(certDir, "localhost-key.pem"));
const cert = fs.readFileSync(path.join(certDir, "localhost.pem"));

const app = next({ dev: true, dir, hostname: "0.0.0.0", port });
await app.prepare();
const handle = app.getRequestHandler();

https
  .createServer({ key, cert }, (req, res) => handle(req, res))
  .listen(port, () => {
    console.log(`▲ Next.js HTTPS ready -> https://localhost:${port}`);
  });

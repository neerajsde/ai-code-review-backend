import app from "./app.js";
import http from "http";
import chalk from "chalk";
import os from "os";
import { ENV } from "./config/env.js";
import {connectRedis} from "./config/redis.config.js";
import { initSocket } from "./socket/socket.server.js";
import { getClientIp, getDeviceInfo } from "./modules/auth/auth.service.js";

const now = new Date();

const day = String(now.getDate()).padStart(2, '0');
const month = now.toLocaleString('en-IN', { month: 'long' });
const year = now.getFullYear();
const time = now.toLocaleTimeString('en-IN');

const formattedDate = `${day} ${month} ${year}, ${time}`

app.get("/", (req, res) => {
  const device = getDeviceInfo(req);
  const ip = getClientIp(req);

  res.status(200).json({
    success: true,
    api: {
      name: "ReelTube Backend API",
      version: ENV.API_VERSION,
      status: "running"
    },
    client: {
      ip: ip,
      device: device
    },
    navigation: {
      documentation: "/docs",
      health_check: "/health",
    },
    message: "🚀 Welcome to the ReelTube Backend API",
    timestamp: formattedDate
  });
});

app.get("/health", (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    status: "ok",
    service: "ReelTube Backend API",
    version: ENV.API_VERSION,
    uptime: `${Math.floor(uptime)} seconds`,
    timestamp: new Date().toISOString(),
    server: {
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed
      },
      node_version: process.version
    }
  });
});

const server = http.createServer(app);
initSocket(server);

const port = ENV.PORT;
const host = ENV.HOST || "127.0.0.1";

server.listen(port, host, () => {
  console.clear();
  console.log(chalk.gray("──────────────────────────────────────"));
  console.log(
    chalk.greenBright.bold("🚀 Server Started Successfully\n")
  );

  console.log(
    `${chalk.cyan("📍 URL:")}      ${chalk.white(`http://localhost:${port}`)}`
  );
  console.log(
    `${chalk.cyan("📄 DOCS:")}     ${chalk.white(`http://localhost:${port}/docs`)}`
  );
  console.log(
    `${chalk.cyan("🌍 ENV:")}      ${chalk.yellow(ENV.NODE_ENV)}`
  );
  console.log(
    `${chalk.cyan("🧠 Node:")}     ${process.version}`
  );
  console.log(
    `${chalk.cyan("💻 Platform:")} ${os.platform()} (${os.arch()})`
  );
  console.log(
    `${chalk.cyan("🕒 Time:")}     ${new Date().toLocaleString()}`
  );

  console.log(chalk.gray("──────────────────────────────────────"));
});  

connectRedis();
